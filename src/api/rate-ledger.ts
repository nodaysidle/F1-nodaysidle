export interface RateRules {
  /** Minimum spacing between request starts. */
  minIntervalMs: number;
  /** Maximum request starts in any rolling 60 s window. */
  perMinute: number;
}

interface LedgerState {
  /** Reserved start times, ascending, pruned to the last minute. */
  starts: number[];
  /** No request may start before this time (set after a 429). */
  blockedUntil: number;
}

const WINDOW_MS = 60_000;

/**
 * Pure scheduling step: the earliest start at or after `now` that respects spacing, the
 * rolling one-minute budget and any backoff block. Mutates `state` to record the reservation.
 */
export function reserveSlot(state: LedgerState, now: number, rules: RateRules): number {
  const last = state.starts.at(-1);
  let startAt = Math.max(now, state.blockedUntil, last === undefined ? 0 : last + rules.minIntervalMs);
  state.starts = state.starts.filter((t) => t > startAt - WINDOW_MS);
  if (state.starts.length >= rules.perMinute) {
    startAt = Math.max(startAt, state.starts[state.starts.length - rules.perMinute] + WINDOW_MS);
  }
  state.starts.push(startAt);
  return startAt;
}

/** Where the request budget is recorded. OpenF1 limits per client IP, so the budget is shared state. */
export interface RateLedger {
  reserve(now: number, rules: RateRules): Promise<number>;
  block(until: number): Promise<void>;
}

export class MemoryRateLedger implements RateLedger {
  private readonly state: LedgerState = { starts: [], blockedUntil: 0 };

  reserve(now: number, rules: RateRules): Promise<number> {
    return Promise.resolve(reserveSlot(this.state, now, rules));
  }

  block(until: number): Promise<void> {
    this.state.blockedUntil = Math.max(this.state.blockedUntil, until);
    return Promise.resolve();
  }
}

const STORAGE_KEY = 'f1tp-openf1-budget';
const LOCK_NAME = 'f1tp-openf1-budget';

/**
 * Budget persisted in localStorage so it survives reloads and is shared by every tab of the
 * app. Reservations run under a Web Lock so two tabs cannot claim the same slot. Falls back
 * to memory when storage is unavailable (private mode, blocked site data).
 */
export class SharedRateLedger implements RateLedger {
  private readonly fallback = new MemoryRateLedger();

  private read(): LedgerState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { starts: [], blockedUntil: 0 };
      const parsed = JSON.parse(raw) as Partial<LedgerState>;
      return {
        starts: Array.isArray(parsed.starts) ? parsed.starts.filter((t) => typeof t === 'number') : [],
        blockedUntil: typeof parsed.blockedUntil === 'number' ? parsed.blockedUntil : 0,
      };
    } catch {
      return null;
    }
  }

  private write(state: LedgerState): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
      return navigator.locks.request(LOCK_NAME, fn);
    }
    return fn();
  }

  reserve(now: number, rules: RateRules): Promise<number> {
    return this.exclusive(async () => {
      const state = this.read();
      if (!state) return this.fallback.reserve(now, rules);
      const startAt = reserveSlot(state, now, rules);
      return this.write(state) ? startAt : this.fallback.reserve(now, rules);
    });
  }

  block(until: number): Promise<void> {
    return this.exclusive(async () => {
      const state = this.read();
      if (!state) return this.fallback.block(until);
      state.blockedUntil = Math.max(state.blockedUntil, until);
      if (!this.write(state)) await this.fallback.block(until);
    });
  }
}

export function defaultLedger(): RateLedger {
  return typeof localStorage === 'undefined' ? new MemoryRateLedger() : new SharedRateLedger();
}
