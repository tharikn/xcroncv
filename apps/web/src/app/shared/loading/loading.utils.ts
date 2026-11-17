/** Clamp a progress value to the 0..100 range used by ARIA and the CSS fill. `null` means indeterminate. */
export function clampProgress(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** True when the total is unknown, so the bar should animate indeterminately. */
export function isIndeterminateProgress(value: number | null | undefined): boolean {
  return value === null || value === undefined;
}
