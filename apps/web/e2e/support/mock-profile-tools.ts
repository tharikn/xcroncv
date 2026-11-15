/**
 * In-memory fakes for modules 41 (portfolio), 47 (autofill) and 49 (evidence wallet).
 * They mirror the API rules that the UI depends on (allowlist snapshots, consent gates, status semantics) and keep
 * per-test state in a WeakMap keyed by the shared MockState, so nothing leaks between tests.
 */
export interface Reply { status: number; data?: unknown }
const ok = (data: unknown, status = 200): Reply => ({ status, data });
const err = (status: number, message: string): Reply => ({ status, data: { message } });

interface Store {
  seq: number;
  portfolios: any[]; sessions: any[]; credentials: any[]; grants: any[];
  /** test hook: pretend this many days have passed for expiry checks */
  failPublicWith?: number;
}
const stores = new WeakMap<object, Store>();
export function store(state: object): Store {
  let s = stores.get(state);
  if (!s) { s = { seq: 0, portfolios: [], sessions: [], credentials: [], grants: [] }; stores.set(state, s); }
  return s;
}
const uid = (st: Store, p: string) => `${p}${String(++st.seq).padStart(4, '0')}-0000-4000-8000-000000000000`.replace(/^(.{8})-/, '$1-');
const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------- module 41: portfolio
const MASK_OK = ['email', 'phone'];
function snapshotOf(profile: any, sel: any) {
  const header: Record<string, unknown> = {};
  const sections: Record<string, any[]> = {};
  for (const f of ['fullName', 'headline', 'summary', 'location', 'email', 'phone']) {
    const v = sel.header?.[f] ?? 'hidden'; const val = profile?.[f];
    if (!val || v === 'hidden') continue;
    if (v === 'masked') { if (f === 'email') header[f] = `${String(val).slice(0, 1)}***@${String(val).split('@')[1]}`; else if (f === 'phone') header[f] = `${'*'.repeat(8)}${String(val).slice(-2)}`; continue; }
    header[f] = val;
  }
  if (sel.header?.links === 'public') header['links'] = (profile?.links ?? []).filter((l: any) => /^https?:\/\//i.test(l.url));
  const map: Record<string, [string, (r: any) => any]> = {
    experience: ['experiences', (e) => ({ employerName: e.employerName, jobTitle: e.jobTitle, startDate: e.startDate, endDate: e.endDate ?? undefined, isCurrent: !!e.isCurrent, bullets: sel.experience?.includeBullets ? (e.bullets ?? []).map((b: any) => b.content) : [] })],
    projects: ['projects', (p) => ({ name: p.name, url: p.url, description: p.description, technologies: p.technologies ?? [] })],
    skills: ['skills', (s) => ({ name: s.name, category: s.category })],
    education: ['educations', (e) => ({ institution: e.institution, degree: e.degree })],
    certifications: ['certifications', (c) => ({ name: c.name, issuer: c.issuer })],
    languages: ['languages', (l) => ({ name: l.name, proficiency: l.proficiency })],
  };
  for (const [k, [src, fn]] of Object.entries(map)) {
    const ids = new Set(sel[k]?.ids ?? []);
    const rows = (profile?.[src] ?? []).filter((r: any) => ids.has(r.id)).map(fn);
    if (rows.length) sections[k] = rows;
  }
  return { schemaVersion: 1, header, sections };
}
const count = (s: any) => Object.keys(s.header).length + Object.values(s.sections).reduce((n: number, a: any) => n + a.length, 0);
const summaryOf = (p: any) => { const { versions, token, password, ...rest } = p; return { ...rest, hasActiveLink: !!token, passwordProtected: !!password }; };

function portfolio(state: any, st: Store, method: string, path: string, body: any): Reply | null {
  if (path.startsWith('/public/portfolios/')) {
    if (st.failPublicWith) return err(st.failPublicWith, 'x');
    const token = decodeURIComponent(path.split('/')[3]);
    const p = st.portfolios.find((x) => x.token === token && x.status === 'PUBLISHED');
    if (!p || (p.expiresAt && new Date(p.expiresAt) <= new Date())) return err(404, 'Portfolio not found');
    const v = p.versions.find((x: any) => x.versionNumber === p.publishedVersion);
    if (p.password) {
      const given = (state.__headers ?? {})['x-portfolio-password'];
      if (!given) return { status: 401, data: { message: 'This portfolio is password protected.', passwordRequired: true } };
      if (given !== p.password) return { status: 401, data: { message: 'Incorrect password.', passwordRequired: true } };
    }
    return ok({ schemaVersion: 1, theme: v.theme, publishedAt: p.publishedAt, expiresAt: p.expiresAt, snapshot: v.snapshot });
  }
  if (path === '/portfolios') {
    if (method === 'GET') return ok(st.portfolios.map(summaryOf));
    if (method === 'POST') {
      if (!state.profile) return err(404, 'Career profile not found');
      for (const [f, v] of Object.entries(body.selection?.header ?? {})) if (v === 'masked' && !MASK_OK.includes(f)) return err(400, `"${f}" cannot be masked; make it public or hidden`);
      const p: any = { id: uid(st, 'a'), name: body.name, roleFamily: body.roleFamily ?? null, status: 'DRAFT', currentVersion: 1, publishedVersion: null, publishedAt: null, expiresAt: null, noIndex: true, updatedAt: nowIso(), token: null, views: 0, versions: [] };
      const snap = snapshotOf(state.profile, body.selection);
      p.versions.push({ id: uid(st, 'v'), versionNumber: 1, theme: body.theme ?? 'light', changeSummary: 'Initial snapshot', createdAt: nowIso(), selection: body.selection, snapshot: snap, disclosedCount: count(snap) });
      st.portfolios.unshift(p);
      return ok(summaryOf(p), 201);
    }
  }
  const m = /^\/portfolios\/([^/]+)(?:\/(versions|preview|publish|revoke|share-policy))?$/.exec(path);
  if (!m) return null;
  const p = st.portfolios.find((x) => x.id === m[1]);
  if (!p) return err(404, 'Portfolio not found');
  const sub = m[2];
  if (!sub) {
    if (method === 'GET') {
      const expired = !!p.expiresAt && new Date(p.expiresAt) <= new Date();
      return ok({ ...summaryOf(p), expired, views: p.views, versions: [...p.versions].reverse().map((v: any) => ({ ...v, snapshot: undefined, published: p.status === 'PUBLISHED' && p.publishedVersion === v.versionNumber })) });
    }
    if (method === 'DELETE') { st.portfolios = st.portfolios.filter((x) => x !== p); return ok(undefined, 204); }
  }
  if (sub === 'versions' && method === 'POST') {
    const snap = snapshotOf(state.profile, body.selection);
    const n = p.currentVersion + 1;
    p.versions.push({ id: uid(st, 'v'), versionNumber: n, theme: body.theme ?? 'light', changeSummary: body.changeSummary ?? null, createdAt: nowIso(), selection: body.selection, snapshot: snap, disclosedCount: count(snap) });
    p.currentVersion = n;
    return ok({ versionNumber: n, disclosedCount: count(snap) }, 201);
  }
  if (sub === 'preview' && method === 'POST') {
    if (body.selection) return ok({ theme: 'light', snapshot: snapshotOf(state.profile, body.selection), draft: true });
    const v = p.versions.find((x: any) => x.versionNumber === (body.versionNumber ?? p.currentVersion));
    return v ? ok({ theme: v.theme, snapshot: v.snapshot, draft: false }) : err(404, 'Version not found');
  }
  if (sub === 'publish' && method === 'POST') {
    if (body.confirm !== true) return err(400, 'Explicit confirmation is required to publish a portfolio');
    const v = p.versions.find((x: any) => x.versionNumber === body.versionNumber);
    if (!v) return err(404, 'Version not found');
    if (v.disclosedCount === 0) return err(400, 'Nothing is selected to publish. Choose at least one field.');
    if (body.expiresAt && new Date(body.expiresAt) <= new Date()) return err(400, 'Expiry must be a future date');
    p.token = `tok${String(++st.seq).padStart(4, '0')}${'x'.repeat(36)}`.slice(0, 43);
    Object.assign(p, { status: 'PUBLISHED', publishedVersion: v.versionNumber, publishedAt: nowIso(), expiresAt: body.expiresAt ?? null, noIndex: body.noIndex ?? true });
    return ok({ ...summaryOf(p), token: p.token, sharePath: `/p/${p.token}` });
  }
  if (sub === 'revoke' && method === 'POST') { Object.assign(p, { status: 'REVOKED', token: null, publishedVersion: null }); return ok(summaryOf(p)); }
  if (sub === 'share-policy' && method === 'PATCH') {
    if (body.expiresAt !== undefined) p.expiresAt = body.expiresAt;
    if (body.noIndex !== undefined) p.noIndex = body.noIndex;
    if (body.password !== undefined) p.password = body.password;
    return ok(summaryOf(p));
  }
  return null;
}

// ---------------------------------------------------------------- module 47: autofill
const ADAPTERS = [
  { id: 'manual-copy', name: 'Manual copy', version: 1, mode: 'COPY', hostPatterns: [], verified: true, description: 'Works on any site: review the values here and copy them yourself. Nothing touches the page.', selectors: {} },
  { id: 'html-autocomplete', name: 'Standard form fields', version: 1, mode: 'FILL', hostPatterns: [], verified: false, description: 'Experimental. Targets inputs that declare standard HTML autocomplete hints; visible fields only.', selectors: { email: 'input[autocomplete="email"]' } },
];
const FIELDS: Array<[string, string, string, boolean]> = [
  ['fullName', 'Full name', 'Identity', false], ['firstName', 'First name', 'Identity', false], ['lastName', 'Last name', 'Identity', false],
  ['email', 'Email address', 'Contact', false], ['phone', 'Phone number', 'Contact', true], ['location', 'Location', 'Contact', true],
  ['currentEmployer', 'Current or latest employer', 'Work', false],
];
function valueOf(p: any, key: string): string | undefined {
  const parts = String(p?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
  switch (key) {
    case 'fullName': return p?.fullName; case 'firstName': return parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0]; case 'lastName': return parts.length > 1 ? parts[parts.length - 1] : undefined;
    case 'email': return p?.email; case 'phone': return p?.phone; case 'location': return p?.location; case 'currentEmployer': return p?.experiences?.[0]?.employerName;
    default: return undefined;
  }
}
const FORBIDDEN = /pass(word|code)|ssn|gender|authori[sz]ation|visa|salary|birth/i;
const sessionView = (s: any) => ({ id: s.id, adapterId: s.adapterId, targetHost: s.targetHost, status: s.status !== 'REVOKED' && new Date(s.expiresAt) <= new Date() ? 'EXPIRED' : s.status, consentedKeys: s.consentedKeys, sensitiveConsent: s.sensitiveConsent, expiresAt: s.expiresAt, createdAt: s.createdAt });

function autofill(state: any, st: Store, method: string, path: string, body: any): Reply | null {
  if (path === '/autofill/site-adapters' && method === 'GET') return ok(ADAPTERS);
  if (path === '/autofill/sessions') {
    if (method === 'GET') return ok(st.sessions.map(sessionView));
    if (method === 'POST') {
      if (body.confirm !== true) return err(400, 'Start an autofill session explicitly: confirmation is required');
      if (!ADAPTERS.some((a) => a.id === body.adapterId)) return err(400, 'Unknown site adapter');
      if (body.targetHost && !/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(body.targetHost.trim())) return err(400, 'Enter the site hostname only, for example boards.greenhouse.io');
      if (!state.profile) return err(404, 'Career profile not found');
      const s = { id: uid(st, 'b'), adapterId: body.adapterId, targetHost: body.targetHost?.trim().toLowerCase() || null, status: 'ACTIVE', consentedKeys: [], sensitiveConsent: false, expiresAt: new Date(Date.now() + 900_000).toISOString(), createdAt: nowIso() };
      st.sessions.unshift(s);
      return ok(sessionView(s), 201);
    }
  }
  const m = /^\/autofill\/sessions\/([^/]+)\/(field-options|authorize-fields|revoke)$/.exec(path);
  if (!m) return null;
  const s = st.sessions.find((x) => x.id === m[1]);
  if (!s) return err(404, 'Autofill session not found');
  if (m[2] === 'revoke') { Object.assign(s, { status: 'REVOKED', consentedKeys: [], sensitiveConsent: false }); return ok(sessionView(s)); }
  if (s.status === 'REVOKED') return err(409, 'This session was revoked. Start a new one.');
  if (new Date(s.expiresAt) <= new Date()) return err(410, 'This session has expired. Start a new one.');
  const adapter = ADAPTERS.find((a) => a.id === s.adapterId)!;
  if (m[2] === 'field-options' && method === 'GET') {
    const mask = (k: string, v: string) => (k === 'email' ? `${v.slice(0, 1)}***@${v.split('@')[1]}` : k === 'phone' ? `********${v.slice(-2)}` : v);
    return ok({ session: sessionView(s), adapter, fields: FIELDS.map(([key, label, group, sensitive]) => { const v = valueOf(state.profile, key); return { key, label, group, sensitive, available: v !== undefined, preview: v === undefined ? null : mask(key, v) }; }) });
  }
  if (m[2] === 'authorize-fields' && method === 'POST') {
    if (body.confirm !== true) return err(400, 'Review and confirm the selected fields before they are released');
    for (const k of body.fieldKeys) {
      if (FORBIDDEN.test(k)) return err(400, `"${k}" is never filled by this assistant. Answer it yourself on the form.`);
      if (!FIELDS.some((f) => f[0] === k)) return err(400, `Unknown field "${k}"`);
    }
    const sens = body.fieldKeys.filter((k: string) => FIELDS.find((f) => f[0] === k)![3]);
    if (sens.length && body.sensitiveConsent !== true) return err(400, `Sensitive fields need your explicit consent for this session: ${sens.join(', ')}`);
    const fills: any[] = []; const skipped: string[] = [];
    for (const k of body.fieldKeys) { const v = valueOf(state.profile, k); if (v === undefined) skipped.push(k); else fills.push({ fieldKey: k, value: v, selector: adapter.mode === 'FILL' ? (adapter.selectors as any)[k] ?? null : null }); }
    Object.assign(s, { status: 'AUTHORIZED', consentedKeys: fills.map((f) => f.fieldKey), sensitiveConsent: sens.length > 0 });
    return ok({ session: sessionView(s), mode: adapter.mode, fills, skipped, submit: 'never' });
  }
  return null;
}

// ---------------------------------------------------------------- module 49: evidence wallet
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;
function effective(c: any) {
  if (c.status === 'REVOKED') return 'REVOKED';
  if (c.expiresOn) { const [y, mo] = c.expiresOn.split('-').map(Number); if (new Date(Date.UTC(y, mo, 0, 23, 59, 59)) < new Date()) return 'EXPIRED'; }
  return c.status;
}
const credView = (c: any) => {
  const { evidenceList, verifications, credentialId, ...rest } = c;
  return { ...rest, credentialIdMasked: credentialId ? `••••${credentialId.slice(-4)}` : null, hasCredentialId: !!credentialId, effectiveStatus: effective(c), recheckDue: false };
};
const gState = (g: any) => (g.revokedAt ? 'REVOKED' : new Date(g.expiresAt) <= new Date() ? 'EXPIRED' : 'ACTIVE');

function wallet(state: any, st: Store, method: string, path: string, body: any): Reply | null {
  if (path === '/credentials') {
    if (method === 'GET') return ok(st.credentials.map(credView));
    if (method === 'POST') {
      for (const f of ['issuedOn', 'expiresOn']) if (body[f] && !DATE_RE.test(body[f])) return err(400, `${f} must be YYYY-MM or YYYY-MM-DD`);
      if (body.issuedOn && body.expiresOn && body.expiresOn < body.issuedOn) return err(400, 'Expiry cannot be before the issue date');
      const c = { id: uid(st, 'c'), kind: body.kind ?? 'CERTIFICATION', name: body.name, issuer: body.issuer, issuedOn: body.issuedOn ?? null, expiresOn: body.expiresOn ?? null, credentialId: body.credentialId ?? null, verificationUrl: body.verificationUrl ?? null, status: 'SELF_REPORTED', statusSource: 'USER', statusAt: nowIso(), recheckAfter: null, updatedAt: nowIso(), evidenceList: [] as any[], verifications: [] as any[] };
      st.credentials.unshift(c);
      return ok(credView(c), 201);
    }
  }
  const dm = /^\/credential-disclosures\/([^/]+)\/revoke$/.exec(path);
  if (dm && method === 'POST') { const g = st.grants.find((x) => x.id === dm[1]); if (!g) return err(404, 'Disclosure not found'); g.revokedAt = nowIso(); return ok({ ...g, state: 'REVOKED' }); }
  const m = /^\/credentials\/([^/]+)(?:\/(evidence(?:\/[^/]+)?|verification-requests|verification|disclosure-grants))?$/.exec(path);
  if (!m) return null;
  const c = st.credentials.find((x) => x.id === m[1]);
  if (!c) return err(404, 'Credential not found');
  const sub = m[2];
  if (!sub) {
    if (method === 'GET') return ok({ ...credView(c), evidence: c.evidenceList.map((e: any) => ({ ...e, profileLinkValid: e.kind === 'PROFILE_ITEM' ? true : undefined })) });
    if (method === 'PATCH') {
      const material = ['name', 'issuer', 'issuedOn', 'expiresOn', 'credentialId'].some((f) => body[f] !== undefined && (f === 'credentialId' || body[f] !== c[f]));
      for (const [k, v] of Object.entries(body)) c[k] = v;
      if (material && c.status !== 'SELF_REPORTED') Object.assign(c, { status: 'SELF_REPORTED', statusSource: 'USER', statusAt: nowIso() });
      return ok(credView(c));
    }
    if (method === 'DELETE') { st.credentials = st.credentials.filter((x) => x !== c); st.grants = st.grants.filter((g) => g.credentialId !== c.id); return ok(undefined, 204); }
  }
  if (sub === 'evidence' && method === 'POST') {
    if (body.kind === 'LINK' && !body.url) return err(400, 'A link needs a URL');
    const e = { id: uid(st, 'e'), kind: body.kind, label: body.label, url: body.kind === 'LINK' ? body.url : null, profileItemType: body.profileItemType ?? null, profileItemId: body.profileItemId ?? null };
    c.evidenceList.push(e);
    return ok(e, 201);
  }
  const em = /^evidence\/([^/]+)$/.exec(sub ?? '');
  if (em && method === 'DELETE') { c.evidenceList = c.evidenceList.filter((e: any) => e.id !== em[1]); return ok(undefined, 204); }
  if (sub === 'verification-requests' && method === 'POST') {
    if (body.consent !== true) return err(400, 'Verification is only attempted with your explicit consent');
    let status: string; let source: string; let note: string | null = null;
    if (body.method === 'SELF_DOCUMENT_REVIEW') { status = 'DOCUMENT_REVIEWED'; source = 'USER'; }
    else { status = 'UNABLE_TO_VERIFY'; source = 'PROVIDER:none'; note = 'No verification provider is connected. Your credential keeps its current standing.'; }
    const applies = status !== 'UNABLE_TO_VERIFY' || c.status === 'SELF_REPORTED';
    c.verifications.unshift({ id: uid(st, 'r'), status, source, note, checkedAt: nowIso() });
    if (applies) Object.assign(c, { status, statusSource: source, statusAt: nowIso() });
    return ok({ verification: { status, note }, applied: applies });
  }
  if (sub === 'verification' && method === 'GET') return ok({ status: c.status, effectiveStatus: effective(c), source: c.statusSource, asOf: c.statusAt, recheckAfter: null, recheckDue: false, history: c.verifications });
  if (sub === 'disclosure-grants') {
    if (method === 'GET') return ok(st.grants.filter((g) => g.credentialId === c.id).map((g) => ({ ...g, state: gState(g) })));
    if (method === 'POST') {
      if (body.confirm !== true) return err(400, 'Confirm what you are disclosing; nothing is shared by default');
      const g = { id: uid(st, 'g'), credentialId: c.id, purpose: body.purpose, recipientLabel: body.recipientLabel ?? null, fields: body.fields, expiresAt: new Date(Date.now() + (body.expiresInDays ?? 30) * 86_400_000).toISOString(), revokedAt: null };
      st.grants.unshift(g);
      const projection: Record<string, unknown> = {};
      for (const f of body.fields) {
        if (f === 'status') { projection['status'] = effective(c); projection['statusSource'] = c.statusSource; projection['statusAsOf'] = c.statusAt; }
        else if (f === 'credentialIdMasked') { if (c.credentialId) projection[f] = `••••${c.credentialId.slice(-4)}`; }
        else if (c[f]) projection[f] = c[f];
      }
      return ok({ ...g, state: 'ACTIVE', projection }, 201);
    }
  }
  return null;
}

/** Entry point called from mock-api.ts. Returns null when the path does not belong to these modules. */
export function handleProfileTools(state: object, method: string, path: string, body: any): Reply | null {
  const st = store(state);
  if (path.startsWith('/portfolios') || path.startsWith('/public/portfolios/')) return portfolio(state, st, method, path, body ?? {});
  if (path.startsWith('/autofill/')) return autofill(state, st, method, path, body ?? {});
  if (path.startsWith('/credentials') || path.startsWith('/credential-disclosures/')) return wallet(state, st, method, path, body ?? {});
  return null;
}
