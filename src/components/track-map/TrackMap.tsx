import { useEffect, useRef } from 'react';
import { scrubBus } from '../../hooks/scrub-bus';
import { useSlotStore } from '../../store/slots';
import { useTelemetryStore } from '../../store/telemetry';
import type { AlignedSlot } from '../../types/telemetry';
import { DELTA_COLORS, LIFT_COAST_ALT, LIFT_COAST_COLOR, withAlpha } from '../../utils/colors';
import { classifyMicroSectors } from '../../utils/delta';
import { clamp } from '../../utils/interp';
import { DirtyRegion } from '../../utils/dirty-region';
import { locateOnGrid, sampleLinear } from '../../utils/grid';
import { boundsOf, nearestIndex, project, type View } from './geometry';

const CLICK_SLOP_PX = 4;

function setupCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function TrackMap() {
  const comparison = useTelemetryStore((s) => s.comparison);
  const meta = useTelemetryStore((s) => s.meta);
  const deltaSlot = useSlotStore((s) => s.deltaSlot);
  const showLiftCoast = useSlotStore((s) => s.showLiftCoast);
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const base = baseRef.current;
    const overlay = overlayRef.current;
    if (!wrap || !base || !overlay || !comparison) return;
    const refIndex = comparison.slots.findIndex((s) => s !== null);
    const ref = comparison.slots[refIndex];
    if (!ref) return;
    const bounds = boundsOf(ref.x, ref.y);
    if (!bounds) return;

    const cmpIndex = comparison.slots[deltaSlot] ? deltaSlot : comparison.slots.findIndex((s, i) => s && i !== refIndex);
    const cmp: AlignedSlot | null = cmpIndex >= 0 ? comparison.slots[cmpIndex] : null;
    const sectors = cmp ? classifyMicroSectors(cmp.delta) : [];
    const n = comparison.grid.length;

    let width = 0;
    let height = 0;
    let view: View = { zoom: 1, panX: 0, panY: 0 };
    let proj = project(bounds, 1, 1, view);
    let baseCtx: CanvasRenderingContext2D | null = null;
    let overlayCtx: CanvasRenderingContext2D | null = null;
    const dirty = new DirtyRegion();

    const strokeRange = (ctx: CanvasRenderingContext2D, from: number, to: number) => {
      ctx.beginPath();
      ctx.moveTo(proj.sx(ref.x[from]), proj.sy(ref.y[from]));
      for (let i = from + 1; i <= to; i++) ctx.lineTo(proj.sx(ref.x[i]), proj.sy(ref.y[i]));
      ctx.stroke();
    };

    const indexOf = (distance: number) => clamp(Math.round(distance / 5), 0, n - 1);

    const drawBase = () => {
      const ctx = baseCtx;
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const lineWidth = clamp(3 * Math.sqrt(view.zoom), 3, 9);

      ctx.strokeStyle = '#1C1F27';
      ctx.lineWidth = lineWidth + 8;
      strokeRange(ctx, 0, n - 1);

      if (showLiftCoast) {
        ctx.lineWidth = lineWidth + 10;
        ctx.strokeStyle = withAlpha(LIFT_COAST_COLOR, 0.55);
        for (const z of ref.liftCoast) strokeRange(ctx, indexOf(z.start), indexOf(z.end));
        if (cmp) {
          ctx.lineWidth = lineWidth + 4;
          ctx.strokeStyle = withAlpha(LIFT_COAST_ALT, 0.6);
          for (const z of cmp.liftCoast) strokeRange(ctx, indexOf(z.start), indexOf(z.end));
        }
      }

      ctx.lineWidth = lineWidth;
      if (sectors.length === 0) {
        ctx.strokeStyle = '#8B90A0';
        strokeRange(ctx, 0, n - 1);
      } else {
        for (const sector of sectors) {
          ctx.strokeStyle = DELTA_COLORS[sector.state];
          strokeRange(ctx, sector.startIndex, sector.endIndex);
        }
      }

      // Start/finish line, perpendicular to the direction of travel.
      const k = Math.min(4, n - 1);
      const dx = proj.sx(ref.x[k]) - proj.sx(ref.x[0]);
      const dy = proj.sy(ref.y[k]) - proj.sy(ref.y[0]);
      const len = Math.hypot(dx, dy) || 1;
      const px = (-dy / len) * (lineWidth + 6);
      const py = (dx / len) * (lineWidth + 6);
      const x0 = proj.sx(ref.x[0]);
      const y0 = proj.sy(ref.y[0]);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0 - px, y0 - py);
      ctx.lineTo(x0 + px, y0 + py);
      ctx.stroke();
    };

    const drawOverlay = (progress: number) => {
      const ctx = overlayCtx;
      if (!ctx) return;
      dirty.clear(ctx);
      const distance = progress * comparison.length;
      const at = locateOnGrid(comparison.grid, distance);
      const { i, j } = at;
      ctx.font = '600 11px "Inter", system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      const cars: { x: number; y: number; slot: number }[] = [];
      for (let s = 0; s < comparison.slots.length; s++) {
        const slot = comparison.slots[s];
        if (!slot || !meta[s]) continue;
        const useOwn = Number.isFinite(slot.x[i]) && Number.isFinite(slot.x[j]);
        const xs = useOwn ? slot.x : ref.x;
        const ys = useOwn ? slot.y : ref.y;
        cars.push({ x: proj.sx(sampleLinear(xs, at)), y: proj.sy(sampleLinear(ys, at)), slot: s });
      }
      // Dots back-to-front so the reference sits on top.
      for (let k = cars.length - 1; k >= 0; k--) {
        const { x, y, slot } = cars[k];
        const r = slot === refIndex ? 7 : 6;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = meta[slot]!.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#0D0E12';
        ctx.stroke();
        dirty.add(x - r - 2, y - r - 2, 2 * r + 4, 2 * r + 4);
      }
      // Cars share a distance, so they bunch up; stack the tags in slot order beside the reference.
      const anchor = cars.at(0);
      if (!anchor) return;
      cars.forEach(({ slot }, k) => {
        const m = meta[slot]!;
        const label = m.driver.name_acronym;
        const tx = anchor.x + 14;
        const ty = anchor.y - 12 - (cars.length - 1 - k) * 15;
        const w = ctx.measureText(label).width + 8;
        ctx.fillStyle = 'rgba(13,14,18,0.85)';
        ctx.fillRect(tx - 4, ty - 7, w, 14);
        ctx.fillStyle = m.color;
        ctx.fillText(label, tx, ty);
        dirty.add(tx - 4, ty - 7, w, 14);
      });
    };

    const layout = () => {
      const rect = wrap.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      baseCtx = setupCanvas(base, width, height);
      overlayCtx = setupCanvas(overlay, width, height);
      dirty.reset();
      proj = project(bounds, width, height, view);
      drawBase();
      drawOverlay(scrubBus.value);
    };

    let frame = 0;
    const scheduleRedraw = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        proj = project(bounds, width, height, view);
        drawBase();
        overlayCtx?.clearRect(0, 0, width, height);
        dirty.reset();
        drawOverlay(scrubBus.value);
      });
    };

    const observer = new ResizeObserver(layout);
    observer.observe(wrap);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const nextZoom = clamp(view.zoom * Math.exp(-e.deltaY * 0.0015), 1, 12);
      const k = nextZoom / view.zoom;
      // Keep the world point under the cursor fixed.
      view = {
        zoom: nextZoom,
        panX: mx - width / 2 - (mx - width / 2 - view.panX) * k,
        panY: my - height / 2 - (my - height / 2 - view.panY) * k,
      };
      if (nextZoom === 1) view = { zoom: 1, panX: 0, panY: 0 };
      scheduleRedraw();
    };

    let drag: { x: number; y: number; panX: number; panY: number; moved: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      wrap.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < CLICK_SLOP_PX) return;
      drag.moved = true;
      view = { ...view, panX: drag.panX + dx, panY: drag.panY + dy };
      scheduleRedraw();
    };
    const onUp = (e: PointerEvent) => {
      if (!drag) return;
      if (!drag.moved) {
        const rect = wrap.getBoundingClientRect();
        const idx = nearestIndex(ref.x, ref.y, proj.wx(e.clientX - rect.left), proj.wy(e.clientY - rect.top));
        scrubBus.set(comparison.grid[idx] / comparison.length);
      }
      drag = null;
      if (wrap.hasPointerCapture(e.pointerId)) wrap.releasePointerCapture(e.pointerId);
    };
    const onDblClick = () => {
      view = { zoom: 1, panX: 0, panY: 0 };
      scheduleRedraw();
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    wrap.addEventListener('pointerdown', onDown);
    wrap.addEventListener('pointermove', onMove);
    wrap.addEventListener('pointerup', onUp);
    wrap.addEventListener('dblclick', onDblClick);

    const unsubscribe = scrubBus.subscribe(drawOverlay);
    return () => {
      unsubscribe();
      observer.disconnect();
      cancelAnimationFrame(frame);
      wrap.removeEventListener('wheel', onWheel);
      wrap.removeEventListener('pointerdown', onDown);
      wrap.removeEventListener('pointermove', onMove);
      wrap.removeEventListener('pointerup', onUp);
      wrap.removeEventListener('dblclick', onDblClick);
    };
  }, [comparison, meta, deltaSlot, showLiftCoast]);

  const hasLocation = comparison?.slots.some((s) => s && Number.isFinite(s.x[0])) ?? false;

  return (
    <div ref={wrapRef} className="relative h-full w-full cursor-grab touch-none active:cursor-grabbing" data-testid="track-map">
      <canvas ref={baseRef} className="absolute inset-0" />
      <canvas ref={overlayRef} className="absolute inset-0" />
      {comparison && !hasLocation && (
        <p className="absolute inset-0 grid place-items-center text-sm text-ink-faint">No location data for this lap</p>
      )}
    </div>
  );
}
