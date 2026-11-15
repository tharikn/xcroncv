import { clamp } from '../../core/preview-layout';

/** Pinch-to-zoom: scale follows the ratio of finger distances. */
export function pinchScale(startScale: number, startDist: number, dist: number, lo = 0.25, hi = 2.5): number {
  if (startDist <= 0) return startScale;
  return clamp(+(startScale * (dist / startDist)).toFixed(3), lo, hi);
}
export const touchDistance = (a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

/** Ctrl/⌘+wheel zoom step (deltaY < 0 zooms in). */
export function wheelScale(scale: number, deltaY: number, lo = 0.25, hi = 2.5): number {
  return clamp(+(scale * Math.exp(-deltaY * 0.0015)).toFixed(3), lo, hi);
}

/* ---------- crop (square box) ---------- */
export interface CropState { zoom: number; ox: number; oy: number }

/** Scale at which the image exactly covers the square box (zoom 1). */
export const coverScale = (w: number, h: number, box: number) => Math.max(box / w, box / h);

/** Keep the image covering the box: offsets are the image's top-left relative to the box. */
export function clampCrop(c: CropState, w: number, h: number, box: number): CropState {
  const zoom = clamp(c.zoom, 1, 4);
  const s = coverScale(w, h, box) * zoom;
  return { zoom, ox: clamp(c.ox, box - w * s, 0), oy: clamp(c.oy, box - h * s, 0) };
}
/** Centred crop at a zoom. */
export function centeredCrop(w: number, h: number, box: number, zoom = 1): CropState {
  const s = coverScale(w, h, box) * zoom;
  return clampCrop({ zoom, ox: (box - w * s) / 2, oy: (box - h * s) / 2 }, w, h, box);
}
/** Changing zoom keeps the box centre fixed. */
export function zoomCrop(c: CropState, zoom: number, w: number, h: number, box: number): CropState {
  const base = coverScale(w, h, box);
  const cx = (box / 2 - c.ox) / (base * c.zoom); const cy = (box / 2 - c.oy) / (base * c.zoom); // image-space centre
  const z = clamp(zoom, 1, 4);
  return clampCrop({ zoom: z, ox: box / 2 - cx * base * z, oy: box / 2 - cy * base * z }, w, h, box);
}
/** Source rectangle (image pixels) the box currently shows. */
export function cropSource(c: CropState, w: number, h: number, box: number): { sx: number; sy: number; size: number } {
  const s = coverScale(w, h, box) * c.zoom;
  return { sx: -c.ox / s + 0, sy: -c.oy / s + 0, size: box / s }; // + 0 normalises -0
}
