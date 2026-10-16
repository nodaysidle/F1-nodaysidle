import { describe, expect, it } from 'vitest';
import ver from '../test/fixtures/lap-9570-1-17.json';
import lec from '../test/fixtures/lap-9570-16-21.json';
import type { RawLapTelemetry } from '../types/telemetry';
import { alignLaps, drsOpen, normaliseBrake, processLap, timeAtDistance } from './align';

// Real OpenF1 laps: 2024 Belgian GP qualifying, VER lap 17 (1:53.159) and LEC lap 21 (1:53.754).
const verLap = ver as RawLapTelemetry;
const lecLap = lec as RawLapTelemetry;
const SPA_LENGTH_M = 7004;

describe('processLap on real telemetry', () => {
  const lap = processLap(verLap);

  it('spans exactly the timed lap', () => {
    expect(lap.t[0]).toBe(0);
    expect(lap.t[lap.t.length - 1]).toBeCloseTo(verLap.duration, 9);
    expect(lap.d[0]).toBe(0);
  });

  it('integrates speed to within 2% of the official circuit length', () => {
    expect(Math.abs(lap.length - SPA_LENGTH_M) / SPA_LENGTH_M).toBeLessThan(0.02);
  });

  it('produces monotonic distance and bounded channels', () => {
    for (let i = 1; i < lap.d.length; i++) expect(lap.d[i]).toBeGreaterThanOrEqual(lap.d[i - 1]);
    for (const b of lap.brake) expect(b >= 0 && b <= 1).toBe(true);
    for (const v of lap.throttle) expect(v >= 0 && v <= 100).toBe(true);
    for (const v of lap.drs) expect(v === 0 || v === 1).toBe(true);
    expect(lap.x.every(Number.isFinite)).toBe(true);
  });

  it('closes the circuit: start and end positions nearly coincide', () => {
    const n = lap.x.length - 1;
    // OpenF1 coordinates are decimetres; allow 60 m for sample timing at ~300 km/h.
    expect(Math.hypot(lap.x[n] - lap.x[0], lap.y[n] - lap.y[0])).toBeLessThan(600);
  });
});

describe('alignLaps on real telemetry', () => {
  const result = alignLaps([processLap(verLap), processLap(lecLap), null, null]);
  const [ref, comp] = result.slots;

  it('lays both laps on a shared 5 m grid', () => {
    expect(result.grid[1] - result.grid[0]).toBe(5);
    expect(ref!.t.length).toBe(result.grid.length);
    expect(comp!.t.length).toBe(result.grid.length);
    expect(result.slots[2]).toBeNull();
  });

  it('ends the delta at the official lap-time gap', () => {
    const final = comp!.delta[comp!.delta.length - 1];
    expect(final).toBeCloseTo(lecLap.duration - verLap.duration, 6);
    expect(ref!.delta.every((v) => v === 0)).toBe(true);
  });

  it('interpolates elapsed time by distance', () => {
    expect(timeAtDistance(result.grid, ref!, result.length)).toBeCloseTo(verLap.duration, 6);
    expect(timeAtDistance(result.grid, ref!, 0)).toBe(0);
  });
});

describe('channel normalisation', () => {
  it('maps brake to [0,1] and DRS codes to open/closed', () => {
    expect(normaliseBrake(100)).toBe(1);
    expect(normaliseBrake(104)).toBe(1);
    expect(normaliseBrake(0)).toBe(0);
    expect([0, 1, 8, 10, 12, 14].map(drsOpen)).toEqual([0, 0, 0, 1, 1, 1]);
  });
});
