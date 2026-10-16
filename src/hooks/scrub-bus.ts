import { useEffect } from 'react';
import { clamp } from '../utils/interp';

export type ScrubListener = (progress: number) => void;

/**
 * Master scrub head, kept outside React. Writes are coalesced to one notification per
 * animation frame, and listeners mutate DOM/canvas directly, so scrubbing never schedules
 * a React render.
 */
export class ScrubBus {
  private progress = 0;
  private readonly listeners = new Set<ScrubListener>();
  private frame = 0;

  get value(): number {
    return this.progress;
  }

  set(progress: number): void {
    const next = clamp(progress, 0, 1);
    if (next === this.progress && this.frame === 0) return;
    this.progress = next;
    if (this.frame !== 0) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.emit();
    });
  }

  /** Synchronous notify, for callers already inside a frame callback. */
  setNow(progress: number): void {
    this.progress = clamp(progress, 0, 1);
    if (this.frame !== 0) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.emit();
  }

  subscribe(listener: ScrubListener): () => void {
    this.listeners.add(listener);
    listener(this.progress);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.progress);
  }
}

export const scrubBus = new ScrubBus();

/** Subscribes `listener` for the component's lifetime; re-subscribes when deps change. */
export function useScrub(listener: ScrubListener, deps: readonly unknown[]): void {
  useEffect(() => scrubBus.subscribe(listener), deps); // eslint-disable-line react-hooks/exhaustive-deps
}
