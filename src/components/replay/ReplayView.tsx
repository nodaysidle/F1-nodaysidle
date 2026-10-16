import { useEffect, useRef, useState } from 'react';
import { openf1 } from '../../api/openf1';
import { useAsync } from '../../hooks/use-async';
import { useSlotStore } from '../../store/slots';
import { teamColor } from '../../utils/colors';
import { isTimedLap } from '../../utils/laps';
import { alignInWorker } from '../../workers/client';
import { CompoundBadge } from '../common/CompoundBadge';
import { Panel } from '../common/Panel';
import { SessionPicker } from '../session-picker/SessionPicker';
import { DirtyRegion } from '../../utils/dirty-region';
import { boundsOf, project } from '../track-map/geometry';
import { REPLAY_RATES, ReplayEngine, type CarState, type LeaderboardRow } from './engine';

const LEADERBOARD_HZ = 4;

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface Outline {
  x: Float64Array;
  y: Float64Array;
}

async function loadReplay(sessionKey: number): Promise<{ engine: ReplayEngine; outline: Outline }> {
  const session = await openf1.session(sessionKey);
  if (!session) throw new Error(`Session ${sessionKey} not found`);
  const engine = await ReplayEngine.load(session);
  const fastest = engine.data.laps
    .filter((l) => isTimedLap(l) && !l.is_pit_out_lap)
    .sort((a, b) => a.lap_duration! - b.lap_duration!)
    .at(0);
  if (!fastest) throw new Error('This session has no timed laps to draw the circuit from');
  const raw = await openf1.lapTelemetry(fastest);
  const aligned = await alignInWorker([raw]);
  const slot = aligned.slots[0]!;
  return { engine, outline: { x: slot.x, y: slot.y } };
}

