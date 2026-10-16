// Records real OpenF1 laps as test fixtures: node scripts/record-fixture.mjs <session_key> <driver_number> [lap|fastest]
import { writeFileSync } from 'node:fs';

const [sessionKey, driverNumber, lapArg = 'fastest'] = process.argv.slice(2);
const B = 'https://api.openf1.org/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (res.status === 404) return [];
    await sleep(1000 * 2 ** i);
  }
  throw new Error(`failed ${url}`);
}
const laps = await get(`${B}/laps?session_key=${sessionKey}&driver_number=${driverNumber}`);
const timed = laps.filter((l) => l.lap_duration && l.date_start && !l.is_pit_out_lap);
const lap = lapArg === 'fastest' ? timed.sort((a, b) => a.lap_duration - b.lap_duration)[0] : laps.find((l) => l.lap_number === Number(lapArg));
const startMs = Date.parse(lap.date_start);
const from = new Date(startMs - 1500).toISOString();
const to = new Date(startMs + lap.lap_duration * 1000 + 1500).toISOString();
const scope = `session_key=${sessionKey}&driver_number=${driverNumber}&date>=${from}&date<=${to}`;
const carData = await get(`${B}/car_data?${scope}`);
await sleep(400);
const location = await get(`${B}/location?${scope}`);
const out = { sessionKey: Number(sessionKey), driverNumber: Number(driverNumber), lapNumber: lap.lap_number, startMs, duration: lap.lap_duration, carData, location };
const file = `src/test/fixtures/lap-${sessionKey}-${driverNumber}-${lap.lap_number}.json`;
writeFileSync(file, JSON.stringify(out));
console.log(file, lap.lap_duration, carData.length, location.length);
