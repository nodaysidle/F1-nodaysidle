import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import { scrubBus } from '../../hooks/scrub-bus';
import { useSlotStore } from '../../store/slots';
import { useTelemetryStore } from '../../store/telemetry';
import type { AlignedComparison, AlignedSlot, Zone } from '../../types/telemetry';
import { LIFT_COAST_ALT, LIFT_COAST_COLOR, withAlpha } from '../../utils/colors';
import { locateOnGrid, sampleLinear, sampleNearest } from '../../utils/grid';
import { clamp } from '../../utils/interp';
import { AXIS_WIDTH, CHANNELS, type ChannelSpec } from './channels';

const AXIS_STYLE = {
  stroke: '#5D6170',
  font: '10px "JetBrains Mono", ui-monospace, monospace',
  grid: { stroke: 'rgba(255,255,255,0.045)', width: 1 },
  ticks: { stroke: 'rgba(255,255,255,0.08)', width: 1, size: 4 },
};
const X_AXIS_HEIGHT = 22;
const LANE_ROW = 9;
const MIN_ZOOM_SPAN_M = 150;
const steppedPaths = uPlot.paths.stepped!({ align: 1 });

interface ActiveSlot {
  index: number;
  slot: AlignedSlot;
  color: string;
}

function paddedRange(spec: ChannelSpec): uPlot.Range.Function {
  return (_u, min, max) => {
    if (spec.range) return spec.range;
    if (spec.key === 'delta') {
      const m = Math.max(0.05, Math.abs(min), Math.abs(max)) * 1.15;
      return [-m, m];
    }
    const pad = (max - min) * 0.06 || 1;
    return [Math.max(0, min - pad), max + pad];
  };
}

function zoneBands(zones: { zones: Zone[]; color: string }[]): uPlot.Hooks.Arrays['drawClear'] {
  return [
    (u: uPlot) => {
      const { ctx } = u;
      const { top, height } = u.bbox;
      ctx.save();
      for (const { zones: list, color } of zones) {
        ctx.fillStyle = color;
        for (const z of list) {
          const x0 = u.valToPos(z.start, 'x', true);
          const x1 = u.valToPos(z.end, 'x', true);
          ctx.fillRect(x0, top, Math.max(1, x1 - x0), height);
        }
      }
      ctx.restore();
    },
  ];
}

function buildChart(
  spec: ChannelSpec,
  comparison: AlignedComparison,
  active: ActiveSlot[],
  bands: { zones: Zone[]; color: string }[],
  isLast: boolean,
  width: number,
  height: number,
  view: [number, number],
  mount: HTMLElement,
): uPlot {
  const refIndex = active[0].index;
  const data: uPlot.AlignedData = [
    comparison.grid,
    ...active.map(({ slot }) => {
      const values = spec.pick(slot);
      return spec.scale === 1 ? values : values.map((v) => v * spec.scale);
    }),
  ];
  const opts: uPlot.Options = {
    width,
    height,
    padding: [14, 10, isLast ? 0 : 2, 0],
    legend: { show: false },
    cursor: { show: false, drag: { x: false, y: false, setScale: false } },
    select: { show: false, left: 0, top: 0, width: 0, height: 0 },
    scales: {
      x: { time: false, auto: false, min: view[0], max: view[1] },
      y: { auto: true, range: paddedRange(spec) },
    },
    axes: [
      {
        ...AXIS_STYLE,
        show: isLast,
        size: X_AXIS_HEIGHT,
        values: (_u, splits) => splits.map((v) => `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}km`),
      },
      {
        ...AXIS_STYLE,
        size: AXIS_WIDTH,
        ticks: { ...AXIS_STYLE.ticks, show: false },
        splits: spec.ticks ? () => spec.ticks! : undefined,
        values: (_u, splits) => splits.map(spec.tickLabel ?? spec.format),
      },
    ],
    series: [
      {},
      ...active.map(({ index, color }) => ({
        stroke: color,
        width: index === refIndex ? 1.75 : 1.25,
        dash: spec.key === 'delta' && index === refIndex ? [4, 4] : undefined,
        paths: spec.stepped ? steppedPaths : undefined,
        points: { show: false },
      })),
    ],
    hooks: bands.length > 0 ? { drawClear: zoneBands(bands) } : {},
  };
  return new uPlot(opts, data, mount);
}

