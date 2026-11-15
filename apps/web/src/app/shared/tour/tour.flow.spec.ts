import { TOUR_KEY_PREFIX, TOUR_STEPS } from './tour.config';
import { TourFlow, TourStore } from './tour.logic';

function mk(m = new Map<string, string>(), sub = 'u1', authed = true) {
  const store: TourStore = { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
  return new TourFlow(TOUR_STEPS.length, store, TOUR_KEY_PREFIX, () => sub, () => authed);
}

describe('TourFlow', () => {
  it('auto-starts once for a first-time user; skip persists and prevents restarts (also after reload)', () => {
    const m = new Map<string, string>();
    const t = mk(m);
    t.maybeStart();
    expect(t.active).toBe(true);
    t.skip();
    expect(t.active).toBe(false);
    t.maybeStart();
    expect(t.active).toBe(false);
    const reloaded = mk(m); reloaded.maybeStart();
    expect(reloaded.active).toBe(false);
  });
  it('is per user', () => {
    const m = new Map<string, string>();
    mk(m, 'a').finish();
    expect(mk(m, 'b').isDone()).toBe(false);
    expect(mk(m, 'a').isDone()).toBe(true);
  });
  it('does not start when signed out', () => { const t = mk(new Map(), 'x', false); t.maybeStart(); expect(t.active).toBe(false); });
  it('walks all steps and completes on the last next()', () => {
    const t = mk(); t.maybeStart();
    for (let i = 0; i < TOUR_STEPS.length - 1; i++) { expect(t.index).toBe(i); t.next(); }
    expect(t.isLast()).toBe(true);
    t.next();
    expect(t.active).toBe(false);
    expect(t.isDone()).toBe(true);
  });
  it('back is clamped at the first step', () => { const t = mk(); t.maybeStart(); t.back(); expect(t.index).toBe(0); t.next(); t.back(); expect(t.index).toBe(0); });
  it('replay restarts from step 1 even when done', () => {
    const t = mk(); t.maybeStart(); t.next(); t.finish();
    t.replay();
    expect(t.active).toBe(true);
    expect(t.index).toBe(0);
  });
});
