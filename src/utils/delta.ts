import type { MicroSectorState } from '../types/telemetry';
import type { NumArray } from './interp';

export const DELTA_GRID_STEP_M = 5;
export const NEUTRAL_BAND_S = 0.02;
export const MICRO_SECTOR_M = 100;

/** Δt(d) = t_comp(d) − t_ref(d) on a shared distance grid. Positive = comparison is behind. */
export function timeDelta(tRef: NumArray, tComp: NumArray): Float64Array {
  const n = Math.min(tRef.length, tComp.length);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = tComp[i] - tRef[i];
  return out;
}

function classifyGain(gain: number, neutralBand: number): MicroSectorState {
  if (gain < -neutralBand) return 'faster';
  if (gain > neutralBand) return 'slower';
  return 'neutral';
}

export interface MicroSector {
  startIndex: number;
  endIndex: number;
  /** Time gained (negative) or lost (positive) by the comparison driver inside this micro-sector. */
  gain: number;
  state: MicroSectorState;
}

/**
 * Splits the grid into fixed-length micro-sectors and classifies each by the change in Δt
 * across it: green when the comparison driver gained more than the neutral band, red when
 * they lost more, grey otherwise.
 */
export function classifyMicroSectors(
  delta: NumArray,
  gridStep = DELTA_GRID_STEP_M,
  sectorLength = MICRO_SECTOR_M,
  neutralBand = NEUTRAL_BAND_S,
): MicroSector[] {
  const n = delta.length;
  if (n < 2) return [];
  const per = Math.max(1, Math.round(sectorLength / gridStep));
  const sectors: MicroSector[] = [];
  for (let start = 0; start < n - 1; start += per) {
    const end = Math.min(n - 1, start + per);
    const gain = delta[end] - delta[start];
    sectors.push({ startIndex: start, endIndex: end, gain, state: classifyGain(gain, neutralBand) });
  }
  return sectors;
}

export function makeGrid(length: number, step = DELTA_GRID_STEP_M): Float64Array {
  const count = Math.max(2, Math.floor(length / step) + 1);
  const grid = new Float64Array(count);
  for (let i = 0; i < count; i++) grid[i] = Math.min(i * step, length);
  if (grid[count - 1] < length) {
    const extended = new Float64Array(count + 1);
    extended.set(grid);
    extended[count] = length;
    return extended;
  }
  return grid;
}
