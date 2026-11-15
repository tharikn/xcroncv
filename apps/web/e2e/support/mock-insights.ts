/**
 * In-memory fakes for modules 23/29 (resume match), 20/31 (quality review) and 22 (recruiter view).
 * They mirror the API rules the UI depends on (requirements confirmation, evidence statuses, N/A weight redistribution,
 * separate scores, anonymisation, quick vs full) in a deliberately small form. State is per test (WeakMap on MockState).
 */
export interface Reply { status: number; data?: unknown }
const ok = (data: unknown, status = 200): Reply => ({ status, data });
const err = (status: number, message: string): Reply => ({ status, data: { message } });

interface Store { seq: number; jds: any[]; reports: any[]; reviews: any[] }
const stores = new WeakMap<object, Store>();
const store = (s: object): Store => { let x = stores.get(s); if (!x) { x = { seq: 0, jds: [], reports: [], reviews: [] }; stores.set(s, x); } return x; };

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TERMS: Array<[string, string]> = [['NestJS', 'nestjs'], ['PostgreSQL', 'postgresql'], ['TypeScript', 'typescript'], ['Docker', 'docker'], ['Kubernetes', 'kubernetes'], ['AWS', 'aws'], ['Terraform', 'terraform'], ['Python', 'python'], ['Node.js', 'nodejs'], ['Algorithms', 'algorithms'], ['Mathematics', 'mathematics']];

function extract(text: string) {
  const reqs: any[] = []; let section = 'required';
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^[\s\-*]+/, '').trim(); if (!line) continue;
    if (/^nice to have|^preferred/i.test(line)) { section = 'preferred'; continue; }
    if (/^responsibilit/i.test(line)) { section = 'responsibilities'; continue; }
    if (/^requirement/i.test(line)) { section = 'required'; continue; }
    const y = /(\d+)\+?\s*years/i.exec(line);
    if (y) reqs.push({ id: `r-y-${reqs.length}`, type: 'experience', label: `${y[1]}+ years of relevant experience`, minYears: +y[1], sourceText: line, confidence: 0.75, included: true, origin: 'EXTRACTED' });
    for (const [label] of TERMS) if (new RegExp(`\\b${label.replace('.', '\\.')}\\b`, 'i').test(line) && !reqs.some((r) => r.label === label)) {
      reqs.push({ id: `r-s-${reqs.length}`, type: section === 'preferred' ? 'preferred_skill' : 'required_skill', label, sourceText: line, confidence: 0.9, included: true, explicit: true, origin: 'EXTRACTED' });
    }
    if (section === 'responsibilities' && line.length > 20) reqs.push({ id: `r-p-${reqs.length}`, type: 'responsibility', label: line.slice(0, 120), sourceText: line, confidence: 0.8, included: true, origin: 'EXTRACTED' });
  }
  return reqs;
}

const jdView = (jd: any, extra: object = {}) => { const { rawText, ...rest } = jd; return { ...rest, hasRawText: !!rawText, ...extra }; };

function resumeText(model: any) {
  const work: string[] = []; const listed: string[] = [];
  for (const s of model.sections) {
    if (s.type === 'experience') for (const it of s.items ?? []) work.push([it.title, it.subtitle, ...(it.bullets ?? [])].join(' '));
    else if (s.type === 'skills') for (const it of s.items ?? []) listed.push((it.tags ?? []).join(' '));
    else if (s.type === 'summary') listed.push(s.text ?? '');
  }
  return { work: work.join(' ').toLowerCase(), listed: listed.join(' ').toLowerCase() };
}

