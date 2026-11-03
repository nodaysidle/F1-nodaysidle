import { describe, expect, it } from 'vitest';
import { COMPOUND_COLORS } from '../../utils/colors';
import type { DegradationPoint, SessionStintDegradation } from '../../utils/degradation';
import {
  buildDegradationPlot,
  filterStintsByCompound,
  visibleStints,
} from './degradation-plot';

function stint(overrides: Partial<SessionStintDegradation> & { points: DegradationPoint[] }): SessionStintDegradation {
  return {
    driverNumber: 1,
    stintNumber: 1,
    compound: 'MEDIUM',
    lapStart: 1,
    lapEnd: 5,
    result: { status: 'insufficient', lapCount: 0 },
    ...overrides,
  };
}

const labels = new Map([[1, 'VER'], [16, 'LEC']]);

describe('buildDegradationPlot', () => {
  it('builds a shared, ascending, unique tyre-age axis across selected stints', () => {
    const fits = [
      stint({ points: [{ age: 2, time: 80 }, { age: 3, time: 80.1 }] }),
      stint({ driverNumber: 16, points: [{ age: 3, time: 81 }, { age: 1, time: 79.9 }] }),
    ];
    const plot = buildDegradationPlot(fits, labels, new Set([1, 16]));
    expect(plot.xs).toEqual([1, 2, 3]);
  });

  it('leaves a stint null at ages where another selected stint has laps but it does not', () => {
    const fits = [
      stint({ points: [{ age: 1, time: 80 }, { age: 3, time: 82 }] }),
      stint({ driverNumber: 16, points: [{ age: 2, time: 81 }] }),
    ];
    const plot = buildDegradationPlot(fits, labels, new Set([1, 16]));
    expect(plot.xs).toEqual([1, 2, 3]);
    expect(plot.series[0].values).toEqual([80, null, 82]);
    expect(plot.series[1].values).toEqual([null, 81, null]);
  });

  it('places each lap in its own stint series', () => {
    const fits = [stint({ points: [{ age: 1, time: 80 }, { age: 3, time: 82 }] })];
    const plot = buildDegradationPlot(fits, labels, new Set([1]));
    expect(plot.series).toHaveLength(1);
    expect(plot.xs).toEqual([1, 3]);
    expect(plot.series[0].values).toEqual([80, 82]);
  });

  it('adds a fitted-line series only for fitted stints, spanning the stint ages', () => {
    const fits = [
      stint({
        points: [{ age: 1, time: 80 }, { age: 2, time: 80.5 }, { age: 3, time: 81 }],
        result: { status: 'fitted', slope: 0.5, intercept: 79.5, rSquared: 1, lapCount: 3 },
      }),
    ];
    const plot = buildDegradationPlot(fits, labels, new Set([1]));
    const line = plot.series.find((s) => s.kind === 'line');
    expect(line).toBeDefined();
    expect(line!.values).toEqual([80, 80.5, 81]);
  });

  it('colours by compound and labels by driver, stint and compound initial', () => {
    const fits = [stint({ compound: 'HARD', stintNumber: 2, points: [{ age: 1, time: 80 }] })];
    const plot = buildDegradationPlot(fits, labels, new Set([1]));
    expect(plot.series[0]).toMatchObject({ label: 'VER S2 H', kind: 'points', color: '#F0F0F0' });
  });

  it('excludes drivers that are not selected', () => {
    const fits = [stint({ driverNumber: 16, points: [{ age: 1, time: 80 }] })];
    const plot = buildDegradationPlot(fits, labels, new Set([1]));
    expect(plot.series).toHaveLength(0);
    expect(plot.xs).toEqual([]);
  });

  it('falls back to a neutral colour and driver number when unknown', () => {
    const fits = [stint({ driverNumber: 44, compound: null, points: [{ age: 1, time: 80 }] })];
    const plot = buildDegradationPlot(fits, labels, new Set([44]));
    expect(plot.series[0]).toMatchObject({ label: '#44 S1', color: '#9CA3AF' });
  });
});

