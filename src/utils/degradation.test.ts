import { describe, expect, it } from 'vitest';
import type { Lap, RaceControlMessage, Stint } from '../types/openf1';
import { MIN_DEGRADATION_LAPS, fitSessionDegradation, fitStintDegradation, tyreAgeForLap } from './degradation';

function lap(lapNumber: number, duration: number | null, overrides: Partial<Lap> = {}): Lap {
  return {
    session_key: 1,
    driver_number: 1,
    lap_number: lapNumber,
    date_start: '2026-01-01T00:00:00Z',
    lap_duration: duration,
    duration_sector_1: null,
    duration_sector_2: null,
    duration_sector_3: null,
    is_pit_out_lap: false,
    segments_sector_1: null,
    segments_sector_2: null,
    segments_sector_3: null,
    i1_speed: null,
    i2_speed: null,
    st_speed: null,
    ...overrides,
  };
}

function stint(overrides: Partial<Stint> = {}): Stint {
  return {
    session_key: 1,
    driver_number: 1,
    stint_number: 1,
    lap_start: 1,
    lap_end: 10,
    compound: 'MEDIUM',
    tyre_age_at_start: 0,
    ...overrides,
  };
}

const TRUE_SLOPE = 0.08;
const TRUE_INTERCEPT = 80;

function linearLaps(count: number, extra: Partial<Lap> = {}): Lap[] {
  return Array.from({ length: count }, (_, i) => lap(i + 1, TRUE_INTERCEPT + TRUE_SLOPE * i, extra));
}

describe('tyreAgeForLap', () => {
  it('adds laps since stint start to the age at start', () => {
    expect(tyreAgeForLap(stint({ tyre_age_at_start: 4, lap_start: 10 }), 13)).toBe(7);
  });

  it('returns null when the stint lacks an age or start lap', () => {
    expect(tyreAgeForLap(stint({ tyre_age_at_start: null }), 3)).toBeNull();
    expect(tyreAgeForLap(stint({ lap_start: null }), 3)).toBeNull();
  });
});

describe('fitStintDegradation', () => {
  it('recovers a known slope and intercept from noiseless laps', () => {
    const result = fitStintDegradation(linearLaps(10), stint({ lap_end: 10, tyre_age_at_start: 0 }), { isLastStint: true });
    expect(result.status).toBe('fitted');
    if (result.status !== 'fitted') return;
    expect(result.slope).toBeCloseTo(TRUE_SLOPE, 10);
    expect(result.intercept).toBeCloseTo(TRUE_INTERCEPT, 10);
    expect(result.rSquared).toBeCloseTo(1, 10);
    expect(result.lapCount).toBe(10);
  });

  it('uses the stint tyre age, not the lap number, as the x-axis', () => {
    const laps = Array.from({ length: 8 }, (_, i) => lap(i + 21, TRUE_INTERCEPT + TRUE_SLOPE * (i + 5)));
    const result = fitStintDegradation(laps, stint({ lap_start: 21, lap_end: 28, tyre_age_at_start: 5 }), { isLastStint: true });
    expect(result.status).toBe('fitted');
    if (result.status !== 'fitted') return;
    expect(result.slope).toBeCloseTo(TRUE_SLOPE, 10);
    expect(result.intercept).toBeCloseTo(TRUE_INTERCEPT, 10);
  });

  it('excludes the out-lap, and the in-lap of a non-final stint', () => {
    const laps = [
      lap(1, 200, { is_pit_out_lap: true }),
      ...Array.from({ length: 9 }, (_, i) => lap(i + 2, TRUE_INTERCEPT + TRUE_SLOPE * (i + 1))),
      lap(11, 999),
    ];
    const result = fitStintDegradation(laps, stint({ lap_start: 1, lap_end: 11, tyre_age_at_start: 0 }));
    expect(result.status).toBe('fitted');
    if (result.status !== 'fitted') return;
    expect(result.lapCount).toBe(9);
  });

  it('excludes laps flagged as safety car or VSC', () => {
    const laps = linearLaps(10);
    const result = fitStintDegradation(laps, stint({ lap_end: 10 }), { isLastStint: true, excludeLaps: new Set([3, 4]) });
    expect(result.status).toBe('fitted');
    if (result.status !== 'fitted') return;
    expect(result.lapCount).toBe(8);
    expect(result.slope).toBeCloseTo(TRUE_SLOPE, 10);
  });

  it('ignores laps with no valid duration', () => {
    const laps = [...linearLaps(10), lap(11, null), lap(12, 0)];
    const result = fitStintDegradation(laps, stint({ lap_end: 12 }), { isLastStint: true });
    expect(result.status).toBe('fitted');
    if (result.status !== 'fitted') return;
    expect(result.lapCount).toBe(10);
  });

  it('ignores laps from other drivers', () => {
    const laps = [...linearLaps(10), ...linearLaps(10).map((l) => ({ ...l, driver_number: 2, lap_duration: 500 }))];
    const result = fitStintDegradation(laps, stint({ lap_end: 10 }), { isLastStint: true });
    expect(result.status).toBe('fitted');
    if (result.status !== 'fitted') return;
    expect(result.slope).toBeCloseTo(TRUE_SLOPE, 10);
  });

  it(`reports insufficient data under ${MIN_DEGRADATION_LAPS} usable laps`, () => {
    const result = fitStintDegradation(linearLaps(4), stint({ lap_end: 4 }), { isLastStint: true });
    expect(result).toEqual({ status: 'insufficient', lapCount: 4 });
  });

  it('reports insufficient data when the stint has no tyre age', () => {
    const result = fitStintDegradation(linearLaps(10), stint({ lap_end: 10, tyre_age_at_start: null }), { isLastStint: true });
    expect(result).toEqual({ status: 'insufficient', lapCount: 0 });
  });
});

