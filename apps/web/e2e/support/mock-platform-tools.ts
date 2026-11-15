/**
 * In-memory fakes for the platform modules: AI gateway (06/38), webhooks (37), career path (44), job clipper (45),
 * job portals (32), expert review (50), interview copilot (51), document suite (52).
 * They mirror the API rules the UI depends on (consent gates, approval, SSRF rejection, explicit import) in a small form.
 * State is per test (WeakMap on MockState).
 */
export interface Reply { status: number; data?: unknown }
const ok = (data: unknown, status = 200): Reply => ({ status, data });
const err = (status: number, message: string): Reply => ({ status, data: { message } });

interface Store {
  seq: number;
  ai: { enabled: boolean; used: number; providerAvailable: boolean; suggestions: any[]; calls: any[]; failNext?: boolean };
  [k: string]: any;
}
const stores = new WeakMap<object, Store>();
export function pstore(state: object): Store {
  let s = stores.get(state);
  if (!s) {
    s = { seq: 0, ai: { enabled: false, used: 0, providerAvailable: true, suggestions: [], calls: [] } };
    stores.set(state, s);
  }
  return s;
}
const uuid = (st: Store) => `00000000-0000-4000-8000-${String(++st.seq).padStart(12, '0')}`;
const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------- docs 06/38: AI
function aiStatus(st: Store) {
  return {
    enabled: st.ai.enabled, consentAt: st.ai.enabled ? nowIso() : null,
    provider: { id: st.ai.providerAvailable ? 'deterministic' : 'none', model: st.ai.providerAvailable ? 'rules-v1' : 'none', available: st.ai.providerAvailable, external: false },
    quota: { limit: 20, used: st.ai.used, windowHours: 24 },
    tasks: ['REWRITE_BULLET', 'SUMMARY_DRAFT', 'KEYWORD_GAPS', 'POLISH_TEXT', 'COACH_ANSWER'],
    guarantees: ['Suggestions only: nothing is saved to your profile until you confirm and apply it yourself.', 'AI never produces or changes a score.', 'Contact details are removed before text reaches a provider.'],
  };
}
function aiOutput(task: string, text: string, ctx: any) {
  if (task === 'REWRITE_BULLET') {
    const t = text.replace(/^(responsible for|worked on)\s+/i, '').trim();
    const out = t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.');
    return { text: out, notes: [], questions: /\d/.test(out) ? [] : ['What was the measurable result? Add it only if you know the real value.'] };
  }
  if (task === 'SUMMARY_DRAFT') return { text: `${ctx?.title}${ctx?.years !== undefined ? ` with ${ctx.years} years of experience` : ''}.`, notes: ['Built only from the confirmed title, years and skills you provided.'], questions: [] };
  return { text: 'Terms in this posting that your skills list does not mention: kubernetes.', notes: ['Advisory only.'], questions: ['Which of these do you genuinely have experience with?'] };
}
function ai(st: Store, method: string, path: string, body: any): Reply | null {
  if (!path.startsWith('/ai/')) return null;
  if (path === '/ai/status' && method === 'GET') return ok(aiStatus(st));
  if (path === '/ai/settings' && method === 'PUT') { st.ai.enabled = !!body.enabled; return ok(aiStatus(st)); }
  if (path === '/ai/usage' && method === 'GET') {
    const by: Record<string, any> = {};
    for (const c of st.ai.calls) { const b = (by[c] ??= { calls: 0, ok: 0, inputTokens: 5, outputTokens: 5, costMicros: 0 }); b.calls++; b.ok++; }
    const sg = st.ai.suggestions;
    return ok({ windowDays: 30, totalCalls: st.ai.calls.length, failures: 0, byFeature: by, suggestions: { accepted: sg.filter((s: any) => s.status === 'ACCEPTED').length, rejected: sg.filter((s: any) => s.status === 'REJECTED').length, pending: sg.filter((s: any) => s.status === 'PENDING').length }, note: 'Usage metadata only. Prompts, resume text and outputs are not kept in usage records.' });
  }
  if (path === '/ai/suggestions') {
    if (method === 'GET') return ok([...st.ai.suggestions].reverse());
    if (method === 'DELETE') { const n = st.ai.suggestions.length; st.ai.suggestions = []; return ok({ deleted: n }); }
    if (method === 'POST') {
      if (!st.ai.enabled) return err(403, 'AI assistance is off. Turn it on to request suggestions; the manual tools keep working either way.');
      if (!st.ai.providerAvailable) return err(503, 'No AI provider is available right now. Your text is unchanged; continue manually.');
      if (st.ai.failNext) { st.ai.failNext = false; return err(502, 'The assistant returned something unusable, so it was discarded. Please try again or edit manually.'); }
      st.ai.used++; st.ai.calls.push(body.task);
      const text = String(body.text ?? '').replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]');
      const s = {
        id: uuid(st), feature: body.task, provider: 'deterministic', status: 'PENDING', inputPreview: text.slice(0, 160), output: aiOutput(body.task, text, body.context),
        provenance: { redacted: text !== body.text, injectionFlagged: /ignore (all )?previous instructions/i.test(text), sourceFields: ['text'] }, createdAt: nowIso(), decidedAt: null, requiresApproval: true,
      };
      st.ai.suggestions.push(s);
      return ok(s, 201);
    }
  }
  const dm = /^\/ai\/suggestions\/([^/]+)\/decision$/.exec(path);
  if (dm && method === 'POST') {
    const s = st.ai.suggestions.find((x: any) => x.id === dm[1]);
    if (!s) return err(404, 'Suggestion not found');
    if (body.decision === 'ACCEPT' && body.confirm !== true) return err(400, 'Confirm that you reviewed the text before accepting it');
    s.status = body.decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED'; s.decidedAt = nowIso(); s.requiresApproval = false;
    return ok({ ...s, applied: false });
  }
  return null;
}