describe('compound filtering and visible stints', () => {
  it('drops stints with 0 points from visibleStints and from buildDegradationPlot series', () => {
    const stints = [
      stint({ driverNumber: 1, stintNumber: 1, points: [] }),
      stint({ driverNumber: 1, stintNumber: 2, points: [{ age: 1, time: 80 }] }),
    ];
    const visible = visibleStints(stints, new Set([1]), 'ALL');
    expect(visible).toHaveLength(1);
    expect(visible[0].stintNumber).toBe(2);

    const plot = buildDegradationPlot(stints, labels, new Set([1]));
    expect(plot.series).toHaveLength(1);
    expect(plot.series[0].label).toContain('S2');
  });

  it('filterStintsByCompound returns only matching stints for specific compounds and everything for ALL', () => {
    const allStints = [
      stint({ stintNumber: 1, compound: 'SOFT', points: [{ age: 1, time: 80 }] }),
      stint({ stintNumber: 2, compound: 'MEDIUM', points: [{ age: 1, time: 80 }] }),
      stint({ stintNumber: 3, compound: 'HARD', points: [{ age: 1, time: 80 }] }),
      stint({ stintNumber: 4, compound: 'INTERMEDIATE', points: [{ age: 1, time: 80 }] }),
      stint({ stintNumber: 5, compound: 'WET', points: [{ age: 1, time: 80 }] }),
      stint({ stintNumber: 6, compound: null, points: [{ age: 1, time: 80 }] }),
    ];

    expect(filterStintsByCompound(allStints, 'SOFT').map((s) => s.stintNumber)).toEqual([1]);
    expect(filterStintsByCompound(allStints, 'MEDIUM').map((s) => s.stintNumber)).toEqual([2]);
    expect(filterStintsByCompound(allStints, 'HARD').map((s) => s.stintNumber)).toEqual([3]);

    const allResult = filterStintsByCompound(allStints, 'ALL');
    expect(allResult.map((s) => s.stintNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('visibleStints combines driver selection, zero-point exclusion, and compound filter', () => {
    const stints = [
      stint({ driverNumber: 1, stintNumber: 1, compound: 'SOFT', points: [{ age: 1, time: 80 }] }),
      stint({ driverNumber: 1, stintNumber: 2, compound: 'HARD', points: [{ age: 1, time: 81 }] }),
      stint({ driverNumber: 16, stintNumber: 1, compound: 'SOFT', points: [{ age: 1, time: 80.5 }] }),
      stint({ driverNumber: 16, stintNumber: 2, compound: 'SOFT', points: [] }),
      stint({ driverNumber: 44, stintNumber: 1, compound: 'SOFT', points: [{ age: 1, time: 82 }] }),
    ];

    const visible = visibleStints(stints, new Set([1, 16]), 'SOFT');
    expect(visible.map((s) => `${s.driverNumber}-S${s.stintNumber}`)).toEqual(['1-S1', '16-S1']);
  });

  it('buildDegradationPlot over filtered stints yields series colors equal to COMPOUND_COLORS and no other compounds', () => {
    const stints = [
      stint({ driverNumber: 1, stintNumber: 1, compound: 'SOFT', points: [{ age: 1, time: 80 }] }),
      stint({ driverNumber: 1, stintNumber: 2, compound: 'MEDIUM', points: [{ age: 1, time: 81 }] }),
      stint({ driverNumber: 1, stintNumber: 3, compound: 'HARD', points: [{ age: 1, time: 82 }] }),
    ];

    const softStints = visibleStints(stints, new Set([1]), 'SOFT');
    const plot = buildDegradationPlot(softStints, labels, new Set([1]));

    expect(plot.series.length).toBeGreaterThan(0);
    for (const s of plot.series) {
      expect(s.color).toBe(COMPOUND_COLORS.SOFT);
      expect(s.color).not.toBe(COMPOUND_COLORS.MEDIUM);
      expect(s.color).not.toBe(COMPOUND_COLORS.HARD);
    }
    expect(plot.series.some((s) => s.label.includes('MEDIUM') || s.label.includes('HARD'))).toBe(false);
  });
});
