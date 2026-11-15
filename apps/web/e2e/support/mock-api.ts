import { Page, Route } from '@playwright/test';
import { handleM2628 } from './mock-m26-28';
import { handleM43 } from './mock-m43';
import { handleProfileTools } from './mock-profile-tools';
import { handleInsights } from './mock-insights';
import { handleAts } from './mock-ats';
import { handleReadinessTools } from './mock-readiness-tools';
import { handlePlatformTools } from './mock-platform-tools';
import { handleExpertReview } from './mock-expert-review';
import { handleUsage } from './mock-usage';

const API = 'http://localhost:3100/api/v1';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
};

export const TEMPLATES = [
  { id: 'ats-classic', slug: 'ats-classic', name: 'Classic Chronological', category: 'ATS classic', description: 'Conventional single-column layout.', tags: ['ats', 'classic'], version: 1, atsProfile: 'ATS_FIRST', layout: 'single-column', pageSizes: ['A4', 'LETTER'],
    theme: { fontFamily: 'Times-Roman', baseSizePt: 10.5, accent: '#000000', headingTransform: 'upper', headerAlign: 'center', sectionRule: true } },
  { id: 'tech-compact', slug: 'tech-compact', name: 'Software Engineer Compact', category: 'Technology', description: 'Skills-forward layout for engineers.', tags: ['technology', 'compact'], version: 1, atsProfile: 'ATS_FIRST', layout: 'single-column', pageSizes: ['A4', 'LETTER'],
    theme: { fontFamily: 'Helvetica', baseSizePt: 10, accent: '#1f3a5f', headingTransform: 'upper', headerAlign: 'left', sectionRule: true } },
  { id: 'graduate-clean', slug: 'graduate-clean', name: 'Graduate Clean', category: 'Graduate / early career', description: 'Education and projects first.', tags: ['graduate', 'entry'], version: 1, atsProfile: 'BALANCED', layout: 'single-column', pageSizes: ['A4', 'LETTER'],
    theme: { fontFamily: 'Helvetica', baseSizePt: 10.5, accent: '#2f6f4f', headingTransform: 'none', headerAlign: 'left', sectionRule: false } },
];

const SECTION_ORDER = ['summary', 'experience', 'skills', 'education', 'projects', 'certifications', 'languages'];

export interface MockState {
  profile: any | null;
  resumes: any[];
  versions: Record<string, any[]>;
  failNext: { path: RegExp; status: number } | null;
  usageForbidden?: boolean;
  prefs?: { theme: string | null; locale: string | null };
  exportCalls: string[];
  requests: Array<{ method: string; path: string; body?: any; auth?: string }>;
}

export function sampleProfile(over: Record<string, unknown> = {}) {
  return {
    id: 'p1', fullName: 'Ada Lovelace', email: 'ada@example.com', phone: '+44 20 7946 0000', location: 'London', headline: 'Analytical Engine Programmer',
    summary: 'Pioneer of computing.', links: [{ label: 'Site', url: 'https://ada.dev' }],
    experiences: [{ id: 'e1', employerName: 'Babbage & Co', jobTitle: 'Programmer', startDate: '2020-01', endDate: null, isCurrent: true, location: 'London',
      bullets: [{ id: 'b1', kind: 'ACHIEVEMENT', content: 'Wrote the first published algorithm.', displayOrder: 0 }] }],
    skills: [{ id: 's1', name: 'Mathematics', category: 'Core' }, { id: 's2', name: 'Algorithms', category: 'Core' }],
    educations: [{ id: 'ed1', institution: 'Home tutored', degree: 'Mathematics' }], projects: [], certifications: [], languages: [],
    ...over,
  };
}

export function sampleResume(over: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111', name: 'Engineer CV', targetRole: 'Backend Engineer', templateId: 'ats-classic', templateVersion: 1,
    status: 'DRAFT', sections: SECTION_ORDER.map((type) => ({ type, visible: true })), overrides: {},
    createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-02T10:00:00.000Z', ...over,
  };
}

