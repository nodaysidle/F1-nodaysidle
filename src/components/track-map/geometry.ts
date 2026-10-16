export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function boundsOf(xs: ArrayLike<number>, ys: ArrayLike<number>): Bounds | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const y = ys[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return Number.isFinite(minX) ? { minX, maxX, minY, maxY } : null;
}

export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export interface Projection {
  /** Screen-space x for a world point (CSS px). */
  sx: (x: number) => number;
  sy: (y: number) => number;
  /** Inverse, for hit-testing clicks. */
  wx: (sx: number) => number;
  wy: (sy: number) => number;
  scale: number;
}

/**
 * Fits the circuit's bounding box into the viewport (aspect-preserving, centred, y flipped
 * because OpenF1's y axis points up), then applies the user's pan/zoom on top.
 */
export function project(bounds: Bounds, width: number, height: number, view: View, padding = 24): Projection {
  const w = bounds.maxX - bounds.minX || 1;
  const h = bounds.maxY - bounds.minY || 1;
  const fit = Math.min((width - padding * 2) / w, (height - padding * 2) / h);
  const scale = fit * view.zoom;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const ox = width / 2 + view.panX;
  const oy = height / 2 + view.panY;
  return {
    sx: (x) => ox + (x - cx) * scale,
    sy: (y) => oy - (y - cy) * scale,
    wx: (sx) => cx + (sx - ox) / scale,
    wy: (sy) => cy - (sy - oy) / scale,
    scale,
  };
}

export function nearestIndex(xs: ArrayLike<number>, ys: ArrayLike<number>, x: number, y: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const d = (xs[i] - x) ** 2 + (ys[i] - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}
