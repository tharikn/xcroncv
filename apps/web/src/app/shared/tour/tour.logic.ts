import { TourStep } from './tour.config';

export interface Box { top: number; left: number; width: number; height: number }
export interface Viewport { width: number; height: number }

export const SPOT_PAD = 6;

export function storageKey(prefix: string, subject: string): string { return `${prefix}${subject || 'anonymous'}`; }

/** First selector from the step whose element exists (and is visible per the supplied probe). */
export function resolveTarget<T>(step: TourStep, find: (selector: string) => T | null, visible: (el: T) => boolean): T | null {
  for (const name of step.targets) {
    const el = find(`[data-tour="${name}"]`);
    if (el && visible(el)) return el;
  }
  return null;
}

/** Padded spotlight box clamped to the viewport. */
export function spotBox(r: Box, vp: Viewport, pad = SPOT_PAD): Box {
  const left = Math.max(0, r.left - pad), top = Math.max(0, r.top - pad);
  const right = Math.min(vp.width, r.left + r.width + pad), bottom = Math.min(vp.height, r.top + r.height + pad);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export interface TipPos { top: number; left: number; placement: 'below' | 'above' | 'center' }

/** Place the tooltip below the spot when it fits, else above, else centered. Always inside the viewport. */
export function placeTip(spot: Box | null, tip: { width: number; height: number }, vp: Viewport, gap = 12, margin = 8): TipPos {
  const w = Math.min(tip.width, vp.width - 2 * margin);
  const clampX = (x: number) => Math.min(Math.max(margin, x), Math.max(margin, vp.width - w - margin));
  if (!spot) return { top: Math.max(margin, (vp.height - tip.height) / 2), left: clampX((vp.width - w) / 2), placement: 'center' };
  const left = clampX(spot.left + spot.width / 2 - w / 2);
  if (spot.top + spot.height + gap + tip.height + margin <= vp.height) return { top: spot.top + spot.height + gap, left, placement: 'below' };
  if (spot.top - gap - tip.height >= margin) return { top: spot.top - gap - tip.height, left, placement: 'above' };
  return { top: Math.max(margin, (vp.height - tip.height) / 2), left, placement: 'center' };
}

export function isInViewport(r: Box, vp: Viewport): boolean {
  return r.top >= 0 && r.left >= 0 && r.top + r.height <= vp.height && r.left + r.width <= vp.width;
}

/** Cycle focus within a container's focusable list (focus trap). Returns the index to focus. */
export function nextFocusIndex(current: number, count: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  return backwards ? (current - 1 + count) % count : (current + 1) % count;
}

export interface TourStore { get(key: string): string | null; set(key: string, value: string): void }
export interface TourSnapshot { active: boolean; index: number }

/** Framework-free tour state machine (unit-testable). Completion is stored per user. */
export class TourFlow {
  active = false;
  index = 0;
  constructor(private total: number, private store: TourStore, private prefix: string,
              private subject: () => string, private authed: () => boolean) {}

  private key() { return storageKey(this.prefix, this.subject()); }
  isDone(): boolean { return this.store.get(this.key()) === '1'; }
  isLast(): boolean { return this.index >= this.total - 1; }
  maybeStart(): void { if (!this.active && this.authed() && !this.isDone()) this.begin(); }
  replay(): void { this.begin(); }
  begin(): void { this.index = 0; this.active = true; }
  next(): void { if (this.isLast()) this.finish(); else this.index++; }
  back(): void { this.index = Math.max(0, this.index - 1); }
  skip(): void { this.finish(); }
  finish(): void { this.store.set(this.key(), '1'); this.active = false; }
  snapshot(): TourSnapshot { return { active: this.active, index: this.index }; }
}
