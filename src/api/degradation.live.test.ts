import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { fitSessionDegradation } from '../utils/degradation';
import { neutralisedLapNumbers } from '../utils/neutralised-laps';
import { OpenF1Client } from './openf1';

// Hits the real OpenF1 API: `npm run test:live`.
describe('tyre degradation live', () => {
  const client = new OpenF1Client();

  async function load(sessionKey: number) {
    const session = await client.session(sessionKey);
    expect(session).toBeDefined();
    const [laps, stints, messages] = await Promise.all([
      client.laps(session!),
      client.stints(session!),
      client.raceControl(session!),
    ]);
    return { session: session!, laps, stints, messages };
  }

  it.each([
    ['2024 Bahrain race', 9472],
    ['2025 Bahrain race', 10014],
    ['2026 Mexico City race', 11404],
  ])('fits stints for the %s from real data', async (label, sessionKey) => {
    const { laps, stints, messages } = await load(sessionKey);
    const fits = fitSessionDegradation(laps, stints, messages);
    const fitted = fits.filter((f) => f.result.status === 'fitted');
    const drivers = new Set(fitted.map((f) => f.driverNumber));
    console.log(
      `${label}: stints=${stints.length} fitted=${fitted.length} drivers=${drivers.size} neutralised=${[...neutralisedLapNumbers(messages, Math.max(...laps.map((l) => l.lap_number)))].join(',') || 'none'}`,
    );
    expect(stints.length).toBeGreaterThan(0);
    expect(fitted.length).toBeGreaterThan(0);
    expect(drivers.size).toBeGreaterThanOrEqual(10);
  });

  it('excludes the 2024 Australia virtual safety car laps (17-18) from the fit', async () => {
    const { laps, messages } = await load(9488);
    const neutralised = neutralisedLapNumbers(messages, Math.max(...laps.map((l) => l.lap_number)));
    expect(neutralised.has(17)).toBe(true);
    expect(neutralised.has(18)).toBe(true);
  });
});
