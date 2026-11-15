/**
 * Pure, descriptive aggregation over job-search events (doc 48).
 * Rules: every metric carries numerator, denominator, sample size and window; missing data is labelled;
 * small cohorts are withheld; nothing here is a causal or predictive claim.
 */
export const EVENT_TYPES = ['SAVED', 'APPLIED', 'RESPONSE', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const MIN_COHORT = 5;

export interface EventRow {
  type: string; occurredAt: Date; applicationRef: string; source: string;
  roleFamily?: string | null; geography?: string | null; seniority?: string | null; sourceName?: string | null;
  resumeVersionId?: string | null;
}
export interface Filters { from?: Date; to?: Date; roleFamily?: string; geography?: string; seniority?: string; sourceName?: string }

export interface Rate { numerator: number; denominator: number; rate: number | null; sampleSize: number }
const rate = (n: number, d: number): Rate => ({ numerator: n, denominator: d, rate: d > 0 ? Math.round((n / d) * 1000) / 1000 : null, sampleSize: d });

export function applyFilters(rows: EventRow[], f: Filters): EventRow[] {
  const eq = (a?: string | null, b?: string) => !b || (a ?? '').toLowerCase() === b.toLowerCase();
  // Filters apply per application (an application's attributes may sit on any one of its events).
  const attrs = new Map<string, EventRow>();
  for (const r of rows) attrs.set(r.applicationRef, { ...(attrs.get(r.applicationRef) ?? r), ...Object.fromEntries(Object.entries(r).filter(([k, v]) => v != null && ['roleFamily', 'geography', 'seniority', 'sourceName'].includes(k))) });
  return rows.filter((r) => {
    const a = attrs.get(r.applicationRef)!;
    return eq(a.roleFamily, f.roleFamily) && eq(a.geography, f.geography) && eq(a.seniority, f.seniority) && eq(a.sourceName, f.sourceName)
      && (!f.from || r.occurredAt >= f.from) && (!f.to || r.occurredAt <= f.to);
  });
}

interface AppSummary {
  ref: string; saved?: Date; applied?: Date; firstResponse?: Date; interview: boolean; offer: boolean; rejected: boolean; withdrawn: boolean;
  resumeVersionId?: string; responded: boolean;
}

const RESPONSE_TYPES = new Set(['RESPONSE', 'INTERVIEW', 'OFFER', 'REJECTED']);

export function summarizeApplications(rows: EventRow[]): AppSummary[] {
  const map = new Map<string, AppSummary>();
  for (const r of [...rows].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())) {
    const a = map.get(r.applicationRef) ?? { ref: r.applicationRef, interview: false, offer: false, rejected: false, withdrawn: false, responded: false };
    if (r.type === 'SAVED') a.saved ??= r.occurredAt;
    if (r.type === 'APPLIED') { a.applied ??= r.occurredAt; if (r.resumeVersionId) a.resumeVersionId = r.resumeVersionId; }
    if (r.resumeVersionId && !a.resumeVersionId) a.resumeVersionId = r.resumeVersionId;
    if (RESPONSE_TYPES.has(r.type)) { a.responded = true; a.firstResponse ??= r.occurredAt; }
    if (r.type === 'INTERVIEW') a.interview = true;
    if (r.type === 'OFFER') a.offer = true;
    if (r.type === 'REJECTED') a.rejected = true;
    if (r.type === 'WITHDRAWN') a.withdrawn = true;
    map.set(r.applicationRef, a);
  }
  return [...map.values()];
}

