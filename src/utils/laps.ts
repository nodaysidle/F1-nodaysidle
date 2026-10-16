import type { Compound, Lap, Stint } from '../types/openf1';
import type { CompoundFilter, LapChoice } from '../store/slots';

export function compoundForLap(stints: Stint[], driverNumber: number, lapNumber: number): Compound | null {
  let match: Stint | null = null;
  for (const stint of stints) {
    if (stint.driver_number !== driverNumber) continue;
    const start = stint.lap_start ?? 1;
    const end = stint.lap_end ?? Number.POSITIVE_INFINITY;
    // Stints share their boundary lap (pit in/out); the later stint wins, matching what the car ran on exit.
    if (lapNumber >= start && lapNumber <= end && (!match || stint.stint_number > match.stint_number)) match = stint;
  }
  return match?.compound ?? null;
}

export function isTimedLap(lap: Lap): boolean {
  return lap.lap_duration !== null && lap.lap_duration > 0 && lap.date_start !== null;
}

/** Laps eligible for "fastest": timed, not an out-lap, and on the requested compound. */
export function eligibleLaps(laps: Lap[], stints: Stint[], compound: CompoundFilter): Lap[] {
  return laps.filter(
    (lap) =>
      isTimedLap(lap) &&
      !lap.is_pit_out_lap &&
      (compound === 'ANY' || compoundForLap(stints, lap.driver_number, lap.lap_number) === compound),
  );
}

export function selectLap(laps: Lap[], stints: Stint[], choice: LapChoice, compound: CompoundFilter): Lap | null {
  if (choice !== 'fastest') {
    const lap = laps.find((l) => l.lap_number === choice);
    return lap && isTimedLap(lap) ? lap : null;
  }
  let best: Lap | null = null;
  for (const lap of eligibleLaps(laps, stints, compound)) {
    if (!best || lap.lap_duration! < best.lap_duration!) best = lap;
  }
  return best;
}

export function formatLapTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, '0')}` : s.toFixed(3);
}

export function formatDelta(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  let sign = '±';
  if (seconds > 0) sign = '+';
  else if (seconds < 0) sign = '−';
  return `${sign}${Math.abs(seconds).toFixed(3)}`;
}
