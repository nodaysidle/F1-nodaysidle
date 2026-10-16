import type { NumArray } from './interp';

const KMH_TO_MS = 1 / 3.6;

/**
 * Cumulative distance by trapezoidal integration of speed over time:
 *   d[i] = d[i-1] + ½ (v[i-1] + v[i]) · (t[i] - t[i-1])
 * `t` in seconds, `speedKmh` in km/h, result in metres. d[0] = 0.
 */
export function cumulativeDistance(t: NumArray, speedKmh: NumArray): Float64Array {
  const n = Math.min(t.length, speedKmh.length);
  const d = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const dt = t[i] - t[i - 1];
    const vMean = (speedKmh[i - 1] + speedKmh[i]) * 0.5 * KMH_TO_MS;
    d[i] = d[i - 1] + (dt > 0 ? vMean * dt : 0);
  }
  return d;
}
