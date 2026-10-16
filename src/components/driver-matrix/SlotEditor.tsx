import { openf1 } from '../../api/openf1';
import { useAsync } from '../../hooks/use-async';
import { useSlotStore, type CompoundFilter, type LapChoice, type SlotConfig } from '../../store/slots';
import type { Compound } from '../../types/openf1';
import { compoundForLap, formatLapTime, isTimedLap } from '../../utils/laps';
import { Select } from '../common/Select';
import { SessionPicker } from '../session-picker/SessionPicker';

const COMPOUNDS: CompoundFilter[] = ['ANY', 'SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET'];

export function SlotEditor({ index, slot }: { index: number; slot: SlotConfig }) {
  const updateSlot = useSlotStore((s) => s.updateSlot);
  const clearSlot = useSlotStore((s) => s.clearSlot);
  const syncSessionToAll = useSlotStore((s) => s.syncSessionToAll);
  const { sessionKey, driverNumber } = slot;

  const drivers = useAsync(
    sessionKey === null
      ? null
      : async () => {
          const session = await openf1.session(sessionKey);
          return session ? openf1.drivers(session) : [];
        },
    [sessionKey],
  );
  const lapData = useAsync(
    sessionKey === null || driverNumber === null
      ? null
      : async () => {
          const session = await openf1.session(sessionKey);
          if (!session) return { laps: [], stints: [] };
          const [laps, stints] = await Promise.all([
            openf1.laps(session, driverNumber),
            openf1.stints(session, driverNumber),
          ]);
          return { laps, stints };
        },
    [sessionKey, driverNumber],
  );

  const lapOptions: { value: LapChoice; label: string }[] = [{ value: 'fastest', label: 'Fastest lap' }];
  for (const lap of lapData.data?.laps ?? []) {
    if (!isTimedLap(lap)) continue;
    const compound: Compound | null = compoundForLap(lapData.data!.stints, lap.driver_number, lap.lap_number);
    lapOptions.push({
      value: lap.lap_number,
      label: `L${lap.lap_number}  ${formatLapTime(lap.lap_duration)}${compound ? `  ${compound[0]}` : ''}${lap.is_pit_out_lap ? '  out' : ''}`,
    });
  }

  return (
    <div className="flex flex-col gap-2.5 border-t border-line px-3 pt-2.5 pb-3">
      <SessionPicker
        compact
        year={slot.year}
        meetingKey={slot.meetingKey}
        sessionKey={slot.sessionKey}
        onChange={(next) => {
          updateSlot(index, { ...next, lap: 'fastest' });
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <Select
          label={drivers.loading ? 'Driver · loading' : 'Driver'}
          className="col-span-2"
          value={driverNumber}
          disabled={!drivers.data}
          options={(drivers.data ?? []).map((d) => ({
            value: d.driver_number,
            label: `${d.name_acronym} · #${d.driver_number} · ${d.team_name ?? '—'}`,
          }))}
          onChange={(n) => {
            updateSlot(index, { driverNumber: n, lap: 'fastest' });
          }}
        />
        <Select
          label={lapData.loading ? 'Lap · loading' : 'Lap'}
          value={slot.lap}
          disabled={!lapData.data}
          options={lapOptions}
          onChange={(lap) => {
            updateSlot(index, { lap });
          }}
        />
        <Select
          label="Compound"
          value={slot.compound}
          disabled={slot.lap !== 'fastest'}
          options={COMPOUNDS.map((c) => ({ value: c, label: c === 'ANY' ? 'Any' : c.charAt(0) + c.slice(1).toLowerCase() }))}
          onChange={(compound) => {
            updateSlot(index, { compound });
          }}
        />
      </div>
      <div className="flex gap-2">
        {index === 0 && (
          <button
            type="button"
            className="h-7 flex-1 rounded-md border border-line text-[11px] text-ink-dim hover:border-line-strong hover:text-ink"
            onClick={syncSessionToAll}
          >
            Use this session in all slots
          </button>
        )}
        {index > 0 && (
          <button
            type="button"
            className="h-7 flex-1 rounded-md border border-line text-[11px] text-ink-dim hover:border-red-500/50 hover:text-red-300"
            onClick={() => {
              clearSlot(index);
            }}
          >
            Clear slot
          </button>
        )}
      </div>
    </div>
  );
}
