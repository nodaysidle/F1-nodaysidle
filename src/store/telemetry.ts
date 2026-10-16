import { create } from 'zustand';
import type { Compound, Driver, Lap, Session } from '../types/openf1';
import type { AlignedComparison } from '../types/telemetry';

export interface SlotMeta {
  driver: Driver;
  session: Session;
  lap: Lap;
  compound: Compound | null;
  color: string;
}

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface TelemetryState {
  status: LoadStatus;
  comparison: AlignedComparison | null;
  meta: (SlotMeta | null)[];
  slotErrors: (string | null)[];
  /** Worker compute time for the latest alignment, ms. */
  computeMs: number;
  setLoading: () => void;
  setResult: (
    comparison: AlignedComparison,
    meta: (SlotMeta | null)[],
    slotErrors: (string | null)[],
    computeMs: number,
  ) => void;
  setFailed: (slotErrors: (string | null)[]) => void;
}

export const useTelemetryStore = create<TelemetryState>()((set) => ({
  status: 'idle',
  comparison: null,
  meta: [null, null, null, null],
  slotErrors: [null, null, null, null],
  computeMs: 0,
  setLoading: () => {
    set({ status: 'loading' });
  },
  setResult: (comparison, meta, slotErrors, computeMs) => {
    set({ status: 'ready', comparison, meta, slotErrors, computeMs });
  },
  setFailed: (slotErrors) => {
    set({ status: 'error', slotErrors });
  },
}));