function score(model: any, jd: any) {
  const { work, listed } = resumeText(model);
  const items = jd.requirements.filter((r: any) => r.included && (r.type === 'required_skill' || r.type === 'preferred_skill')).map((r: any) => {
    const t = r.label.toLowerCase();
    const status = work.includes(t) ? 'exact' : listed.includes(t) ? 'partial' : 'missing';
    const ev = status === 'exact' ? [{ section: 'experience', itemIndex: 0, itemTitle: 'Programmer', field: 'bullets', bulletIndex: 0, excerpt: `Mentions ${r.label} in work history` }] : status === 'partial' ? [{ section: 'skills', itemIndex: 0, field: 'tags', excerpt: r.label }] : [];
    return {
      requirementId: r.id, label: r.label, type: r.type, dimension: r.type === 'required_skill' ? 'required_skills' : 'preferred_skills', status, method: status === 'partial' ? 'listed_only' : 'exact_keyword', confidence: 0.9,
      points: status === 'exact' ? 1 : status === 'partial' ? 0.5 : 0, evidence: ev, sourceText: r.sourceText,
      explanation: status === 'exact' ? `${r.label} appears where you describe your work.` : status === 'partial' ? `${r.label} is listed but not shown in a job or project.` : `No evidence of ${r.label} found in this resume.`,
      action: status === 'exact' ? undefined : `Add ${r.label} only if it reflects work you have actually done.`,
    };
  });
  const dim = (id: string, label: string, weight: number) => {
    const xs = items.filter((i: any) => i.dimension === id);
    return { id, label, weight, applicable: xs.length > 0, effectiveWeight: 0, score: xs.length ? Math.round((xs.reduce((a: number, i: any) => a + i.points, 0) / xs.length) * 100) : null, itemCount: xs.length, explanation: xs.length ? `${xs.filter((i: any) => i.status === 'exact').length} of ${xs.length} evaluated items fully supported.` : 'Not applicable: the posting gave nothing to evaluate here. Its weight was redistributed.' };
  };
  const dims = [dim('required_skills', 'Required skills', 25), dim('experience', 'Relevant experience', 20), dim('role_seniority', 'Role and seniority', 15), dim('responsibilities', 'Responsibilities', 15), dim('preferred_skills', 'Preferred skills', 10), dim('education', 'Education and certifications', 5), dim('domain_tools', 'Domain, tools and keywords', 5), dim('semantic', 'Language similarity', 5)];
  const aw = dims.filter((d) => d.applicable).reduce((a, d) => a + d.weight, 0);
  dims.forEach((d) => { d.effectiveWeight = d.applicable ? Math.round((d.weight / aw) * 1000) / 10 : 0; });
  const total = aw ? Math.round(dims.filter((d) => d.applicable).reduce((a, d) => a + d.weight * d.score!, 0) / aw) : 0;
  const by = (s: string) => items.filter((i: any) => i.status === s).map((i: any) => i.label);
  const counts: any = { exact: 0, related: 0, partial: 0, missing: 0, not_evaluated: 0 }; items.forEach((i: any) => counts[i.status]++);
  return {
    totalScore: total, dimensions: dims, items,
    coverage: { applicableWeight: aw, dimensionsApplicable: dims.filter((d) => d.applicable).length, dimensionsTotal: 8, requirementsIncluded: jd.requirements.filter((r: any) => r.included).length, requirementsEvaluated: items.length, confidence: jd.confirmationStatus === 'CONFIRMED' && aw >= 80 ? 'high' : aw < 50 ? 'low' : 'medium',
      limitations: aw < 100 ? [`${100 - aw}% of the weight belongs to dimensions the posting or resume gave nothing to evaluate; it was redistributed.`] : [] },
    summary: { counts, strong: by('exact'), partial: by('partial'), related: by('related'), missing: by('missing'), notEvaluated: [], nextActions: items.filter((i: any) => i.action).map((i: any) => `${i.label}: ${i.action}`), disclaimer: 'This is a job-specific alignment score between this resume and this posting. It is not a hiring probability, a chance of selection or an employer ATS result. "Missing" means not found in this resume, not that you lack the skill.' },
  };
}

function findings(model: any) {
  const out: any[] = []; let n = 0;
  const f = (ruleId: string, category: string, severity: string, title: string, explanation: string, evidence: any, recommendation: string, confirm = false) =>
    out.push({ id: `f-${ruleId}-${n++}`, ruleId, ruleVersion: '1.0.0', category, severity, title, explanation, evidence, recommendation, confidence: 0.8, source: 'deterministic_rule', requiresUserConfirmation: confirm });
  if (!model.header.contacts.some((c: string) => c.includes('@'))) f('STRUCTURE.NO_EMAIL', 'structure', 'warning', 'No email address', 'Reviewers need a way to contact you.', { section: 'header', field: 'contacts' }, 'Add an email address to your profile.');
  if (!model.sections.some((s: any) => s.type === 'summary')) f('CONTENT.NO_SUMMARY', 'content', 'suggestion', 'No professional summary', 'A short summary helps a reviewer place you quickly.', { section: 'summary' }, 'Add two or three lines.');
  for (const s of model.sections) if (s.type === 'experience') (s.items ?? []).forEach((it: any, i: number) => (it.bullets ?? []).forEach((b: string, bi: number) => {
    const ev = { section: 'experience', itemIndex: i, itemTitle: it.title, field: 'bullets', bulletIndex: bi, text: b };
    if (/responsible for/i.test(b)) f('WRITING.WEAK_PHRASE', 'writing', 'suggestion', 'Phrase describes duty, not action', '"responsible for" describes a duty, not what you did.', ev, 'Lead with a specific action verb.');
    if (/^[a-z]/.test(b)) f('WRITING.LOWERCASE_START', 'writing', 'suggestion', 'Bullet starts with a lowercase letter', 'Inconsistent capitalisation looks careless.', ev, 'Capitalise the first word.');
    if (/world-class|best/i.test(b)) f('CONTENT.SUPERLATIVE', 'content', 'warning', 'Unsupported superlative', 'Cannot be verified from the resume.', ev, 'Replace with a fact.', true);
  }));
  if (!model.sections.length) f('EXPORT.NO_CONTENT', 'export', 'critical', 'Nothing to export', 'The resume has no content.', { section: 'document' }, 'Add content before exporting.');
  return out;
}

