/** Doc 16 mock: aggregate-only report; non-admin (state.usageForbidden) gets 403 like the real guard. */
export const USAGE_REPORT = {
  filters: { from: null, to: null, platform: null, templateId: null, exportFormat: null, feature: null },
  kpis: { resumesCreated: 7, activeDesigners: 4, activeSessions: 5, exportRequests: 9, exportsSucceeded: 8, localSavesConfirmed: 3, uniqueSavers: 2, downloadsInitiated: 6, previews: 12, atsReports: 2 },
  daily: [{ date: '2026-11-13', resumesCreated: 7, exportRequests: 9, exportsSucceeded: 8, localSaves: 3, previews: 12 }],
  funnel: [{ stage: 'RESUME_CREATED', users: 4 }, { stage: 'PREVIEW_RENDERED', users: 4 }, { stage: 'EXPORT_SUCCEEDED', users: 3 }, { stage: 'LOCAL_SAVE_SUCCEEDED', users: 2 }],
  platforms: { WEB: 10, ANDROID: 2 }, exportFormats: { PDF: 8 }, failureCategories: {},
  templates: [{ templateId: 'classic', templateVersion: 1, events: 9, users: 4 }, { templateId: 'other', templateVersion: null, events: 2, users: null }],
  ai: { requests: 3, failed: 1, estimatedCostMicros: 120000, byFeature: [] },
  notes: ['Aggregate only: no resume content, contact details, prompts, paths or per-user rows are returned.'],
};
export function handleUsage(state: { usageForbidden?: boolean }, method: string, path: string) {
  if (method === 'POST' && path === '/analytics/usage/events') return { status: 200, data: { accepted: 1 } };
  if (method === 'GET' && path === '/admin/analytics/usage') return state.usageForbidden ? { status: 403, data: { message: 'Forbidden' } } : { status: 200, data: USAGE_REPORT };
  return null;
}
