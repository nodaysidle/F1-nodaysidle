import { describe, expect, it } from 'vitest';
import { cumulativeDistance } from './distance';

describe('cumulativeDistance', () => {
  it('integrates constant speed exactly', () => {
    const d = cumulativeDistance([0, 1, 2, 3], [360, 360, 360, 360]);
    expect(Array.from(d)).toEqual([0, 100, 200, 300]);
  });

  it('uses the trapezoid rule for linear acceleration', () => {
    // 0 → 36 km/h (10 m/s) over 2 s covers exactly 10 m.
    const d = cumulativeDistance([0, 1, 2], [0, 18, 36]);
    expect(d[2]).toBeCloseTo(10, 10);
  });

  it('ignores non-increasing timestamps', () => {
    const d = cumulativeDistance([0, 1, 1, 0.5], [36, 36, 36, 36]);
    expect(Array.from(d)).toEqual([0, 10, 10, 10]);
  });
});
