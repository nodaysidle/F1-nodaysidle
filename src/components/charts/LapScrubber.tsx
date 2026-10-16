import { useEffect, useRef, useState } from 'react';
import { scrubBus } from '../../hooks/scrub-bus';
import { useTelemetryStore } from '../../store/telemetry';
import { clamp, interpLinear } from '../../utils/interp';
import { formatLapTime } from '../../utils/laps';

const RATES = [0.25, 0.5, 1, 2, 4] as const;

/**
 * Master lap scrubber: drag bar, keyboard stepping and real-time lap playback driven by
 * the reference lap's own clock. Only play/rate state lives in React.
 */
export function LapScrubber() {
  const comparison = useTelemetryStore((s) => s.comparison);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<number>(1);
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);

  const ref = comparison?.slots.find((s) => s !== null) ?? null;

  useEffect(() => {
    if (!comparison || !ref) return;
    return scrubBus.subscribe((progress) => {
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${progress.toFixed(5)})`;
      if (handleRef.current) handleRef.current.style.transform = `translate3d(${(progress * 100).toFixed(3)}%,0,0)`;
      if (readoutRef.current) {
        const d = progress * comparison.length;
        readoutRef.current.textContent = `${d.toFixed(0).padStart(4, ' ')} m · ${formatLapTime(interpLinear(comparison.grid, ref.t, d))}`;
      }
    });
  }, [comparison, ref]);

  useEffect(() => {
    if (!playing || !comparison || !ref) return;
    let frame = 0;
    let lastTs = performance.now();
    let elapsed = interpLinear(comparison.grid, ref.t, scrubBus.value * comparison.length);
    const lapTime = ref.t[ref.t.length - 1];
    if (elapsed >= lapTime - 0.01) elapsed = 0;
    const tick = (ts: number) => {
      elapsed += ((ts - lastTs) / 1000) * rate;
      lastTs = ts;
      if (elapsed >= lapTime) {
        scrubBus.setNow(1);
        setPlaying(false);
        return;
      }
      scrubBus.setNow(interpLinear(ref.t, comparison.grid, elapsed) / comparison.length);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [playing, rate, comparison, ref]);

  useEffect(() => {
    if (!comparison) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      const stepM = e.shiftKey ? 100 : 10;
      const step = stepM / comparison.length;
      if (e.key === 'ArrowRight') scrubBus.set(scrubBus.value + step);
      else if (e.key === 'ArrowLeft') scrubBus.set(scrubBus.value - step);
      else if (e.key === 'Home') scrubBus.set(0);
      else if (e.key === 'End') scrubBus.set(1);
      else if (e.key === ' ') setPlaying((p) => !p);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [comparison]);

  const scrubFromPointer = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    scrubBus.set(clamp((clientX - rect.left) / rect.width, 0, 1));
  };

  return (
    <div className="flex h-12 items-center gap-3 px-3">
      <button
        type="button"
        disabled={!comparison}
        aria-label={playing ? 'Pause lap playback' : 'Play lap'}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-f1 text-white hover:brightness-110 disabled:opacity-30"
        onClick={() => {
          setPlaying((p) => !p);
        }}
      >
        {playing ? (
          <svg viewBox="0 0 12 12" className="size-3 fill-current" aria-hidden>
            <rect x="2" y="1.5" width="3" height="9" rx="0.5" />
            <rect x="7" y="1.5" width="3" height="9" rx="0.5" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" className="ml-0.5 size-3 fill-current" aria-hidden>
            <path d="M2.5 1.5v9l8-4.5z" />
          </svg>
        )}
      </button>
      <div className="flex shrink-0 rounded-md border border-line p-0.5" role="group" aria-label="Playback rate">
        {RATES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={rate === r}
            className="h-6 rounded px-1.5 font-mono text-[10px] text-ink-dim aria-pressed:bg-white/10 aria-pressed:text-ink"
            onClick={() => {
              setRate(r);
            }}
          >
            {r}×
          </button>
        ))}
      </div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Lap position"
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative h-6 flex-1 cursor-pointer touch-none"
        data-testid="lap-scrubber"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          scrubFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) scrubFromPointer(e.clientX);
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
          <div ref={fillRef} className="h-full origin-left bg-gradient-to-r from-f1 to-amber will-change-transform" />
        </div>
        <div ref={handleRef} className="pointer-events-none absolute inset-0 will-change-transform">
          <div className="absolute top-1/2 left-0 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-carbon bg-white shadow" />
        </div>
      </div>
      <span ref={readoutRef} className="live-layer w-40 shrink-0 text-right font-mono text-[12px] whitespace-pre text-ink-dim tabular" />
    </div>
  );
}
