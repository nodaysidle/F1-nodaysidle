import { defaultLedger, type RateLedger } from './rate-ledger';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`OpenF1 request failed with HTTP ${status}: ${url}`);
    this.name = 'HttpError';
  }
}

export interface QueueOptions {
  /** Minimum spacing between request starts (OpenF1 free tier: 3 req/s). */
  minIntervalMs: number;
  /** Maximum request starts in any rolling 60 s window (OpenF1 free tier: 30 req/min). */
  perMinute: number;
  maxConcurrent: number;
  maxRetries: number;
  baseBackoffMs: number;
  fetchFn: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** Shared record of request starts; defaults to localStorage-backed when available. */
  ledger: RateLedger;
}

type Task = () => Promise<void>;

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Serialises OpenF1 requests under a start-rate limit with bounded concurrency,
 * retrying 429 and 5xx responses with exponential backoff. A 404 is OpenF1's
 * "No results found." and resolves to an empty array.
 */
export class RequestQueue {
  private readonly opts: QueueOptions;
  private readonly pending: Task[] = [];
  private active = 0;
  private pumping = false;
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(options: Partial<QueueOptions> = {}) {
    this.opts = {
      minIntervalMs: 400,
      perMinute: 28,
      maxConcurrent: 2,
      maxRetries: 5,
      baseBackoffMs: 1000,
      fetchFn: (input, init) => fetch(input, init),
      sleep: defaultSleep,
      now: () => Date.now(),
      ledger: options.ledger ?? defaultLedger(),
      ...options,
    };
  }

  get queued(): number {
    return this.pending.length + this.active;
  }

  getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
    const existing = this.inflight.get(url);
    if (existing) return existing as Promise<T>;
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.push(async () => {
        try {
          resolve(await this.execute<T>(url, signal));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
      void this.pump();
    }).finally(() => {
      this.inflight.delete(url);
    });
    this.inflight.set(url, promise);
    return promise;
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.pending.length > 0 && this.active < this.opts.maxConcurrent) {
        await this.waitForSlot();
        const task = this.pending.shift();
        if (!task) break;
        this.active++;
        void task().finally(() => {
          this.active--;
          void this.pump();
        });
      }
    } finally {
      this.pumping = false;
    }
  }

  /**
   * Reserves the earliest start time that respects the per-request spacing, the rolling
   * one-minute budget and any 429 backoff — across reloads and tabs — then sleeps until it.
   */
  private async waitForSlot(): Promise<void> {
    const now = this.opts.now();
    const startAt = await this.opts.ledger.reserve(now, this.opts);
    const wait = startAt - this.opts.now();
    if (wait > 0) await this.opts.sleep(wait);
  }

  private async execute<T>(url: string, signal?: AbortSignal): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      if (attempt > 0) {
        // Every retry goes back through the rate limiter so backoff does not bypass it.
        await this.waitForSlot();
      }
      const response = await this.opts.fetchFn(url, { signal, headers: { Accept: 'application/json' } });
      if (response.ok) return (await response.json()) as T;
      if (response.status === 404) return [] as T;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= this.opts.maxRetries) throw new HttpError(response.status, url);
      const retryAfter = Number(response.headers.get('Retry-After'));
      const backoff =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : this.opts.baseBackoffMs * 2 ** attempt;
      await this.opts.ledger.block(this.opts.now() + backoff);
    }
  }
}
