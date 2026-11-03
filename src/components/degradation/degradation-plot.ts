import { COMPOUND_COLORS } from '../../utils/colors';
import type { SessionStintDegradation } from '../../utils/degradation';

export interface PlotSeries {
  label: string;
  kind: 'points' | 'line';
  color: string;
  values: (number | null)[];
}

export interface DegradationPlot {
  /** Shared x axis: tyre age in laps, ascending and unique. */
  xs: number[];
  series: PlotSeries[];
}

export type CompoundFilter = 'ALL' | 'SOFT' | 'MEDIUM' | 'HARD';

export const COMPOUND_FILTERS: readonly CompoundFilter[] = ['ALL', 'SOFT', 'MEDIUM', 'HARD'] as const;

export function filterStintsByCompound(
  stints: readonly SessionStintDegradation[],
  filter: CompoundFilter,
): SessionStintDegradation[] {
  if (filter === 'ALL') return [...stints];
  return stints.filter((s) => s.compound === filter);
}

export function visibleStints(
  stints: readonly SessionStintDegradation[],
  driverNumbers: ReadonlySet<number>,
  filter: CompoundFilter,
): SessionStintDegradation[] {
  const selected = stints.filter((s) => driverNumbers.has(s.driverNumber) && s.points.length > 0);
  return filterStintsByCompound(selected, filter);
}

const FALLBACK_COLOR = '#9CA3AF';

/**
 * Builds one shared x axis (tyre age) and, per selected stint, a points series and a fitted-line
 * series. Values are null where a stint has no data, so each series draws only its own stint.
 */
export function buildDegradationPlot(
  stints: readonly SessionStintDegradation[],
  driverLabels: ReadonlyMap<number, string>,
  driverNumbers: ReadonlySet<number>,
): DegradationPlot {
  const selected = stints.filter((s) => driverNumbers.has(s.driverNumber) && s.points.length > 0);
  const xs = [...new Set(selected.flatMap((s) => s.points.map((p) => p.age)))].sort((a, b) => a - b);
  const indexOf = new Map(xs.map((x, i) => [x, i]));

  const series: PlotSeries[] = [];
  for (const stint of selected) {
    const color = (stint.compound && COMPOUND_COLORS[stint.compound]) || FALLBACK_COLOR;
    const label = `${driverLabels.get(stint.driverNumber) ?? `#${stint.driverNumber}`} S${stint.stintNumber}${stint.compound ? ` ${stint.compound[0]}` : ''}`;

    const points: (number | null)[] = xs.map(() => null);
    for (const p of stint.points) points[indexOf.get(p.age)!] = p.time;
    series.push({ label, kind: 'points', color, values: points });

    if (stint.result.status === 'fitted') {
      const { slope, intercept } = stint.result;
      const minAge = Math.min(...stint.points.map((p) => p.age));
      const maxAge = Math.max(...stint.points.map((p) => p.age));
      const line = xs.map((x) => (x >= minAge && x <= maxAge ? intercept + slope * x : null));
      series.push({ label: `${label} fit`, kind: 'line', color, values: line });
    }
  }
  return { xs, series };
}
