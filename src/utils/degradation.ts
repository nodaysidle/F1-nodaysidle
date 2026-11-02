import type { Compound, Lap, RaceControlMessage, Stint } from '../types/openf1';
import { neutralisedLapNumbers } from './neutralised-laps';

export const MIN_DEGRADATION_LAPS = 5;

export interface StintDegradation {
  slope: number;
  intercept: number;
  rSquared: number;
  lapCount: number;
}

export type DegradationResult = { status: 'fitted' } & StintDegradation | { status: 'insufficient'; lapCount: number };

export interface DegradationOptions {
  excludeLaps?: ReadonlySet<number>;
  isLastStint?: boolean;
}

export function tyreAgeForLap(stint: Stint, lapNumber: number): number | null {
  if (stint.tyre_age_at_start === null || stint.lap_start === null) return null;
  return stint.tyre_age_at_start + (lapNumber - stint.lap_start);
}

function cleanStintPoints(laps: Lap[], stint: Stint, options: DegradationOptions): { age: number; time: number }[] {
  const points: { age: number; time: number }[] = [];
  const start = stint.lap_start;
  const end = stint.lap_end;
  if (start === null || end === null) return points;
  for (const lap of laps) {
    if (lap.driver_number !== stint.driver_number) continue;
    if (lap.lap_number < start || lap.lap_number > end) continue;
    if (lap.is_pit_out_lap) continue;
    if (!options.isLastStint && lap.lap_number === end) continue;
    if (options.excludeLaps?.has(lap.lap_number)) continue;
    if (lap.lap_duration === null || lap.lap_duration <= 0) continue;
    const age = tyreAgeForLap(stint, lap.lap_number);
    if (age === null) continue;
    points.push({ age, time: lap.lap_duration });
  }
  return points;
}

export function fitStintDegradation(laps: Lap[], stint: Stint, options: DegradationOptions = {}): DegradationResult {
  const points = cleanStintPoints(laps, stint, options);
  const n = points.length;
  if (n < MIN_DEGRADATION_LAPS) return { status: 'insufficient', lapCount: n };

  const meanAge = points.reduce((sum, p) => sum + p.age, 0) / n;
  const meanTime = points.reduce((sum, p) => sum + p.time, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.age - meanAge) ** 2;
    sxy += (p.age - meanAge) * (p.time - meanTime);
  }
  if (sxx === 0) return { status: 'insufficient', lapCount: n };

  const slope = sxy / sxx;
  const intercept = meanTime - slope * meanAge;
  let ssRes = 0;
  let ssTot = 0;
  for (const p of points) {
    const predicted = intercept + slope * p.age;
    ssRes += (p.time - predicted) ** 2;
    ssTot += (p.time - meanTime) ** 2;
  }
  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { status: 'fitted', slope, intercept, rSquared, lapCount: n };
}

export interface SessionStintDegradation {
  driverNumber: number;
  stintNumber: number;
  compound: Compound | null;
  lapStart: number | null;
  lapEnd: number | null;
  result: DegradationResult;
}

export function fitSessionDegradation(
  laps: readonly Lap[],
  stints: readonly Stint[],
  messages: readonly RaceControlMessage[],
): SessionStintDegradation[] {
  const finalLap = laps.reduce((max, lap) => Math.max(max, lap.lap_number), 0);
  const excludeLaps = neutralisedLapNumbers(messages, finalLap);
  const lastStintByDriver = new Map<number, number>();
  for (const stint of stints) {
    const current = lastStintByDriver.get(stint.driver_number) ?? 0;
    if (stint.stint_number > current) lastStintByDriver.set(stint.driver_number, stint.stint_number);
  }
  return stints.map((stint) => ({
    driverNumber: stint.driver_number,
    stintNumber: stint.stint_number,
    compound: stint.compound,
    lapStart: stint.lap_start,
    lapEnd: stint.lap_end,
    result: fitStintDegradation(laps as Lap[], stint, {
      excludeLaps,
      isLastStint: lastStintByDriver.get(stint.driver_number) === stint.stint_number,
    }),
  }));
}
