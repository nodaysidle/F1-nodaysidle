export interface Meeting {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name: string;
  location: string;
  country_name: string;
  country_code: string;
  circuit_key: number;
  circuit_short_name: string;
  date_start: string;
  year: number;
}

export interface Session {
  session_key: number;
  /** e.g. Practice 1, Qualifying, Sprint, Sprint Qualifying, Race. */
  session_name: string;
  session_type: string;
  date_start: string;
  date_end: string;
  meeting_key: number;
  circuit_key: number;
  circuit_short_name: string;
  country_name: string;
  location: string;
  year: number;
}

export interface Driver {
  session_key: number;
  driver_number: number;
  broadcast_name: string;
  full_name: string;
  name_acronym: string;
  team_name: string | null;
  team_colour: string | null;
  headshot_url: string | null;
}

export interface Lap {
  session_key: number;
  driver_number: number;
  lap_number: number;
  date_start: string | null;
  lap_duration: number | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  is_pit_out_lap: boolean;
  segments_sector_1: (number | null)[] | null;
  segments_sector_2: (number | null)[] | null;
  segments_sector_3: (number | null)[] | null;
  i1_speed: number | null;
  i2_speed: number | null;
  st_speed: number | null;
}

export type Compound = 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET' | 'UNKNOWN' | 'TEST_UNKNOWN';

export interface Stint {
  session_key: number;
  driver_number: number;
  stint_number: number;
  lap_start: number | null;
  lap_end: number | null;
  compound: Compound | null;
  tyre_age_at_start: number | null;
}

export interface CarDataSample {
  date: string;
  driver_number: number;
  speed: number;
  throttle: number;
  brake: number;
  rpm: number;
  n_gear: number;
  drs: number;
}

export interface LocationSample {
  date: string;
  driver_number: number;
  x: number;
  y: number;
  z: number;
}

export interface PositionSample {
  date: string;
  driver_number: number;
  position: number;
}

export interface IntervalSample {
  date: string;
  driver_number: number;
  gap_to_leader: number | string | null;
  interval: number | string | null;
}

export interface PitStop {
  date: string;
  driver_number: number;
  lap_number: number;
  pit_duration: number | null;
}
