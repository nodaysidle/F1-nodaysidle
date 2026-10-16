import { describe, expect, it } from 'vitest';
import { makeGrid } from './delta';
import { locateOnGrid, sampleLinear, sampleNearest } from './grid';

describe('grid sampling', () => {
  const grid = makeGrid(12); // [0, 5, 10, 12]
  const values = Float64Array.from([0, 50, 100, 120]);

  it('brackets a distance and interpolates', () => {
    const at = locateOnGrid(grid, 7.5);
    expect(at).toEqual({ i: 1, j: 2, f: 0.5 });
    expect(sampleLinear(values, at)).toBe(75);
  });

  it('handles the short final segment and clamps out-of-range distances', () => {
    expect(sampleLinear(values, locateOnGrid(grid, 11))).toBeCloseTo(110, 10);
    expect(sampleLinear(values, locateOnGrid(grid, 99))).toBe(120);
    expect(sampleLinear(values, locateOnGrid(grid, -4))).toBe(0);
  });

  it('picks the nearest sample for discrete channels', () => {
    expect(sampleNearest(values, locateOnGrid(grid, 7))).toBe(50);
    expect(sampleNearest(values, locateOnGrid(grid, 8))).toBe(100);
  });
});
