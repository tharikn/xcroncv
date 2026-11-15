/**
 * In-memory fake for doc 07 (ATS engine). Mirrors the API rules the UI depends on: own score and version, per-dimension weights,
 * N/A redistribution, "not found in this resume" wording, evidence excerpts, owner-scoped history. State is per test (WeakMap).
 * Job descriptions come from the insights mock (same /job-descriptions routes), so a posting added on /match is usable here.
 */
export interface Reply { status: number; data?: unknown }
const ok = (data: unknown, status = 200): Reply => ({ status, data });
const err = (status: number, message: string): Reply => ({ status, data: { message } });

const DIMS = [
  { id: 'required_skills', label: 'Required skills match', weight: 20, needsJob: true, what: 'Required skills with direct resume evidence' },
  { id: 'preferred_skills', label: 'Preferred skills match', weight: 10, needsJob: true, what: 'Preferred skills with direct or related evidence' },
  { id: 'experience', label: 'Relevant experience evidence', weight: 20, needsJob: true, what: 'Years of experience and skills shown in real work, not only listed' },
  { id: 'role_title', label: 'Role and title relevance', weight: 10, needsJob: true, what: 'Job title and level' },
  { id: 'keyword_coverage', label: 'Keyword coverage', weight: 10, needsJob: true, what: 'Share of distinct posting keywords found on the resume' },
  { id: 'semantic', label: 'Semantic relevance (lexical)', weight: 10, needsJob: true, what: 'Word-overlap similarity; no AI model' },
  { id: 'structure', label: 'Structure and parseability', weight: 10, needsJob: false, what: 'Headings, contact details, dates, order' },
  { id: 'clarity', label: 'Content clarity and completeness', weight: 10, needsJob: false, what: 'Summary, bullets, outcomes, length' },
];
const DISCLAIMER = 'This is an internal ATS compatibility estimate for this resume and this posting. Employer systems use their own parsing and ranking rules, so it does not predict whether any system will pass or rank you.';

