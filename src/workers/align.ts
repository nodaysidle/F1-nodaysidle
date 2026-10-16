import type { AlignedComparison, AlignedSlot, ProcessedLap, RawLapTelemetry } from '../types/telemetry';
import { cumulativeDistance } from '../utils/distance';
import { makeGrid, timeDelta } from '../utils/delta';
import { interpLinear, resample } from '../utils/interp';
import { detectLiftCoast } from '../utils/lift-coast';

const DRS_OPEN_CODES = new Set([10, 12, 14]);

export const normaliseBrake = (value: number): number => Math.min(1, Math.max(0, value / 100));
export const drsOpen = (code: number): number => (DRS_OPEN_CODES.has(code) ? 1 : 0);

/**
 * Converts a raw lap window (which includes padding on both sides) into clean arrays
 * spanning exactly [0, duration] seconds, with distance integrated from speed and the
 * car position interpolated onto the car_data clock.
 */
export function processLap(raw: RawLapTelemetry): ProcessedLap {
  const byTime = new Map<number, RawLapTelemetry['carData'][number]>();
  for (const sample of raw.carData) byTime.set(Date.parse(sample.date), sample);
  const times = [...byTime.keys()].sort((a, b) => a - b);
  const n = times.length;
  if (n < 2) throw new Error(`Lap ${raw.lapNumber} of driver ${raw.driverNumber} has too few samples`);

  const t = new Float64Array(n);
  const speed = new Float64Array(n);
  const throttle = new Float64Array(n);
  const brake = new Float64Array(n);
  const rpm = new Float64Array(n);
  const gear = new Float64Array(n);
  const drs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = byTime.get(times[i])!;
    t[i] = (times[i] - raw.startMs) / 1000;
    speed[i] = s.speed;
    // OpenF1 occasionally reports throttle above 100 (sensor overflow codes); clamp to the physical range.
    throttle[i] = Math.min(100, Math.max(0, s.throttle));
    brake[i] = normaliseBrake(s.brake);
    rpm[i] = s.rpm;
    gear[i] = s.n_gear;
    drs[i] = drsOpen(s.drs);
  }
  const dPadded = cumulativeDistance(t, speed);

  const loc = [...raw.location]
    .map((p) => ({ ms: Date.parse(p.date), x: p.x, y: p.y }))
    .sort((a, b) => a.ms - b.ms);
  const locT = Float64Array.from(loc, (p) => (p.ms - raw.startMs) / 1000);
  const locX = Float64Array.from(loc, (p) => p.x);
  const locY = Float64Array.from(loc, (p) => p.y);

  // Trim to [0, duration] and synthesise exact boundary samples.
  const duration = raw.duration;
  const tOut: number[] = [0];
  for (let i = 0; i < n; i++) if (t[i] > 0 && t[i] < duration) tOut.push(t[i]);
  tOut.push(duration);
  const grid = Float64Array.from(tOut);

  const linear = (ys: Float64Array) => resample(t, ys, grid, 'linear');
  const step = (ys: Float64Array) => resample(t, ys, grid, 'step');
  const dAbs = linear(dPadded);
  const d0 = dAbs[0];
  const d = dAbs.map((v) => v - d0);
  const hasLocation = locT.length >= 2;

  return {
    t: grid,
    d,
    speed: linear(speed),
    throttle: linear(throttle),
    brake: linear(brake),
    rpm: linear(rpm),
    gear: step(gear),
    drs: step(drs),
    x: hasLocation ? resample(locT, locX, grid, 'linear') : new Float64Array(grid.length).fill(NaN),
    y: hasLocation ? resample(locT, locY, grid, 'linear') : new Float64Array(grid.length).fill(NaN),
    length: d[d.length - 1],
    duration,
  };
}

/**
 * Aligns up to four laps on a common 5 m distance grid spanning the reference lap.
 * Each comparison lap's integrated distance is scaled to the reference length so that
 * integration drift (different lines, sensor noise) does not shift corners against each other.
 */
export function alignLaps(laps: (ProcessedLap | null)[]): AlignedComparison {
  const ref = laps.find((lap): lap is ProcessedLap => lap !== null);
  if (!ref) return { grid: new Float64Array(0), length: 0, slots: laps.map(() => null) };
  const length = ref.length;
  const grid = makeGrid(length);

  const aligned = laps.map((lap): AlignedSlot | null => {
    if (!lap) return null;
    const scale = lap.length > 0 ? length / lap.length : 1;
    const d = lap.d.map((v) => v * scale);
    const liftCoast = detectLiftCoast({ t: lap.t, d, speed: lap.speed, throttle: lap.throttle, brake: lap.brake });
    return {
      t: resample(d, lap.t, grid, 'linear'),
      speed: resample(d, lap.speed, grid, 'linear'),
      throttle: resample(d, lap.throttle, grid, 'linear'),
      brake: resample(d, lap.brake, grid, 'linear'),
      rpm: resample(d, lap.rpm, grid, 'linear'),
      gear: resample(d, lap.gear, grid, 'step'),
      drs: resample(d, lap.drs, grid, 'step'),
      x: resample(d, lap.x, grid, 'linear'),
      y: resample(d, lap.y, grid, 'linear'),
      delta: new Float64Array(grid.length),
      liftCoast,
      lapTime: lap.duration,
      rawLength: lap.length,
    };
  });

  const refSlot = aligned.find((slot): slot is AlignedSlot => slot !== null)!;
  for (const slot of aligned) {
    if (slot && slot !== refSlot) slot.delta = timeDelta(refSlot.t, slot.t);
  }
  return { grid, length, slots: aligned };
}

/** Elapsed lap time of `slot` at distance `distance`, by interpolation on the grid. */
export function timeAtDistance(grid: Float64Array, slot: AlignedSlot, distance: number): number {
  return interpLinear(grid, slot.t, distance);
}

export function transferablesOf(result: AlignedComparison): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [result.grid.buffer as ArrayBuffer];
  for (const slot of result.slots) {
    if (!slot) continue;
    for (const arr of [
      slot.t,
      slot.speed,
      slot.throttle,
      slot.brake,
      slot.rpm,
      slot.gear,
      slot.drs,
      slot.x,
      slot.y,
      slot.delta,
    ]) {
      buffers.push(arr.buffer as ArrayBuffer);
    }
  }
  return buffers;
}