function review(model: any, resume: any, versionNumber: number | null, prev: any | null, id: string) {
  const fs = findings(model);
  const counts: any = { critical: 0, warning: 0, suggestion: 0, info: 0 }; fs.forEach((x) => counts[x.severity]++);
  const dims = ['writing:Writing and language:20', 'content:Content strength and evidence:25', 'structure:Structure and completeness:15', 'consistency:Consistency and credibility:15', 'readability:Readability and scanability:15', 'export:Technical and export quality:10'].map((d) => {
    const [cid, label, w] = d.split(':'); const mine = fs.filter((x) => x.category === cid);
    const ded = mine.reduce((a, x) => a + ({ critical: 30, warning: 10, suggestion: 3, info: 0 } as any)[x.severity], 0);
    return { id: cid, label, weight: +w, applicable: true, effectiveWeight: +w, score: Math.max(0, 100 - ded), findings: mine.length, note: mine.length ? `${mine.length} finding(s).` : 'No findings.' };
  });
  const sc = Math.round(dims.reduce((a, d) => a + d.weight * d.score!, 0) / 100);
  const readiness = counts.critical ? 'needs_attention' : counts.warning ? 'review_recommended' : 'ready';
  let comparison: any = null;
  if (prev) {
    const pids = new Set(prev.findings.map((x: any) => x.ruleId + JSON.stringify(x.evidence))); const cids = new Set(fs.map((x) => x.ruleId + JSON.stringify(x.evidence)));
    const resolved = prev.findings.filter((x: any) => !cids.has(x.ruleId + JSON.stringify(x.evidence))); const added = fs.filter((x) => !pids.has(x.ruleId + JSON.stringify(x.evidence)));
    const delta = sc - prev.score;
    comparison = { previousId: prev.id, previousScore: prev.score, scoreDelta: delta, scoringVersionChanged: false, newFindings: added.map(({ id: i, ruleId, severity, title }) => ({ id: i, ruleId, severity, title })), resolvedFindings: resolved.map(({ id: i, ruleId, severity, title }: any) => ({ id: i, ruleId, severity, title })),
      message: `${delta > 0 ? 'Up' : delta < 0 ? 'Down' : 'Unchanged'}${delta ? ' ' + Math.abs(delta) + ' points' : ''}: ${resolved.length} resolved, ${added.length} new.` };
  }
  return { id, resumeId: resume.id, resumeName: resume.name, resumeVersionId: null, resumeVersionNumber: versionNumber, scoringVersion: '1.0.0', score: sc, readiness, dimensions: dims,
    coverage: { applicableWeight: 100, dimensionsApplicable: 6, dimensionsTotal: 6, limitations: ['Spelling and grammar are only checked for mechanical problems (repeated words, spacing, capitalisation). Proofread yourself.'] },
    counts, findings: fs, disclaimer: 'A quality score reviews the resume itself. It is not a job match score, a parsing test, an employer ATS result or a prediction of any hiring outcome.', createdAt: new Date().toISOString(), comparison };
}

