import { describe, expect, it } from 'vitest';
import type { Lap, Stint } from '../types/openf1';
import { compoundForLap, formatDelta, formatLapTime, selectLap } from './laps';

const lap = (lap_number: number, lap_duration: number | null, is_pit_out_lap = false): Lap => ({
  session_key: 1,
  driver_number: 1,
  lap_number,
  lap_duration,
  is_pit_out_lap,
  date_start: lap_duration === null ? null : '2024-07-27T14:00:00Z',
  duration_sector_1: null,
  duration_sector_2: null,
  duration_sector_3: null,
  segments_sector_1: null,
  segments_sector_2: null,
  segments_sector_3: null,
  i1_speed: null,
  i2_speed: null,
  st_speed: null,
});
const stint = (stint_number: number, lap_start: number, lap_end: number, compound: Stint['compound']): Stint => ({
  session_key: 1,
  driver_number: 1,
  stint_number,
  lap_start,
  lap_end,
  compound,
  tyre_age_at_start: 0,
});

describe('lap selection', () => {
  const laps = [lap(1, 95, true), lap(2, 90), lap(3, 88), lap(4, 91), lap(5, null)];
  const stints = [stint(1, 1, 3, 'SOFT'), stint(2, 3, 5, 'HARD')];

  it('picks the fastest timed non-out lap', () => {
    expect(selectLap(laps, stints, 'fastest', 'ANY')?.lap_number).toBe(3);
  });

  it('filters fastest by compound, later stint winning a shared boundary lap', () => {
    expect(compoundForLap(stints, 1, 3)).toBe('HARD');
    expect(selectLap(laps, stints, 'fastest', 'SOFT')?.lap_number).toBe(2);
    expect(selectLap(laps, stints, 'fastest', 'WET')).toBeNull();
  });

  it('returns a specific lap only if timed', () => {
    expect(selectLap(laps, stints, 4, 'ANY')?.lap_number).toBe(4);
    expect(selectLap(laps, stints, 5, 'ANY')).toBeNull();
  });

  it('formats times', () => {
    expect(formatLapTime(113.159)).toBe('1:53.159');
    expect(formatLapTime(65.0)).toBe('1:05.000');
    expect(formatDelta(0.595)).toBe('+0.595');
    expect(formatDelta(-0.1)).toBe('−0.100');
  });
});