// ---------------------------------------------------------------- doc 37: webhooks
const EVENT_IDS = ['test.ping', 'resume.created', 'resume.updated', 'resume.exported', 'import.completed'];
function mockUrlProblem(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return 'Enter a valid URL.'; }
  if (u.protocol !== 'https:') return 'Webhook targets must use https.';
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname) || u.hostname.endsWith('.internal')) return 'Private, loopback and link-local addresses are not allowed.';
  return null;
}
function webhooks(st: Store, method: string, path: string, body: any): Reply | null {
  const w = (st['wh'] ??= { endpoints: [] as any[], deliveries: [] as any[], failTests: false });
  const view = (e: any) => { const { secret, ...rest } = e; return rest; };
  if (path === '/webhooks/event-types' && method === 'GET') return ok({ apiVersion: '1', events: EVENT_IDS.map((id) => ({ id, description: `Event ${id}.` })) });
  if (path === '/webhooks/deliveries' && method === 'GET') return ok([...w.deliveries].reverse());
  if (path === '/webhooks') {
    if (method === 'GET') return ok(w.endpoints.map(view));
    if (method === 'POST') {
      const p = mockUrlProblem(body.url); if (p) return err(400, p);
      if (w.endpoints.length >= 5) return err(409, 'You can register up to 5 endpoints');
      const secret = `whsec_mock${String(++st.seq).padStart(6, '0')}`;
      const e = { id: uuid(st), url: body.url, description: body.description ?? null, events: body.events, active: true, secretHint: `••••${secret.slice(-4)}`, secretVersion: 1, createdAt: nowIso(), secret };
      w.endpoints.push(e);
      return ok({ ...view(e), secret, secretNote: 'Copy this signing secret now. It is not shown again.' }, 201);
    }
  }
  const dr = /^\/webhook-deliveries\/([^/]+)\/retry$/.exec(path);
  if (dr && method === 'POST') {
    const d = w.deliveries.find((x: any) => x.id === dr[1]); if (!d) return err(404, 'Delivery not found');
    if (d.status !== 'FAILED') return err(400, 'Only failed deliveries can be retried');
    w.failTests = false; d.status = 'SUCCESS'; d.attempts++; d.responseCode = 200; d.error = null; d.nextAttemptAt = null; d.deliveredAt = nowIso();
    return ok(d);
  }
  const m = /^\/webhooks\/([^/]+)(?:\/(test|rotate-secret))?$/.exec(path);
  if (m) {
    const e = w.endpoints.find((x: any) => x.id === m[1]); if (!e) return err(404, 'Webhook endpoint not found');
    if (!m[2]) {
      if (method === 'PATCH') { if (body.url) { const p = mockUrlProblem(body.url); if (p) return err(400, p); } Object.assign(e, Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined))); return ok(view(e)); }
      if (method === 'DELETE') { w.endpoints = w.endpoints.filter((x: any) => x !== e); w.deliveries = w.deliveries.filter((d: any) => d.endpointId !== e.id); return { status: 204 }; }
    }
    if (m[2] === 'rotate-secret' && method === 'POST') {
      e.secretVersion++; const secret = `whsec_rot${String(++st.seq).padStart(6, '0')}`; e.secret = secret; e.secretHint = `••••${secret.slice(-4)}`;
      return ok({ ...view(e), secret, secretNote: 'The previous secret no longer works. Update your receiver now.' });
    }
    if (m[2] === 'test' && method === 'POST') {
      const fail = w.failTests;
      const d = { id: uuid(st), endpointId: e.id, eventId: uuid(st), eventType: 'test.ping', status: fail ? 'FAILED' : 'SUCCESS', attempts: 1, responseCode: fail ? 503 : 200, error: fail ? 'Receiver answered HTTP 503' : null, nextAttemptAt: fail ? nowIso() : null, createdAt: nowIso(), deliveredAt: fail ? null : nowIso() };
      w.deliveries.push(d);
      return ok(d);
    }
  }
  return null;
}

