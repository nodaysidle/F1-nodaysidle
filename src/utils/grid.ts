import { DELTA_GRID_STEP_M } from './delta';
import { clamp } from './interp';

/** Position of a distance on the shared grid: bracketing indices and the fraction between them. */
export interface GridPoint {
  i: number;
  j: number;
  f: number;
}

/** O(1) lookup, valid because the grid is uniformly spaced except for its final point. */
export function locateOnGrid(grid: Float64Array, distance: number): GridPoint {
  const last = grid.length - 1;
  const i = clamp(Math.floor(distance / DELTA_GRID_STEP_M), 0, last);
  const j = Math.min(last, i + 1);
  const span = grid[j] - grid[i];
  return { i, j, f: span > 0 ? clamp((distance - grid[i]) / span, 0, 1) : 0 };
}

export function sampleLinear(values: Float64Array, { i, j, f }: GridPoint): number {
  return values[i] + (values[j] - values[i]) * f;
}

/** Nearest grid sample, for discrete channels such as gear and DRS. */
export function sampleNearest(values: Float64Array, { i, j, f }: GridPoint): number {
  return f < 0.5 ? values[i] : values[j];
}
