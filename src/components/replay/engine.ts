import { openf1, parseMs } from '../../api/openf1';
import type { Driver, IntervalSample, Lap, LocationSample, PitStop, PositionSample, Session, Stint } from '../../types/openf1';
import { compoundForLap } from '../../utils/laps';
import { segmentIndex } from '../../utils/interp';

/** Replay data is fetched in fixed windows of session time (all drivers per request). */
export const CHUNK_MS = 240_000;
const PREFETCH_AHEAD = 1;

export const REPLAY_RATES = [0.5, 1, 2, 5, 10, 20] as const;

interface Track {
  t: Float64Array;
  x: Float64Array;
  y: Float64Array;
}

interface Chunk {
  status: 'loading' | 'ready' | 'error';
  tracks: Map<number, Track>;
}

export interface CarState {
  driverNumber: number;
  x: number;
  y: number;
}

export interface LeaderboardRow {
  driver: Driver;
  position: number | null;
  gapToLeader: string;
  interval: string;
  lap: number | null;
  compound: string | null;
  inPit: boolean;
}

export interface ReplayStatic {
  session: Session;
  drivers: Driver[];
  laps: Lap[];
  stints: Stint[];
  positions: Map<number, PositionSample[]>;
  intervals: Map<number, IntervalSample[]>;
  pits: PitStop[];
  startMs: number;
  endMs: number;
}

function groupBy<T extends { driver_number: number; date: string }>(rows: T[]): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const row of rows) {
    let list = out.get(row.driver_number);
    if (!list) out.set(row.driver_number, (list = []));
    list.push(row);
  }
  for (const list of out.values()) list.sort((a, b) => parseMs(a.date) - parseMs(b.date));
  return out;
}

function latestAtOrBefore<T extends { date: string }>(rows: T[] | undefined, atMs: number): T | null {
  if (!rows || rows.length === 0) return null;
  let lo = 0;
  let hi = rows.length - 1;
  if (parseMs(rows[0].date) > atMs) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (parseMs(rows[mid].date) <= atMs) lo = mid;
    else hi = mid - 1;
  }
  return rows[lo];
}

function formatGap(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  return `+${value.toFixed(3)}`;
}

/**
 * Session replay clock with windowed location loading. Car positions are interpolated at
 * clock time T from per-driver tracks; the clock lives outside React and is advanced from
 * a requestAnimationFrame loop by the view.
 */
export class ReplayEngine {
  readonly data: ReplayStatic;
  private readonly chunks = new Map<number, Chunk>();
  private readonly listeners = new Set<() => void>();
  private readonly abort = new AbortController();
  timeMs: number;
  rate = 1;
  playing = false;

  private constructor(data: ReplayStatic) {
    this.data = data;
    this.timeMs = data.startMs;
  }

  static async load(session: Session): Promise<ReplayEngine> {
    const [drivers, laps, stints, positions, pits, intervals] = await Promise.all([
      openf1.drivers(session),
      openf1.laps(session),
      openf1.stints(session),
      openf1.positions(session),
      openf1.pits(session),
      openf1.intervals(session),
    ]);
    const firstLap = laps.reduce<number>(
      (min, lap) => (lap.date_start ? Math.min(min, parseMs(lap.date_start)) : min),
      Number.POSITIVE_INFINITY,
    );
    const startMs = Number.isFinite(firstLap) ? firstLap - 30_000 : parseMs(session.date_start);
    const engine = new ReplayEngine({
      session,
      drivers,
      laps,
      stints,
      positions: groupBy(positions),
      intervals: groupBy(intervals),
      pits,
      startMs,
      endMs: parseMs(session.date_end),
    });
    engine.ensureChunks();
    return engine;
  }

  configure(playing: boolean, rate: number): void {
    this.playing = playing;
    this.rate = rate;
  }

  dispose(): void {
    this.abort.abort();
    this.listeners.clear();
  }

