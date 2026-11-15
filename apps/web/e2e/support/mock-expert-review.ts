/**
 * In-memory fake for doc 50 (expert review). Mirrors the API rules the UI depends on: explicit consent, saved version only,
 * scope-limited preview, expiry/revoke gates on preview and feedback, content-free audit trail, decisions that never touch the resume.
 * State is per test (WeakMap on MockState).
 */
export interface Reply { status: number; data?: unknown }
const ok = (data: unknown, status = 200): Reply => ({ status, data });
const err = (status: number, message: string): Reply => ({ status, data: { message } });

export const MOCK_REVIEWERS = [
  { id: 'rv-sample-tech', displayName: 'Sample reviewer: technology resumes', expertise: ['Software engineering', 'Data'], vetting: 'UNVERIFIED', serviceLevelDays: 5, conflictPolicy: 'Declines reviews where they know the candidate or their employer.' },
  { id: 'rv-sample-career-change', displayName: 'Sample reviewer: career changers', expertise: ['Career change', 'Transferable skills'], vetting: 'UNVERIFIED', serviceLevelDays: 7, conflictPolicy: 'Declines reviews where they know the candidate or their employer.' },
];
const PACKAGES = [
  { id: 'pk-focused', label: 'Focused review', description: 'Comments on up to three sections.', maxSections: 3 },
  { id: 'pk-full', label: 'Full resume review', description: 'Comments across every section you choose to share.', maxSections: 7 },
];
const NOTE = 'No payment provider is configured. Reviews are not charged and no card details are taken. Payment, refunds and disputes are not available yet.';
const TITLES: Record<string, string> = { summary: 'Summary', experience: 'Experience', skills: 'Skills', education: 'Education', projects: 'Projects', certifications: 'Certifications', languages: 'Languages' };

interface Store { seq: number; reviews: any[]; feedback: any[]; events: any[] }
const stores = new WeakMap<object, Store>();
export function estore(state: object): Store {
  let s = stores.get(state);
  if (!s) { s = { seq: 0, reviews: [], feedback: [], events: [] }; stores.set(state, s); }
  return s;
}
const uuid = (st: Store) => `00000000-0000-4000-8000-${String(700000 + ++st.seq).padStart(12, '0')}`;
const nowIso = () => new Date().toISOString();
const statusOf = (r: any) => (r.revokedAt ? 'REVOKED' : new Date(r.expiresAt).getTime() <= Date.now() ? 'EXPIRED' : 'ACTIVE');
const classify = (c: string) => (c.includes('@') ? 'email' : (c.match(/\d/g) ?? []).length >= 7 ? 'phone' : 'location');
const view = (st: Store, r: any) => ({
  id: r.id, resumeId: r.resumeId, versionNumber: r.versionNumber, reviewer: r.reviewer, packageId: r.packageId, scope: r.scope, status: statusOf(r), consentAt: r.consentAt,
  expiresAt: r.expiresAt, revokedAt: r.revokedAt, payment: { status: 'NOT_CONFIGURED', reference: null }, feedbackCount: st.feedback.filter((f) => f.requestId === r.id).length, createdAt: r.createdAt,
});
const log = (st: Store, requestId: string, kind: string, ref?: string) => st.events.push({ id: uuid(st), requestId, kind, ref: ref ?? null, createdAt: nowIso() });

