import type { CarDataSample, LocationSample } from './openf1';

/** Raw per-lap payload as fetched from OpenF1 and persisted in IndexedDB. */
export interface RawLapTelemetry {
  sessionKey: number;
  driverNumber: number;
  lapNumber: number;
  /** Lap start, epoch milliseconds. */
  startMs: number;
  /** Lap duration in seconds. */
  duration: number;
  carData: CarDataSample[];
  location: LocationSample[];
}

/**
 * Lap telemetry after cleaning: every array is aligned to the car_data sample clock.
 * `t` is seconds since lap start; `d` is metres from integrating speed over `t`.
 */
export interface ProcessedLap {
  t: Float64Array;
  d: Float64Array;
  speed: Float64Array;
  throttle: Float64Array;
  /** Normalised to [0, 1]. */
  brake: Float64Array;
  rpm: Float64Array;
  gear: Float64Array;
  /** 1 when the flap is open, 0 otherwise. */
  drs: Float64Array;
  x: Float64Array;
  y: Float64Array;
  length: number;
  duration: number;
}

export interface Zone {
  /** Start distance on the shared grid, metres. */
  start: number;
  end: number;
}

/** One slot resampled on the shared distance grid. */
export interface AlignedSlot {
  t: Float64Array;
  speed: Float64Array;
  throttle: Float64Array;
  brake: Float64Array;
  rpm: Float64Array;
  gear: Float64Array;
  drs: Float64Array;
  x: Float64Array;
  y: Float64Array;
  /** comp time minus reference time at each grid point (zeros for the reference slot). */
  delta: Float64Array;
  liftCoast: Zone[];
  lapTime: number;
  rawLength: number;
}

export interface AlignedComparison {
  /** Shared distance grid in metres, 5 m spacing, spanning the reference lap. */
  grid: Float64Array;
  length: number;
  /** Indexed like the input slots; null where the slot was empty. */
  slots: (AlignedSlot | null)[];
}

export type MicroSectorState = 'faster' | 'slower' | 'neutral';
