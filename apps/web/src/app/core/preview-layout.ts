/** Page geometry for the dedicated Preview route (doc 17). CSS px at 96dpi. */
export const PAGE_PX = { A4: { w: 794, h: 1123 }, LETTER: { w: 816, h: 1056 } } as const;
export type PageSize = keyof typeof PAGE_PX;

export function pageCount(contentHeightPx: number, size: PageSize): number {
  return Math.max(1, Math.ceil(contentHeightPx / PAGE_PX[size].h));
}

/** A laid-out block: where it starts and how tall it is, in flow coordinates (content top origin). */
export interface BreakCandidate { id: string; top: number; height: number; }

const AUTO_BREAK_EPS = 0.5;

/**
 * Automatic page-break planning (content that exceeds the page moves to the next page automatically).
 *
 * `top` is a flow coordinate measured from the TOP OF THE CONTENT AREA (after the sheet's top padding),
 * so the printable bottom is `pageH - verticalPadding` where verticalPadding = top + bottom sheet padding.
 * Coordinates are reduced modulo the page height: a block already starting a page (top % pageH ≈ 0) is
 * deliberately left alone — moving it again would add a redundant spacer on every following page.
 *
 * Callers union the returned ids with explicit user-forced breaks (`pageBreakBefore`) so manual control still wins.
 */
export function planAutoBreaks(cands: BreakCandidate[], pageH: number, verticalPadding: number): Set<string> {
  const breaks = new Set<string>();
  const printableBottom = pageH - verticalPadding;
  for (const c of cands) {
    const topInPage = ((c.top % pageH) + pageH) % pageH;
    if (topInPage <= AUTO_BREAK_EPS) continue; // already starts a fresh page
    if (topInPage + c.height > printableBottom + AUTO_BREAK_EPS) breaks.add(c.id);
  }
  return breaks;
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
