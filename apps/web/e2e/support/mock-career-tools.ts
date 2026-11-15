import { Page, Route } from '@playwright/test';

/**
 * In-memory fake of the career-tool endpoints (docs 42, 46, 48). Register AFTER setup(): Playwright runs the
 * most recently registered route first, and unmatched paths fall back to the base mock in mock-api.ts.
 */
const API = 'http://localhost:3100/api/v1';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-expose-headers': 'content-disposition',
};
export const PROFILE_BULLET = 'Cut p95 latency by 40% on the billing API.';
const MINE = /^\/(cover-letters|contacts|job-activities|follow-up-tasks|analytics|applications\/[^/]+\/cover-letter-bindings)/;

export interface Call { method: string; path: string; query: Record<string, string>; body?: any }
export interface ToolsState {
  letters: any[]; versions: Record<string, any[]>; bindings: any[];
  contacts: any[]; activities: any[]; tasks: any[]; events: any[];
  calls: Call[]; failNext: { path: RegExp; status: number; message?: string } | null; exports: string[]; seq: number;
}

export const freshTools = (over: Partial<ToolsState> = {}): ToolsState => ({
  letters: [], versions: {}, bindings: [], contacts: [], activities: [], tasks: [], events: [], calls: [], failNext: null, exports: [], seq: 0, ...over,
});

const TEMPLATES = [
  { id: 'concise', version: 1, name: 'Concise', description: 'Three short paragraphs for quick applications.' },
  { id: 'standard', version: 1, name: 'Standard', description: 'Opening, fit, achievements and a closing.' },
  { id: 'career-change', version: 1, name: 'Career change', description: 'Emphasises transferable skills and motivation.' },
  { id: 'referral', version: 1, name: 'Referral / contextual', description: 'Names a referrer you supply.' },
];

/** Same spirit as the server's validator: invented metrics are flagged unless the user typed them. */
export function fakeClaims(sections: any[], userAuthored: string[] = []) {
  const claims: any[] = [];
  for (const s of sections) {
    for (const m of s.text.match(/\d[\d,.]*\s?%/g) ?? []) {
      const backed = PROFILE_BULLET.includes(m.trim());
      claims.push({ sectionId: s.id, text: m.trim(), kind: 'metric', status: backed ? 'SUPPORTED' : userAuthored.includes(m.trim()) ? 'USER_AUTHORED' : 'UNSUPPORTED', evidence: backed ? 'Found in confirmed achievements' : undefined });
    }
    if (/Babbage & Co/.test(s.text)) claims.push({ sectionId: s.id, text: 'Babbage & Co', kind: 'employer', status: 'SUPPORTED', evidence: 'Employer in career profile' });
  }
  return claims;
}