export function handleExpertReview(state: any, method: string, path: string, body: any): Reply | null {
  if (path === '/reviewers' && method === 'GET') return ok(MOCK_REVIEWERS);
  if (path === '/review-packages' && method === 'GET') return ok({ payment: { configured: false, provider: 'none', note: NOTE }, packages: PACKAGES });
  if (!path.startsWith('/expert-reviews')) return null;
  const st = estore(state);
  if (path === '/expert-reviews') {
    if (method === 'GET') return ok([...st.reviews].reverse().map((r) => view(st, r)));
    if (method === 'POST') {
      if (body.consent !== true) return err(400, 'A review needs your explicit consent to the scope you chose. Nothing is shared by default.');
      const reviewer = MOCK_REVIEWERS.find((x) => x.id === body.reviewerId); const pkg = PACKAGES.find((x) => x.id === body.packageId);
      if (!reviewer) return err(404, 'Reviewer not found');
      if (!pkg) return err(404, 'Package not found');
      if (body.sections.length > pkg.maxSections) return err(400, `${pkg.label} covers up to ${pkg.maxSections} sections.`);
      if (!state.resumes.some((r: any) => r.id === body.resumeId)) return err(404, 'Resume version not found');
      const list: any[] = state.versions[body.resumeId] ?? [];
      const v = body.resumeVersionId ? list.find((x) => x.id === body.resumeVersionId) : [...list].sort((a, b) => b.versionNumber - a.versionNumber)[0];
      if (!v) return body.resumeVersionId ? err(404, 'Resume version not found') : err(400, 'Save a version of this resume first: only an immutable saved version can be reviewed.');
      const r = {
        id: uuid(st), resumeId: body.resumeId, versionNumber: v.versionNumber, reviewer: { id: reviewer.id, displayName: reviewer.displayName }, packageId: pkg.id,
        scope: { sections: body.sections, contacts: body.contacts, links: body.links ?? 'hidden' }, consentAt: nowIso(), expiresAt: new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString(),
        revokedAt: null, createdAt: nowIso(),
      };
      st.reviews.push(r); log(st, r.id, 'REQUESTED'); log(st, r.id, 'GRANTED');
      return ok(view(st, r), 201);
    }
    return null;
  }
  const m = /^\/expert-reviews\/([^/]+)(?:\/(grant|revoke|preview|feedback|audit)(?:\/([^/]+))?)?$/.exec(path);
  if (!m) return null;
  const r = st.reviews.find((x) => x.id === m[1]);
  if (!r) return err(404, 'Review request not found');
  const sub = m[2];
  if (!sub) {
    if (method === 'GET') return ok(view(st, r));
    if (method === 'DELETE') { st.reviews = st.reviews.filter((x) => x !== r); st.feedback = st.feedback.filter((f) => f.requestId !== r.id); st.events = st.events.filter((e) => e.requestId !== r.id); return { status: 204 }; }
  }
  if (sub === 'grant' && method === 'POST') {
    if (body.consent !== true) return err(400, 'Extending access needs your explicit consent.');
    if (r.revokedAt) return err(410, 'This review access was revoked. Create a new request to share again.');
    r.consentAt = nowIso(); r.expiresAt = new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString(); log(st, r.id, 'GRANTED');
    return ok(view(st, r));
  }
  if (sub === 'revoke' && method === 'POST') { if (!r.revokedAt) { r.revokedAt = nowIso(); log(st, r.id, 'REVOKED'); } return ok(view(st, r)); }
  if (sub === 'audit' && method === 'GET') return ok(st.events.filter((e) => e.requestId === r.id));
  if (sub === 'preview' && method === 'GET') {
    const s = statusOf(r);
    if (s !== 'ACTIVE') return err(410, s === 'REVOKED' ? 'This review access was revoked; the reviewer sees nothing.' : 'This review access has expired; the reviewer sees nothing.');
    const p = state.profile ?? {};
    const contacts = [p.email, p.phone, p.location].filter(Boolean).filter((c: string) => r.scope.contacts[classify(c)] === 'visible');
    log(st, r.id, 'PREVIEWED');
    return ok({ requestId: r.id, versionNumber: r.versionNumber, reviewer: r.reviewer.displayName, readOnly: true, expiresAt: r.expiresAt, resume: { header: { name: p.fullName ?? 'Candidate', headline: p.headline, contacts }, sections: r.scope.sections.map((k: string) => ({ type: k, title: TITLES[k] ?? k })) } });
  }
  if (sub === 'feedback' && !m[3]) {
    if (method === 'GET') return ok(st.feedback.filter((f) => f.requestId === r.id).reverse());
    if (method === 'POST') {
      const s = statusOf(r);
      if (s !== 'ACTIVE') return err(410, s === 'REVOKED' ? 'This review access was revoked; it no longer accepts feedback.' : 'This review access has expired; it no longer accepts feedback.');
      if (!body.comment && !['clarity', 'relevance', 'evidence', 'presentation'].some((k) => body[k] != null)) return err(400, 'Add at least one rating or a comment.');
      if (body.section && !r.scope.sections.includes(body.section)) return err(400, 'That section was not part of the shared scope.');
      const f = { id: uuid(st), requestId: r.id, section: body.section ?? null, clarity: body.clarity ?? null, relevance: body.relevance ?? null, evidence: body.evidence ?? null, presentation: body.presentation ?? null, comment: body.comment ?? null, status: 'NEW', decisionNote: null, decidedAt: null, createdAt: nowIso() };
      st.feedback.push(f); log(st, r.id, 'FEEDBACK_RECORDED', f.id);
      return ok(f, 201);
    }
  }
  if (sub === 'feedback' && m[3] && method === 'PATCH') {
    const f = st.feedback.find((x) => x.id === m[3] && x.requestId === r.id);
    if (!f) return err(404, 'Feedback not found');
    f.status = body.decision; f.decisionNote = body.note ?? null; f.decidedAt = nowIso(); log(st, r.id, body.decision, f.id);
    return ok(f);
  }
  return null;
}
