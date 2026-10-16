import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { alignLaps, processLap } from '../workers/align';
import { selectLap } from '../utils/laps';
import { OpenF1Client } from './openf1';

// Hits the real OpenF1 API: `npm run test:live`.
describe('OpenF1 live', () => {
  const client = new OpenF1Client();

  it('loads, integrates and aligns the 2023 Monza qualifying pole lap', async () => {
    const meetings = await client.meetings(2023);
    const monza = meetings.find((m) => m.location === 'Monza');
    expect(monza).toBeDefined();
    const sessions = await client.sessions(monza!.meeting_key);
    const quali = sessions.find((s) => s.session_name === 'Qualifying')!;
    const drivers = await client.drivers(quali);
    expect(drivers.length).toBeGreaterThanOrEqual(20);

    const raws = [];
    for (const number of [55, 1]) {
      const [laps, stints] = await Promise.all([client.laps(quali, number), client.stints(quali, number)]);
      const lap = selectLap(laps, stints, 'fastest', 'ANY')!;
      raws.push(await client.lapTelemetry(lap));
    }
    const [sai, ver] = raws.map(processLap);
    // Monza: 5793 m.
    expect(Math.abs(sai.length - 5793) / 5793).toBeLessThan(0.02);
    const aligned = alignLaps([sai, ver]);
    const final = aligned.slots[1]!.delta.at(-1)!;
    expect(final).toBeCloseTo(raws[1].duration - raws[0].duration, 6);
    // Monza is mostly flat out; top speed must exceed 330 km/h.
    expect(Math.max(...sai.speed)).toBeGreaterThan(330);
  });
});