  onChunk(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get duration(): number {
    return this.data.endMs - this.data.startMs;
  }

  seek(ms: number): void {
    this.timeMs = Math.min(this.data.endMs, Math.max(this.data.startMs, ms));
    this.ensureChunks();
  }

  advance(realDtMs: number): void {
    if (!this.playing) return;
    // Hold the clock while the chunk under it is still downloading instead of showing empty cars.
    if (this.chunkAt(this.timeMs)?.status !== 'ready') {
      this.ensureChunks();
      return;
    }
    this.seek(this.timeMs + realDtMs * this.rate);
    if (this.timeMs >= this.data.endMs) this.playing = false;
  }

  chunkStart(ms: number): number {
    return this.data.startMs + Math.floor((ms - this.data.startMs) / CHUNK_MS) * CHUNK_MS;
  }

  private chunkAt(ms: number): Chunk | undefined {
    return this.chunks.get(this.chunkStart(ms));
  }

  get buffering(): boolean {
    return this.chunkAt(this.timeMs)?.status !== 'ready';
  }

  loadedRanges(): { start: number; end: number; status: Chunk['status'] }[] {
    return [...this.chunks.entries()].map(([start, chunk]) => ({ start, end: start + CHUNK_MS, status: chunk.status }));
  }

  /** Loads the chunk under the clock plus a few ahead; requests go through the rate-limited queue. */
  ensureChunks(): void {
    const current = this.chunkStart(this.timeMs);
    for (let k = -1; k <= PREFETCH_AHEAD; k++) {
      const start = current + k * CHUNK_MS;
      if (start < this.chunkStart(this.data.startMs) || start > this.data.endMs) continue;
      const existing = this.chunks.get(start);
      if (existing && existing.status !== 'error') continue;
      void this.loadChunk(start);
    }
  }

  private async loadChunk(start: number): Promise<void> {
    const chunk: Chunk = { status: 'loading', tracks: new Map() };
    this.chunks.set(start, chunk);
    try {
      const location = await openf1.locationWindow(this.data.session, start, start + CHUNK_MS, this.abort.signal);
      for (const [driver, rows] of groupBy<LocationSample>(location)) {
        // Location at the pit/garage reads (0,0); drop it so cars don't streak across the map.
        const valid = rows.filter((r) => r.x !== 0 || r.y !== 0);
        chunk.tracks.set(driver, {
          t: Float64Array.from(valid, (r) => parseMs(r.date)),
          x: Float64Array.from(valid, (r) => r.x),
          y: Float64Array.from(valid, (r) => r.y),
        });
      }
      chunk.status = 'ready';
    } catch (error) {
      if (this.abort.signal.aborted) return;
      console.warn(`Replay chunk ${new Date(start).toISOString()} failed`, error);
      chunk.status = 'error';
    }
    for (const listener of this.listeners) listener();
  }

  private trackSample(driver: number, ms: number): Track | undefined {
    return this.chunkAt(ms)?.tracks.get(driver);
  }

  /** Interpolated (x, y) for every driver at clock time, bridging chunk boundaries. */
  cars(out: CarState[] = []): CarState[] {
    out.length = 0;
    const ms = this.timeMs;
    for (const driver of this.data.drivers) {
      const n = driver.driver_number;
      const track = this.trackSample(n, ms);
      if (!track || track.t.length === 0) continue;
      let x: number;
      let y: number;
      if (ms < track.t[0]) {
        const prev = this.trackSample(n, ms - CHUNK_MS);
        if (!prev || prev.t.length === 0) {
          x = track.x[0];
          y = track.y[0];
        } else {
          const last = prev.t.length - 1;
          const f = (ms - prev.t[last]) / (track.t[0] - prev.t[last] || 1);
          x = prev.x[last] + (track.x[0] - prev.x[last]) * f;
          y = prev.y[last] + (track.y[0] - prev.y[last]) * f;
        }
      } else {
        const i = segmentIndex(track.t, ms);
        const j = Math.min(track.t.length - 1, i + 1);
        const span = track.t[j] - track.t[i];
        const f = span > 0 ? Math.min(1, (ms - track.t[i]) / span) : 0;
        x = track.x[i] + (track.x[j] - track.x[i]) * f;
        y = track.y[i] + (track.y[j] - track.y[i]) * f;
      }
      // A car that has retired stops streaming; hide it once its last sample is stale.
      if (ms - track.t[track.t.length - 1] > 20_000) continue;
      out.push({ driverNumber: n, x, y });
    }
    return out;
  }

  leaderboard(): LeaderboardRow[] {
    const ms = this.timeMs;
    const rows = this.data.drivers.map((driver): LeaderboardRow => {
      const n = driver.driver_number;
      const position = latestAtOrBefore(this.data.positions.get(n), ms)?.position ?? null;
      const interval = latestAtOrBefore(this.data.intervals.get(n), ms);
      let lap: Lap | null = null;
      for (const l of this.data.laps) {
        if (l.driver_number === n && l.date_start && parseMs(l.date_start) <= ms && (!lap || l.lap_number > lap.lap_number)) {
          lap = l;
        }
      }
      const inPit = this.data.pits.some((p) => {
        if (p.driver_number !== n) return false;
        const enter = parseMs(p.date);
        return ms >= enter && ms <= enter + (p.pit_duration ?? 25) * 1000;
      });
      return {
        driver,
        position,
        gapToLeader: position === 1 ? 'Leader' : formatGap(interval?.gap_to_leader),
        interval: position === 1 ? '—' : formatGap(interval?.interval),
        lap: lap?.lap_number ?? null,
        compound: lap ? compoundForLap(this.data.stints, n, lap.lap_number) : null,
        inPit,
      };
    });
    return rows.sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  }
}
