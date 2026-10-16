import { describe, expect, it } from 'vitest';
import { interpLinear, interpStep, resample, segmentIndex } from './interp';

describe('interpolation', () => {
  const xs = [0, 1, 2, 4];
  const ys = [0, 10, 20, 40];

  it('finds the containing segment', () => {
    expect(segmentIndex(xs, -1)).toBe(0);
    expect(segmentIndex(xs, 1.5)).toBe(1);
    expect(segmentIndex(xs, 3)).toBe(2);
    expect(segmentIndex(xs, 9)).toBe(2);
  });

  it('interpolates linearly and clamps at the ends', () => {
    expect(interpLinear(xs, ys, 3)).toBe(30);
    expect(interpLinear(xs, ys, -5)).toBe(0);
    expect(interpLinear(xs, ys, 5)).toBe(40);
  });

  it('holds the previous sample in step mode', () => {
    expect(interpStep(xs, ys, 1.99)).toBe(10);
    expect(interpStep(xs, ys, 2)).toBe(20);
  });

  it('resample matches pointwise interpolation', () => {
    const grid = [-1, 0, 0.5, 1, 2.5, 3.9, 4, 6];
    const linear = resample(xs, ys, grid, 'linear');
    const step = resample(xs, ys, grid, 'step');
    grid.forEach((g, i) => {
      expect(linear[i]).toBeCloseTo(interpLinear(xs, ys, g), 10);
      expect(step[i]).toBe(interpStep(xs, ys, g));
    });
  });

  it('tolerates repeated x values (car stationary)', () => {
    expect(resample([0, 1, 1, 2], [0, 5, 5, 6], [1, 1.5], 'linear')).toEqual(Float64Array.from([5, 5.5]));
  });
});