function recruiter(model: any, resume: any, q: URLSearchParams | undefined, opts: { mode: string; anonymize: boolean; annotations: boolean }) {
  const quick = opts.mode === 'quick'; const mask = (s?: string) => (opts.anonymize && s ? s.replace(/[\w.+-]+@[\w.-]+/g, '[email hidden]') : s);
  let hiddenItems = 0; let hiddenBullets = 0;
  const annotations = opts.annotations ? findings(model).filter((f) => ['writing', 'content', 'readability', 'consistency'].includes(f.category)).map((f) => ({ id: f.id, ruleId: f.ruleId, severity: f.severity, category: f.category, title: f.title, explanation: f.explanation, section: f.evidence.section, itemIndex: f.evidence.itemIndex, bulletIndex: f.evidence.bulletIndex })) : [];
  const sections = model.sections.map((s: any) => {
    const all = s.items ?? []; const limit = quick && s.type === 'experience' ? 1 : all.length;
    const items = all.map((it: any, index: number) => {
      const collapsed = index >= limit; const bl = it.bullets ?? []; const shown = collapsed ? [] : quick && s.type === 'experience' ? bl.slice(0, 1) : bl;
      hiddenBullets += bl.length - shown.length;
      return { index, title: it.title, subtitle: it.subtitle, meta: it.meta, text: collapsed ? undefined : it.text, bullets: shown.map((b: string, bi: number) => ({ index: bi, text: mask(b), highlight: /\d/.test(b), matched: [] })), hiddenBullets: bl.length - shown.length, tags: collapsed ? [] : it.tags ?? [], hiddenTags: 0, collapsed, annotationIds: [] };
    });
    hiddenItems += items.filter((i: any) => i.collapsed).length;
    return { type: s.type, title: s.title, text: mask(s.text), items, totalItems: all.length, hiddenItems: items.filter((i: any) => i.collapsed).length, annotationIds: [] };
  });
  const exp = (model.sections.find((s: any) => s.type === 'experience')?.items ?? []);
  return {
    mode: opts.mode, anonymized: opts.anonymize, readOnly: true, identity: { name: model.header.name, headline: model.header.headline, targetRole: resume.targetRole ?? undefined },
    contacts: opts.anonymize ? model.header.contacts.map((c: string) => (c.includes('@') ? '[email hidden]' : /\d/.test(c) ? '[phone hidden]' : '[location hidden]')) : model.header.contacts,
    links: (model.header.links ?? []).map((l: any) => (opts.anonymize ? { label: l.label } : l)),
    overview: { currentRole: exp[0]?.title, currentEmployer: exp[0]?.subtitle, statedExperienceYears: exp.length ? 6.5 : null, roleCount: exp.length, coreSkills: (model.sections.find((s: any) => s.type === 'skills')?.items ?? []).flatMap((i: any) => i.tags ?? []).slice(0, 8), note: 'Experience length is calculated from the dates stated on the resume.' },
    sections, navigation: sections.map((s: any) => ({ type: s.type, title: s.title })),
    collapsedSummary: { hiddenItems, hiddenBullets, hiddenTags: 0, message: hiddenItems + hiddenBullets ? `Quick scan collapsed ${hiddenItems} entries, ${hiddenBullets} bullets and 0 skills. Switch to full content to see everything.` : 'Nothing is collapsed.' },
    annotations, resume: { id: resume.id, name: resume.name, versionId: null, versionNumber: null },
  };
}

