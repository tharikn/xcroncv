/**
 * Compensation adapter boundary (doc 44, P2). No licensed source is connected, so no number is ever produced here.
 * A provider must return provenance with every observation; observations without it are dropped, never shown.
 */
export interface RawObservation {
  role?: string; geography?: string; currency?: string; period?: string;
  p25?: number; median?: number; p75?: number; sampleSize?: number;
  source?: string; observedAt?: string; licensedUse?: boolean;
}
export interface CompensationObservation {
  role: string; geography: string; currency: string; period: 'YEAR' | 'MONTH' | 'HOUR';
  p25?: number; median: number; p75?: number; sampleSize?: number; source: string; observedAt: string;
}
export interface CompensationProvider {
  id: string;
  fetch(q: { role: string; location?: string; currency?: string }): Promise<RawObservation[]>;
}
export const COMPENSATION_PROVIDERS = Symbol('COMPENSATION_PROVIDERS');

const CURRENCY = /^[A-Z]{3}$/;
/** Keep only observations that can be fully attributed: source, geography, currency, date, plausible numbers, licensed use. */
export function normalizeObservations(raw: RawObservation[], now = new Date()): CompensationObservation[] {
  const out: CompensationObservation[] = [];
  for (const r of raw) {
    const t = r.observedAt ? Date.parse(r.observedAt) : NaN;
    const nums = [r.p25, r.median, r.p75].filter((n) => n !== undefined) as number[];
    if (!r.source?.trim() || !r.geography?.trim() || !r.currency || !CURRENCY.test(r.currency) || !r.role?.trim()) continue;
    if (!Number.isFinite(t) || t > now.getTime() || r.licensedUse !== true) continue;
    if (r.median === undefined || nums.some((n) => !Number.isFinite(n) || n <= 0)) continue;
    if ((r.p25 !== undefined && r.p25 > r.median) || (r.p75 !== undefined && r.p75 < r.median)) continue;
    const period = r.period === 'MONTH' || r.period === 'HOUR' ? r.period : 'YEAR';
    out.push({ role: r.role, geography: r.geography, currency: r.currency, period, p25: r.p25, median: r.median, p75: r.p75, sampleSize: r.sampleSize, source: r.source, observedAt: new Date(t).toISOString() });
  }
  return out;
}