// ---------------------------------------------------------------- doc 44: career path and compensation
const CP_ROLES = [
  { id: 'devops-engineer', title: 'DevOps / Platform Engineer', family: 'Infrastructure', summary: 'Automates delivery and runs reliable infrastructure.', required: [['Docker', ['docker']], ['Kubernetes', ['kubernetes', 'k8s']], ['Infrastructure as code', ['terraform']], ['Cloud platform', ['aws', 'azure']]] },
  { id: 'data-analyst', title: 'Data Analyst', family: 'Data', summary: 'Turns data into decisions and reports.', required: [['SQL', ['sql', 'postgresql']], ['Spreadsheets', ['excel']], ['Statistics', ['statistics']]] },
  { id: 'backend-engineer', title: 'Backend Engineer', family: 'Engineering', summary: 'Builds services, APIs and data storage.', required: [['SQL', ['sql', 'postgresql']], ['Docker', ['docker']], ['REST APIs', ['rest', 'api']]] },
] as const;
function cpOption(profile: any, r: (typeof CP_ROLES)[number], target?: string) {
  const skills = (profile?.skills ?? []) as Array<{ id: string; name: string }>;
  const text = (profile?.experiences ?? []).flatMap((e: any) => (e.bullets ?? []).map((b: any) => b.content)).join(' ').toLowerCase();
  const assessed = r.required.map(([label, aliases]) => {
    const hit = skills.find((s) => (aliases as readonly string[]).some((a) => s.name.toLowerCase().includes(a)));
    if (hit) return { label, status: 'RECORDED_SKILL', evidence: [{ type: 'skill', id: hit.id ?? hit.name, label: hit.name }] };
    if ((aliases as readonly string[]).some((a) => text.includes(a))) return { label, status: 'RECORDED_IN_EXPERIENCE', evidence: [{ type: 'experience', id: 'e', label: 'Your experience' }] };
    return { label, status: 'NO_RECORDED_EVIDENCE', evidence: [] };
  });
  const covered = assessed.filter((a) => a.status !== 'NO_RECORDED_EVIDENCE').length;
  const none = assessed.filter((a) => a.status === 'NO_RECORDED_EVIDENCE').map((a) => a.label);
  const why = [...(target === r.id ? ['You chose this role as your target.'] : []), covered ? `Your profile records evidence for ${covered} of ${r.required.length} typical requirements.` : 'Your profile does not yet record evidence for any typical requirement of this role.'];
  return { roleId: r.id, title: r.title, family: r.family, summary: r.summary, taxonomyVersion: '1', coverage: { covered, total: r.required.length }, skills: assessed, transferable: assessed.filter((a) => a.status !== 'NO_RECORDED_EVIDENCE').map((a) => a.label), noRecordedEvidence: none, why, adjacentToCurrent: false, isTarget: target === r.id };
}
function planView(p: any) { const done = p.milestones.filter((m: any) => m.status === 'DONE').length; return { ...p, progress: { done, total: p.milestones.length } }; }
function careerPath(st: Store, method: string, path: string, body: any, state: any): Reply | null {
  const cp = (st['cp'] ??= { plans: [] as any[], compSource: false });
  if (path === '/career-paths/roles' && method === 'GET') return ok({ taxonomyVersion: '1', roles: CP_ROLES.map(({ id, title, family, summary }) => ({ id, title, family, summary })) });
  if (path === '/career-paths/analyze' && method === 'POST') {
    if (!state.profile) return err(404, 'Career profile not found');
    const roles = body?.targetRoleId ? CP_ROLES.filter((r) => r.id === body.targetRoleId) : CP_ROLES;
    return ok({ taxonomyVersion: '1', currentRole: { id: 'backend-engineer', title: 'Backend Engineer' }, options: roles.map((r) => cpOption(state.profile, r, body?.targetRoleId)), notes: ['Based only on facts in your confirmed profile. A missing item means no evidence is recorded yet, not that you lack the skill.', 'This is not a prediction of hiring outcomes and does not rank your worth.'] });
  }
  if (path === '/compensation-insights' && method === 'GET') {
    if (!cp.compSource) return ok({ available: false, observations: [], reason: 'No licensed compensation data source is connected, so no salary figures are shown. This platform does not estimate pay.' });
    return ok({ available: true, observations: [{ role: 'Backend Engineer', geography: 'Germany', currency: 'EUR', period: 'YEAR', median: 60000, source: 'Licensed Survey 2026', observedAt: '2026-03-01T00:00:00.000Z' }], note: 'Observed market data.' });
  }
  if (path === '/career-paths') {
    if (method === 'GET') return ok(cp.plans.map(planView));
    if (method === 'POST') {
      const r = CP_ROLES.find((x) => x.id === body.roleId); if (!r) return err(400, 'Unknown role');
      const o = cpOption(state.profile, r, r.id);
      const p = { id: uuid(st), title: body.title ?? `Towards ${r.title}`, targetRoleId: r.id, targetRoleTitle: r.title, status: 'ACTIVE', notes: null, basis: { why: o.why }, milestones: o.noRecordedEvidence.slice(0, 5).map((l, i) => ({ id: uuid(st), title: `Record or build evidence for: ${l}`, targetDate: null, status: 'NOT_STARTED', notes: null, position: i })) };
      cp.plans.push(p); return ok(planView(p), 201);
    }
  }
  const m = /^\/career-paths\/([^/]+)(?:\/milestones(?:\/([^/]+))?)?$/.exec(path);
  if (m && m[1] !== 'roles' && m[1] !== 'analyze') {
    const p = cp.plans.find((x: any) => x.id === m[1]); if (!p) return err(404, 'Plan not found');
    const isMs = path.includes('/milestones');
    if (!isMs) {
      if (method === 'GET') return ok(planView(p));
      if (method === 'PATCH') { Object.assign(p, Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined))); return ok(planView(p)); }
      if (method === 'DELETE') { cp.plans = cp.plans.filter((x: any) => x !== p); return { status: 204 }; }
    } else if (!m[2] && method === 'POST') {
      p.milestones.push({ id: uuid(st), title: body.title, targetDate: body.targetDate ?? null, status: 'NOT_STARTED', notes: null, position: p.milestones.length }); return ok(planView(p));
    } else if (m[2]) {
      const ms = p.milestones.find((x: any) => x.id === m[2]); if (!ms) return err(404, 'Milestone not found');
      if (method === 'PATCH') { Object.assign(ms, Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined))); return ok(planView(p)); }
      if (method === 'DELETE') { p.milestones = p.milestones.filter((x: any) => x !== ms); return ok(planView(p)); }
    }
  }
  return null;
}

