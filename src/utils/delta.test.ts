import { describe, expect, it } from 'vitest';
import { classifyMicroSectors, makeGrid, timeDelta } from './delta';

describe('delta', () => {
  it('computes comp minus ref', () => {
    expect(Array.from(timeDelta([0, 1, 2], [0, 1.1, 1.9]))).toEqual([0, 1.1 - 1, 1.9 - 2]);
  });

  it('builds a 5 m grid that ends exactly at the lap length', () => {
    const grid = makeGrid(12);
    expect(Array.from(grid)).toEqual([0, 5, 10, 12]);
    expect(Array.from(makeGrid(10))).toEqual([0, 5, 10]);
  });

  it('classifies micro-sectors by time gained inside each', () => {
    // 41 points at 5 m = 200 m → two 100 m sectors.
    const delta = Float64Array.from({ length: 41 }, (_, i) => (i <= 20 ? -0.005 * i : -0.1 + 0.0005 * (i - 20)));
    const sectors = classifyMicroSectors(delta);
    expect(sectors.map((s) => s.state)).toEqual(['faster', 'neutral']);
    expect(sectors[0].gain).toBeCloseTo(-0.1, 10);
  });

  it('marks lost time red', () => {
    const delta = Float64Array.from({ length: 21 }, (_, i) => 0.01 * i);
    expect(classifyMicroSectors(delta)[0].state).toBe('slower');
  });
});
