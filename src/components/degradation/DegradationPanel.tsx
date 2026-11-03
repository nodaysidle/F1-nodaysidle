import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import uPlot from 'uplot';
import { openf1 } from '../../api/openf1';
import { useAsync } from '../../hooks/use-async';
import { useSessionDegradation } from '../../hooks/use-session-degradation';
import { useSlotStore } from '../../store/slots';
import { COMPOUND_COLORS } from '../../utils/colors';
import {
  buildDegradationPlot,
  COMPOUND_FILTERS,
  type CompoundFilter,
  type DegradationPlot,
  visibleStints,
} from './degradation-plot';

const AXIS_STYLE = {
  stroke: '#5D6170',
  font: '10px "JetBrains Mono", ui-monospace, monospace',
  grid: { stroke: 'rgba(255,255,255,0.045)', width: 1 },
  ticks: { stroke: 'rgba(255,255,255,0.08)', width: 1, size: 4 },
};

function DegradationChartCanvas({ plot }: { plot: DegradationPlot }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const data: uPlot.AlignedData = [plot.xs, ...plot.series.map((s) => s.values)];
    const chart = new uPlot(
      {
        width: container.clientWidth,
        height: container.clientHeight,
        legend: { show: false },
        cursor: { drag: { x: false, y: false } },
        scales: { x: { time: false } },
        axes: [
          { ...AXIS_STYLE, label: 'tyre age (laps)', labelFont: AXIS_STYLE.font, labelSize: 18 },
          { ...AXIS_STYLE, label: 'lap time (s)', labelFont: AXIS_STYLE.font, labelSize: 18, size: 62 },
        ],
        series: [
          {},
          ...plot.series.map((s) =>
            s.kind === 'points'
              ? { label: s.label, stroke: s.color, width: 0, points: { show: true, size: 5, fill: s.color, stroke: s.color }, paths: () => null }
              : { label: s.label, stroke: s.color, width: 1.5, dash: [5, 4], points: { show: false }, spanGaps: true },
          ),
        ],
      },
      data,
      container,
    );
    const observer = new ResizeObserver(() => {
      chart.setSize({ width: container.clientWidth, height: container.clientHeight });
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.destroy();
    };
  }, [plot]);

  return <div ref={containerRef} className="h-full w-full" />;
}

export function DegradationPanel() {
  const [compound, setCompound] = useState<CompoundFilter>('ALL');
  const sessionKey = useSlotStore((s) => s.slots[0]?.sessionKey ?? null);
  const slots = useSlotStore((s) => s.slots);
  const session = useAsync(sessionKey === null ? null : () => openf1.session(sessionKey), [sessionKey]);
  const drivers = useAsync(
    session.data === undefined ? null : () => openf1.drivers(session.data!),
    [session.data?.session_key ?? null],
  );
  const degradation = useSessionDegradation(session.data ?? null);

  const driverNumbers = useMemo(
    () => new Set(slots.map((slot) => slot.driverNumber).filter((d): d is number => d !== null)),
    [slots],
  );
  const driverLabels = useMemo(
    () => new Map((drivers.data ?? []).map((d) => [d.driver_number, d.name_acronym])),
    [drivers.data],
  );
  const stints = useMemo(() => degradation.data ?? [], [degradation.data]);
  const allStints = useMemo(
    () => visibleStints(stints, driverNumbers, 'ALL'),
    [stints, driverNumbers],
  );
  const selectedStints = useMemo(
    () => visibleStints(stints, driverNumbers, compound),
    [stints, driverNumbers, compound],
  );
  const plot = useMemo(
    () => buildDegradationPlot(selectedStints, driverLabels, driverNumbers),
    [selectedStints, driverLabels, driverNumbers],
  );

  if (sessionKey === null) return <Message>Pick a race in slot 1 to see tyre degradation.</Message>;
  if (session.error) return <Message tone="error">{session.error}</Message>;
  if (session.data && session.data.session_name !== 'Race') {
    return <Message>Tyre degradation uses race sessions. Slot 1 is {session.data.session_name}.</Message>;
  }
  if (degradation.error) return <Message tone="error">{degradation.error}</Message>;
  if (degradation.loading || session.loading) return <Message>Loading stints and laps…</Message>;
  if (allStints.length === 0) return <Message>No stints for the selected drivers.</Message>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-1.5">
        {COMPOUND_FILTERS.map((filter) => {
          const isActive = compound === filter;
          const color = filter === 'ALL' ? null : COMPOUND_COLORS[filter];
          return (
            <button
              key={filter}
              type="button"
              aria-pressed={isActive}
              onClick={() => {
                setCompound(filter);
              }}
              className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase transition-colors ${
                isActive
                  ? filter === 'ALL'
                    ? 'border-ink text-ink'
                    : ''
                  : 'border-line text-ink-dim hover:border-line-strong hover:text-ink'
              }`}
              style={
                isActive && color
                  ? { borderColor: color, color }
                  : undefined
              }
            >
              {color && (
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
              )}
              {filter}
            </button>
          );
        })}
      </div>
      <div className="min-h-[180px] flex-1 px-1 pt-2">
        {selectedStints.length === 0 ? (
          <Message>No {compound} stints for the selected drivers.</Message>
        ) : (
          <DegradationChartCanvas plot={plot} />
        )}
      </div>
      <ul className="max-h-[120px] shrink-0 space-y-0.5 overflow-y-auto border-t border-line px-3 py-2 font-mono text-[10px] text-ink-dim">
        {selectedStints.map((s) => (
          <li key={`${s.driverNumber}-${s.stintNumber}`} className="flex gap-2">
            <span className="w-10 text-ink">{driverLabels.get(s.driverNumber) ?? `#${s.driverNumber}`}</span>
            <span className="w-16">S{s.stintNumber} {s.compound ?? '—'}</span>
            {s.result.status === 'fitted' ? (
              <span>
                {s.result.slope >= 0 ? '+' : '−'}
                {Math.abs(s.result.slope).toFixed(3)} s/lap · R² {s.result.rSquared.toFixed(2)} · {s.result.lapCount} laps
              </span>
            ) : (
              <span className="text-ink-faint">insufficient data ({s.result.lapCount} laps)</span>
            )}
          </li>
        ))}
      </ul>
      <p className="shrink-0 border-t border-line px-3 py-1.5 text-[10px] text-ink-faint">
        Slope includes fuel burn (no fuel correction). Safety car and VSC laps excluded.
      </p>
    </div>
  );
}

function Message({ children, tone }: { children: ReactNode; tone?: 'error' }) {
  return (
    <p className={`px-3 py-4 text-[11px] ${tone === 'error' ? 'text-red-400' : 'text-ink-faint'}`}>{children}</p>
  );
}
