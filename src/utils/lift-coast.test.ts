import { describe, expect, it } from 'vitest';
import { detectLiftCoast } from './lift-coast';

const series = (n: number, f: (i: number) => number) => Float64Array.from({ length: n }, (_, i) => f(i));

describe('detectLiftCoast', () => {
  const n = 12;
  const t = series(n, (i) => i * 0.27);
  const d = series(n, (i) => i * 20);
  const speed = series(n, () => 280);
  const brake = series(n, () => 0);

  it('flags a coasting run above 150 km/h', () => {
    const throttle = series(n, (i) => (i >= 4 && i <= 6 ? 0 : 100));
    const zones = detectLiftCoast({ t, d, speed, throttle, brake });
    expect(zones).toHaveLength(1);
    // Midpoints to neighbours: (3+4)/2 → (6+7)/2 samples.
    expect(zones[0].start).toBeCloseTo(70, 6);
    expect(zones[0].end).toBeCloseTo(130, 6);
  });

  it('rejects runs below the speed threshold', () => {
    const throttle = series(n, (i) => (i >= 4 && i <= 6 ? 0 : 100));
    const slow = series(n, () => 140);
    expect(detectLiftCoast({ t, d, speed: slow, throttle, brake })).toHaveLength(0);
  });

  it('rejects runs while braking', () => {
    const throttle = series(n, (i) => (i >= 4 && i <= 6 ? 0 : 100));
    const braking = series(n, (i) => (i === 5 ? 1 : 0));
    const zones = detectLiftCoast({ t, d, speed, throttle, brake: braking });
    // Braking at sample 5 splits the run into two single-sample zones of 270 ms each.
    expect(zones).toHaveLength(2);
  });

  it('enforces the 150 ms minimum duration', () => {
    const fastT = series(n, (i) => i * 0.1);
    const throttle = series(n, (i) => (i === 5 ? 0 : 100));
    expect(detectLiftCoast({ t: fastT, d, speed, throttle, brake })).toHaveLength(0);
  });
});
