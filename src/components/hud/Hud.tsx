import { useEffect, useRef } from 'react';
import { scrubBus } from '../../hooks/scrub-bus';
import { useTelemetryStore } from '../../store/telemetry';
import { clamp } from '../../utils/interp';
import { locateOnGrid, sampleLinear, sampleNearest } from '../../utils/grid';
import { formatDelta, formatLapTime } from '../../utils/laps';

interface Readout {
  speed: HTMLElement;
  gear: HTMLElement;
  rpm: HTMLElement;
  rpmBar: HTMLElement;
  throttle: HTMLElement;
  brake: HTMLElement;
  drs: HTMLElement;
  time: HTMLElement;
  delta: HTMLElement;
}

const FIELDS: (keyof Readout)[] = ['speed', 'gear', 'rpm', 'rpmBar', 'throttle', 'brake', 'drs', 'time', 'delta'];
const RPM_MAX = 13500;

function deltaSign(delta: number): 'faster' | 'slower' | 'even' {
  if (delta > 0.0005) return 'slower';
  if (delta < -0.0005) return 'faster';
  return 'even';
}

/** Instantaneous readouts per slot. Values are written straight into the DOM from the scrub bus. */
export function Hud() {
  const comparison = useTelemetryStore((s) => s.comparison);
  const meta = useTelemetryStore((s) => s.meta);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !comparison) return;
    const readouts = new Map<number, Readout>();
    root.querySelectorAll<HTMLElement>('[data-slot]').forEach((card) => {
      const slot = Number(card.dataset.slot);
      const r = {} as Readout;
      for (const field of FIELDS) r[field] = card.querySelector<HTMLElement>(`[data-f="${field}"]`)!;
      readouts.set(slot, r);
    });
    const refIndex = comparison.slots.findIndex((s) => s !== null);

    return scrubBus.subscribe((progress) => {
      const distance = progress * comparison.length;
      const at = locateOnGrid(comparison.grid, distance);
      const lerp = (a: Float64Array) => sampleLinear(a, at);
      for (const [index, r] of readouts) {
        const slot = comparison.slots[index];
        if (!slot) continue;
        const rpm = lerp(slot.rpm);
        r.speed.textContent = lerp(slot.speed).toFixed(0);
        const gear = sampleNearest(slot.gear, at);
        r.gear.textContent = gear <= 0 ? 'N' : gear.toFixed(0);
        r.rpm.textContent = rpm.toFixed(0);
        r.rpmBar.style.transform = `scaleX(${clamp(rpm / RPM_MAX, 0, 1).toFixed(3)})`;
        r.throttle.style.transform = `scaleY(${clamp(lerp(slot.throttle) / 100, 0, 1).toFixed(3)})`;
        r.brake.style.transform = `scaleY(${clamp(lerp(slot.brake), 0, 1).toFixed(3)})`;
        const drsOpen = sampleNearest(slot.drs, at) >= 0.5;
        r.drs.dataset.on = drsOpen ? '1' : '0';
        r.time.textContent = formatLapTime(lerp(slot.t));
        const delta = lerp(slot.delta);
        r.delta.textContent = index === refIndex ? 'REF' : formatDelta(delta);
        r.delta.dataset.sign = deltaSign(delta);
      }
    });
  }, [comparison, meta]);

  if (!comparison) return null;

  return (
    <div ref={rootRef} className="grid grid-cols-2 gap-2 p-2" data-testid="hud">
      {comparison.slots.map((slot, index) => {
        const m = meta[index];
        if (!slot || !m) return null;
        return (
          <div
            key={index}
            data-slot={index}
            className="live-layer relative overflow-hidden rounded-lg border border-line bg-carbon-2/80 px-2.5 py-2"
            style={{ boxShadow: `inset 3px 0 0 ${m.color}` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold tracking-wide" style={{ color: m.color }}>
                {m.driver.name_acronym}
              </span>
              <span
                data-f="delta"
                className="font-mono text-[11px] tabular data-[sign=even]:text-ink-dim data-[sign=faster]:text-green-400 data-[sign=slower]:text-red-400"
              />
            </div>
            <div className="mt-1 flex items-end gap-2">
              <div className="flex flex-1 flex-col">
                <span className="flex items-baseline gap-1">
                  <span data-f="speed" className="font-mono text-[26px] leading-none font-semibold tabular" />
                  <span className="text-[10px] text-ink-faint">km/h</span>
                </span>
                <span className="mt-1 flex items-baseline gap-1.5 font-mono text-[11px] text-ink-dim tabular">
                  <span data-f="rpm" />
                  <span className="text-ink-faint">rpm</span>
                </span>
                <span className="mt-1 h-1 w-full overflow-hidden rounded bg-white/5">
                  <span data-f="rpmBar" className="block h-full origin-left bg-gradient-to-r from-cyan via-green-400 to-red-500" />
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[9px] text-ink-faint">GEAR</span>
                <span data-f="gear" className="font-mono text-[24px] leading-none font-bold" />
              </div>
              <div className="flex h-11 items-end gap-1" aria-hidden>
                <span className="relative h-full w-2 overflow-hidden rounded-sm bg-white/5">
                  <span data-f="throttle" className="absolute inset-0 origin-bottom bg-green-500" />
                </span>
                <span className="relative h-full w-2 overflow-hidden rounded-sm bg-white/5">
                  <span data-f="brake" className="absolute inset-0 origin-bottom bg-red-500" />
                </span>
              </div>
            </div>
            <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-ink-dim tabular">
              <span data-f="time" />
              <span
                data-f="drs"
                className="rounded px-1 text-[9px] font-bold tracking-wider text-ink-faint ring-1 ring-line data-[on=1]:bg-green-500/20 data-[on=1]:text-green-300 data-[on=1]:ring-green-500/50"
              >
                DRS
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