export function renderModelFor(state: MockState, resume: any) {
  const p = state.profile ?? sampleProfile();
  const tpl = TEMPLATES.find((t) => t.id === resume.templateId)!;
  const sections: any[] = [];
  for (const s of resume.sections) {
    if (!s.visible) continue;
    if (s.type === 'summary' && p.summary) sections.push({ type: 'summary', title: 'Summary', text: p.summary });
    if (s.type === 'experience' && p.experiences?.length) sections.push({ type: 'experience', title: 'Experience',
      items: p.experiences.map((e: any) => ({ title: e.jobTitle, subtitle: e.employerName, meta: `${e.startDate} - ${e.isCurrent ? 'Present' : e.endDate}`, bullets: (e.bullets ?? []).map((b: any) => b.content) })) });
    if (s.type === 'skills' && p.skills?.length) sections.push({ type: 'skills', title: 'Skills', items: [{ title: 'Core', tags: p.skills.map((k: any) => k.name) }] });
    if (s.type === 'education' && p.educations?.length) sections.push({ type: 'education', title: 'Education', items: p.educations.map((e: any) => ({ title: e.degree, subtitle: e.institution })) });
  }
  const model: any = {
    schemaVersion: 1, template: { id: tpl.id, version: 1 }, layout: (tpl as any).layout ?? 'single-column', sideSections: [], page: { size: resume.overrides?.pageSize ?? 'A4', marginPt: 40 },
    theme: { ...tpl.theme, accent: resume.overrides?.accent ?? tpl.theme.accent, baseSizePt: resume.overrides?.baseSizePt ?? tpl.theme.baseSizePt },
    header: { name: p.fullName, headline: p.headline, contacts: [p.email, p.phone, p.location].filter(Boolean), links: p.links ?? [] }, sections,
  };
  // Mirrors the API's applyDoc: a saved visual-editor document replaces header text + sections (doc 16).
  const doc = resume.overrides?.doc;
  if (doc) {
    model.header = { ...model.header, name: doc.header.name, headline: doc.header.headline || undefined, contacts: doc.header.contacts, photo: doc.header.photo };
    model.sections = doc.sections.filter((x: any) => !x.hidden);
    model.styles = doc.styles;
  }
  return model;
}

export function freshState(over: Partial<MockState> = {}): MockState {
  return { profile: null, resumes: [], versions: {}, failNext: null, exportCalls: [], requests: [], ...over };
}