export async function mockCareerTools(page: Page, state: ToolsState = freshTools()): Promise<ToolsState> {
  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace('/api/v1', '');
    if (!MINE.test(path)) return route.fallback();
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    let body: any; try { body = req.postDataJSON(); } catch { body = undefined; }
    const query = Object.fromEntries(url.searchParams.entries());
    state.calls.push({ method, path, query, body });
    const json = (status: number, data?: unknown) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: data === undefined ? '' : JSON.stringify(data) });
    const file = (type: string, name: string, content: string) => route.fulfill({ status: 200, headers: { ...CORS, 'content-type': type, 'content-disposition': `attachment; filename="${name}"` }, body: content });
    const id = () => `00000000-0000-4000-8000-${String(++state.seq).padStart(12, '0')}`;
    if (state.failNext && state.failNext.path.test(path)) { const f = state.failNext; state.failNext = null; return json(f.status, { message: f.message ?? 'Injected failure' }); }

    // ---------------- cover letters ----------------
    if (path === '/cover-letters/templates') return json(200, TEMPLATES);
    if (path === '/cover-letters/drafts' && method === 'POST') {
      if (body.kind === 'referral' && !body.referrerName) return json(400, { message: 'A referral letter needs the referrer name you supply.' });
      const lid = id();
      const sections = [
        { id: 'opening', heading: 'Opening', text: `Dear Hiring Manager,\n\nI am writing to apply for ${body.jobTitle || 'the role'}${body.company ? ' at ' + body.company : ''}.`, origin: 'GENERATED' },
        { id: 'achievements', heading: 'Selected achievements', text: `- ${PROFILE_BULLET}`, origin: 'GENERATED' },
        { id: 'closing', heading: 'Closing', text: 'Thank you for your time.\n\nSincerely,\nAda Lovelace', origin: 'GENERATED' },
      ];
      const letter = { id: lid, title: body.title, company: body.company ?? null, jobTitle: body.jobTitle ?? null, kind: body.kind ?? 'standard', tone: body.tone ?? 'professional', length: body.length ?? 'medium', currentVersion: 1, updatedAt: new Date().toISOString() };
      state.letters.unshift(letter);
      state.versions[lid] = [{ id: `v-${lid}-1`, versionNumber: 1, changeSummary: 'Initial draft', createdAt: new Date().toISOString(), sections, claims: fakeClaims(sections) }];
      return json(201, { ...letter, version: state.versions[lid][0], unsupportedClaims: 0 });
    }
    if (path === '/cover-letters' && method === 'GET') return json(200, state.letters);
    const lm = /^\/cover-letters\/([^/]+)(?:\/(versions|claims\/validate|export\/(pdf|html|txt)))?$/.exec(path);
    if (lm) {
      const l = state.letters.find((x) => x.id === lm[1]);
      if (!l) return json(404, { message: 'Cover letter not found' });
      const vs = state.versions[l.id];
      if (!lm[2]) {
        if (method === 'GET') { const cur = vs.find((v) => v.versionNumber === l.currentVersion); return json(200, { ...l, version: cur, versions: [...vs].reverse().map(({ sections, claims, ...v }) => v) }); }
        if (method === 'DELETE') { state.letters = state.letters.filter((x) => x.id !== l.id); return json(204); }
      }
      if (lm[2] === 'versions' && method === 'POST') {
        const claims = fakeClaims(body.sections, body.userAuthored);
        const v = { id: `v-${l.id}-${vs.length + 1}`, versionNumber: vs.length + 1, changeSummary: body.changeSummary ?? null, createdAt: new Date().toISOString(), sections: body.sections, claims };
        vs.push(v); l.currentVersion = v.versionNumber;
        return json(201, { ...v, unsupportedClaims: claims.filter((c) => c.status === 'UNSUPPORTED').length });
      }
      if (lm[2] === 'claims/validate') { const claims = fakeClaims(body.sections, body.userAuthored); return json(200, { claims, unsupportedClaims: claims.filter((c) => c.status === 'UNSUPPORTED').length }); }
      if (lm[3]) { state.exports.push(lm[3]); return file(lm[3] === 'pdf' ? 'application/pdf' : 'text/plain', `letter.${lm[3]}`, lm[3] === 'pdf' ? '%PDF-1.4 mock' : 'mock'); }
    }
    const bm = /^\/applications\/([^/]+)\/cover-letter-bindings$/.exec(path);
    if (bm && method === 'POST') {
      if (body.confirm !== true) return json(400, { message: 'Explicit confirmation is required' });
      if (state.bindings.some((b) => b.applicationRef === bm[1] && b.coverLetterId === body.coverLetterId)) return json(409, { message: 'already bound' });
      const b = { id: id(), applicationRef: bm[1], coverLetterId: body.coverLetterId, versionNumber: body.versionNumber, createdAt: new Date().toISOString() };
      state.bindings.push(b); return json(201, b);
    }

    // ---------------- contacts / CRM ----------------
    if (path === '/contacts/import/preview' || path === '/contacts/import/commit') {
      if (body.consent !== true) return json(400, { message: 'Confirm that you may keep these contacts before importing.' });
      const lines = String(body.csv).split(/\r?\n/).filter(Boolean); const header = lines.shift()!.split(',').map((h) => h.trim().toLowerCase());
      const seen = new Set(state.contacts.map((c) => c.name.toLowerCase()));
      const rows = lines.map((l, i) => {
        const cells = l.split(','); const get = (k: string) => (cells[header.indexOf(k)] ?? '').trim();
        const name = get('name'); if (!name) return { line: i + 1, status: 'INVALID', reason: 'Missing name' };
        if (seen.has(name.toLowerCase())) return { line: i + 1, status: 'DUPLICATE', reason: 'Matches an existing or earlier contact', contact: { name } };
        seen.add(name.toLowerCase()); return { line: i + 1, status: 'NEW', contact: { name, organization: get('company') } };
      });
      const n = (s: string) => rows.filter((r) => r.status === s).length;
      const summary = { new: n('NEW'), duplicate: n('DUPLICATE'), invalid: n('INVALID') };
      if (path.endsWith('commit')) {
        for (const r of rows) if (r.status === 'NEW') state.contacts.unshift({ id: id(), name: (r as any).contact.name, organization: (r as any).contact.organization || null, role: null, relationship: 'OTHER', channels: [], tags: [], notes: null, links: [] });
        return json(201, { created: summary.new, skippedDuplicates: summary.duplicate, invalid: summary.invalid, truncated: false });
      }
      return json(201, { rows, truncated: false, unmappedColumns: [], summary });
    }
    if (path === '/contacts/export') return file('application/json', 'contacts-export.json', JSON.stringify({ contacts: state.contacts }));
    if (path === '/contacts' && method === 'GET') {
      const q = (query['q'] ?? '').toLowerCase();
      return json(200, state.contacts.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.organization ?? '').toLowerCase().includes(q)).map(({ notes, ...c }) => c));
    }
    if (path === '/contacts' && method === 'POST') {
      const dup = state.contacts.find((c) => c.name.toLowerCase() === body.name.trim().toLowerCase() && (c.organization ?? '') === (body.organization ?? ''));
      if (dup) return json(409, { message: 'A matching contact already exists', existingId: dup.id });
      const c = { id: id(), name: body.name, organization: body.organization ?? null, role: body.role ?? null, relationship: body.relationship ?? 'OTHER', channels: body.channels ?? [], tags: body.tags ?? [], notes: body.notes ?? null, links: [] as any[] };
      state.contacts.unshift(c); const { links, notes, ...out } = c; return json(201, out);
    }
    const cm = /^\/contacts\/([^/]+)(?:\/links(?:\/([^/]+))?)?$/.exec(path);
    if (cm) {
      const c = state.contacts.find((x) => x.id === cm[1]);
      if (!c) return json(404, { message: 'Contact not found' });
      if (path.includes('/links')) {
        if (method === 'POST') {
          if (c.links.some((l: any) => l.kind === body.kind && l.externalRef === body.externalRef)) return json(409, { message: 'Link already exists' });
          const l = { id: id(), kind: body.kind, externalRef: body.externalRef, label: body.label ?? null }; c.links.push(l); return json(201, l);
        }
        if (method === 'DELETE') { c.links = c.links.filter((l: any) => l.id !== cm[2]); return json(204); }
      } else {
        if (method === 'GET') return json(200, { ...c, activities: state.activities.filter((a) => a.contactId === c.id).sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)), tasks: state.tasks.filter((t) => t.contactId === c.id) });
        if (method === 'PATCH') { Object.assign(c, Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined))); return json(200, c); }
        if (method === 'DELETE') { state.contacts = state.contacts.filter((x) => x.id !== c.id); state.activities = state.activities.filter((a) => a.contactId !== c.id); state.tasks = state.tasks.filter((t) => t.contactId !== c.id); return json(204); }
      }
    }
    if (path === '/job-activities' && method === 'POST') { const a = { id: id(), contactId: body.contactId ?? null, type: body.type, occurredAt: body.occurredAt, summary: body.summary }; state.activities.push(a); return json(201, a); }
    const am = /^\/job-activities\/([^/]+)$/.exec(path);
    if (am && method === 'DELETE') { state.activities = state.activities.filter((a) => a.id !== am[1]); return json(204); }
    if (path === '/follow-up-tasks' && method === 'GET') return json(200, state.tasks.filter((t) => !query['status'] || t.status === query['status']));
    if (path === '/follow-up-tasks' && method === 'POST') { const t = { id: id(), contactId: body.contactId ?? null, title: body.title, dueAt: body.dueAt, status: 'OPEN' }; state.tasks.push(t); return json(201, t); }
    const tm = /^\/follow-up-tasks\/([^/]+)$/.exec(path);
    if (tm && method === 'PATCH') { const t = state.tasks.find((x) => x.id === tm[1]); if (!t) return json(404, { message: 'Task not found' }); Object.assign(t, body); return json(200, t); }

    // ---------------- analytics ----------------
    if (path === '/analytics/job-search/ingest/vault' && method === 'POST') {
      if (body.confirm !== true) return json(400, { message: 'Confirm that you want to build events from this source' });
      const fresh = { type: 'APPLIED', occurredAt: '2026-03-01T00:00:00.000Z', applicationRef: 'vault:e1', source: 'MANUAL', idempotencyKey: 'vault:e1:APPLIED' };
      const dup = state.events.some((e: any) => e.idempotencyKey === fresh.idempotencyKey);
      if (!dup) state.events.push(fresh);
      return json(200, { applications: 1, created: dup ? 0 : 1, duplicates: dup ? 1 : 0 });
    }
    if (path === '/analytics/job-search/events' && method === 'POST') { state.events.push(...body.events); return json(201, { created: body.events.length, duplicates: 0 }); }
    if (path === '/analytics/events' && method === 'DELETE') { const n = state.events.length; state.events = []; return json(200, { deleted: n }); }
    if (path === '/analytics/exports') return file('application/json', 'job-search-analytics.json', JSON.stringify({ events: state.events }));
    if (path.startsWith('/analytics/job-search/')) return json(200, analytics(path.split('/').pop()!, state, query));
    return json(404, { message: `No career-tool mock for ${method} ${path}` });
  });
  return state;
}

