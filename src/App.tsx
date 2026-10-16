import { DriverMatrix } from './components/driver-matrix/DriverMatrix';
import { LapScrubber } from './components/charts/LapScrubber';
import { TelemetryCharts } from './components/charts/TelemetryCharts';
import { Panel } from './components/common/Panel';
import { Hud } from './components/hud/Hud';
import { ReplayView } from './components/replay/ReplayView';
import { TrackMap } from './components/track-map/TrackMap';
import { useComparisonLoader } from './hooks/use-comparison-loader';
import { useSlotStore, type View } from './store/slots';
import { useTelemetryStore } from './store/telemetry';
import { DELTA_COLORS, LIFT_COAST_COLOR } from './utils/colors';

const VIEWS: { key: View; label: string }[] = [
  { key: 'analysis', label: 'Lap Analysis' },
  { key: 'replay', label: 'Session Replay' },
];

function Header() {
  const view = useSlotStore((s) => s.view);
  const setView = useSlotStore((s) => s.setView);
  const status = useTelemetryStore((s) => s.status);
  const computeMs = useTelemetryStore((s) => s.computeMs);

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line px-4">
      <div className="flex items-center gap-2">
        <span className="h-4 w-1.5 -skew-x-12 bg-f1" />
        <h1 className="text-[14px] font-bold tracking-[0.08em] uppercase">
          F1 Telemetry <span className="text-f1">Pro</span>
        </h1>
      </div>
      <nav className="flex rounded-lg border border-line p-0.5" aria-label="View">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            aria-pressed={view === v.key}
            className="h-7 rounded-md px-3 text-[12px] text-ink-dim aria-pressed:bg-white/10 aria-pressed:text-ink"
            onClick={() => {
              setView(v.key);
            }}
          >
            {v.label}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-3 font-mono text-[10px] text-ink-faint">
        {view === 'analysis' && status === 'loading' && <span className="text-amber">FETCHING TELEMETRY…</span>}
        {view === 'analysis' && status === 'ready' && <span>aligned in {computeMs.toFixed(0)} ms</span>}
        <span>DATA · OPENF1</span>
      </div>
    </header>
  );
}

function TrackMapActions() {
  const deltaSlot = useSlotStore((s) => s.deltaSlot);
  const setDeltaSlot = useSlotStore((s) => s.setDeltaSlot);
  const showLiftCoast = useSlotStore((s) => s.showLiftCoast);
  const setShowLiftCoast = useSlotStore((s) => s.setShowLiftCoast);
  const meta = useTelemetryStore((s) => s.meta);
  const comparisons = meta.map((m, i) => ({ m, i })).filter(({ m, i }) => m && i > 0);

  return (
    <>
      {comparisons.length > 0 && (
        <label className="flex items-center gap-1.5 text-[10px] text-ink-faint">
          Δ vs
          <select
            className="field h-6 rounded border border-line bg-carbon-2 pr-5 pl-1.5 text-[11px] text-ink"
            value={deltaSlot}
            onChange={(e) => {
              setDeltaSlot(Number(e.target.value));
            }}
          >
            {comparisons.map(({ m, i }) => (
              <option key={i} value={i}>
                {m!.driver.name_acronym}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        aria-pressed={showLiftCoast}
        className="h-6 rounded border border-line px-2 text-[10px] text-ink-faint aria-pressed:border-amber/50 aria-pressed:text-amber"
        onClick={() => {
          setShowLiftCoast(!showLiftCoast);
        }}
      >
        Lift &amp; Coast
      </button>
    </>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 px-3 pb-2 text-[10px] text-ink-faint">
      <span className="flex items-center gap-1">
        <i className="h-1 w-3 rounded" style={{ background: DELTA_COLORS.faster }} /> gains
      </span>
      <span className="flex items-center gap-1">
        <i className="h-1 w-3 rounded" style={{ background: DELTA_COLORS.slower }} /> loses
      </span>
      <span className="flex items-center gap-1">
        <i className="h-1 w-3 rounded" style={{ background: DELTA_COLORS.neutral }} /> ±0.02s
      </span>
      <span className="flex items-center gap-1">
        <i className="h-1 w-3 rounded" style={{ background: LIFT_COAST_COLOR }} /> lift &amp; coast
      </span>
      <span className="ml-auto">scroll zoom · drag pan · click to scrub</span>
    </div>
  );
}

function AnalysisView() {
  useComparisonLoader();
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_420px]">
      <DriverMatrix />
      <Panel
        title="Telemetry"
        bodyClassName="flex flex-col"
        actions={<span className="text-[10px] text-ink-faint">drag to scrub · wheel zoom · dbl-click reset · ←/→ space</span>}
      >
        <div className="min-h-[520px] flex-1 px-1 pt-2">
          <TelemetryCharts />
        </div>
        <div className="border-t border-line">
          <LapScrubber />
        </div>
      </Panel>
      <div className="flex min-h-0 flex-col gap-3 lg:col-span-2 xl:col-span-1">
        <Panel title="Track Map" className="min-h-[340px] flex-1" bodyClassName="flex flex-col" actions={<TrackMapActions />}>
          <div className="min-h-0 flex-1">
            <TrackMap />
          </div>
          <Legend />
        </Panel>
        <Panel title="HUD" className="shrink-0">
          <Hud />
        </Panel>
      </div>
    </div>
  );
}

export default function App() {
  const view = useSlotStore((s) => s.view);
  return (
    <div className="flex h-full flex-col">
      <Header />
      <main className="min-h-0 flex-1 p-3">{view === 'analysis' ? <AnalysisView /> : <ReplayView />}</main>
    </div>
  );
}