/** Install an in-memory fake of the XCron CV API on the page. Returns the mutable state for assertions. */
export async function mockApi(page: Page, state: MockState = freshState()): Promise<MockState> {
  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    let body: any;
    try { body = req.postDataJSON(); } catch { body = undefined; }
    state.requests.push({ method, path, body, auth: req.headers()['authorization'] });

    const json = (status: number, data?: unknown) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: data === undefined ? '' : JSON.stringify(data) });

    if (state.failNext && state.failNext.path.test(path)) { const f = state.failNext; state.failNext = null; return json(f.status, { message: 'Injected failure' }); }

    if (path === '/templates' && method === 'GET') return json(200, TEMPLATES);
    // Dummy-data render model for gallery cards / template preview (never the signed-in user's profile).
    const sm = /^\/templates\/([^/]+)\/sample$/.exec(path);
    if (sm && method === 'GET') {
      const known = TEMPLATES.find((x) => x.id === sm[1]) ?? TEMPLATES[0];
      const model: any = renderModelFor({ ...state, profile: sampleProfile({ fullName: 'Alex Morgan' }) }, sampleResume({ templateId: known.id }));
      model.template.id = sm[1];
      return json(200, model);
    }
    const tm = /^\/templates\/([^/]+)$/.exec(path);
    if (tm && method === 'GET') { const t = TEMPLATES.find((x) => x.id === tm[1]); return t ? json(200, t) : json(404, { message: 'Template not found' }); }

    if (path === '/career-profile') {
      if (method === 'GET') return state.profile ? json(200, state.profile) : json(404, { message: 'Career profile not found' });
      if (method === 'PUT') { state.profile = { id: 'p1', ...body }; return json(200, state.profile); }
      if (method === 'DELETE') { state.profile = null; return json(204); }
    }

    if (path === '/resumes') {
      if (method === 'GET') return json(200, state.resumes.map(({ sections, overrides, ...s }) => s));
      if (method === 'POST') {
        if (!state.profile) return json(409, { message: 'Create a career profile before creating a resume' });
        const r = sampleResume({ id: crypto.randomUUID?.() ?? `00000000-0000-4000-8000-${String(state.resumes.length + 1).padStart(12, '0')}`, name: body.name, targetRole: body.targetRole ?? null, templateId: body.templateId, updatedAt: new Date().toISOString() });
        state.resumes.unshift(r); return json(201, r);
      }
    }
    const rm = /^\/resumes\/([^/]+)(?:\/(versions|render-model|export\/(?:pdf|html|docx|xlsx)))?$/.exec(path);
    if (rm) {
      const r = state.resumes.find((x) => x.id === rm[1]);
      if (!r) return json(404, { message: 'Resume not found' });
      const sub = rm[2];
      if (!sub) {
        if (method === 'GET') return json(200, r);
        if (method === 'PATCH') { Object.assign(r, Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)), { updatedAt: new Date().toISOString() }); return json(200, r); }
        if (method === 'DELETE') { state.resumes = state.resumes.filter((x) => x.id !== r.id); return json(204); }
      }
      if (sub === 'render-model') return json(200, renderModelFor(state, r));
      if (sub === 'versions') {
        const list = (state.versions[r.id] ??= []);
        if (method === 'GET') return json(200, [...list].reverse());
        if (method === 'POST') { const v = { id: `v${list.length + 1}`, versionNumber: list.length + 1, changeSummary: body?.changeSummary ?? null, createdAt: new Date().toISOString() }; list.push(v); return json(201, v); }
      }
      if (sub?.startsWith('export/') && method === 'POST') {
        const fmt = sub.split('/')[1]; state.exportCalls.push(fmt);
        const isPdf = fmt === 'pdf';
        if (fmt === 'docx' || fmt === 'xlsx') return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': fmt === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'access-control-expose-headers': 'content-disposition', 'content-disposition': `attachment; filename="x.${fmt}"` }, body: 'PK mock' });
        return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': isPdf ? 'application/pdf' : 'text/html; charset=utf-8', 'access-control-expose-headers': 'content-disposition', 'content-disposition': `attachment; filename="x.${fmt}"` }, body: isPdf ? '%PDF-1.4 mock' : '<html><body>mock</body></html>' });
      }
    }
    // module 06: transient import (multipart). The mock never stores the upload.
    if (path === '/resume-imports/parse' && method === 'POST') {
      state.requests.push({ method, path, auth: req.headers()['authorization'] });
      const raw = req.postData() ?? '';
      if (raw.includes('MOCK-UNSUPPORTED')) return json(415, { message: 'Only PDF and DOCX files can be imported.' });
      if (raw.includes('MOCK-BAD')) return json(400, { message: 'This is not a valid DOCX file.' });
      return json(201, { kind: 'docx', pages: null, suggestion: importSuggestion() });
    }
    // module 41 (portfolio), module 47 (autofill), module 49 (evidence wallet): logic lives in mock-profile-tools.ts
    {
      (state as any).__headers = req.headers();
      const r = handleProfileTools(state, method, path, body);
      if (r) return json(r.status, r.data);
    }
    // module 23/29 (resume match), 20/31 (quality review), 22 (recruiter view): logic lives in mock-insights.ts
    {
      const r = handleInsights(state, method, path, body, url.searchParams, (resume) => renderModelFor(state, resume));
      if (r) return json(r.status, r.data);
    }
    // module 07 (ATS engine): logic lives in mock-ats.ts; postings come from the insights mock
    {
      const jdOf = (id: string) => { const r = handleInsights(state, 'GET', `/job-descriptions/${id}`, {}, url.searchParams, () => null); return r && r.status === 200 ? (r.data as any) : null; };
      const r = handleAts(state, method, path, body, jdOf, (resume) => renderModelFor(state, resume));
      if (r) return json(r.status, r.data);
    }
    // docs 06/38, 37, 44, 45, 32, 50, 51, 52 (platform modules): logic lives in mock-platform-tools.ts
    {
      const r = handlePlatformTools(state, method, path, body, url.searchParams);
      if (r) return json(r.status, r.data);
    }
    // docs 33, 34, 35, 36 (vault, readiness, interview prep, feedback sharing): logic lives in mock-readiness-tools.ts
    {
      const r = handleReadinessTools(state, method, path, body, url.searchParams);
      if (r) return json(r.status, r.data);
    }
    // module 07: parsing test
    const pt = /^\/resumes\/([^/]+)\/parsing-tests$/.exec(path);
    if (pt && method === 'POST') {
      state.requests.push({ method, path, body, auth: req.headers()['authorization'] });
      if (!state.resumes.some((r) => r.id === pt[1])) return json(404, { message: 'Resume not found' });
      const rep = parsingReport({ source: 'GENERATED', format: body?.format ?? 'pdf' });
      const row = { id: crypto.randomUUID?.() ?? '33333333-3333-4333-8333-333333333333', createdAt: new Date().toISOString(), source: 'GENERATED', format: rep.format, score: rep.score, suiteVersion: rep.suiteVersion, errors: 0, warnings: rep.findings.length, resumeId: pt[1], report: rep };
      (state as any).parsingRows = [row, ...((state as any).parsingRows ?? [])];
      return json(201, { id: row.id, createdAt: row.createdAt, resumeId: pt[1], report: rep, preview: [{ adapter: 'pdf-geometric-v1', lines: ['Ada Lovelace', 'EXPERIENCE', 'Programmer'] }] });
    }
    if (pt && method === 'GET') return json(200, ((state as any).parsingRows ?? []).filter((r: any) => r.resumeId === pt[1]).map(({ report, resumeId, ...m }: any) => m));
    if (path === '/parsing-tests/upload' && method === 'POST') {
      state.requests.push({ method, path, auth: req.headers()['authorization'] });
      const raw = req.postData() ?? '';
      if (raw.includes('MOCK-UNSUPPORTED')) return json(415, { message: 'Only PDF and DOCX files can be imported.' });
      return json(201, { id: '44444444-4444-4444-8444-444444444444', createdAt: new Date().toISOString(), resumeId: null, report: parsingReport({ source: 'UPLOAD', format: 'docx' }), preview: [{ adapter: 'docx-xml-v1', lines: ['Jane Roe', 'SECRET-LINE'] }] });
    }
    const pg = /^\/parsing-tests\/([^/]+)$/.exec(path);
    if (pg) {
      const rows: any[] = (state as any).parsingRows ?? []; const row = rows.find((r) => r.id === pg[1]);
      if (method === 'GET') return row ? json(200, { id: row.id, createdAt: row.createdAt, resumeId: row.resumeId, report: row.report }) : json(404, { message: 'Report not found' });
      if (method === 'DELETE') { (state as any).parsingRows = rows.filter((r) => r.id !== pg[1]); return json(204); }
    }
    // doc 50 (expert review): logic lives in mock-expert-review.ts
    {
      const r = handleExpertReview(state, method, path, body);
      if (r) return json(r.status, r.data);
    }
    // modules 26-28 handlers live in e2e/support/mock-m26-28.ts
    { const r = handleM2628(state, method, path, body, url.searchParams); if (r) return json(r.status, r.data); }
    // module 43 (external profile import): logic lives in mock-m43.ts (multipart upload is read raw, never stored)
    { const r = handleM43(state, method, path, body, req.postData() ?? ''); if (r) return json(r.status, r.data); }
    { const r = handleUsage(state, method, path); if (r) return json(r.status, r.data); }
    if (path === '/me/preferences') {
      if (method === 'GET') return json(200, state.prefs ?? { theme: null, locale: null });
      if (method === 'PUT') { state.prefs = { ...(state.prefs ?? { theme: null, locale: null }), ...body }; return json(200, state.prefs); }
    }
    return json(404, { message: `No mock for ${method} ${path}` });
  });
  return state;
}

