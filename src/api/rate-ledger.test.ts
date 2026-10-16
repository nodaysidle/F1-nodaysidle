import { afterEach, describe, expect, it, vi } from 'vitest';
import { reserveSlot, SharedRateLedger } from './rate-ledger';

const RULES = { minIntervalMs: 400, perMinute: 3 };

class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe('reserveSlot', () => {
  it('spaces starts and caps the rolling minute', () => {
    const state = { starts: [] as number[], blockedUntil: 0 };
    expect([0, 0, 0, 0].map(() => reserveSlot(state, 0, RULES))).toEqual([0, 400, 800, 60_000]);
  });

  it('honours a backoff block', () => {
    const state = { starts: [], blockedUntil: 5000 };
    expect(reserveSlot(state, 0, RULES)).toBe(5000);
  });

  it('forgets starts older than a minute', () => {
    const state = { starts: [0, 400, 800], blockedUntil: 0 };
    expect(reserveSlot(state, 70_000, RULES)).toBe(70_000);
    expect(state.starts).toEqual([70_000]);
  });
});

describe('SharedRateLedger', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists the budget so a fresh instance (page reload) continues it', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    const before = new SharedRateLedger();
    for (let i = 0; i < 3; i++) await before.reserve(0, RULES);
    const afterReload = new SharedRateLedger();
    expect(await afterReload.reserve(0, RULES)).toBe(60_000);
  });

  it('shares 429 blocks with other instances', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    await new SharedRateLedger().block(9000);
    expect(await new SharedRateLedger().reserve(0, RULES)).toBe(9000);
  });

  it('falls back to memory when storage throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    });
    const ledger = new SharedRateLedger();
    expect(await ledger.reserve(0, RULES)).toBe(0);
    expect(await ledger.reserve(0, RULES)).toBe(400);
  });
});
