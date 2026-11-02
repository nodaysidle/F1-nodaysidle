import { describe, expect, it } from 'vitest';
import { RACE_CATALOG, meetingHasRaceData } from './race-catalog';

describe('race catalog', () => {
  it('covers 2024 to 2026 with 69 races, 67 of which have data', () => {
    expect(RACE_CATALOG).toHaveLength(69);
    expect(RACE_CATALOG.filter((r) => r.has_data)).toHaveLength(67);
    expect(new Set(RACE_CATALOG.map((r) => r.year))).toEqual(new Set([2024, 2025, 2026]));
  });

  it('hides the two 2026 meetings with no race data', () => {
    const noData = RACE_CATALOG.filter((r) => !r.has_data).map((r) => `${r.year} ${r.country}`);
    expect(noData.sort()).toEqual(['2026 Bahrain', '2026 Saudi Arabia']);
    for (const race of RACE_CATALOG.filter((r) => !r.has_data)) {
      expect(meetingHasRaceData(race.meeting_key)).toBe(false);
    }
  });

  it('keeps meetings with race data, including the last 2026 round', () => {
    const mexico = RACE_CATALOG.find((r) => r.year === 2026 && r.country === 'Mexico');
    expect(mexico).toMatchObject({ laps: 1360, has_data: true });
    expect(meetingHasRaceData(mexico!.meeting_key)).toBe(true);
  });

  it('keeps meetings it does not know about', () => {
    expect(meetingHasRaceData(999999)).toBe(true);
  });
});
