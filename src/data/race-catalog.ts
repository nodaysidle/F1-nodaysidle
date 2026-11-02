import catalog from './race-catalog-2024-2026.json';

export interface CatalogRace {
  year: number;
  meeting_key: number;
  session_key: number;
  country: string;
  location: string;
  date: string;
  laps: number;
  timed_laps: number;
  stints: number;
  drivers: number;
  has_data: boolean;
}

export const RACE_CATALOG: readonly CatalogRace[] = catalog.races;

const MEETINGS_WITHOUT_RACE_DATA = new Set(RACE_CATALOG.filter((race) => !race.has_data).map((race) => race.meeting_key));

/** False only for meetings the catalog records as having no race lap data. Unknown meetings stay visible. */
export function meetingHasRaceData(meetingKey: number): boolean {
  return !MEETINGS_WITHOUT_RACE_DATA.has(meetingKey);
}
