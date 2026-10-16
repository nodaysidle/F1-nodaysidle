import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { idbClear, idbCount, idbGet, idbSet, resetIdbConnection } from './idb';

describe('IndexedDB cache', () => {
  beforeEach(async () => {
    resetIdbConnection();
    await idbClear();
  });

  it('round-trips values', async () => {
    await idbSet('9570:1:17', { carData: [1, 2, 3] });
    expect(await idbGet('9570:1:17')).toEqual({ carData: [1, 2, 3] });
    expect(await idbCount()).toBe(1);
  });

  it('treats entries older than maxAge as missing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await idbSet('meta', [1]);
    vi.setSystemTime(new Date('2026-01-01T01:00:00Z'));
    expect(await idbGet('meta', 30 * 60 * 1000)).toBeUndefined();
    expect(await idbGet('meta', 2 * 3600 * 1000)).toEqual([1]);
    vi.useRealTimers();
  });
});