export function ReplayView() {
  const selection = useSlotStore((s) => s.replay);
  const setReplay = useSlotStore((s) => s.setReplay);
  const loaded = useAsync(selection.sessionKey === null ? null : () => loadReplay(selection.sessionKey!), [selection.sessionKey]);
  const engine = loaded.data?.engine ?? null;
  const outline = loaded.data?.outline ?? null;

  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const carsRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLInputElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const bufferRef = useRef<HTMLSpanElement>(null);

  // Dispose the previous engine only when a different session replaces it; StrictMode's
  // remount must not abort the live engine's downloads.
  const previousEngine = useRef<ReplayEngine | null>(null);
  useEffect(() => {
    if (previousEngine.current && previousEngine.current !== engine) previousEngine.current.dispose();
    previousEngine.current = engine;
  }, [engine]);

  useEffect(() => {
    if (!engine) return;
    engine.configure(playing, rate);
  }, [engine, playing, rate]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const base = baseRef.current;
    const carsCanvas = carsRef.current;
    if (!engine || !outline || !wrap || !base || !carsCanvas) return;
    const bounds = boundsOf(outline.x, outline.y);
    if (!bounds) return;
    const colors = new Map(engine.data.drivers.map((d) => [d.driver_number, teamColor(d.team_name, d.team_colour)]));
    const acronyms = new Map(engine.data.drivers.map((d) => [d.driver_number, d.name_acronym]));

    let width = 0;
    let height = 0;
    let proj = project(bounds, 1, 1, { zoom: 1, panX: 0, panY: 0 });
    let ctx: CanvasRenderingContext2D | null = null;
    const dpr = window.devicePixelRatio || 1;
    const dirty = new DirtyRegion();
    // Clock time of the last painted frame; NaN forces a repaint (resize, new chunk).
    let drawnAt = Number.NaN;
    const offChunk = engine.onChunk(() => {
      drawnAt = Number.NaN;
    });

    const layout = () => {
      const rect = wrap.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      for (const c of [base, carsCanvas]) {
        c.width = Math.round(width * dpr);
        c.height = Math.round(height * dpr);
        c.style.width = `${width}px`;
        c.style.height = `${height}px`;
      }
      proj = project(bounds, width, height, { zoom: 1, panX: 0, panY: 0 }, 36);
      const b = base.getContext('2d');
      if (b) {
        b.setTransform(dpr, 0, 0, dpr, 0, 0);
        b.lineCap = 'round';
        b.lineJoin = 'round';
        b.beginPath();
        for (let i = 0; i < outline.x.length; i++) {
          const x = proj.sx(outline.x[i]);
          const y = proj.sy(outline.y[i]);
          if (i === 0) b.moveTo(x, y);
          else b.lineTo(x, y);
        }
        b.closePath();
        b.strokeStyle = '#1C1F27';
        b.lineWidth = 14;
        b.stroke();
        b.strokeStyle = '#3A3E4A';
        b.lineWidth = 3;
        b.stroke();
      }
      ctx = carsCanvas.getContext('2d');
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty.reset();
      drawnAt = Number.NaN;
    };
    const observer = new ResizeObserver(layout);
    observer.observe(wrap);
    layout();

    const scratch: CarState[] = [];
    let positions = new Map<number, number>();
    let frame = 0;
    let last = performance.now();
    let lastBoard = 0;

    const draw = (ts: number) => {
      engine.advance(ts - last);
      last = ts;
      if (ctx && engine.timeMs !== drawnAt) {
        drawnAt = engine.timeMs;
        dirty.clear(ctx);
        ctx.font = '600 10px "Inter", system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        const cars = engine.cars(scratch);
        // Leader drawn last so it is never hidden.
        cars.sort((a, b) => (positions.get(b.driverNumber) ?? 99) - (positions.get(a.driverNumber) ?? 99));
        for (const car of cars) {
          const x = proj.sx(car.x);
          const y = proj.sy(car.y);
          const color = colors.get(car.driverNumber) ?? '#9CA3AF';
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.lineWidth = positions.get(car.driverNumber) === 1 ? 2.5 : 1.5;
          ctx.strokeStyle = positions.get(car.driverNumber) === 1 ? '#FFFFFF' : '#0D0E12';
          ctx.stroke();
          ctx.fillStyle = color;
          const label = acronyms.get(car.driverNumber) ?? String(car.driverNumber);
          ctx.fillText(label, x + 9, y - 8);
          dirty.add(x - 9, y - 9, 18, 18);
          dirty.add(x + 8, y - 15, ctx.measureText(label).width + 3, 14);
        }
      }
      const elapsed = engine.timeMs - engine.data.startMs;
      if (clockRef.current) clockRef.current.textContent = formatClock(elapsed);
      if (timelineRef.current && document.activeElement !== timelineRef.current) {
        timelineRef.current.value = String(elapsed);
      }
      if (bufferRef.current) bufferRef.current.dataset.on = engine.buffering ? '1' : '0';
      if (ts - lastBoard > 1000 / LEADERBOARD_HZ) {
        lastBoard = ts;
        const board = engine.leaderboard();
        positions = new Map(board.map((r) => [r.driver.driver_number, r.position ?? 99]));
        setRows(board);
        if (!engine.playing) setPlaying(false);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      offChunk();
    };
  }, [engine, outline]);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Panel
        title="Session Replay"
        bodyClassName="flex flex-col"
        actions={
          <div className="w-[min(520px,60vw)]">
            <SessionPicker
              finishedOnly
              year={selection.year}
              meetingKey={selection.meetingKey}
              sessionKey={selection.sessionKey}
              onChange={(next) => {
                setPlaying(false);
                setReplay(next);
              }}
            />
          </div>
        }
        className="[&>header]:h-auto [&>header]:py-2"
      >
        <div ref={wrapRef} className="relative min-h-0 flex-1" data-testid="replay-map">
          <canvas ref={baseRef} className="absolute inset-0" />
          <canvas ref={carsRef} className="absolute inset-0" />
          {loaded.loading && <p className="absolute inset-0 grid place-items-center text-sm text-ink-faint">Loading session…</p>}
          {loaded.error && <p className="absolute inset-0 grid place-items-center text-sm text-red-400">{loaded.error}</p>}
          <span
            ref={bufferRef}
            className="absolute top-3 right-3 rounded bg-amber/15 px-2 py-0.5 font-mono text-[10px] text-amber opacity-0 transition-opacity data-[on=1]:opacity-100"
          >
            BUFFERING
          </span>
        </div>
        <div className="flex items-center gap-3 border-t border-line px-3 py-2">
          <button
            type="button"
            disabled={!engine}
            aria-label={playing ? 'Pause replay' : 'Play replay'}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-f1 text-white disabled:opacity-30"
            onClick={() => {
              setPlaying((p) => !p);
            }}
          >
            {playing ? (
              <svg viewBox="0 0 12 12" className="size-3 fill-current" aria-hidden>
                <rect x="2" y="1.5" width="3" height="9" rx="0.5" />
                <rect x="7" y="1.5" width="3" height="9" rx="0.5" />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" className="ml-0.5 size-3 fill-current" aria-hidden>
                <path d="M2.5 1.5v9l8-4.5z" />
              </svg>
            )}
          </button>
          <div className="flex rounded-md border border-line p-0.5" role="group" aria-label="Replay rate">
            {REPLAY_RATES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={rate === r}
                className="h-6 rounded px-1.5 font-mono text-[10px] text-ink-dim aria-pressed:bg-white/10 aria-pressed:text-ink"
                onClick={() => {
                  setRate(r);
                }}
              >
                {r}×
              </button>
            ))}
          </div>
          <input
            ref={timelineRef}
            type="range"
            aria-label="Session time"
            className="h-1 flex-1 cursor-pointer accent-f1"
            min={0}
            max={engine?.duration ?? 1}
            step={1000}
            defaultValue={0}
            disabled={!engine}
            onInput={(e) => {
              if (engine) engine.seek(engine.data.startMs + Number(e.currentTarget.value));
            }}
          />
          <span ref={clockRef} className="w-16 text-right font-mono text-[12px] text-ink-dim tabular">
            0:00:00
          </span>
        </div>
      </Panel>
      <Panel title="Live Timing" bodyClassName="overflow-y-auto">
        <table className="w-full text-[12px]" data-testid="leaderboard">
          <thead className="sticky top-0 bg-carbon-2 text-[10px] tracking-wider text-ink-faint uppercase">
            <tr>
              <th className="py-1.5 pl-3 text-left font-medium">P</th>
              <th className="text-left font-medium">Driver</th>
              <th className="text-right font-medium">Gap</th>
              <th className="text-right font-medium">Int</th>
              <th className="text-center font-medium">Lap</th>
              <th className="pr-3 text-center font-medium">Tyre</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.driver.driver_number} className="border-t border-line/60">
                <td className="py-1.5 pl-3 font-mono text-ink-dim tabular">{row.position ?? '—'}</td>
                <td>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-3.5 w-1 rounded-full"
                      style={{ background: teamColor(row.driver.team_name, row.driver.team_colour) }}
                    />
                    <span className="font-semibold">{row.driver.name_acronym}</span>
                    {row.inPit && (
                      <span className="rounded bg-cyan/15 px-1 font-mono text-[9px] font-bold text-cyan">PIT</span>
                    )}
                  </span>
                </td>
                <td className="text-right font-mono text-ink-dim tabular">{row.gapToLeader}</td>
                <td className="text-right font-mono text-ink-dim tabular">{row.interval}</td>
                <td className="text-center font-mono text-ink-faint tabular">{row.lap ?? '—'}</td>
                <td className="pr-3">
                  <span className="flex justify-center">
                    <CompoundBadge compound={row.compound} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