// ---------------------------------------------------------------- doc 45: job clipper
const CLIP_TERMS: Array<[string, string]> = [['Docker', 'docker'], ['Kubernetes', 'kubernetes'], ['SQL', 'sql'], ['Cloud platform', 'aws']];
function clipper(st: Store, method: string, path: string, body: any, state: any): Reply | null {
  const c = (st['clip'] ??= { clips: [] as any[], sessions: [] as any[] });
  const view = (x: any, full = false) => { const { description, ...r } = x; return full ? { ...r, description, descriptionLength: description.length } : { ...r, excerpt: description.slice(0, 200), descriptionLength: description.length }; };
  if (path === '/extension/sessions') {
    if (method === 'GET') return ok([...c.sessions].reverse());
    if (method === 'POST') { const s = { id: uuid(st), label: body.label, expiresAt: new Date(Date.now() + 1_800_000).toISOString(), state: 'ACTIVE' }; c.sessions.push(s); return ok(s, 201); }
  }
  const sr = /^\/extension\/sessions\/([^/]+)\/revoke$/.exec(path);
  if (sr && method === 'POST') { const s = c.sessions.find((x: any) => x.id === sr[1]); if (!s) return err(404, 'Session not found'); s.state = 'REVOKED'; return ok(s); }
  if (path === '/clipped-jobs') {
    if (method === 'GET') return ok([...c.clips].reverse().map((x: any) => view(x)));
    if (method === 'POST') {
      if (body.reviewed !== true) return err(400, 'Review and confirm the details before saving. Nothing is stored without that.');
      if (body.url && !/^https?:\/\//i.test(body.url)) return err(400, 'The URL must be http or https, without a username or password.');
      const dup = c.clips.find((x: any) => x.idem === body.idempotencyKey || (x.title === body.title && x.company === body.company && x.description === body.description));
      if (dup) return ok({ ...view(dup), duplicate: true }, 201);
      let hostname = null; try { hostname = body.url ? new URL(body.url).hostname : null; } catch { /* ignore */ }
      const x = { id: uuid(st), title: body.title, company: body.company, url: body.url ?? null, hostname, description: body.description, source: body.source, status: 'NEW', createdAt: nowIso(), idem: body.idempotencyKey };
      c.clips.push(x); return ok({ ...view(x), duplicate: false }, 201);
    }
  }
  const m = /^\/clipped-jobs\/([^/]+)(?:\/(analyze))?$/.exec(path);
  if (m) {
    const x = c.clips.find((y: any) => y.id === m[1]); if (!x) return err(404, 'Clipped job not found');
    if (m[2] === 'analyze' && method === 'POST') {
      const have = (state.profile?.skills ?? []).map((s: any) => s.name.toLowerCase());
      const terms = CLIP_TERMS.filter(([, a]) => x.description.toLowerCase().includes(a)).map(([label, a]) => ({ label, matchedText: a, inProfile: have.some((h: string) => h.includes(a)) }));
      return ok({ clipId: x.id, terms, inProfile: terms.filter((t) => t.inProfile).length, notRecorded: terms.filter((t) => !t.inProfile).length, notes: ['Terms are matched from a fixed vocabulary.', 'This is not a match score.'] });
    }
    if (method === 'GET') return ok(view(x, true));
    if (method === 'PATCH') { Object.assign(x, Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined))); return ok(view(x, true)); }
    if (method === 'DELETE') { c.clips = c.clips.filter((y: any) => y !== x); return { status: 204 }; }
  }
  return null;
}

