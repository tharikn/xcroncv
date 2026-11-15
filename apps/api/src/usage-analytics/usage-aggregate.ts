/** Pure aggregation for admin usage analytics (doc 16). Input rows carry allowlisted metadata only. */
export const USAGE_EVENTS = [
  'DASHBOARD_OPENED', 'DESIGNER_OPENED', 'DESIGNER_ACTIVITY', 'TEMPLATE_SELECTED', 'PREVIEW_RENDERED',
  'EXPORT_REQUESTED', 'EXPORT_SUCCEEDED', 'EXPORT_FAILED', 'LOCAL_SAVE_SUCCEEDED', 'DOWNLOAD_INITIATED',
  'ATS_REPORT_GENERATED', 'RESUME_CREATED', 'GOOGLE_DOC_CREATED',
] as const;
export const PLATFORMS = ['WEB', 'ANDROID'] as const;
export const EXPORT_FORMATS = ['PDF', 'HTML', 'DOCX', 'XLSX'] as const;
export const FAILURE_CATEGORIES = ['VALIDATION', 'RENDER', 'PERMISSION', 'STORAGE', 'NETWORK', 'OTHER'] as const;
/** Meaningful design activity (a page view alone never counts, doc 16 section 5). */
export const DESIGN_ACTIVITY: string[] = ['DESIGNER_ACTIVITY', 'TEMPLATE_SELECTED', 'PREVIEW_RENDERED', 'EXPORT_REQUESTED'];
/** Smallest group shown for per-template breakdowns; smaller groups collapse into "other". */
export const MIN_GROUP = 3;

export interface UsageRow {
  name: string; occurredAt: Date; userId: string; sessionId?: string | null; platform: string;
  templateId?: string | null; templateVersion?: number | null; exportFormat?: string | null;
  status?: string | null; failureCategory?: string | null; durationMs?: number | null;
}
export interface AiRow { feature: string; status: string; costMicros: number; userId: string; createdAt: Date }
export interface UsageFilters { from?: Date; to?: Date; platform?: string; templateId?: string; templateVersion?: number; exportFormat?: string; feature?: string }

