/**
 * In-memory fakes for modules 33 (application vault), 34 (career readiness), 35 (interview preparation) and
 * 36 (feedback sharing). They mirror the API rules the UI depends on (immutable version references, evidence levels with no
 * score, resume-grounded vs general questions, consent + expiry + revoke) in a small form. State is per test (WeakMap).
 */
export interface Reply { status: number; data?: unknown }
const ok = (data: unknown, status = 200): Reply => ({ status, data });
const err = (status: number, message: string): Reply => ({ status, data: { message } });

interface Store { seq: number; vault: any[]; plans: any[]; preps: any[]; shares: any[]; feedback: any[] }
const stores = new WeakMap<object, Store>();
export function rstore(state: object): Store {
  let s = stores.get(state);
  if (!s) { s = { seq: 0, vault: [], plans: [], preps: [], shares: [], feedback: [] }; stores.set(state, s); }
  return s;
}
const uuid = (st: Store) => `00000000-0000-4000-8000-${String(900000 + ++st.seq).padStart(12, '0')}`;
const nowIso = () => new Date().toISOString();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text: string, term: string) => new RegExp(`(^|[^a-z0-9+#])${esc(term.trim().toLowerCase())}(?![a-z0-9+#])`, 'i').test(text);

// ---------------------------------------------------------------- resume helpers
const resumeOf = (state: any, id: string) => state.resumes.find((r: any) => r.id === id);
function versionFor(state: any, resumeId: string, versionId?: string) {
  const list: any[] = state.versions[resumeId] ?? [];
  return versionId ? list.find((v) => v.id === versionId) : [...list].sort((a, b) => b.versionNumber - a.versionNumber)[0];
}
const latestNumber = (state: any, resumeId: string) => Math.max(0, ...(state.versions[resumeId] ?? []).map((v: any) => v.versionNumber));

// ---------------------------------------------------------------- module 33: vault
const vaultView = (state: any, e: any) => ({
  id: e.id, employerLabel: e.employerLabel, jobTitle: e.jobTitle ?? null, externalJobId: e.externalJobId ?? null, appliedOn: e.appliedOn,
  resume: { id: e.resumeId, versionId: e.versionId, versionNumber: e.versionNumber, contentHash: e.hash, versionAvailable: !!versionFor(state, e.resumeId, e.versionId), newerVersionExists: latestNumber(state, e.resumeId) > e.versionNumber },
  coverLetterVersionRef: e.coverLetterVersionRef ?? null, stage: e.stage, notes: e.notes ?? null, followUpOn: e.followUpOn ?? null, followUpDone: !!e.followUpDone,
  followUpOverdue: !!e.followUpOn && !e.followUpDone && e.followUpOn < nowIso().slice(0, 10), createdAt: e.createdAt, updatedAt: e.updatedAt,
});