/** Unsigned JWT-shaped token. The web app only decodes (never verifies) tokens; the API is the verifier. */
export function fakeToken(sub = 'e2e-user', ttlSec = 3600): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub, tenant_id: 'e2e', exp: Math.floor(Date.now() / 1000) + ttlSec })}.sig`;
}

export async function signIn(page: Page, sub = 'e2e-user', opts: { tour?: boolean } = {}) {
  const token = fakeToken(sub);
  // The first-run guided tour would cover the page in every other spec; mark it seen unless a spec opts in.
  if (!opts.tour) await page.addInitScript((k) => { try { localStorage.setItem(k, '1'); } catch { /* ignore */ } }, `xcroncv.tour.done.${sub}`);
  // Seed once per tab: addInitScript re-runs on every navigation, which would undo a sign-out.
  await page.addInitScript((t) => { try { if (!sessionStorage.getItem('e2e.seeded')) { sessionStorage.setItem('e2e.seeded', '1'); sessionStorage.setItem('xcroncv.token', t); } } catch { /* ignore */ } }, token);
}

// module 06: suggestion returned by the mocked importer
export function importSuggestion(over: Record<string, unknown> = {}) {
  return {
    fullName: 'Grace Hopper', email: 'grace@example.com', phone: '+1 555 010 2030', location: 'New York, USA', headline: 'Compiler Pioneer',
    summary: 'Invented the first compiler.', links: [{ label: 'GitHub', url: 'https://github.com/grace' }],
    experiences: [
      { employerName: 'US Navy', jobTitle: 'Rear Admiral', startDate: '2010-03', endDate: '2015-06', isCurrent: false, bullets: [{ content: 'Led language standardisation.' }], confidence: 'high' },
      { employerName: 'Remington Rand', jobTitle: 'Mathematician', startDate: '2016-01', isCurrent: true, bullets: [], confidence: 'low' },
    ],
    skills: [{ name: 'COBOL', category: 'Languages' }, { name: 'Mathematics' }],
    educations: [{ institution: 'Yale University', degree: 'PhD Mathematics', startDate: '1930-09', endDate: '1934-06', confidence: 'medium' }],
    projects: [], certifications: [{ name: 'Naval Reserve Commission', confidence: 'medium' }], languages: [{ name: 'English', proficiency: 'native' }],
    sectionsFound: ['experience', 'skills', 'education'], warnings: ['Some dates only had a year; they were set to January. Please check them.'],
    ...over,
  };
}

// module 07: report returned by the mocked parsing test
export function parsingReport(o: { source: 'GENERATED' | 'UPLOAD'; format: string }) {
  const gen = o.source === 'GENERATED';
  const layout = { columns: 1, tables: 0, textBoxes: 0, images: 0, headerFooterText: false, headerFooterHasContact: false, blankPages: 0, imageOnlyPages: 0 };
  const fields = { name: true, email: true, phone: false, experienceEntries: 2, educationEntries: 1, skills: 5 };
  return {
    suiteVersion: 'parsing-suite-1', scoreVersion: 'parsing-score-1', source: o.source, format: o.format, generatedAt: new Date().toISOString(), score: gen ? 92 : null,
    scoreNote: gen ? 'Parsing Test Score compares what these test parsers extracted with the resume you generated. It is separate from the quality and job match scores and does not predict how any employer system will read the file.' : 'No score is shown: there is no known source to compare against, so an accuracy percentage would be invented. Only extraction diagnostics are reported.',
    indicators: { textExtracted: 'ok', fieldsDetected: 'warning', readingOrder: 'ok', layout: 'warning' },
    adapters: [{ id: gen ? 'pdf-geometric-v1' : 'docx-xml-v1', name: gen ? 'PDF layout-aware text extractor' : 'DOCX body-text extractor', version: '1.0', capabilities: ['Selectable text', 'No OCR'], lineCount: 40, wordCount: 210, sectionsFound: ['experience'], fields, layout, score: gen ? 92 : null, breakdown: gen ? { textCoverage: { score: 100, weight: 0.25 }, dates: { score: 80, weight: 0.1 } } : null }],
    findings: [
      { id: 'PT-FLD-003', category: 'fields', severity: 'warning', adapter: 'x', message: 'This parser did not detect your phone number.', ...(gen ? { expected: '+44 20 7946 0000' } : {}) },
      { id: 'PT-LAY-004', category: 'layout', severity: 'warning', adapter: 'x', message: 'Contact details sit in the page header or footer, which many parsers ignore.', suggestion: 'Put your name and contact details in the main body.' },
    ],
    limitations: ['These are independent test parsers built for this product. They do not emulate any employer ATS or its ranking.'],
  };
}