// ---------------------------------------------------------------- doc 32: job portal integration
function portal(st: Store, method: string, path: string, body: any, state: any): Reply | null {
  if (!path.startsWith('/portal/')) return null;
  const p = (st['portal'] ??= { jobs: [] as any[], proposals: [] as any[], apps: [] as any[] });
  const view = (j: any, full = false) => { const { description, ...r } = j; return full ? j : r; };
  if (path === '/portal/job-contexts') {
    if (method === 'GET') return ok(p.jobs.map((j: any) => view(j)));
    if (method === 'PUT') {
      if (body.consent !== true) return err(400, 'Confirm that this job should be added to your account');
      let j = p.jobs.find((x: any) => x.hostId === body.hostId && x.externalId === body.externalId);
      const reqs = [...new Set([...(body.requirements ?? []), ...['docker', 'kubernetes'].filter((t) => body.description.toLowerCase().includes(t)).map((t) => t[0].toUpperCase() + t.slice(1))])];
      const data = { title: body.title, company: body.company, description: body.description, requirements: reqs, location: null, applyUrl: null, updatedAt: nowIso() };
      if (j) Object.assign(j, data); else { j = { id: uuid(st), hostId: body.hostId, externalId: body.externalId, ...data }; p.jobs.push(j); }
      return ok(view(j, true));
    }
  }
  const jm = /^\/portal\/job-contexts\/([^/]+)(?:\/(proposals))?$/.exec(path);
  if (jm) {
    const j = p.jobs.find((x: any) => x.id === jm[1]); if (!j) return err(404, 'Job not found');
    if (!jm[2]) { if (method === 'GET') return ok(view(j, true)); if (method === 'DELETE') { p.jobs = p.jobs.filter((x: any) => x !== j); p.apps = p.apps.filter((a: any) => a.jobContextId !== j.id); return { status: 204 }; } }
    if (jm[2] && method === 'GET') return ok(p.proposals.filter((x: any) => x.jobContextId === j.id));
    if (jm[2] && method === 'POST') {
      if (!state.resumes.some((r: any) => r.id === body.resumeId)) return err(404, 'Resume not found');
      const skills = (state.profile?.skills ?? []) as Array<{ id: string; name: string }>;
      const items = (j.requirements as string[]).map((term, i) => {
        const sk = skills.find((s) => s.name.toLowerCase().includes(term.toLowerCase()));
        return sk ? { id: `i${i}s`, type: 'EMPHASISE_SKILL', requirement: term, refs: [{ type: 'skill', id: sk.id, label: sk.name }], note: `Show "${sk.name}" near the top of your skills.`, decision: 'PENDING' }
          : { id: `i${i}n`, type: 'NO_RECORDED_EVIDENCE', requirement: term, refs: [], note: 'Nothing in your profile mentions this. Add it only if it is true and you can support it.', decision: 'PENDING' };
      });
      const prop = { id: uuid(st), jobContextId: j.id, resumeId: body.resumeId, items, notice: 'Suggestions only. They point at facts already in your profile and change nothing until you edit your resume yourself.' };
      p.proposals.push(prop); return ok(prop, 201);
    }
  }
  const dm = /^\/portal\/proposals\/([^/]+)\/decisions$/.exec(path);
  if (dm && method === 'POST') {
    const prop = p.proposals.find((x: any) => x.id === dm[1]); if (!prop) return err(404, 'Proposal not found');
    const it = prop.items.find((x: any) => x.id === body.itemId); if (!it) return err(404, 'Suggestion not found');
    it.decision = body.decision; return ok(prop);
  }
  if (path === '/portal/applications') {
    if (method === 'GET') return ok([...p.apps].reverse());
    if (method === 'POST') {
      if (body.confirm !== true) return err(400, 'Confirm that you used this resume version for this job');
      if (!(state.versions[body.resumeId] ?? []).some((v: any) => v.versionNumber === body.versionNumber)) return err(404, 'Resume version not found. Save a version first so the exact content is recorded.');
      const a = { id: uuid(st), jobContextId: body.jobContextId, resumeId: body.resumeId, versionNumber: body.versionNumber, hostStatus: null, createdAt: nowIso() };
      p.apps.push(a); return ok(a, 201);
    }
  }
  const am = /^\/portal\/applications\/([^/]+)$/.exec(path);
  if (am) {
    const a = p.apps.find((x: any) => x.id === am[1]); if (!a) return err(404, 'Application not found');
    if (method === 'PATCH') { a.hostStatus = body.hostStatus || null; return ok(a); }
    if (method === 'DELETE') { p.apps = p.apps.filter((x: any) => x !== a); return { status: 204 }; }
  }
  return null;
}

