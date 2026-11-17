import { clampProgress, isIndeterminateProgress } from './loading.utils';

describe('loading utils', () => {
  it('clamps progress into 0..100 and rounds fractional values', () => {
    expect(clampProgress(-12)).toBe(0);
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(47.6)).toBe(48);
    expect(clampProgress(100)).toBe(100);
    expect(clampProgress(240)).toBe(100);
    expect(clampProgress(Number.NaN)).toBe(0);
  });

  it('treats null and undefined as indeterminate but 0 as a real value', () => {
    expect(isIndeterminateProgress(null)).toBe(true);
    expect(isIndeterminateProgress(undefined)).toBe(true);
    expect(isIndeterminateProgress(0)).toBe(false);
    expect(clampProgress(null)).toBe(0);
  });
});