function vault(state: any, st: Store, method: string, path: string, body: any, q: URLSearchParams): Reply | null {
  if (path === '/application-vault/reminders' && method === 'GET') {
    const today = nowIso().slice(0, 10); const dd = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
    const items: any[] = [];
    for (const e of st.vault) {
      if (['OFFER', 'REJECTED', 'WITHDRAWN'].includes(e.stage)) continue;
      const base = { entryId: e.id, employerLabel: e.employerLabel, jobTitle: e.jobTitle ?? null, stage: e.stage };
      if (e.followUpOn && !e.followUpDone) {
        const d = dd(e.followUpOn, today);
        if (d < 0) items.push({ ...base, kind: 'OVERDUE', dueOn: e.followUpOn, daysFromToday: d, label: `Follow-up was due ${-d} days ago` });
        else if (d === 0) items.push({ ...base, kind: 'DUE_TODAY', dueOn: e.followUpOn, daysFromToday: 0, label: 'Follow-up is due today' });
        else if (d <= 7) items.push({ ...base, kind: 'UPCOMING', dueOn: e.followUpOn, daysFromToday: d, label: `Follow-up due in ${d} days` });
      } else if (!e.followUpOn && e.stage === 'APPLIED' && dd(today, e.appliedOn) >= 14) {
        items.push({ ...base, kind: 'SUGGESTED', dueOn: null, daysFromToday: -dd(today, e.appliedOn), label: `Applied ${dd(today, e.appliedOn)} days ago with no follow-up date. Suggestion only: consider a polite check-in.` });
      }
    }
    return ok({ today, counts: { overdue: 0, dueToday: 0, upcoming: 0, suggested: 0 }, items });
  }
  const sn = /^\/application-vault\/([^/]+)\/snooze$/.exec(path);
  if (sn && method === 'POST') {
    const e = st.vault.find((x) => x.id === sn[1]); if (!e) return err(404, 'Vault entry not found');
    const d = new Date(Date.now() + body.days * 86_400_000).toISOString().slice(0, 10); e.followUpOn = d; e.followUpDone = false;
    return ok(vaultView(state, e));
  }
  if (path === '/application-vault') {
    if (method === 'GET') {
      const emp = (q.get('employer') ?? '').toLowerCase(); const stage = q.get('stage');
      return ok(st.vault.filter((e) => (!emp || e.employerLabel.toLowerCase().includes(emp)) && (!stage || e.stage === stage)).map((e) => vaultView(state, e)));
    }
    if (method === 'POST') {
      if (!resumeOf(state, body.resumeId)) return err(404, 'Resume not found');
      const v = versionFor(state, body.resumeId, body.resumeVersionId);
      if (!v) return body.resumeVersionId ? err(404, 'Resume version not found') : err(400, 'Save a version of this resume first: the vault records an immutable version, not a working draft.');
      if (!body.employerLabel?.trim()) return err(400, 'employerLabel should not be empty');
      const e = {
        id: uuid(st), employerLabel: body.employerLabel, jobTitle: body.jobTitle, externalJobId: body.externalJobId, appliedOn: body.appliedOn, resumeId: body.resumeId,
        versionId: v.id, versionNumber: v.versionNumber, hash: `hash${String(v.versionNumber).padStart(2, '0')}abcdef1234567890`, coverLetterVersionRef: body.coverLetterVersionRef,
        stage: body.stage ?? 'APPLIED', notes: body.notes, followUpOn: body.followUpOn, followUpDone: false, createdAt: nowIso(), updatedAt: nowIso(),
      };
      st.vault.unshift(e);
      return ok(vaultView(state, e), 201);
    }
  }
  const m = /^\/application-vault\/([^/]+)$/.exec(path);
  if (!m) return null;
  const e = st.vault.find((x) => x.id === m[1]);
  if (!e) return err(404, 'Vault entry not found');
  if (method === 'GET') return ok(vaultView(state, e));
  if (method === 'PATCH') {
    for (const k of ['stage', 'notes', 'jobTitle', 'coverLetterVersionRef', 'followUpOn', 'followUpDone']) if (body[k] !== undefined) e[k] = body[k];
    e.updatedAt = nowIso();
    return ok(vaultView(state, e));
  }
  if (method === 'DELETE') { st.vault = st.vault.filter((x) => x !== e); return ok(undefined, 204); }
  return null;
}

