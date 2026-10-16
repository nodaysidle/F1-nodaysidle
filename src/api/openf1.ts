import { idbGet, idbSet } from '../cache/idb';
import { LruCache } from '../cache/lru';
import type {
  CarDataSample,
  Driver,
  IntervalSample,
  Lap,
  LocationSample,
  Meeting,
  PitStop,
  PositionSample,
  Session,
  Stint,
} from '../types/openf1';
import type { RawLapTelemetry } from '../types/telemetry';
import { RequestQueue } from './queue';

export const OPENF1_BASE = 'https://api.openf1.org/v1';

/** Metadata for sessions that ended this long ago is treated as immutable. */
const SETTLED_AFTER_MS = 3 * 24 * 3600 * 1000;
const FRESH_METADATA_MS = 15 * 60 * 1000;

/** Extra window fetched either side of a lap so the boundaries can be interpolated. */
export const LAP_PAD_MS = 1500;

type Params = Record<string, string | number | undefined>;

export function buildUrl(endpoint: string, params: Params, ranges: [string, string, string][] = []): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) parts.push(`${key}=${encodeURIComponent(String(value))}`);
  }
  for (const [key, op, value] of ranges) parts.push(`${key}${op}${encodeURIComponent(value)}`);
  return `${OPENF1_BASE}/${endpoint}?${parts.join('&')}`;
}

export const isoMs = (ms: number): string => new Date(ms).toISOString();
export const parseMs = (iso: string): number => Date.parse(iso);

export class OpenF1Client {
  private readonly memory = new LruCache<unknown>(256);

  constructor(readonly queue = new RequestQueue()) {}

  /**
   * Memory LRU → IndexedDB → network. `maxAgeMs` bounds how stale a persisted
   * entry may be; telemetry passes Infinity because historical samples never change.
   */
  private async cached<T>(key: string, url: string, maxAgeMs: number, signal?: AbortSignal): Promise<T> {
    const hot = this.memory.get(key);
    if (hot !== undefined) return hot as T;
    const stored = await idbGet<T>(key, maxAgeMs);
    if (stored !== undefined) {
      this.memory.set(key, stored);
      return stored;
    }
    const fresh = await this.queue.getJson<T>(url, signal);
    this.memory.set(key, fresh);
    void idbSet(key, fresh);
    return fresh;
  }

  private metadataAge(referenceDateIso?: string): number {
    if (!referenceDateIso) return FRESH_METADATA_MS;
    return Date.now() - parseMs(referenceDateIso) > SETTLED_AFTER_MS ? Infinity : FRESH_METADATA_MS;
  }

  async meetings(year: number): Promise<Meeting[]> {
    const age = year < new Date().getUTCFullYear() ? Infinity : FRESH_METADATA_MS;
    const rows = await this.cached<Meeting[]>(`meetings:${year}`, buildUrl('meetings', { year }), age);
    return [...rows].sort((a, b) => parseMs(a.date_start) - parseMs(b.date_start));
  }

  async sessions(meetingKey: number): Promise<Session[]> {
    const rows = await this.cached<Session[]>(
      `sessions:${meetingKey}`,
      buildUrl('sessions', { meeting_key: meetingKey }),
      FRESH_METADATA_MS * 4,
    );
    return [...rows].sort((a, b) => parseMs(a.date_start) - parseMs(b.date_start));
  }

  async session(sessionKey: number): Promise<Session | undefined> {
    const rows = await this.cached<Session[]>(
      `session:${sessionKey}`,
      buildUrl('sessions', { session_key: sessionKey }),
      FRESH_METADATA_MS * 4,
    );
    return rows[0];
  }

  async drivers(session: Session): Promise<Driver[]> {
    const rows = await this.cached<Driver[]>(
      `drivers:${session.session_key}`,
      buildUrl('drivers', { session_key: session.session_key }),
      this.metadataAge(session.date_end),
    );
    const unique = new Map<number, Driver>();
    for (const row of rows) unique.set(row.driver_number, row);
    return [...unique.values()].sort((a, b) => a.driver_number - b.driver_number);
  }