export function TelemetryCharts() {
  const comparison = useTelemetryStore((s) => s.comparison);
  const meta = useTelemetryStore((s) => s.meta);
  const showLiftCoast = useSlotStore((s) => s.showLiftCoast);
  const deltaSlot = useSlotStore((s) => s.deltaSlot);

  const containerRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLCanvasElement>(null);
  const needleRef = useRef<HTMLDivElement>(null);
  const needleLabelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const stack = stackRef.current;
    const lane = laneRef.current;
    const needle = needleRef.current;
    const needleLabel = needleLabelRef.current;
    if (!container || !stack || !lane || !needle || !needleLabel || !comparison) return;

    const active: ActiveSlot[] = [];
    comparison.slots.forEach((slot, index) => {
      const color = meta[index]?.color;
      if (slot && color) active.push({ index, slot, color });
    });
    if (active.length === 0) return;

    const length = comparison.length;
    let view: [number, number] = [0, length];
    const ref = active[0];
    const cmp = active.find((a) => a.index === deltaSlot) ?? active.at(1);
    const bands = showLiftCoast
      ? [
          { zones: ref.slot.liftCoast, color: withAlpha(LIFT_COAST_COLOR, 0.16) },
          ...(cmp ? [{ zones: cmp.slot.liftCoast, color: withAlpha(LIFT_COAST_ALT, 0.12) }] : []),
        ]
      : [];

    const totalWeight = CHANNELS.reduce((sum, c) => sum + c.weight, 0);
    const laneHeight = showLiftCoast ? active.length * LANE_ROW + 8 : 0;
    const sizes = () => {
      const width = stack.clientWidth;
      const available = Math.max(240, stack.clientHeight - laneHeight - X_AXIS_HEIGHT);
      return CHANNELS.map((c, i) => ({
        width,
        height: Math.round((available * c.weight) / totalWeight) + (i === CHANNELS.length - 1 ? X_AXIS_HEIGHT : 0),
      }));
    };

    const mounts: HTMLDivElement[] = [];
    const labels: HTMLSpanElement[][] = [];
    const initial = sizes();
    const charts = CHANNELS.map((spec, i) => {
      const mount = document.createElement('div');
      mount.className = 'relative';
      // Lane sits between DRS and delta so the delta chart keeps the shared x axis at the bottom.
      if (spec.key === 'delta') stack.appendChild(lane);
      stack.appendChild(mount);
      mounts.push(mount);
      const chart = buildChart(
        spec,
        comparison,
        active,
        spec.key === 'speed' || spec.key === 'throttle' ? bands : [],
        i === CHANNELS.length - 1,
        initial[i].width,
        initial[i].height,
        view,
        mount,
      );
      const caption = document.createElement('div');
      caption.className =
        'live-layer pointer-events-none absolute top-0 flex items-baseline gap-2 font-mono text-[10px] tracking-wider';
      caption.style.left = `${AXIS_WIDTH + 6}px`;
      const title = document.createElement('span');
      title.className = 'text-ink-faint uppercase';
      title.textContent = spec.unit ? `${spec.label} · ${spec.unit}` : spec.label;
      caption.appendChild(title);
      const values = active.map(({ color }) => {
        const v = document.createElement('span');
        v.className = 'tabular';
        v.style.color = color;
        caption.appendChild(v);
        return v;
      });
      labels.push(values);
      mount.appendChild(caption);
      return chart;
    });
    lane.style.display = showLiftCoast ? 'block' : 'none';

    const plotBox = () => {
      const over = charts[0].over;
      return { left: over.offsetLeft, width: over.clientWidth };
    };

    const drawLane = () => {
      if (!showLiftCoast) return;
      const dpr = window.devicePixelRatio || 1;
      const { width } = stack.getBoundingClientRect();
      lane.width = Math.round(width * dpr);
      lane.height = Math.round(laneHeight * dpr);
      lane.style.width = `${width}px`;
      lane.style.height = `${laneHeight}px`;
      const ctx = lane.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, laneHeight);
      const { left, width: plotWidth } = plotBox();
      const xOf = (d: number) => left + ((d - view[0]) / (view[1] - view[0])) * plotWidth;
      ctx.font = '9px "JetBrains Mono", ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#5D6170';
      ctx.fillText('LIFT&COAST', 2, laneHeight / 2);
      active.forEach(({ slot, color }, row) => {
        const y = 4 + row * LANE_ROW;
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(left, y + 1, plotWidth, LANE_ROW - 2);
        ctx.fillStyle = row === 0 ? LIFT_COAST_COLOR : color;
        for (const z of slot.liftCoast) {
          const x0 = Math.max(left, xOf(z.start));
          const x1 = Math.min(left + plotWidth, xOf(z.end));
          if (x1 > x0) ctx.fillRect(x0, y + 1, Math.max(2, x1 - x0), LANE_ROW - 2);
        }
      });
    };

    const updateNeedle = (progress: number) => {
      const distance = progress * length;
      const { left, width } = plotBox();
      const frac = (distance - view[0]) / (view[1] - view[0]);
      if (frac < 0 || frac > 1) {
        needle.style.opacity = '0';
      } else {
        needle.style.opacity = '1';
        needle.style.transform = `translate3d(${(left + frac * width).toFixed(1)}px,0,0)`;
      }
      needleLabel.textContent = `${distance.toFixed(0)} m`;
      // Same interpolation as the HUD so every readout agrees at the needle.
      const at = locateOnGrid(comparison.grid, distance);
      CHANNELS.forEach((spec, c) => {
        if (spec.key === 'drs') return;
        active.forEach(({ slot }, s) => {
          const values = spec.pick(slot);
          const raw = (spec.stepped ? sampleNearest(values, at) : sampleLinear(values, at)) * spec.scale;
          labels[c][s].textContent = spec.key === 'delta' && s === 0 ? '' : spec.format(raw);
        });
      });
    };

    const applyView = () => {
      for (const chart of charts) chart.setScale('x', { min: view[0], max: view[1] });
      drawLane();
      updateNeedle(scrubBus.value);
    };

    const resize = () => {
      const next = sizes();
      charts.forEach((chart, i) => {
        chart.setSize(next[i]);
      });
      drawLane();
      updateNeedle(scrubBus.value);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stack);

    const progressAt = (clientX: number) => {
      const rect = stack.getBoundingClientRect();
      const { left, width } = plotBox();
      const frac = clamp((clientX - rect.left - left) / width, 0, 1);
      return (view[0] + frac * (view[1] - view[0])) / length;
    };
    let dragging = false;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      container.setPointerCapture(e.pointerId);
      scrubBus.set(progressAt(e.clientX));
    };
    const onMove = (e: PointerEvent) => {
      if (dragging) scrubBus.set(progressAt(e.clientX));
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const anchor = progressAt(e.clientX) * length;
      const factor = Math.exp(e.deltaY * 0.0015);
      const span = clamp((view[1] - view[0]) * factor, MIN_ZOOM_SPAN_M, length);
      const t = (anchor - view[0]) / (view[1] - view[0]);
      let min = anchor - t * span;
      min = clamp(min, 0, length - span);
      view = [min, min + span];
      applyView();
    };
    const onDblClick = () => {
      view = [0, length];
      applyView();
    };
    container.addEventListener('pointerdown', onDown);
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerup', onUp);
    container.addEventListener('pointercancel', onUp);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('dblclick', onDblClick);

    drawLane();
    const unsubscribe = scrubBus.subscribe(updateNeedle);

    return () => {
      unsubscribe();
      observer.disconnect();
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('dblclick', onDblClick);
      for (const chart of charts) chart.destroy();
      for (const mount of mounts) mount.remove();
    };
  }, [comparison, meta, showLiftCoast, deltaSlot]);

  return (
    <div ref={containerRef} className="relative h-full cursor-crosshair touch-none select-none" data-testid="telemetry-charts">
      <div ref={stackRef} className="flex h-full flex-col overflow-hidden">
        <canvas ref={laneRef} className="shrink-0" />
      </div>
      <div
        ref={needleRef}
        className="pointer-events-none absolute top-0 bottom-[22px] left-0 w-px bg-white/80 shadow-[0_0_8px_rgba(255,255,255,0.6)] will-change-transform"
        data-testid="scrub-needle"
      >
        <span
          ref={needleLabelRef}
          className="absolute -top-0.5 left-1.5 rounded bg-carbon/90 px-1 font-mono text-[10px] whitespace-nowrap text-ink tabular"
        />
      </div>
      {!comparison && (
        <div className="absolute inset-0 grid place-items-center text-sm text-ink-faint">Waiting for telemetry…</div>
      )}
    </div>
  );
}