// ---------------------------------------------------------------- module 34: readiness
const LABEL: Record<string, string> = { DEMONSTRATED: 'in your recorded work experience', PROJECT: 'in a recorded project', CERTIFICATION: 'in a certification', SELF_REPORTED: 'as a listed skill' };
const RELATED = [['postgresql', 'mysql', 'sql'], ['react', 'angular', 'vue'], ['docker', 'kubernetes'], ['aws', 'azure', 'gcp']];
function evidence(profile: any, skill: string) {
  const sources: any[] = []; let level = 'NONE'; const rank: any = { NONE: 0, SELF_REPORTED: 1, CERTIFICATION: 2, PROJECT: 3, DEMONSTRATED: 4 };
  const bump = (l: string) => { if (rank[l] > rank[level]) level = l; };
  for (const e of profile.experiences ?? []) if (has([e.jobTitle, ...(e.bullets ?? []).map((b: any) => b.content)].join('\n'), skill)) { sources.push({ type: 'EXPERIENCE', id: e.id, label: `${e.jobTitle} at ${e.employerName}` }); bump('DEMONSTRATED'); }
  for (const p of profile.projects ?? []) if (has([p.name, p.description ?? '', ...(p.technologies ?? [])].join('\n'), skill)) { sources.push({ type: 'PROJECT', id: p.id, label: p.name }); bump('PROJECT'); }
  for (const c of profile.certifications ?? []) if (has(c.name, skill)) { sources.push({ type: 'CERTIFICATION', id: c.id, label: c.name }); bump('CERTIFICATION'); }
  for (const s of profile.skills ?? []) if (s.name.toLowerCase() === skill.toLowerCase()) { sources.push({ type: 'SKILL', id: s.id, label: s.name }); bump('SELF_REPORTED'); }
  return { level, sources };
}
function analyse(profile: any, skills: any[]) {
  return skills.map((t) => {
    const { level, sources } = evidence(profile, t.name);
    const transferableFrom: any[] = [];
    if (level === 'NONE' || level === 'SELF_REPORTED') {
      for (const g of RELATED) if (g.includes(t.name.toLowerCase())) for (const r of g) if (r !== t.name.toLowerCase()) { const ev = evidence(profile, r); if (['PROJECT', 'DEMONSTRATED'].includes(ev.level)) transferableFrom.push({ skill: r, level: ev.level, sources: ev.sources }); }
    }
    const statement = level === 'NONE' ? `No recorded evidence of ${t.name} yet. This does not mean you lack it; it means your profile does not show it.`
      : level === 'SELF_REPORTED' ? `${t.name} is listed as a skill, but no experience or project shows it in use.` : `${t.name} appears ${LABEL[level]}.`;
    return { skill: t.name, importance: t.importance, level, sources, transferableFrom, statement };
  });
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function milestonesFor(analysis: any[]) {
  return analysis.filter((a) => a.level === 'NONE' || a.level === 'SELF_REPORTED').map((a) => ({
    id: `m-${slug(a.skill)}`, skill: a.skill, status: 'OPEN', origin: 'RECOMMENDATION',
    title: a.level === 'NONE' ? `Practise ${a.skill} with a small project or exercise, then add it to your profile` : `Add one concrete example of using ${a.skill} to your experience or projects`,
  }));
}
function summary(analysis: any[]) {
  const counts: any = { DEMONSTRATED: 0, PROJECT: 0, CERTIFICATION: 0, SELF_REPORTED: 0, NONE: 0 };
  for (const a of analysis) counts[a.level]++;
  return { total: analysis.length, counts, requiredWithoutEvidence: analysis.filter((a) => a.importance === 'required' && a.level === 'NONE').map((a) => a.skill), note: 'Counts of recorded evidence by kind. This is not a score and does not predict hiring outcomes.' };
}
const planView = (p: any) => ({ id: p.id, targetRole: p.targetRole, analysis: p.analysis, summary: summary(p.analysis), milestones: p.milestones, analysisVersion: 'readiness-1', updatedAt: p.updatedAt });

function readiness(state: any, st: Store, method: string, path: string, body: any): Reply | null {
  if (path === '/readiness-plans/import-sources' && method === 'GET') {
    return ok({ jobDescriptions: [{ id: 'jd-1', title: 'Senior Platform Engineer', company: 'Acme' }], roles: [{ id: 'backend-engineer', title: 'Backend Engineer', family: 'Engineering' }] });
  }
  if (path === '/readiness-plans/import-preview' && method === 'POST') {
    if (body.source === 'JOB_DESCRIPTION' && body.id === 'jd-1') return ok({ source: 'JOB_DESCRIPTION', sourceId: 'jd-1', targetRole: 'Senior Platform Engineer', skills: [{ name: 'Kubernetes', importance: 'required' }, { name: 'Terraform', importance: 'required' }, { name: 'Kafka', importance: 'preferred' }], note: 'Imported from your saved job description. Review and edit before creating a plan; nothing is added to your profile.' });
    if (body.source === 'CAREER_PATH_ROLE' && body.id === 'backend-engineer') return ok({ source: 'CAREER_PATH_ROLE', sourceId: 'backend-engineer', targetRole: 'Backend Engineer', skills: [{ name: 'SQL', importance: 'required' }, { name: 'Docker', importance: 'required' }], note: 'Imported from career-path taxonomy v1. These are typical skills for the role, not a guarantee of any hiring outcome. Review and edit before creating a plan.' });
    return err(404, 'Not found');
  }
  if (path === '/readiness-plans') {
    if (method === 'GET') return ok(st.plans.map((p) => ({ id: p.id, targetRole: p.targetRole, summary: summary(p.analysis), openMilestones: p.milestones.filter((m: any) => m.status === 'OPEN').length, updatedAt: p.updatedAt })));
    if (method === 'POST') {
      if (!state.profile) return err(404, 'Create your career profile first: readiness is compared against recorded evidence.');
      const seen = new Set<string>(); const skills = (body.skills ?? []).filter((s: any) => { const k = s.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
      const analysis = analyse(state.profile, skills);
      const p = { id: uuid(st), targetRole: body.targetRole, skills, analysis, milestones: milestonesFor(analysis), updatedAt: nowIso() };
      st.plans.unshift(p);
      return ok(planView(p), 201);
    }
  }
  const m = /^\/readiness-plans\/([^/]+)(?:\/(refresh|milestones)(?:\/([^/]+))?)?$/.exec(path);
  if (!m) return null;
  const p = st.plans.find((x) => x.id === m[1]);
  if (!p) return err(404, 'Plan not found');
  if (!m[2]) {
    if (method === 'GET') return ok(planView(p));
    if (method === 'DELETE') { st.plans = st.plans.filter((x) => x !== p); return ok(undefined, 204); }
  }
  if (m[2] === 'refresh' && method === 'POST') {
    p.analysis = analyse(state.profile, p.skills);
    const ids = new Set(p.milestones.map((x: any) => x.id));
    p.milestones = [...p.milestones, ...milestonesFor(p.analysis).filter((x) => !ids.has(x.id))];
    return ok(planView(p));
  }
  if (m[2] === 'milestones' && !m[3] && method === 'POST') { p.milestones.push({ id: `u-${uuid(st).slice(-6)}`, title: body.title, skill: body.skill, status: 'OPEN', origin: 'USER' }); return ok(planView(p), 201); }
  if (m[2] === 'milestones' && m[3] && method === 'PATCH') {
    const ms = p.milestones.find((x: any) => x.id === m[3]);
    if (!ms) return err(404, 'Milestone not found');
    Object.assign(ms, Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)));
    return ok(planView(p));
  }
  return null;
}

// ---------------------------------------------------------------- module 35: interview prep
function questionsFor(profile: any, b: any) {
  const qs: any[] = []; let n = 0;
  const add = (q: any) => qs.push({ id: `q-${++n}`, practiced: false, ...q });
  add({ category: 'RESUME_WALKTHROUGH', grounding: 'GENERAL', text: 'Walk me through your resume in about two minutes.', hint: 'Lead with the through-line of your career.' });
  (profile.experiences ?? []).forEach((e: any, i: number) => {
    const bullet = e.bullets?.[0]?.content;
    if (bullet) add({ category: 'BEHAVIOURAL', grounding: 'RESUME', text: `Your resume says: "${bullet}". Tell me about a specific time that happened: what was the situation and what did you do?`, hint: 'Use STAR: the Situation, your Task, the Actions you took, and the Result. Only describe what you actually did.', evidence: { ref: `experience[${i}].bullets[0]`, excerpt: bullet } });
  });
  for (const sk of (profile.skills ?? []).slice(0, 3)) {
    const used = (profile.experiences ?? []).some((e: any) => has((e.bullets ?? []).map((x: any) => x.content).join('\n'), sk.name));
    if (used) add({ category: 'TECHNICAL', grounding: 'RESUME', text: `You used ${sk.name} in your work. Describe a concrete problem you solved with it.`, hint: 'Name the decision and the outcome.', evidence: { ref: 'experience[0]', excerpt: sk.name } });
    else add({ category: 'TECHNICAL', grounding: 'GENERAL', notOnResume: true, text: `General knowledge: what are the core concepts of ${sk.name} and when would you choose it?`, hint: `${sk.name} is listed as a skill but your resume does not show it in use. Answer from knowledge and do not imply work experience.` });
  }
  if (b.roleTitle) add({ category: 'JOB_SPECIFIC', grounding: 'GENERAL', text: `Why are you interested in the ${b.roleTitle} role${b.company ? ` at ${b.company}` : ''}?`, hint: 'Connect the role to specific things you have done or want to learn.' });
  const text = JSON.stringify(profile).toLowerCase();
  for (const sk of b.focusSkills ?? []) {
    if (!has(text, sk)) add({ category: 'GAP_PREPARATION', grounding: 'GENERAL', notOnResume: true, text: `This job emphasises ${sk}. Your resume does not show it. How would you describe your familiarity and how would you get up to speed?`, hint: 'Be honest and describe a concrete learning plan.' });
  }
  return qs;
}
function feedbackFor(q: any, answer: string, profile: any) {
  const wc = (answer.match(/\S+/g) ?? []).length;
  const star = { situation: /\b(when|during|at the time)\b/i.test(answer), task: /\b(my role|needed to|responsible)\b/i.test(answer), action: /\bI [a-z]+ed\b/.test(answer), result: /\b(result|reduced|increased|improved)\b|\d+%/i.test(answer) };
  const count = Object.values(star).filter(Boolean).length;
  const corpus = JSON.stringify(profile).toLowerCase();
  const unsupportedTerms = ['kafka', 'spark', 'terraform'].filter((t) => has(answer, t) && !has(corpus, t) && !has(q.text, t));
  const r = (v: string, tip: string) => ({ rating: v, tip });
  return {
    relevance: r(wc < 8 ? 'improve' : 'ok', wc < 8 ? 'Too short to judge relevance. Answer the question that was asked.' : 'Tie your answer back to the specific question.'),
    structure: count >= 4 ? r('strong', 'Situation, task, action and result are all present.') : r('improve', 'Cover more of STAR.'),
    clarity: wc < 30 ? r('improve', 'Aim for roughly 80 to 200 words (about a minute spoken).') : r('strong', 'Length and sentence size are easy to follow.'),
    specificity: /\d/.test(answer) ? r('strong', 'Good use of names, tools and numbers.') : r('improve', 'Be more specific: name the system, the size, the timeframe, or a measurable result.'),
    evidenceAlignment: unsupportedTerms.length ? r('improve', `You mention ${unsupportedTerms.join(', ')}, which is not on this resume version. Only say it if it is true.`) : r('ok', 'Use a real example from your resume where you can.'),
    starCoverage: star, unsupportedTerms, wordCount: wc,
    note: 'Text-only practice feedback from a fixed rubric. It is guidance, not a score, and says nothing about voice, accent, appearance or personality.',
  };
}
const prepView = (p: any) => ({ id: p.id, title: p.title, roleTitle: p.roleTitle ?? null, company: p.company ?? null, resumeId: p.resumeId, resumeVersionId: p.resumeVersionId ?? null, generator: 'deterministic-1', questions: p.questions, progress: { total: p.questions.length, practiced: p.questions.filter((q: any) => q.practiced).length }, updatedAt: p.updatedAt });

function interview(state: any, st: Store, method: string, path: string, body: any): Reply | null {
  if (path === '/interview-preps') {
    if (method === 'GET') return ok(st.preps.map((p) => { const v = prepView(p); return { id: v.id, title: v.title, roleTitle: v.roleTitle, company: v.company, progress: v.progress, updatedAt: v.updatedAt }; }));
    if (method === 'POST') {
      const r = resumeOf(state, body.resumeId);
      if (!r) return err(404, 'Resume not found');
      if (body.resumeVersionId && !versionFor(state, body.resumeId, body.resumeVersionId)) return err(404, 'Resume version not found');
      const p = { id: uuid(st), title: body.title || `${r.name} practice`, resumeId: r.id, resumeVersionId: body.resumeVersionId, roleTitle: body.roleTitle, company: body.company, questions: questionsFor(state.profile ?? {}, body), updatedAt: nowIso() };
      st.preps.unshift(p);
      return ok(prepView(p), 201);
    }
  }
  const m = /^\/interview-preps\/([^/]+)(?:\/questions\/([^/]+)(?:\/(feedback))?)?$/.exec(path);
  if (!m) return null;
  const p = st.preps.find((x) => x.id === m[1]);
  if (!p) return err(404, 'Practice session not found');
  if (!m[2]) {
    if (method === 'GET') return ok(prepView(p));
    if (method === 'DELETE') { st.preps = st.preps.filter((x) => x !== p); return ok(undefined, 204); }
    return null;
  }
  const q = p.questions.find((x: any) => x.id === m[2]);
  if (!q) return err(404, 'Question not found');
  if (m[3] === 'feedback' && method === 'POST') { q.answer = body.answer; q.feedback = feedbackFor(q, body.answer, state.profile ?? {}); q.practiced = true; return ok(prepView(p)); }
  if (!m[3] && method === 'PATCH') {
    if (body.answer !== undefined) { if (body.answer !== q.answer) q.feedback = null; q.answer = body.answer; }
    if (body.practiced !== undefined) q.practiced = body.practiced;
    return ok(prepView(p));
  }
  return null;
}

// ---------------------------------------------------------------- module 36: feedback sharing
const shareStatus = (s: any) => (s.revokedAt ? 'REVOKED' : new Date(s.expiresAt).getTime() <= Date.now() ? 'EXPIRED' : 'ACTIVE');
const shareView = (st: Store, s: any) => ({
  id: s.id, resumeId: s.resumeId, versionNumber: s.versionNumber, recipientLabel: s.recipientLabel, purpose: 'FEEDBACK', permissions: s.permissions, status: shareStatus(s),
  expiresAt: s.expiresAt, revokedAt: s.revokedAt, feedbackCount: st.feedback.filter((f) => f.shareId === s.id).length, createdAt: s.createdAt,
});
const classify = (c: string) => (c.includes('@') ? 'email' : (c.match(/\d/g) ?? []).length >= 7 ? 'phone' : 'location');

function sharing(state: any, st: Store, method: string, path: string, body: any): Reply | null {
  if (path === '/feedback-shares') {
    if (method === 'GET') return ok([...st.shares].reverse().map((s) => shareView(st, s)));
    if (method === 'POST') {
      if (body.consent !== true) return err(400, 'Sharing needs your explicit confirmation. Nothing is shared by default.');
      if (!resumeOf(state, body.resumeId)) return err(404, 'Resume version not found');
      const v = versionFor(state, body.resumeId, body.resumeVersionId);
      if (!v) return body.resumeVersionId ? err(404, 'Resume version not found') : err(400, 'Save a version of this resume first: only an immutable saved version can be shared.');
      const s = {
        id: uuid(st), resumeId: body.resumeId, versionNumber: v.versionNumber, recipientLabel: body.recipientLabel, permissions: { sections: body.sections, contacts: body.contacts, links: body.links ?? 'hidden' },
        expiresAt: new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString(), revokedAt: null, createdAt: nowIso(),
      };
      st.shares.push(s);
      return ok(shareView(st, s), 201);
    }
  }
  const m = /^\/feedback-shares\/([^/]+)(?:\/(revoke|preview|feedback|summary)(?:\/([^/]+))?)?$/.exec(path);
  if (!m) return null;
  const s = st.shares.find((x) => x.id === m[1]);
  if (!s) return err(404, 'Share not found');
  const sub = m[2];
  if (!sub) {
    if (method === 'GET') return ok(shareView(st, s));
    if (method === 'DELETE') { st.shares = st.shares.filter((x) => x !== s); st.feedback = st.feedback.filter((f) => f.shareId !== s.id); return ok(undefined, 204); }
  }
  if (sub === 'revoke' && method === 'POST') { s.revokedAt ??= nowIso(); return ok(shareView(st, s)); }
  if (sub === 'preview' && method === 'GET') {
    const status = shareStatus(s);
    if (status !== 'ACTIVE') return err(410, status === 'REVOKED' ? 'This share was revoked.' : 'This share has expired.');
    const model = (state.resumes.find((r: any) => r.id === s.resumeId) && state.profile) ?? {};
    const contacts = [model.email, model.phone, model.location].filter(Boolean).filter((c: string) => s.permissions.contacts[classify(c)] === 'visible');
    const titles: Record<string, string> = { summary: 'Summary', experience: 'Experience', skills: 'Skills', education: 'Education', projects: 'Projects', certifications: 'Certifications', languages: 'Languages' };
    return ok({ shareId: s.id, versionNumber: s.versionNumber, recipientLabel: s.recipientLabel, readOnly: true, expiresAt: s.expiresAt, resume: { header: { name: model.fullName ?? 'Candidate', headline: model.headline, contacts, links: [] }, sections: s.permissions.sections.map((k: string) => ({ type: k, title: titles[k] })) } });
  }
  if (sub === 'feedback' && !m[3]) {
    if (method === 'GET') return ok(st.feedback.filter((f) => f.shareId === s.id).reverse());
    if (method === 'POST') {
      const status = shareStatus(s);
      if (status !== 'ACTIVE') return err(410, status === 'REVOKED' ? 'This share was revoked; it no longer accepts feedback.' : 'This share has expired; it no longer accepts feedback.');
      if (!body.comment && !['clarity', 'relevance', 'evidence', 'presentation'].some((k) => body[k] != null)) return err(400, 'Add at least one rating or a comment.');
      const f = { id: uuid(st), shareId: s.id, clarity: body.clarity ?? null, relevance: body.relevance ?? null, evidence: body.evidence ?? null, presentation: body.presentation ?? null, comment: body.comment ?? null, status: 'NEW', decisionNote: null, appliedVersionNumber: null, decidedAt: null, createdAt: nowIso() };
      st.feedback.push(f);
      return ok(f, 201);
    }
  }
  if (sub === 'feedback' && m[3] && method === 'PATCH') {
    const f = st.feedback.find((x) => x.id === m[3] && x.shareId === s.id);
    if (!f) return err(404, 'Feedback not found');
    f.status = body.decision; f.decisionNote = body.note ?? null; f.decidedAt = nowIso();
    return ok(f);
  }
  if (sub === 'summary' && method === 'GET') {
    const rows = st.feedback.filter((f) => f.shareId === s.id);
    const dim = (k: string) => { const v = rows.map((r) => r[k]).filter((x) => typeof x === 'number'); return { count: v.length, average: v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null }; };
    return ok({
      entries: rows.length, accepted: rows.filter((r) => r.status === 'ACCEPTED').length, declined: rows.filter((r) => r.status === 'DECLINED').length, pending: rows.filter((r) => r.status === 'NEW').length,
      dimensions: { clarity: dim('clarity'), relevance: dim('relevance'), evidence: dim('evidence'), presentation: dim('presentation') },
      note: rows.length < 3 ? 'Based on very little feedback; treat it as one or two opinions, not a verdict.' : 'Averages of recipient ratings, 1 (low) to 5 (high). You decide what to act on.',
    });
  }
  return null;
}

export function handleReadinessTools(state: any, method: string, path: string, body: any, query: URLSearchParams = new URLSearchParams()): Reply | null {
  const st = rstore(state);
  return vault(state, st, method, path, body, query) ?? readiness(state, st, method, path, body) ?? interview(state, st, method, path, body) ?? sharing(state, st, method, path, body);
}
