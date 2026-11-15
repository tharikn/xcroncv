import { DOC_LIMITS, DocImage } from '../../core/resume-doc';
import { CropState, cropSource } from './geometry';

export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Validation of the picked file before it is decoded. SVG is refused (scriptable); only raster images are accepted. */
export function validateImageFile(f: { type: string; size: number }): 'ok' | 'type' | 'size' {
  if (!ALLOWED.includes(f.type)) return 'type';
  if (f.size > MAX_SOURCE_BYTES) return 'size';
  return 'ok';
}

export interface LoadedImage { el: HTMLImageElement; w: number; h: number; url: string; png: boolean }

export function loadImage(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => resolve({ el, w: el.naturalWidth, h: el.naturalHeight, url, png: file.type === 'image/png' || file.type === 'image/gif' || file.type === 'image/webp' });
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    el.src = url;
  });
}

/**
 * Renders the visible crop to a small square data URI. Only this cropped, downscaled result is stored in the resume
 * document; the original file never leaves the browser. Shrinks quality/size until it fits the server's per-image cap.
 */
export function renderCrop(img: LoadedImage, crop: CropState, box: number, outPx: number, sizePt: number): DocImage {
  const { sx, sy, size } = cropSource(crop, img.w, img.h, box);
  let px = outPx; let q = 0.88;
  for (let attempt = 0; attempt < 6; attempt++) {
    const c = document.createElement('canvas'); c.width = px; c.height = px;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('canvas');
    if (!img.png) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, px, px); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.el, sx, sy, size, size, 0, 0, px, px);
    const src = img.png && attempt < 3 ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', q);
    if (src.length <= DOC_LIMITS.imageChars * 0.9) return { src, sizePt };
    px = Math.round(px * 0.8); q = Math.max(0.5, q - 0.1);
  }
  throw new Error('too-large');
}
