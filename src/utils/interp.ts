export type NumArray = ArrayLike<number>;

/** Largest index i with xs[i] <= x, clamped to [0, xs.length - 2]. xs must be ascending. */
export function segmentIndex(xs: NumArray, x: number): number {
  const n = xs.length;
  if (n < 2 || x <= xs[0]) return 0;
  if (x >= xs[n - 1]) return Math.max(0, n - 2);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Linear interpolation with end clamping. */
export function interpLinear(xs: NumArray, ys: NumArray, x: number): number {
  const n = xs.length;
  if (n === 0) return NaN;
  if (n === 1 || x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  const i = segmentIndex(xs, x);
  const x0 = xs[i];
  const x1 = xs[i + 1];
  const span = x1 - x0;
  if (span <= 0) return ys[i];
  const f = (x - x0) / span;
  return ys[i] + (ys[i + 1] - ys[i]) * f;
}

/** Sample-and-hold: value of the last sample at or before x. */
export function interpStep(xs: NumArray, ys: NumArray, x: number): number {
  const n = xs.length;
  if (n === 0) return NaN;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  return ys[segmentIndex(xs, x)];
}

/**
 * Resamples a series onto an ascending grid in a single forward pass.
 * O(n + m), which matters when 4 laps × 8 channels are aligned on every slot change.
 */
export function resample(xs: NumArray, ys: NumArray, grid: NumArray, mode: 'linear' | 'step'): Float64Array {
  const out = new Float64Array(grid.length);
  const n = xs.length;
  if (n === 0) return out.fill(NaN);
  let i = 0;
  for (let g = 0; g < grid.length; g++) {
    const x = grid[g];
    if (x <= xs[0]) {
      out[g] = ys[0];
      continue;
    }
    if (x >= xs[n - 1]) {
      out[g] = ys[n - 1];
      continue;
    }
    while (i < n - 2 && xs[i + 1] <= x) i++;
    if (mode === 'step') {
      out[g] = ys[i];
    } else {
      const span = xs[i + 1] - xs[i];
      out[g] = span > 0 ? ys[i] + ((ys[i + 1] - ys[i]) * (x - xs[i])) / span : ys[i];
    }
  }
  return out;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