/** Returns a reply for insight routes, or null so the caller falls through to its 404. */
export function handleInsights(state: any, method: string, path: string, body: any, query: URLSearchParams, modelFor: (resume: any) => any): Reply | null {
  const st = store(state);
  const resumeOf = (id: string) => state.resumes.find((r: any) => r.id === id);

  // ---- job descriptions (23/29) ----
  if (path === '/job-descriptions' && method === 'POST') {
    const jd = { id: uuid(++st.seq), title: body.title, company: body.company ?? null, location: body.location ?? null, sourceType: 'PASTE', sourceDomain: null, rawText: body.retainRawText ? body.text : null, requirements: extract(body.text), extractionVersion: '1.0.0', revision: 1, confirmationStatus: 'UNCONFIRMED', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    st.jds.push(jd);
    return ok(jdView(jd, { warnings: jd.requirements.length ? [] : ['No requirements could be extracted automatically. Add them manually, or paste more of the job description.'] }), 201);
  }
  if (path === '/job-descriptions/import-url' && method === 'POST') {
    const u = String(body.url);
    if (/linkedin\.com|naukri\.com|indeed\./i.test(u)) return ok({ status: 'manual_paste_required', reason: 'This site requires sign-in or does not permit automated retrieval, so the page was not fetched. Paste the job description instead.', sourceDomain: new URL(u).hostname, jobDescription: null });
    if (/localhost|127\.0\.0\.1|169\.254|\.internal/i.test(u)) return ok({ status: 'unsupported_source', reason: 'That address points to a private network. Paste the job description instead.', sourceDomain: null, jobDescription: null });
    if (/good\.example\.com/i.test(u)) {
      const text = 'Requirements\n- 3+ years of experience\n- NestJS and PostgreSQL\n\nNice to have\n- Terraform';
      const jd = { id: uuid(++st.seq), title: 'Backend Engineer', company: 'Good Co', location: null, sourceType: 'URL', sourceDomain: 'good.example.com', rawText: null, requirements: extract(text), extractionVersion: '1.0.0', revision: 1, confirmationStatus: 'UNCONFIRMED', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      st.jds.push(jd);
      return ok({ status: 'imported', reason: 'Imported from the public page. Review the extracted requirements before scoring.', sourceDomain: 'good.example.com', jobDescription: jdView(jd) });
    }
    return ok({ status: 'retrieval_failed', reason: 'The page could not be retrieved. Paste the job description instead.', sourceDomain: null, jobDescription: null });
  }
  if (path === '/job-descriptions' && method === 'GET') return ok(st.jds.map((j) => jdView({ ...j, requirements: [] })));
  const jm = /^\/job-descriptions\/([^/]+)$/.exec(path);
  if (jm) {
    const jd = st.jds.find((j) => j.id === jm[1]); if (!jd) return err(404, 'Job description not found');
    if (method === 'GET') return ok(jdView(jd));
    if (method === 'DELETE') { st.jds = st.jds.filter((j) => j !== jd); st.reports = st.reports.filter((r) => r.jobDescriptionId !== jd.id); return { status: 204 }; }
    if (method === 'PATCH') {
      if (body.requirements) {
        jd.requirements = body.requirements.map((r: any, i: number) => ({ ...r, id: r.id?.startsWith('new-') ? `r-u-${i}` : r.id, sourceText: r.sourceText ?? 'Added by you', included: r.included !== false, origin: r.origin ?? 'USER', confidence: r.confidence ?? 1 }));
        jd.revision += 1; jd.confirmationStatus = 'UNCONFIRMED';
      }
      if (body.confirm === true) jd.confirmationStatus = 'CONFIRMED';
      return ok(jdView(jd));
    }
  }

  // ---- match reports (23/29) ----
  const mr = /^\/resumes\/([^/]+)\/match-reports$/.exec(path);
  if (mr) {
    const resume = resumeOf(mr[1]); if (!resume) return err(404, 'Resume not found');
    if (method === 'GET') {
      const jdId = query.get('jobDescriptionId');
      return ok(st.reports.filter((r) => r.resumeId === resume.id && (!jdId || r.jobDescriptionId === jdId)).map((r) => ({ id: r.id, resumeId: r.resumeId, resumeVersionId: r.resumeVersionId, resumeVersionNumber: r.resumeVersionNumber, jobDescriptionId: r.jobDescriptionId, jdRevision: r.jdRevision, scoringVersion: r.scoringVersion, totalScore: r.totalScore, createdAt: r.createdAt, jdTitle: r.job.title, jdCompany: r.job.company, stale: st.jds.find((j) => j.id === r.jobDescriptionId)?.revision !== r.jdRevision, confidence: r.coverage.confidence })).reverse());
    }
    if (method === 'POST') {
      const jd = st.jds.find((j) => j.id === body.jobDescriptionId); if (!jd) return err(404, 'Job description not found');
      const version = body.resumeVersionId ? (state.versions[resume.id] ?? []).find((v: any) => v.id === body.resumeVersionId) : null;
      if (body.resumeVersionId && !version) return err(404, 'Resume version not found');
      const res = score(modelFor(resume), jd);
      const report = { id: uuid(1000 + ++st.seq), resumeId: resume.id, resumeName: resume.name, resumeVersionId: version?.id ?? null, resumeVersionNumber: version?.versionNumber ?? null, jobDescriptionId: jd.id, jdRevision: jd.revision, scoringVersion: '1.0.0',
        job: { title: jd.title, company: jd.company, location: jd.location, sourceType: jd.sourceType, sourceDomain: jd.sourceDomain, confirmationStatus: jd.confirmationStatus }, ...res, createdAt: new Date().toISOString() };
      st.reports.push(report);
      return ok({ ...report, stale: false }, 201);
    }
  }
  const rr = /^\/resume-match-reports\/([^/]+)(?:\/(recalculate))?$/.exec(path);
  if (rr) {
    const rep = st.reports.find((r) => r.id === rr[1]); if (!rep) return err(404, 'Match report not found');
    const jd = st.jds.find((j) => j.id === rep.jobDescriptionId);
    if (!rr[2] && method === 'GET') return ok({ ...rep, job: { ...rep.job, confirmationStatus: jd?.confirmationStatus ?? rep.job.confirmationStatus }, stale: jd?.revision !== rep.jdRevision });
    if (!rr[2] && method === 'DELETE') { st.reports = st.reports.filter((r) => r !== rep); return { status: 204 }; }
    if (rr[2] && method === 'POST' && jd) {
      const resume = resumeOf(rep.resumeId);
      const res = score(modelFor(resume), jd);
      const next = { ...rep, id: uuid(1000 + ++st.seq), jdRevision: jd.revision, job: { ...rep.job, title: jd.title, confirmationStatus: jd.confirmationStatus }, ...res, createdAt: new Date().toISOString() };
      st.reports.push(next);
      return ok({ ...next, stale: false });
    }
  }

  // ---- quality reviews (20/31) ----
  const ec = /^\/resumes\/([^/]+)\/quality-reviews\/export-check$/.exec(path);
  if (ec && method === 'POST') {
    if (!resumeOf(ec[1])) return err(404, 'Resume not found');
    return ok({ checkVersion: 'export-check-1', resumeVersionNumber: null, note: 'This reads back files generated in memory with a standard text extractor. It is not an employer ATS result or a prediction. Nothing was stored.', checks: [
      { format: 'pdf', ok: true, pages: 1, wordCoverage: 1, missingSample: [], readingOrderOk: true, replacementChars: 0, findings: [] },
      { format: 'docx', ok: false, pages: null, wordCoverage: 0.9, missingSample: ['kubernetes'], readingOrderOk: true, replacementChars: 0, findings: [{ id: 'EXTRACT.DOCX.COVERAGE', severity: 'warning', title: '10% of words were not found when the DOCX was read back', explanation: 'A text extractor could not recover every word.', recommendation: 'Preview the file and export again.' }] },
    ] });
  }
  const qr = /^\/resumes\/([^/]+)\/quality-reviews$/.exec(path);
  if (qr) {
    const resume = resumeOf(qr[1]); if (!resume) return err(404, 'Resume not found');
    const mine = st.reviews.filter((r) => r.resumeId === resume.id);
    if (method === 'GET') return ok(mine.map(({ findings: _f, dimensions: _d, coverage: _c, counts: _n, comparison: _k, disclaimer: _x, ...row }) => row).reverse());
    if (method === 'POST') {
      const version = body?.resumeVersionId ? (state.versions[resume.id] ?? []).find((v: any) => v.id === body.resumeVersionId) : null;
      const r = review(modelFor(resume), resume, version?.versionNumber ?? null, mine[mine.length - 1] ?? null, uuid(2000 + ++st.seq));
      st.reviews.push({ ...r, comparison: undefined });
      return ok(r, 201);
    }
  }
  const qg = /^\/quality-reviews\/([^/]+)$/.exec(path);
  if (qg) { const r = st.reviews.find((x) => x.id === qg[1]); if (!r) return err(404, 'Quality review not found'); if (method === 'GET') return ok(r); if (method === 'DELETE') { st.reviews = st.reviews.filter((x) => x !== r); return { status: 204 }; } }

  // ---- recruiter view (22): read-only ----
  const rv = /^\/resumes\/([^/]+)\/recruiter-view(?:\/(preview|annotations))?$/.exec(path);
  if (rv) {
    const resume = resumeOf(rv[1]); if (!resume) return err(404, 'Resume not found');
    if (rv[2] === 'annotations' && method === 'GET') return ok({ resume: { id: resume.id, name: resume.name }, anonymized: false, annotations: recruiter(modelFor(resume), resume, query, { mode: 'full', anonymize: false, annotations: true }).annotations });
    if (!rv[2] && method === 'GET') return ok(recruiter(modelFor(resume), resume, query, { mode: query.get('mode') ?? 'quick', anonymize: query.get('anonymize') === 'true', annotations: query.get('annotations') === 'true' }));
    if (rv[2] === 'preview' && method === 'POST') return ok(recruiter(modelFor(resume), resume, query, { mode: body?.mode ?? 'quick', anonymize: !!body?.anonymize, annotations: !!body?.includeAnnotations }));
  }
  return null;
}
