import type { Zone } from '../types/telemetry';
import { interpLinear, type NumArray } from './interp';

export interface LiftCoastOptions {
  minSpeedKmh: number;
  minDurationS: number;
}

export const LIFT_COAST_DEFAULTS: LiftCoastOptions = { minSpeedKmh: 150, minDurationS: 0.15 };

export interface LiftCoastInput {
  t: NumArray;
  d: NumArray;
  speed: NumArray;
  throttle: NumArray;
  /** Normalised brake in [0, 1]. */
  brake: NumArray;
}

/**
 * Lift & Coast = (throttle == 0) ∧ (brake == 0) ∧ (speed > 150 km/h) held for ≥ 150 ms.
 *
 * car_data arrives at ~3.7 Hz, so a run of qualifying samples is credited with the time
 * between the midpoints to its neighbouring samples; a single isolated sample therefore
 * represents ~270 ms of coasting rather than zero.
 */
export function detectLiftCoast(input: LiftCoastInput, options: LiftCoastOptions = LIFT_COAST_DEFAULTS): Zone[] {
  const { t, d, speed, throttle, brake } = input;
  const n = t.length;
  const zones: Zone[] = [];
  const qualifies = (i: number) => throttle[i] === 0 && brake[i] === 0 && speed[i] > options.minSpeedKmh;

  let i = 0;
  while (i < n) {
    if (!qualifies(i)) {
      i++;
      continue;
    }
    const first = i;
    while (i + 1 < n && qualifies(i + 1)) i++;
    const last = i;
    const tStart = first > 0 ? (t[first - 1] + t[first]) / 2 : t[first];
    const tEnd = last < n - 1 ? (t[last] + t[last + 1]) / 2 : t[last];
    if (tEnd - tStart >= options.minDurationS) {
      zones.push({ start: interpLinear(t, d, tStart), end: interpLinear(t, d, tEnd) });
    }
    i++;
  }
  return zones;
}