// ---------------------------------------------------------------- doc 51: interview copilot
function copilot(st: Store, method: string, path: string, body: any, state: any): Reply | null {
  if (!path.startsWith('/interview-copilot/')) return null;
  const c = (st['copilot'] ??= { sessions: [] as any[] });
  const view = (s: any) => ({ id: s.id, jobTitle: s.jobTitle, resumeId: s.resumeId, versionNumber: s.versionNumber, retainAnswers: s.retainAnswers, status: s.status, mode: 'TEXT_PRACTICE', notice: 'Practice only. Never use this to get live help during a real assessment.', questions: s.questions, answers: s.answers, createdAt: s.createdAt });
  if (path === '/interview-copilot/sessions') {
    if (method === 'GET') return ok([...c.sessions].reverse().map((s: any) => ({ id: s.id, jobTitle: s.jobTitle, versionNumber: s.versionNumber, status: s.status, createdAt: s.createdAt, answered: s.answers.length, total: s.questions.length })));
    if (method === 'POST') {
      if (body.confirmPracticeOnly !== true) return err(400, 'Confirm that this is practice only');
      if (!(state.versions[body.resumeId] ?? []).some((v: any) => v.versionNumber === body.versionNumber)) return err(404, 'Resume version not found. Save a version first.');
      const s = { id: uuid(st), jobTitle: body.jobTitle, resumeId: body.resumeId, versionNumber: body.versionNumber, retainAnswers: !!body.retainAnswers, status: 'ACTIVE', createdAt: nowIso(), answers: [] as any[],
        questions: [
          { id: 'q-recent', kind: 'GENERAL', text: 'Walk me through your role as Programmer at Babbage & Co and what you are proudest of there.', why: 'Your most recent experience is the natural opening topic.' },
          { id: 'q-g1', kind: 'GAP', text: 'The role mentions Kubernetes. How would you approach it, and what related experience would you draw on?', why: 'The posting asks for Kubernetes, but your resume does not mention it. Interviewers may probe this, so prepare an honest answer.' },
        ] };
      c.sessions.push(s); return ok(view(s), 201);
    }
  }
  const m = /^\/interview-copilot\/sessions\/([^/]+)(?:\/(answers|feedback|consent))?$/.exec(path);
  if (m) {
    const s = c.sessions.find((x: any) => x.id === m[1]); if (!s) return err(404, 'Practice session not found');
    if (!m[2]) { if (method === 'GET') return ok(view(s)); if (method === 'DELETE') { c.sessions = c.sessions.filter((x: any) => x !== s); return { status: 204 }; } }
    if (m[2] === 'answers' && method === 'POST') {
      const words = String(body.text).trim().split(/\s+/).length; const good = words >= 40;
      const feedback = ['relevance', 'structure', 'specificity', 'evidence', 'clarity'].map((key) => ({ key, label: key[0].toUpperCase() + key.slice(1), status: good ? 'STRONG' : 'COULD_IMPROVE', observation: good ? `Your ${key} looks fine.` : `Work on ${key}.` }));
      s.answers = s.answers.filter((a: any) => a.questionId !== body.questionId);
      s.answers.push({ id: uuid(st), questionId: body.questionId, text: s.retainAnswers ? body.text : null, wordCount: words, feedback });
      return ok({ questionId: body.questionId, wordCount: words, feedback, retained: s.retainAnswers });
    }
    if (m[2] === 'feedback' && method === 'POST') {
      const dims: Record<string, { strong: number; couldImprove: number }> = {};
      for (const a of s.answers) for (const d of a.feedback) { const x = (dims[d.key] ??= { strong: 0, couldImprove: 0 }); d.status === 'STRONG' ? x.strong++ : x.couldImprove++; }
      return ok({ answered: s.answers.length, total: s.questions.length, dimensions: dims, note: 'Counts of answers where each aspect looked strong or could improve. This describes your answers only; it is not a rating of you and does not predict hiring outcomes.' });
    }
    if (m[2] === 'consent' && method === 'POST') { s.retainAnswers = !!body.retainAnswers; if (!s.retainAnswers) s.answers.forEach((a: any) => { a.text = null; }); return ok(view(s)); }
  }
  return null;
}