  async laps(session: Session, driverNumber?: number): Promise<Lap[]> {
    const rows = await this.cached<Lap[]>(
      `laps:${session.session_key}:${driverNumber ?? 'all'}`,
      buildUrl('laps', { session_key: session.session_key, driver_number: driverNumber }),
      this.metadataAge(session.date_end),
    );
    return [...rows].sort((a, b) => a.lap_number - b.lap_number);
  }

  stints(session: Session, driverNumber?: number): Promise<Stint[]> {
    return this.cached<Stint[]>(
      `stints:${session.session_key}:${driverNumber ?? 'all'}`,
      buildUrl('stints', { session_key: session.session_key, driver_number: driverNumber }),
      this.metadataAge(session.date_end),
    );
  }

  positions(session: Session): Promise<PositionSample[]> {
    return this.cached<PositionSample[]>(
      `position:${session.session_key}`,
      buildUrl('position', { session_key: session.session_key }),
      this.metadataAge(session.date_end),
    );
  }

  pits(session: Session): Promise<PitStop[]> {
    return this.cached<PitStop[]>(
      `pit:${session.session_key}`,
      buildUrl('pit', { session_key: session.session_key }),
      this.metadataAge(session.date_end),
    );
  }

  /**
   * Car data and location for one lap, scoped to the lap's timestamp window.
   * Persisted under `session_key:driver_number:lap_number`.
   */
  async lapTelemetry(lap: Lap, signal?: AbortSignal): Promise<RawLapTelemetry> {
    if (!lap.date_start || lap.lap_duration === null) {
      throw new Error(`Lap ${lap.lap_number} of driver ${lap.driver_number} has no timing data`);
    }
    const key = `${lap.session_key}:${lap.driver_number}:${lap.lap_number}`;
    const hot = this.memory.get(key);
    if (hot !== undefined) return hot as RawLapTelemetry;
    const stored = await idbGet<RawLapTelemetry>(key);
    if (stored !== undefined) {
      this.memory.set(key, stored);
      return stored;
    }
    const startMs = parseMs(lap.date_start);
    const from = isoMs(startMs - LAP_PAD_MS);
    const to = isoMs(startMs + lap.lap_duration * 1000 + LAP_PAD_MS);
    const scope = { session_key: lap.session_key, driver_number: lap.driver_number };
    const window: [string, string, string][] = [
      ['date', '>=', from],
      ['date', '<=', to],
    ];
    const [carData, location] = await Promise.all([
      this.queue.getJson<CarDataSample[]>(buildUrl('car_data', scope, window), signal),
      this.queue.getJson<LocationSample[]>(buildUrl('location', scope, window), signal),
    ]);
    if (carData.length < 10) {
      throw new Error(`OpenF1 returned no car data for lap ${lap.lap_number} of driver ${lap.driver_number}`);
    }
    const raw: RawLapTelemetry = {
      sessionKey: lap.session_key,
      driverNumber: lap.driver_number,
      lapNumber: lap.lap_number,
      startMs,
      duration: lap.lap_duration,
      carData,
      location,
    };
    this.memory.set(key, raw);
    void idbSet(key, raw);
    return raw;
  }

  /** All drivers' positions in [fromMs, toMs), used by the replay engine's chunk loader. */
  locationWindow(session: Session, fromMs: number, toMs: number, signal?: AbortSignal): Promise<LocationSample[]> {
    return this.cached<LocationSample[]>(
      `replay-location:${session.session_key}:${fromMs}`,
      buildUrl('location', { session_key: session.session_key }, [
        ['date', '>=', isoMs(fromMs)],
        ['date', '<', isoMs(toMs)],
      ]),
      this.metadataAge(session.date_end),
      signal,
    );
  }

  /**
   * Timing-tower intervals for the whole session in one request (a few MB for a race).
   * One call instead of one per replay chunk keeps replay inside the 30 req/min budget.
   */
  intervals(session: Session): Promise<IntervalSample[]> {
    return this.cached<IntervalSample[]>(
      `intervals:${session.session_key}`,
      buildUrl('intervals', { session_key: session.session_key }),
      this.metadataAge(session.date_end),
    );
  }
}

export const openf1 = new OpenF1Client();
