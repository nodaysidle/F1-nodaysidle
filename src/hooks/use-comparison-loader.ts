import { useEffect } from 'react';
import { openf1 } from '../api/openf1';
import { useSlotStore, type SlotConfig } from '../store/slots';
import { useTelemetryStore, type SlotMeta } from '../store/telemetry';
import type { RawLapTelemetry } from '../types/telemetry';
import { assignSlotColors, teamColor } from '../utils/colors';
import { compoundForLap, selectLap } from '../utils/laps';
import { alignInWorker } from '../workers/client';
import { scrubBus } from './scrub-bus';

interface LoadedSlot {
  raw: RawLapTelemetry;
  meta: Omit<SlotMeta, 'color'>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function noLapMessage(config: SlotConfig, acronym: string): string {
  if (config.lap !== 'fastest') return `Lap ${config.lap} has no timing for ${acronym}`;
  const compound = config.compound === 'ANY' ? '' : `${config.compound.toLowerCase()} `;
  return `No timed ${compound}lap for ${acronym}`;
}

async function loadSlot(config: SlotConfig): Promise<LoadedSlot | null> {
  if (config.sessionKey === null || config.driverNumber === null) return null;
  const session = await openf1.session(config.sessionKey);
  if (!session) throw new Error(`Session ${config.sessionKey} not found`);
  const [drivers, laps, stints] = await Promise.all([
    openf1.drivers(session),
    openf1.laps(session, config.driverNumber),
    openf1.stints(session, config.driverNumber),
  ]);
  const driver = drivers.find((d) => d.driver_number === config.driverNumber);
  if (!driver) throw new Error(`Driver #${config.driverNumber} did not take part in this session`);
  const lap = selectLap(laps, stints, config.lap, config.compound);
  if (!lap) throw new Error(noLapMessage(config, driver.name_acronym));
  const raw = await openf1.lapTelemetry(lap);
  return {
    raw,
    meta: { driver, session, lap, compound: compoundForLap(stints, driver.driver_number, lap.lap_number) },
  };
}

const slotKey = (slots: SlotConfig[]) =>
  slots.map((s) => [s.sessionKey, s.driverNumber, s.lap, s.compound].join('|')).join('/');

/** Watches the four slots and keeps the aligned comparison in the telemetry store current. */
export function useComparisonLoader(): void {
  const slots = useSlotStore((s) => s.slots);
  const key = slotKey(slots);

  useEffect(() => {
    let cancelled = false;
    // A function call so the flag is re-read after each await rather than narrowed once.
    const isCancelled = () => cancelled;
    const store = useTelemetryStore.getState();
    store.setLoading();
    const configs = useSlotStore.getState().slots;

    void (async () => {
      const settled = await Promise.allSettled(configs.map(loadSlot));
      if (isCancelled()) return;
      const loaded = settled.map((r) => (r.status === 'fulfilled' ? r.value : null));
      const errors = settled.map((r) => (r.status === 'rejected' ? errorMessage(r.reason) : null));
      if (loaded.every((slot) => slot === null)) {
        store.setFailed(errors);
        return;
      }
      try {
        const started = performance.now();
        const comparison = await alignInWorker(loaded.map((slot) => slot?.raw ?? null));
        if (isCancelled()) return;
        const colors = assignSlotColors(
          loaded.map((slot) => (slot ? teamColor(slot.meta.driver.team_name, slot.meta.driver.team_colour) : null)),
        );
        const meta = loaded.map((slot, i): SlotMeta | null => (slot ? { ...slot.meta, color: colors[i]! } : null));
        store.setResult(comparison, meta, errors, performance.now() - started);
        scrubBus.set(scrubBus.value);
      } catch (error) {
        if (!isCancelled()) store.setFailed(errors.map((e) => e ?? errorMessage(error)));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key]);
}