// ---------------------------------------------------------------- doc 52: career document suite
const DOC_TYPES_MOCK = [
  { id: 'BIO', label: 'Professional bio', inputs: [], disclaimer: null },
  { id: 'THANK_YOU', label: 'Thank-you note', inputs: ['recipientName', 'occasion'], disclaimer: null },
  { id: 'RESIGNATION', label: 'Resignation letter', inputs: ['managerName', 'lastDay'], disclaimer: 'Neutral drafting support only. This is not legal or employment-rights advice; check your contract and local rules.' },
];
function docDraft(type: string, profile: any, inputs: any) {
  const ex = profile?.experiences?.[0]; const sk = (profile?.skills ?? []).slice(0, 2);
  const ph = (v: string | undefined, w: string) => v?.trim() || `[add ${w}]`;
  if (type === 'THANK_YOU') return { sections: [{ id: 'greet', heading: 'Greeting', text: `Dear ${ph(inputs.recipientName, 'recipient name')},`, origin: 'USER' }, { id: 'sign', heading: 'Sign-off', text: `Kind regards,\n${profile.fullName}`, origin: 'PROFILE' }], claims: [{ sectionId: 'greet', text: 'x', label: 'USER_AUTHORED', evidence: null }] };
  if (type === 'RESIGNATION') return { sections: [{ id: 'greet', heading: 'Greeting', text: `Dear ${ph(inputs.managerName, 'manager name')},`, origin: 'USER' }, { id: 'notice', heading: 'Notice', text: `Please accept this letter as formal notice of my resignation from my position as ${ex?.jobTitle} at ${ex?.employerName}.`, origin: 'PROFILE' }], claims: [{ sectionId: 'notice', text: `${ex?.jobTitle} at ${ex?.employerName}`, label: 'EVIDENCED', evidence: { type: 'experience', id: ex?.id, label: `${ex?.jobTitle} at ${ex?.employerName}` } }] };
  return { sections: [{ id: 'intro', heading: 'Introduction', text: `${profile.fullName} is a ${ex?.jobTitle} at ${ex?.employerName}.`, origin: 'PROFILE' }, { id: 'skills', heading: 'Skills', text: `Works with ${sk.map((s: any) => s.name).join(' and ')}.`, origin: 'PROFILE' }],
    claims: [{ sectionId: 'intro', text: 'x', label: 'EVIDENCED', evidence: { type: 'experience', id: ex?.id, label: `${ex?.jobTitle} at ${ex?.employerName}` } }, ...sk.map((s: any) => ({ sectionId: 'skills', text: s.name, label: 'EVIDENCED', evidence: { type: 'skill', id: s.id, label: s.name } }))] };
}
function careerDocs(st: Store, method: string, path: string, body: any, state: any, search?: URLSearchParams): Reply | null {
  if (!path.startsWith('/career-documents')) return null;
  const c = (st['docs'] ??= { docs: [] as any[] });
  const info = (t: string) => DOC_TYPES_MOCK.find((x) => x.id === t)!;
  const view = (d: any, n?: number) => { const v = d.versions.find((x: any) => x.versionNumber === (n ?? d.currentVersion)) ?? d.versions[d.versions.length - 1]; return { id: d.id, type: d.type, typeLabel: info(d.type).label, title: d.title, currentVersion: d.currentVersion, disclaimer: info(d.type).disclaimer, versions: d.versions.map((x: any) => ({ versionNumber: x.versionNumber, changeSummary: x.changeSummary, createdAt: x.createdAt })), version: { versionNumber: v.versionNumber, sections: v.sections, claims: v.claims } }; };
  if (path === '/career-documents/types' && method === 'GET') return ok(DOC_TYPES_MOCK);
  if (path === '/career-documents') {
    if (method === 'GET') return ok([...c.docs].reverse().map((d: any) => ({ id: d.id, type: d.type, typeLabel: info(d.type).label, title: d.title, currentVersion: d.currentVersion, updatedAt: nowIso() })));
    if (method === 'POST') {
      if (!state.profile) return err(404, 'Career profile not found');
      const dr = docDraft(body.type, state.profile, body.inputs ?? {});
      const d = { id: uuid(st), type: body.type, title: body.title ?? info(body.type).label, currentVersion: 1, versions: [{ versionNumber: 1, sections: dr.sections, claims: dr.claims, changeSummary: 'Draft from your profile', createdAt: nowIso() }] };
      c.docs.push(d); return ok(view(d), 201);
    }
  }
  const m = /^\/career-documents\/([^/]+)(?:\/(versions|claims\/validate|diff|export\/(?:txt|md|docx|pdf)))?$/.exec(path);
  if (m) {
    const d = c.docs.find((x: any) => x.id === m[1]); if (!d) return err(404, 'Document not found');
    const sub = m[2];
    if (!sub) { if (method === 'GET') return ok(view(d, search?.get('version') ? Number(search.get('version')) : undefined)); if (method === 'DELETE') { c.docs = c.docs.filter((x: any) => x !== d); return { status: 204 }; } }
    const cur = d.versions.find((x: any) => x.versionNumber === d.currentVersion);
    if (sub === 'versions' && method === 'POST') {
      const sections = cur.sections.map((s: any) => { const e = body.sections.find((x: any) => x.id === s.id); return e && e.text !== s.text ? { ...s, text: e.text, origin: 'USER' } : s; });
      const changedIds = sections.filter((s: any, i: number) => s.text !== cur.sections[i].text).map((s: any) => s.id);
      if (!changedIds.length) return err(400, 'Nothing changed');
      const claims = [...cur.claims.filter((x: any) => !changedIds.includes(x.sectionId)), ...changedIds.map((id: string) => ({ sectionId: id, text: 'edited', label: 'USER_AUTHORED', evidence: null }))];
      d.currentVersion++; d.versions.push({ versionNumber: d.currentVersion, sections, claims, changeSummary: body.changeSummary ?? null, createdAt: nowIso() });
      return ok(view(d), 201);
    }
    if (sub === 'claims/validate' && method === 'POST') {
      const ph = cur.sections.flatMap((s: any) => (s.text.match(/\[add [^\]]+\]/g) ?? []).map((p: string) => ({ sectionId: s.id, placeholder: p })));
      const ev = cur.claims.filter((x: any) => x.label === 'EVIDENCED').length;
      return ok({ ok: ph.length === 0, evidenced: ev, userAuthored: cur.claims.length - ev, stale: [], placeholders: ph });
    }
    if (sub === 'diff') { const [a, b] = [d.versions[d.versions.length - 2], d.versions[d.versions.length - 1]]; if (!a) return err(404, 'Version not found'); return ok({ from: a.versionNumber, to: b.versionNumber, sections: b.sections.map((s: any) => { const x = a.sections.find((y: any) => y.id === s.id); return { id: s.id, heading: s.heading, status: !x ? 'ADDED' : x.text === s.text ? 'UNCHANGED' : 'CHANGED', before: x?.text ?? null, after: s.text }; }) }); }
    if (sub?.startsWith('export/') && method === 'POST') return ok(cur.sections.map((s: any) => s.text).join('\n\n'));
  }
  if (m?.[2] === undefined && /\/diff$/.test(path)) return null;
  return null;
}

/** Entry point called from mock-api.ts (one small insertion before the final 404). */
export function handlePlatformTools(state: object, method: string, path: string, body: any, search?: URLSearchParams): Reply | null {
  const st = pstore(state);
  const handlers: Array<(s: Store, m: string, p: string, b: any, state: any, search?: URLSearchParams) => Reply | null> = [ai, webhooks, careerPath, clipper, portal, copilot, careerDocs];
  for (const h of handlers) { const r = h(st, method, path, body, state as any, search); if (r) return r; }
  return null;
}
