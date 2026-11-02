import type { RaceControlMessage } from '../types/openf1';

const DEPLOYED = /\b(VSC|SAFETY CAR) DEPLOYED\b/;
const ENDED = /\b(VSC|SAFETY CAR) (ENDING|IN THIS LAP)\b/;

/**
 * Laps run under safety car or virtual safety car, from the deployment lap to the
 * ending lap, both inclusive. A deployment still open at the end of the data is closed at `finalLap`.
 * A new deployment before an ending closes the previous period on the lap before it, because the
 * ending message is missing and the period cannot be confirmed past that point.
 */
export function neutralisedLapNumbers(messages: readonly RaceControlMessage[], finalLap: number): Set<number> {
  const events = messages
    .filter((m) => m.category === 'SafetyCar' && m.lap_number !== null)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  const neutralised = new Set<number>();
  const markRange = (from: number, to: number) => {
    for (let lap = from; lap <= to; lap++) neutralised.add(lap);
  };

  let openFrom: number | null = null;
  for (const event of events) {
    const text = event.message.toUpperCase();
    if (DEPLOYED.test(text)) {
      if (openFrom !== null) markRange(openFrom, event.lap_number! - 1);
      openFrom = event.lap_number!;
    } else if (ENDED.test(text) && openFrom !== null) {
      markRange(openFrom, event.lap_number!);
      openFrom = null;
    }
  }
  if (openFrom !== null) markRange(openFrom, finalLap);
  return neutralised;
}
