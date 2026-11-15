/** Page geometry for the dedicated Preview route (doc 17). CSS px at 96dpi. */
export const PAGE_PX = { A4: { w: 794, h: 1123 }, LETTER: { w: 816, h: 1056 } } as const;
export type PageSize = keyof typeof PAGE_PX;

export function pageCount(contentHeightPx: number, size: PageSize): number {
  return Math.max(1, Math.ceil(contentHeightPx / PAGE_PX[size].h));
}

export type FitMode = 'width' | 'page' | 'manual';

export function fitScale(mode: FitMode, size: PageSize, viewport: { w: number; h: number }, manual = 1): number {
  const p = PAGE_PX[size];
  const pad = 32;
  if (mode === 'width') return clamp((viewport.w - pad) / p.w, 0.25, 2);
  if (mode === 'page') return clamp(Math.min((viewport.w - pad) / p.w, (viewport.h - pad) / p.h), 0.25, 2);
  return clamp(manual, 0.25, 2);
}

export function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

export function overflowWarning(pages: number): string | null {
  return pages > 2 ? `This resume runs to ${pages} pages. Most recruiters prefer one or two.` : null;
}