const day = (d: Date) => d.toISOString().slice(0, 10);
const count = <T>(rows: T[], key: (r: T) => string | null | undefined) => {
  const m = new Map<string, number>();
  for (const r of rows) { const k = key(r); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
};
const uniq = (rows: UsageRow[]) => new Set(rows.map((r) => r.userId)).size;

export function applyFilters(rows: UsageRow[], f: UsageFilters): UsageRow[] {
  return rows.filter((r) =>
    (!f.from || r.occurredAt >= f.from) && (!f.to || r.occurredAt <= f.to) &&
    (!f.platform || r.platform === f.platform) &&
    (!f.templateId || r.templateId === f.templateId) &&
    (f.templateVersion == null || r.templateVersion === f.templateVersion) &&
    (!f.exportFormat || r.exportFormat === f.exportFormat) &&
    (!f.feature || r.name === f.feature));
}

export function usageReport(all: UsageRow[], f: UsageFilters, ai: AiRow[] = []) {
  const rows = applyFilters(all, f);
  const by = (n: string) => rows.filter((r) => r.name === n);
  const exportsOk = by('EXPORT_SUCCEEDED');
  const saves = by('LOCAL_SAVE_SUCCEEDED');

  const days = new Map<string, { resumesCreated: number; exportRequests: number; exportsSucceeded: number; localSaves: number; previews: number }>();
  const bucket = (d: string) => { if (!days.has(d)) days.set(d, { resumesCreated: 0, exportRequests: 0, exportsSucceeded: 0, localSaves: 0, previews: 0 }); return days.get(d)!; };
  for (const r of rows) {
    const b = bucket(day(r.occurredAt));
    if (r.name === 'RESUME_CREATED') b.resumesCreated++;
    else if (r.name === 'EXPORT_REQUESTED') b.exportRequests++;
    else if (r.name === 'EXPORT_SUCCEEDED') b.exportsSucceeded++;
    else if (r.name === 'LOCAL_SAVE_SUCCEEDED') b.localSaves++;
    else if (r.name === 'PREVIEW_RENDERED') b.previews++;
  }

  // Funnel counts distinct users per stage; export generation and confirmed local save stay separate.
  const funnel = ['RESUME_CREATED', 'PREVIEW_RENDERED', 'EXPORT_SUCCEEDED', 'LOCAL_SAVE_SUCCEEDED'].map((stage) => ({ stage, users: uniq(by(stage)) }));

  // Template popularity by immutable version; small groups are suppressed to avoid singling out individuals.
  const tmpl = new Map<string, { templateId: string; templateVersion: number | null; events: number; users: Set<string> }>();
  for (const r of rows.filter((x) => x.templateId && ['RESUME_CREATED', 'TEMPLATE_SELECTED', 'EXPORT_SUCCEEDED'].includes(x.name))) {
    const k = `${r.templateId}@${r.templateVersion ?? '?'}`;
    const t = tmpl.get(k) ?? { templateId: r.templateId!, templateVersion: r.templateVersion ?? null, events: 0, users: new Set<string>() };
    t.events++; t.users.add(r.userId); tmpl.set(k, t);
  }
  const shown = [...tmpl.values()].filter((t) => t.users.size >= MIN_GROUP);
  const hidden = [...tmpl.values()].filter((t) => t.users.size < MIN_GROUP);
  const templates: { templateId: string; templateVersion: number | null; events: number; users: number | null }[] = [
    ...shown.map((t) => ({ templateId: t.templateId, templateVersion: t.templateVersion, events: t.events, users: t.users.size })).sort((a, b) => b.events - a.events),
    ...(hidden.length ? [{ templateId: 'other', templateVersion: null, events: hidden.reduce((s, t) => s + t.events, 0), users: null }] : []),
  ];

  const aiRows = ai.filter((a) => (!f.from || a.createdAt >= f.from) && (!f.to || a.createdAt <= f.to));
  const aiByFeature = new Map<string, { requests: number; failed: number; costMicros: number }>();
  for (const a of aiRows) {
    const e = aiByFeature.get(a.feature) ?? { requests: 0, failed: 0, costMicros: 0 };
    e.requests++; if (a.status !== 'OK') e.failed++; e.costMicros += a.costMicros; aiByFeature.set(a.feature, e);
  }

  const failures = rows.filter((r) => r.name === 'EXPORT_FAILED' || r.status === 'FAILED');
  const design = rows.filter((r) => DESIGN_ACTIVITY.includes(r.name));
  const sessions = new Set(design.filter((r) => r.sessionId).map((r) => r.sessionId));

  return {
    filters: { from: f.from?.toISOString() ?? null, to: f.to?.toISOString() ?? null, platform: f.platform ?? null, templateId: f.templateId ?? null, exportFormat: f.exportFormat ?? null, feature: f.feature ?? null },
    kpis: {
      resumesCreated: by('RESUME_CREATED').length, activeDesigners: uniq(design), activeSessions: sessions.size,
      exportRequests: by('EXPORT_REQUESTED').length, exportsSucceeded: exportsOk.length,
      localSavesConfirmed: saves.length, uniqueSavers: uniq(saves), downloadsInitiated: by('DOWNLOAD_INITIATED').length,
      previews: by('PREVIEW_RENDERED').length, atsReports: by('ATS_REPORT_GENERATED').length,
    },
    daily: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
    funnel,
    platforms: Object.fromEntries(PLATFORMS.map((p) => [p, rows.filter((r) => r.platform === p).length])),
    exportFormats: Object.fromEntries([...count(exportsOk, (r) => r.exportFormat)]),
    failureCategories: Object.fromEntries([...count(failures, (r) => r.failureCategory ?? 'OTHER')]),
    templates,
    ai: {
      requests: aiRows.length, failed: aiRows.filter((a) => a.status !== 'OK').length,
      estimatedCostMicros: aiRows.reduce((s, a) => s + a.costMicros, 0),
      byFeature: [...aiByFeature.entries()].map(([feature, v]) => ({ feature, ...v })).sort((a, b) => b.requests - a.requests),
    },
    notes: [
      'Aggregate only: no resume content, contact details, prompts, paths or per-user rows are returned.',
      'Export generation and confirmed local save are separate metrics; a download initiated is not a confirmed save.',
      `Per-template groups with fewer than ${MIN_GROUP} users are merged into "other".`,
    ],
  };
}