/** Compact stand-in for the server aggregation; the real maths is unit-tested in apps/api. */
function analytics(kind: string, state: ToolsState, query: Record<string, string>) {
  const events = state.events.filter((e) => !query['roleFamily'] || (e.roleFamily ?? '').toLowerCase() === query['roleFamily'].toLowerCase());
  const refs = (t: string | string[]) => new Set(events.filter((e) => [t].flat().includes(e.type)).map((e) => e.applicationRef));
  const saved = refs('SAVED'), applied = refs('APPLIED'), responded = refs(['RESPONSE', 'INTERVIEW', 'OFFER', 'REJECTED']), interview = refs('INTERVIEW'), offer = refs('OFFER');
  const both = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x)).length;
  const window = { from: query['from'] ?? null, to: query['to'] ?? null };
  if (kind === 'overview') {
    return {
      window, totals: { saved: saved.size, applied: applied.size, responses: responded.size, interviews: interview.size, offers: offer.size, rejections: refs('REJECTED').size },
      followUps: { open: state.tasks.filter((t) => t.status === 'OPEN').length, overdue: 0, done: 0 },
      timeToResponseDays: both(applied, responded) ? { median: 2.5, sampleSize: both(applied, responded), note: 'Only applications with both an Applied and a response event.' } : { median: null, sampleSize: 0, note: 'No applications have both an Applied and a response event yet.' },
      coverage: { manualEvents: events.length, hostEvents: 0, totalEvents: events.length, incomplete: true, note: 'Based only on activity you recorded. No authorised job portal is connected.' },
      freshness: { lastEventAt: events.length ? events[events.length - 1].occurredAt : null },
    };
  }
  if (kind === 'funnel') {
    const rate = (n: number, d: number) => ({ numerator: n, denominator: d, rate: d ? Math.round((n / d) * 1000) / 1000 : null, sampleSize: d });
    return {
      window, quality: { missingAppliedEvent: 0, notes: ['Descriptive only. Rates show what happened in your own data, not what caused it.'] },
      stages: [
        { stage: 'SAVED', count: new Set([...saved, ...applied]).size, label: 'Applied / saved or applied', ...rate(applied.size, new Set([...saved, ...applied]).size) },
        { stage: 'APPLIED', count: applied.size, label: 'Responded / applied', ...rate(both(applied, responded), applied.size) },
        { stage: 'RESPONDED', count: both(applied, responded), label: 'Interview / responded', ...rate(both(responded, interview), both(applied, responded)) },
        { stage: 'INTERVIEW', count: both(applied, interview), label: 'Offer / interview', ...rate(both(interview, offer), both(applied, interview)) },
        { stage: 'OFFER', count: both(applied, offer), label: 'Offers', numerator: offer.size, denominator: offer.size, rate: null, sampleSize: offer.size },
      ],
    };
  }
  if (kind === 'resume-versions') {
    const byVer = new Map<string, Set<string>>();
    for (const e of events.filter((x) => x.type === 'APPLIED' && x.resumeVersionId)) byVer.set(e.resumeVersionId, (byVer.get(e.resumeVersionId) ?? new Set()).add(e.applicationRef));
    return {
      minCohort: 5, caveat: 'Differences between resume versions are correlations in your own data. They do not show that one version caused a better outcome.',
      versions: [...byVer.entries()].map(([v, s]) => ({ resumeVersionId: v, applications: s.size, sufficientSample: false, responseRate: null, interviewRate: null, note: 'Fewer than 5 applications; rates are hidden to avoid misleading conclusions.' })),
    };
  }
  const weeks = new Map<string, number>();
  for (const e of events) weeks.set(e.occurredAt.slice(0, 10), (weeks.get(e.occurredAt.slice(0, 10)) ?? 0) + 1);
  return { bucket: 'week', weeks: [...weeks.entries()].map(([weekStart, total]) => ({ weekStart, counts: { EVENTS: total }, total })) };
}
