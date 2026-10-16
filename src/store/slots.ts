import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Compound } from '../types/openf1';

export type LapChoice = 'fastest' | number;
export type CompoundFilter = Compound | 'ANY';

export interface SlotConfig {
  year: number | null;
  meetingKey: number | null;
  sessionKey: number | null;
  driverNumber: number | null;
  lap: LapChoice;
  compound: CompoundFilter;
}

export const SLOT_COUNT = 4;

export const emptySlot = (): SlotConfig => ({
  year: null,
  meetingKey: null,
  sessionKey: null,
  driverNumber: null,
  lap: 'fastest',
  compound: 'ANY',
});

export type View = 'analysis' | 'replay';

export interface ReplaySelection {
  year: number | null;
  meetingKey: number | null;
  sessionKey: number | null;
}

interface SlotState {
  slots: SlotConfig[];
  view: View;
  /** Comparison slot whose gain/loss colours the track map (1..3). */
  deltaSlot: number;
  showLiftCoast: boolean;
  replay: ReplaySelection;
  updateSlot: (index: number, patch: Partial<SlotConfig>) => void;
  clearSlot: (index: number) => void;
  /** Copies slot 1's session into every other slot, keeping their drivers where possible. */
  syncSessionToAll: () => void;
  setView: (view: View) => void;
  setDeltaSlot: (index: number) => void;
  setShowLiftCoast: (show: boolean) => void;
  setReplay: (replay: ReplaySelection) => void;
}

const DEFAULT_SLOTS: SlotConfig[] = [
  // 2024 Belgian GP qualifying — VER, LEC, NOR, HAM — a sensible first-load comparison.
  { year: 2024, meetingKey: 1242, sessionKey: 9570, driverNumber: 1, lap: 'fastest', compound: 'ANY' },
  { year: 2024, meetingKey: 1242, sessionKey: 9570, driverNumber: 16, lap: 'fastest', compound: 'ANY' },
  { year: 2024, meetingKey: 1242, sessionKey: 9570, driverNumber: 4, lap: 'fastest', compound: 'ANY' },
  { year: 2024, meetingKey: 1242, sessionKey: 9570, driverNumber: 44, lap: 'fastest', compound: 'ANY' },
];

export const useSlotStore = create<SlotState>()(
  persist(
    (set) => ({
      slots: DEFAULT_SLOTS,
      view: 'analysis',
      deltaSlot: 1,
      showLiftCoast: true,
      replay: { year: 2024, meetingKey: 1242, sessionKey: 9574 },
      updateSlot: (index, patch) => {
        set((state) => ({ slots: state.slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)) }));
      },
      clearSlot: (index) => {
        set((state) => ({ slots: state.slots.map((slot, i) => (i === index ? emptySlot() : slot)) }));
      },
      syncSessionToAll: () => {
        set((state) => {
          const source = state.slots[0];
          return {
            slots: state.slots.map((slot, i) =>
              i === 0
                ? slot
                : {
                    ...slot,
                    year: source.year,
                    meetingKey: source.meetingKey,
                    sessionKey: source.sessionKey,
                    lap: 'fastest',
                  },
            ),
          };
        });
      },
      setView: (view) => {
        set({ view });
      },
      setDeltaSlot: (deltaSlot) => {
        set({ deltaSlot });
      },
      setShowLiftCoast: (showLiftCoast) => {
        set({ showLiftCoast });
      },
      setReplay: (replay) => {
        set({ replay });
      },
    }),
    { name: 'f1tp-slots', version: 1 },
  ),
);