export function funnel(rows: EventRow[], f: Filters = {}) {
  const apps = summarizeApplications(applyFilters(rows, f));
  const saved = apps.filter((a) => a.saved || a.applied).length; // an applied job counts as seen
  const applied = apps.filter((a) => a.applied).length;
  const responded = apps.filter((a) => a.applied && a.responded).length;
  const interview = apps.filter((a) => a.applied && a.interview).length;
  const offer = apps.filter((a) => a.applied && a.offer).length;
  const missingApplied = apps.filter((a) => !a.applied && (a.responded || a.interview || a.offer)).length;
  return {
    window: { from: f.from?.toISOString() ?? null, to: f.to?.toISOString() ?? null },
    stages: [
      { stage: 'SAVED', count: saved, ...rate(applied, saved), label: 'Applied / saved or applied' },
      { stage: 'APPLIED', count: applied, ...rate(responded, applied), label: 'Responded / applied' },
      { stage: 'RESPONDED', count: responded, ...rate(interview, responded), label: 'Interview / responded' },
      { stage: 'INTERVIEW', count: interview, ...rate(offer, interview), label: 'Offer / interview' },
      { stage: 'OFFER', count: offer, numerator: offer, denominator: offer, rate: null, sampleSize: offer, label: 'Offers' },
    ],
    quality: {
      missingAppliedEvent: missingApplied,
      notes: [
        ...(missingApplied ? [`${missingApplied} application(s) have responses but no recorded Applied event and are excluded from rates.`] : []),
        'Descriptive only. Rates show what happened in your own data, not what caused it.',
      ],
    },
  };
}

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function overview(rows: EventRow[], f: Filters, tasks: { open: number; overdue: number; done: number }) {
  const filtered = applyFilters(rows, f);
  const apps = summarizeApplications(filtered);
  const days = apps.filter((a) => a.applied && a.firstResponse && a.firstResponse >= a.applied)
    .map((a) => (a.firstResponse!.getTime() - a.applied!.getTime()) / 86_400_000);
  const bySource = (s: string) => filtered.filter((r) => r.source === s).length;
  const last = filtered.reduce<Date | null>((m, r) => (!m || r.occurredAt > m ? r.occurredAt : m), null);
  return {
    window: { from: f.from?.toISOString() ?? null, to: f.to?.toISOString() ?? null },
    totals: {
      saved: apps.filter((a) => a.saved).length, applied: apps.filter((a) => a.applied).length,
      responses: apps.filter((a) => a.responded).length, interviews: apps.filter((a) => a.interview).length,
      offers: apps.filter((a) => a.offer).length, rejections: apps.filter((a) => a.rejected).length,
    },
    followUps: tasks,
    timeToResponseDays: { median: median(days) === null ? null : Math.round(median(days)! * 10) / 10, sampleSize: days.length,
      note: days.length ? 'Only applications with both an Applied and a response event.' : 'No applications have both an Applied and a response event yet.' },
    coverage: { manualEvents: bySource('MANUAL'), hostEvents: bySource('HOST'), totalEvents: filtered.length,
      incomplete: filtered.length === 0 || bySource('HOST') === 0,
      note: bySource('HOST') === 0 ? 'Based only on activity you recorded. No authorised job portal is connected.' : 'Includes events from an authorised host integration.' },
    freshness: { lastEventAt: last?.toISOString() ?? null },
  };
}

export function resumeVersions(rows: EventRow[], f: Filters = {}) {
  const apps = summarizeApplications(applyFilters(rows, f)).filter((a) => a.applied && a.resumeVersionId);
  const groups = new Map<string, AppSummary[]>();
  for (const a of apps) groups.set(a.resumeVersionId!, [...(groups.get(a.resumeVersionId!) ?? []), a]);
  const versions = [...groups.entries()].map(([id, list]) => {
    const ok = list.length >= MIN_COHORT;
    return {
      resumeVersionId: id, applications: list.length, sufficientSample: ok,
      responseRate: ok ? rate(list.filter((a) => a.responded).length, list.length) : null,
      interviewRate: ok ? rate(list.filter((a) => a.interview).length, list.length) : null,
      note: ok ? undefined : `Fewer than ${MIN_COHORT} applications; rates are hidden to avoid misleading conclusions.`,
    };
  }).sort((a, b) => b.applications - a.applications);
  return {
    minCohort: MIN_COHORT, versions,
    caveat: 'Differences between resume versions are correlations in your own data. They do not show that one version caused a better outcome.',
  };
}

/** Monday-start ISO week key (UTC), e.g. 2026-11-09. */
export function weekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

export function activity(rows: EventRow[], f: Filters = {}) {
  const buckets = new Map<string, Record<string, number>>();
  for (const r of applyFilters(rows, f)) {
    const k = weekStart(r.occurredAt);
    const b = buckets.get(k) ?? {};
    b[r.type] = (b[r.type] ?? 0) + 1;
    buckets.set(k, b);
  }
  return { bucket: 'week', weeks: [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([weekStart, counts]) => ({ weekStart, counts, total: Object.values(counts).reduce((s, n) => s + n, 0) })) };
}
