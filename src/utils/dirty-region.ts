/**
 * Tracks what was drawn on a transparent overlay canvas last frame so the next frame clears
 * only those rectangles. Full-canvas clears damage the whole layer and force a full raster
 * upload each frame; marker-sized clears keep per-frame compositor work proportional to the markers.
 */
export class DirtyRegion {
  private rects: number[] = [];

  /** Records a rectangle drawn this frame, padded to cover antialiasing. */
  add(x: number, y: number, w: number, h: number): void {
    this.rects.push(Math.floor(x) - 1, Math.floor(y) - 1, Math.ceil(w) + 2, Math.ceil(h) + 2);
  }

  /** Erases everything recorded since the previous clear; call before drawing a new frame. */
  clear(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.rects.length; i += 4) {
      ctx.clearRect(this.rects[i], this.rects[i + 1], this.rects[i + 2], this.rects[i + 3]);
    }
    this.rects.length = 0;
  }

  /** Forgets recorded rectangles after the canvas was wiped by other means (resize, full clear). */
  reset(): void {
    this.rects.length = 0;
  }
}