interface Store { seq: number; reports: any[] }
const stores = new WeakMap<object, Store>();
const store = (s: object): Store => { let x = stores.get(s); if (!x) { x = { seq: 0, reports: [] }; stores.set(s, x); } return x; };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(900000 + n).padStart(12, '0')}`;

function resumeText(model: any) {
  const work: string[] = []; const listed: string[] = [];
  for (const s of model.sections) {
    if (s.type === 'experience') for (const it of s.items ?? []) work.push([it.title, it.subtitle, ...(it.bullets ?? [])].join(' '));
    else if (s.type === 'skills') for (const it of s.items ?? []) listed.push((it.tags ?? []).join(' '));
  }
  return { work: work.join(' ').toLowerCase(), listed: listed.join(' ').toLowerCase() };
}

function evaluate(model: any, jd: any) {
  const { work, listed } = resumeText(model);
  const items: any[] = [];
  for (const r of jd.requirements.filter((q: any) => q.included && (q.type === 'required_skill' || q.type === 'preferred_skill'))) {
    const t = r.label.toLowerCase();
    const dimension = r.type === 'required_skill' ? 'required_skills' : 'preferred_skills';
    const status = work.includes(t) ? 'exact' : listed.includes(t) ? 'partial' : 'missing';
    const points = status === 'exact' ? 1 : status === 'partial' ? 0.5 : 0;
    items.push({
      key: r.id, label: r.label, dimension, status, points, method: 'exact_keyword',
      explanation: status === 'exact' ? `"${r.label}" appears where you describe your work.` : status === 'partial' ? `"${r.label}" is listed but not shown in a job or project.` : `No evidence of "${r.label}" found in this resume.`,
      evidence: status === 'exact' ? [{ section: 'experience', itemTitle: 'Senior Backend Engineer', excerpt: `Used ${r.label} in production services.` }] : [],
      action: status === 'exact' ? undefined : `Add "${r.label}" only if it reflects work you have actually done.`,
    });
    items.push({ key: `kw:${r.id}`, label: r.label, dimension: 'keyword_coverage', status: status === 'missing' ? 'missing' : status, points, method: 'keyword_once', explanation: status === 'missing' ? `"${r.label}" was not found anywhere on this resume.` : `"${r.label}" appears on the resume.`, evidence: [] });
  }
  const email = (model.header.contacts ?? []).some((c: string) => c.includes('@'));
  items.push({ key: 'contact', label: 'Name, email and phone present', dimension: 'structure', status: email ? 'pass' : 'fail', points: email ? 1 : 0.4, method: 'structure_rule', explanation: email ? 'Name, email and phone are present in the header.' : 'Missing from the header: email.', evidence: [], action: email ? undefined : 'Add the missing contact details to your profile so they appear in the header.' });
  const hasSummary = model.sections.some((s: any) => s.type === 'summary' && s.text);
  items.push({ key: 'summary', label: 'Summary present and concise', dimension: 'clarity', status: hasSummary ? 'pass' : 'fail', points: hasSummary ? 1 : 0.3, method: 'clarity_rule', explanation: hasSummary ? 'The summary is 22 words.' : 'No summary was found.', evidence: [], action: hasSummary ? undefined : 'Write two to four sentences on your role, strengths and focus.' });

  const dims = DIMS.map((d) => {
    const own = items.filter((i) => i.dimension === d.id);
    const score = own.length ? Math.round((own.reduce((a, i) => a + i.points, 0) / own.length) * 100) : null;
    return { id: d.id, label: d.label, weight: d.weight, applicable: score !== null, effectiveWeight: 0, score, maxScore: 100, itemCount: own.length, matched: [], weak: [], missing: [],
      explanation: score === null ? 'Not applicable: the posting gave nothing to evaluate here, so its weight was redistributed, not scored as zero.' : `${own.filter((i) => i.points >= 0.8).length} of ${own.length} items fully supported. ${d.what}.` };
  });
  const aw = dims.filter((d) => d.applicable).reduce((a, d) => a + d.weight, 0);
  dims.forEach((d) => { d.effectiveWeight = d.applicable ? Math.round((d.weight / aw) * 1000) / 10 : 0; });
  const score = Math.round(dims.filter((d) => d.applicable).reduce((a, d) => a + d.weight * d.score!, 0) / aw);
  const limitations = ['Structure checks use the same render model as preview and export; they do not read an exported file (see the Parsing Test).'];
  if (jd.confirmationStatus !== 'CONFIRMED') limitations.unshift('You have not confirmed the extracted requirements yet.');
  if (aw < 100) limitations.push(`${100 - aw}% of the weight belongs to dimensions with nothing to evaluate; it was redistributed.`);
  return {
    score, dimensions: dims, items,
    coverage: { applicableWeight: aw, requirementsIncluded: jd.requirements.filter((q: any) => q.included).length, confidence: jd.confirmationStatus === 'CONFIRMED' ? 'high' : 'medium', limitations },
    strongMatches: items.filter((i) => i.dimension === 'required_skills' && i.points >= 0.8).map((i) => i.label),
    weakOrMissing: items.filter((i) => ['required_skills', 'preferred_skills'].includes(i.dimension) && i.points < 0.8).map((i) => i.label),
    improvements: items.filter((i) => i.action).map((i) => `${i.label}: ${i.action}`),
  };
}

/** `jdOf(id)` returns the stored job description (with requirements) or null; `modelFor(resume)` the render model. */
export function handleAts(state: any, method: string, path: string, body: any, jdOf: (id: string) => any, modelFor: (resume: any) => any): Reply | null {
  if (path === '/ats/model' && method === 'GET') return ok({ atsVersion: 'ats-1.0.0', taxonomyVersion: '1.0.0', disclaimer: DISCLAIMER, dimensions: DIMS });
  const st = store(state);
  const rm = /^\/resumes\/([^/]+)\/ats-reports$/.exec(path);
  if (rm) {
    const resume = state.resumes.find((r: any) => r.id === rm[1]); if (!resume) return err(404, 'Resume not found');
    if (method === 'GET') return ok(st.reports.filter((r) => r.resumeId === resume.id).map((r) => ({ id: r.id, resumeId: r.resumeId, resumeVersionNumber: r.resumeVersionNumber, jobDescriptionId: r.job.id, jdTitle: r.job.title, jdCompany: r.job.company, atsVersion: r.atsVersion, score: r.score, createdAt: r.createdAt })).reverse());
    if (method === 'POST') {
      const jd = jdOf(body.jobDescriptionId); if (!jd) return err(404, 'Job description not found');
      let versionNumber: number | null = null;
      if (body.resumeVersionId) {
        const v = (state.versions[resume.id] ?? []).find((x: any) => x.id === body.resumeVersionId);
        if (!v) return err(404, 'Resume version not found');
        versionNumber = v.versionNumber;
      }
      const res = evaluate(modelFor(resume), jd);
      const report = { id: uuid(++st.seq), resumeId: resume.id, resumeName: resume.name, resumeVersionId: body.resumeVersionId ?? null, resumeVersionNumber: versionNumber, atsVersion: 'ats-1.0.0', taxonomyVersion: '1.0.0',
        job: { id: jd.id, title: jd.title, company: jd.company ?? null, revision: jd.revision, confirmed: jd.confirmationStatus === 'CONFIRMED' }, ...res, disclaimer: DISCLAIMER, createdAt: new Date().toISOString() };
      st.reports.push(report);
      return ok(report, 201);
    }
  }
  const rr = /^\/ats-reports\/([^/]+)$/.exec(path);
  if (rr) {
    const rep = st.reports.find((r) => r.id === rr[1]); if (!rep) return err(404, 'ATS report not found');
    if (method === 'GET') return ok(rep);
    if (method === 'DELETE') { st.reports = st.reports.filter((r) => r !== rep); return { status: 204 }; }
  }
  return null;
}
