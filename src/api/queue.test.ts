import { describe, expect, it, vi } from 'vitest';
import { HttpError, RequestQueue } from './queue';
import { MemoryRateLedger, type RateLedger } from './rate-ledger';

interface Clock {
  t: number;
}

function harness(
  responses: Record<string, number[]>,
  ledger: RateLedger = new MemoryRateLedger(),
  clock: Clock = { t: 0 },
  starts: { url: string; at: number }[] = [],
) {
  let wakeFrom = clock.t;
  const counters = new Map<string, number>();
  const fetchFn = ((input: string | URL | Request) => {
    const url = input as string;
    starts.push({ url, at: clock.t });
    const n = counters.get(url) ?? 0;
    counters.set(url, n + 1);
    const codes = responses[url] ?? [200];
    const status = codes[Math.min(n, codes.length - 1)];
    const body = status === 200 ? JSON.stringify([{ url }]) : JSON.stringify({ detail: 'x' });
    return Promise.resolve(new Response(body, { status }));
  }) as typeof fetch;
  const queue = new RequestQueue({
    fetchFn,
    now: () => (wakeFrom = clock.t),
    // Advance to the wake-up time rather than by the duration, so concurrent sleepers on a
    // shared clock behave like real timers.
    sleep: (ms) => {
      clock.t = Math.max(clock.t, wakeFrom + ms);
      return Promise.resolve();
    },
    ledger,
    minIntervalMs: 350,
    maxConcurrent: 2,
    baseBackoffMs: 1000,
    perMinute: 5,
  });
  return { queue, starts };
}

describe('RequestQueue', () => {
  it('spaces request starts by the minimum interval', async () => {
    const { queue, starts } = harness({});
    await Promise.all(['a', 'b', 'c', 'd'].map((u) => queue.getJson(u)));
    const gaps = starts.slice(1).map((s, i) => s.at - starts[i].at);
    expect(gaps.every((g) => g >= 350)).toBe(true);
  });

  it('never exceeds the per-minute budget in any rolling window', async () => {
    const { queue, starts } = harness({});
    await Promise.all(Array.from({ length: 12 }, (_, i) => queue.getJson(`u${i}`)));
    for (const s of starts) {
      expect(starts.filter((o) => o.at >= s.at && o.at < s.at + 60_000).length).toBeLessThanOrEqual(5);
    }
    expect(starts[5].at - starts[0].at).toBeGreaterThanOrEqual(60_000);
  });

  it('shares the budget between queues using one ledger (page reload, second tab)', async () => {
    vi.useFakeTimers();
    try {
      const ledger = new MemoryRateLedger();
      const starts: number[] = [];
      const fetchFn = (() => {
        starts.push(Date.now());
        return Promise.resolve(new Response('[]', { status: 200 }));
      }) as typeof fetch;
      const make = () => new RequestQueue({ fetchFn, ledger, minIntervalMs: 350, perMinute: 5 });
      const first = make();
      const second = make();
      const all = Promise.all([
        ...Array.from({ length: 5 }, (_, i) => first.getJson(`a${i}`)),
        ...Array.from({ length: 5 }, (_, i) => second.getJson(`b${i}`)),
      ]);
      await vi.runAllTimersAsync();
      await all;
      expect(starts).toHaveLength(10);
      for (const at of starts) expect(starts.filter((o) => o >= at && o < at + 60_000).length).toBeLessThanOrEqual(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('makes other queues on the same ledger wait out a 429 backoff', async () => {
    const ledger = new MemoryRateLedger();
    const clock = { t: 0 };
    const starts: { url: string; at: number }[] = [];
    const first = harness({ busy: [429, 200] }, ledger, clock, starts);
    const second = harness({}, ledger, clock, starts);
    await first.queue.getJson('busy');
    const blockedAt = starts[0].at;
    await second.queue.getJson('other');
    expect(starts.find((s) => s.url === 'other')!.at - blockedAt).toBeGreaterThanOrEqual(1000);
  });

  it('maps 404 to an empty result', async () => {
    const { queue } = harness({ missing: [404] });
    expect(await queue.getJson('missing')).toEqual([]);
  });

  it('retries 429 with exponential backoff', async () => {
    const { queue, starts } = harness({ busy: [429, 429, 200] });
    expect(await queue.getJson('busy')).toEqual([{ url: 'busy' }]);
    const attempts = starts.filter((s) => s.url === 'busy');
    expect(attempts).toHaveLength(3);
    expect(attempts[1].at - attempts[0].at).toBeGreaterThanOrEqual(1000);
    expect(attempts[2].at - attempts[1].at).toBeGreaterThanOrEqual(2000);
  });

  it('gives up after maxRetries and surfaces the status', async () => {
    const { queue } = harness({ down: [503] });
    await expect(queue.getJson('down')).rejects.toBeInstanceOf(HttpError);
  });

  it('does not retry client errors', async () => {
    const { queue, starts } = harness({ bad: [422] });
    await expect(queue.getJson('bad')).rejects.toMatchObject({ status: 422 });
    expect(starts).toHaveLength(1);
  });

  it('deduplicates identical in-flight requests', async () => {
    const { queue, starts } = harness({});
    const [a, b] = await Promise.all([queue.getJson('same'), queue.getJson('same')]);
    expect(a).toBe(b);
    expect(starts).toHaveLength(1);
  });
});
