import { TOUR_STEPS } from './tour.config';
import { isInViewport, nextFocusIndex, placeTip, resolveTarget, spotBox, storageKey } from './tour.logic';
import { EN } from '../../core/i18n/en';

const vp = { width: 400, height: 800 };

describe('tour config', () => {
  it('has unique ids, targets, and every i18n key exists', () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
    for (const s of TOUR_STEPS) {
      expect(s.targets.length).toBeGreaterThan(0);
      expect(EN).toHaveProperty([s.titleKey]);
      expect(EN).toHaveProperty([s.bodyKey]);
    }
  });
  it('follows the flow profile -> template -> edit -> export', () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual(['profile', 'template', 'panel', 'canvas', 'export']);
  });
});

describe('storageKey', () => {
  it('is per user with an anonymous fallback', () => {
    expect(storageKey('p.', 'u1')).toBe('p.u1');
    expect(storageKey('p.', '')).toBe('p.anonymous');
  });
});

describe('resolveTarget', () => {
  const step = TOUR_STEPS[0];
  it('picks the first target that exists and is visible', () => {
    const dom: Record<string, string> = { '[data-tour="nav-profile"]': 'nav' };
    expect(resolveTarget(step, (q) => dom[q] ?? null, () => true)).toBe('nav');
    dom['[data-tour="step-profile-action"]'] = 'btn';
    expect(resolveTarget(step, (q) => dom[q] ?? null, () => true)).toBe('btn');
  });
  it('skips hidden elements and returns null when nothing matches', () => {
    expect(resolveTarget(step, () => 'x', () => false)).toBeNull();
    expect(resolveTarget(step, () => null, () => true)).toBeNull();
  });
});

describe('spotBox', () => {
  it('pads and clamps to the viewport', () => {
    expect(spotBox({ top: 100, left: 50, width: 100, height: 40 }, vp, 6)).toEqual({ top: 94, left: 44, width: 112, height: 52 });
    const edge = spotBox({ top: 0, left: 390, width: 50, height: 40 }, vp, 6);
    expect(edge.left).toBe(384);
    expect(edge.left + edge.width).toBe(400);
    expect(edge.top).toBe(0);
  });
});

describe('placeTip', () => {
  const tip = { width: 352, height: 180 };
  it('goes below when it fits', () => {
    const p = placeTip({ top: 100, left: 20, width: 100, height: 40 }, tip, vp);
    expect(p.placement).toBe('below');
    expect(p.top).toBe(152);
  });
  it('goes above near the bottom edge', () => {
    expect(placeTip({ top: 700, left: 20, width: 100, height: 40 }, tip, vp).placement).toBe('above');
  });
  it('centers with no target and stays inside a narrow viewport', () => {
    const p = placeTip(null, tip, { width: 320, height: 600 });
    expect(p.placement).toBe('center');
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + Math.min(tip.width, 304)).toBeLessThanOrEqual(312);
  });
  it('centers when neither side fits (very tall target)', () => {
    expect(placeTip({ top: 10, left: 10, width: 300, height: 780 }, tip, vp).placement).toBe('center');
  });
  it('clamps horizontally for a target at the right edge', () => {
    const p = placeTip({ top: 100, left: 380, width: 20, height: 40 }, tip, vp);
    expect(p.left + 352).toBeLessThanOrEqual(392);
  });
});

describe('isInViewport / nextFocusIndex', () => {
  it('detects off-screen targets', () => {
    expect(isInViewport({ top: 10, left: 10, width: 50, height: 50 }, vp)).toBe(true);
    expect(isInViewport({ top: 790, left: 10, width: 50, height: 50 }, vp)).toBe(false);
  });
  it('wraps focus both ways and handles empty / unfocused', () => {
    expect(nextFocusIndex(2, 3, false)).toBe(0);
    expect(nextFocusIndex(0, 3, true)).toBe(2);
    expect(nextFocusIndex(-1, 3, false)).toBe(0);
    expect(nextFocusIndex(-1, 3, true)).toBe(2);
    expect(nextFocusIndex(0, 0, false)).toBe(-1);
  });
});
