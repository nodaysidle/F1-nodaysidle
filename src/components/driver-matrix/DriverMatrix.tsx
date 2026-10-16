import { useState } from 'react';
import { useSlotStore } from '../../store/slots';
import { useTelemetryStore, type LoadStatus, type SlotMeta } from '../../store/telemetry';
import { formatDelta, formatLapTime } from '../../utils/laps';
import { CompoundBadge } from '../common/CompoundBadge';
import { Panel } from '../common/Panel';
import { SlotEditor } from './SlotEditor';

function slotTitle(meta: SlotMeta | null, configured: boolean, status: LoadStatus): string {
  if (meta) return meta.driver.name_acronym;
  if (!configured) return 'Empty slot';
  return status === 'loading' ? '…' : '—';
}

export function DriverMatrix() {
  const slots = useSlotStore((s) => s.slots);
  const meta = useTelemetryStore((s) => s.meta);
  const errors = useTelemetryStore((s) => s.slotErrors);
  const status = useTelemetryStore((s) => s.status);
  const [open, setOpen] = useState<number | null>(null);
  const refTime = meta[0]?.lap.lap_duration ?? meta.find((m) => m)?.lap.lap_duration ?? null;

  return (
    <Panel title="Driver Matrix" className="h-full" bodyClassName="overflow-y-auto">
      <ol className="flex flex-col">
        {slots.map((slot, i) => {
          const m = meta[i];
          const error = errors[i];
          const configured = slot.sessionKey !== null && slot.driverNumber !== null;
          const isOpen = open === i;
          return (
            <li key={i} className="border-b border-line last:border-b-0">
              <button
                type="button"
                aria-expanded={isOpen}
                className="flex w-full items-stretch gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03]"
                onClick={() => {
                  setOpen(isOpen ? null : i);
                }}
              >
                <span className="w-1 shrink-0 rounded-full" style={{ background: m?.color ?? 'var(--color-line-strong)' }} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-ink-faint">{i === 0 ? 'REF' : `CMP${i + 1}`}</span>
                    <span className="truncate text-[15px] font-semibold tracking-wide">
                      {slotTitle(m, configured, status)}
                    </span>
                    {m && <CompoundBadge compound={m.compound} />}
                  </span>
                  <span className={`truncate text-[11px] ${!m && error ? 'text-red-400' : 'text-ink-dim'}`}>
                    {m
                      ? `${m.session.year} ${m.session.location} · ${m.session.session_name} · L${m.lap.lap_number}`
                      : error ?? (configured ? 'Loading telemetry…' : 'Click to configure')}
                  </span>
                </span>
                {m && (
                  <span className="flex flex-col items-end justify-center font-mono text-[12px] tabular">
                    <span>{formatLapTime(m.lap.lap_duration)}</span>
                    {i > 0 && refTime !== null && m.lap.lap_duration !== null && (
                      <span className={m.lap.lap_duration - refTime > 0 ? 'text-red-400' : 'text-green-400'}>
                        {formatDelta(m.lap.lap_duration - refTime)}
                      </span>
                    )}
                  </span>
                )}
              </button>
              {isOpen && <SlotEditor index={i} slot={slot} />}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