describe('fitSessionDegradation', () => {
  function message(lap: number, text: string): RaceControlMessage {
    return {
      session_key: 1,
      meeting_key: 1,
      date: `2026-01-01T12:0${lap % 10}:00+00:00`,
      category: 'SafetyCar',
      flag: null,
      lap_number: lap,
      driver_number: null,
      message: text,
      scope: null,
      sector: null,
      qualifying_phase: null,
    };
  }

  it('applies the session-wide safety car exclusion to every driver', () => {
    const drivers = [1, 2];
    const laps = drivers.flatMap((d) =>
      Array.from({ length: 12 }, (_, i) => ({ ...lap(i + 1, TRUE_INTERCEPT + TRUE_SLOPE * i), driver_number: d })),
    );
    const stints = drivers.map((d) => stint({ driver_number: d, lap_start: 1, lap_end: 12, tyre_age_at_start: 0, stint_number: 1 }));
    const messages = [message(4, 'VIRTUAL SAFETY CAR DEPLOYED'), message(5, 'VIRTUAL SAFETY CAR ENDING')];
    const fits = fitSessionDegradation(laps, stints, messages);
    expect(fits).toHaveLength(2);
    for (const fit of fits) {
      expect(fit.result.status).toBe('fitted');
      if (fit.result.status !== 'fitted') continue;
      expect(fit.result.lapCount).toBe(10);
      expect(fit.result.slope).toBeCloseTo(TRUE_SLOPE, 10);
    }
  });

  it('treats only the final stint of each driver as having no in-lap exclusion', () => {
    const laps = linearLaps(12);
    const stints = [
      stint({ stint_number: 1, lap_start: 1, lap_end: 6, tyre_age_at_start: 0 }),
      stint({ stint_number: 2, lap_start: 6, lap_end: 12, tyre_age_at_start: 0 }),
    ];
    const fits = fitSessionDegradation(laps, stints, []);
    expect(fits[0].result).toMatchObject({ status: 'fitted', lapCount: 5 });
    expect(fits[1].result).toMatchObject({ status: 'fitted', lapCount: 7 });
  });

  it('returns insufficient results rather than dropping a stint', () => {
    const fits = fitSessionDegradation(linearLaps(3), [stint({ lap_end: 3 })], []);
    expect(fits).toHaveLength(1);
    expect(fits[0].result.status).toBe('insufficient');
  });
});
