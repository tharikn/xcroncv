import { NotFoundException } from '@nestjs/common';
import { analyzeJd, detectJdTitle, normalizeUserRequirements, Requirement, sanitizeJdText } from '../src/resume-match/jd-analyzer';
import { computeMatch, DIMENSIONS, SCORING_VERSION } from '../src/resume-match/matcher';
import { findSkills, normalizeLabel } from '../src/resume-match/taxonomy';
import {
  FetchDeps, HttpResult, importJobFromUrl, isPublicIp, robotsAllows, safeGet, validateUrl, extractJob,
} from '../src/resume-match/jd-fetch';
import { ResumeMatchService, jdView } from '../src/resume-match/resume-match.service';
import { AUTH, OTHER, SAMPLE_JD, deepFreeze, sampleModel } from './fixtures/resume-fixtures';
import { featureEnabled } from '../src/common/features';

const NOW = new Date('2026-06-01');
const reqs = (text = SAMPLE_JD) => analyzeJd(text, 'Senior Backend Engineer').requirements;
const byLabel = (rs: Requirement[], label: string, type?: string) => rs.find((r) => r.label === label && (!type || r.type === type));

describe('taxonomy', () => {
  it('matches whole tokens only (C never matches C++, Go never matches "go to")', () => {
    expect(findSkills('We use C++ daily').map((h) => h.id)).toEqual(['cpp']);
    expect(findSkills('you will go to meetings').map((h) => h.id)).toEqual([]);
    expect(findSkills('Cypress and Selenium tests').map((h) => h.id).sort()).toEqual(['cypress', 'selenium']);
  });
  it('resolves synonyms to one skill', () => {
    expect(normalizeLabel('postgres')).toBe('postgresql');
    expect(normalizeLabel('k8s')).toBe('kubernetes');
    expect(normalizeLabel('Node')).toBe('nodejs');
    expect(normalizeLabel('knitting')).toBeNull();
  });
});

describe('JD analysis (deterministic extraction)', () => {
  it('splits required vs preferred by section and cue words', () => {
    const rs = reqs();
    expect(byLabel(rs, 'PostgreSQL', 'required_skill')).toBeTruthy();
    expect(byLabel(rs, 'NestJS', 'required_skill')).toBeTruthy();
    expect(byLabel(rs, 'Terraform', 'preferred_skill')).toBeTruthy();
    expect(byLabel(rs, 'Terraform', 'required_skill')).toBeUndefined();
  });
  it('extracts explicit years with their skill context and never infers years', () => {
    const exp = reqs().find((r) => r.type === 'experience')!;
    expect(exp.minYears).toBe(5);
    expect(exp.label).toMatch(/5\+ years/);
    expect(analyzeJd('We value learning.\nRequirements\n- Curious mind').requirements.some((r) => r.type === 'experience')).toBe(false);
  });
  it('extracts degree level and ignores "About us" content', () => {
    const rs = reqs();
    expect(rs.find((r) => r.type === 'qualification')?.degreeLevel).toBe(2);
    expect(rs.some((r) => /friendly company/.test(r.label))).toBe(false);
  });
  it('captures responsibilities and gives every requirement a source span and stable id', () => {
    const a = reqs(); const b = reqs();
    expect(a.filter((r) => r.type === 'responsibility').length).toBeGreaterThanOrEqual(2);
    expect(a.every((r) => r.sourceText.length > 0 && r.origin === 'EXTRACTED')).toBe(true);
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
  });
  it('warns when nothing can be extracted', () => {
    const a = analyzeJd('Join our team. We love coffee and long walks on the beach, truly.');
    expect(a.requirements).toHaveLength(0);
    expect(a.warnings.join(' ')).toMatch(/No requirements/);
  });
  it('treats JD text as untrusted: strips markup and control characters', () => {
    const s = sanitizeJdText('<script>alert(1)</script><b>Python</b>\u0000 &amp; SQL');
    expect(s).not.toMatch(/script|alert|<b>|\u0000/);
    expect(s).toContain('Python');
  });
  it('re-normalizes user edits server-side (user-added skills get taxonomy ids; years are clamped)', () => {
    const out = normalizeUserRequirements([
      { type: 'required_skill', label: 'k8s', normalized: 'evil' as never },
      { type: 'experience', label: '99 years of Go', minYears: 99 },
    ]);
    expect(out[0].normalized).toBe('kubernetes');
    expect(out[0].origin).toBe('USER');
    expect(out[1].minYears).toBe(50);
  });
});

describe('JD title detection (2-step generator has no title field)', () => {
  it('reads a title from a first-line heading', () => {
    expect(detectJdTitle('Senior Frontend Engineer\n\nWe build accessible products.')).toBe('Senior Frontend Engineer');
  });
  it('prefers an explicit title label and ignores company/about lines', () => {
    expect(detectJdTitle('Company: Acme\nJob Title: Staff Platform Engineer\nAbout us\nWe are growing.')).toBe('Staff Platform Engineer');
  });
  it('extracts a title from a hiring sentence', () => {
    expect(detectJdTitle('About Acme\nWe are hiring a Senior Product Designer to join our team.')).toBe('Senior Product Designer');
  });
  it('does not invent a title from body prose', () => {
    expect(detectJdTitle('We value learning.\nRequirements\n- Curious mind')).toBeUndefined();
  });
});

describe('evidence mapping and statuses', () => {
  const score = (model = sampleModel(), requirements = reqs(), extra = {}) => computeMatch({ model, requirements, jdTitle: 'Senior Backend Engineer', confirmed: true, now: NOW, ...extra });
  const item = (r: ReturnType<typeof score>, label: string) => r.items.find((i) => i.label === label)!;

  it('skill shown in work is exact with an evidence excerpt and location', () => {
    const r = score();
    const i = item(r, 'NestJS');
    expect(i.status).toBe('exact');
    expect(i.evidence[0]).toMatchObject({ section: 'experience', itemIndex: 0, field: 'bullets' });
    expect(i.evidence[0].excerpt).toContain('NestJS');
  });
  it('skill only in the skills list is partial, not equivalent to demonstrated experience', () => {
    const r = score();
    const i = item(r, 'Kubernetes');
    expect(i.status).toBe('partial');
    expect(i.method).toBe('listed_only');
    expect(i.action).toMatch(/if it is true|Do not add/i);
  });
  it('a different but related skill yields related, an absent skill yields missing with no fabricated evidence', () => {
    const model = sampleModel();
    const r = score(model, normalizeUserRequirements([{ type: 'required_skill', label: 'Flask' }, { type: 'required_skill', label: 'Ansible' }, { type: 'required_skill', label: 'Rust' }]));
    expect(item(r, 'Flask').status).toBe('related'); // Python on the resume
    expect(item(r, 'Rust').status).toBe('missing');
    expect(item(r, 'Rust').evidence).toEqual([]);
    expect(item(r, 'Rust').explanation).toMatch(/No evidence .* found in this resume/);
  });
  it('synonyms count as exact via the synonym method', () => {
    const model = sampleModel();
    const r = score(model, normalizeUserRequirements([{ type: 'required_skill', label: 'Postgres' }]));
    expect(item(r, 'PostgreSQL').status).toBe('exact');
  });
  it('years are computed from explicit dates only and flagged not_evaluated without dates', () => {
    const r = score();
    const yrs = r.items.find((i) => i.type === 'experience')!; // Python 2016-2019 = 4 years against 5+ asked
    expect(yrs.status).toBe('partial');
    expect(yrs.explanation).toMatch(/About 4 years/);
    const three = score(sampleModel(), normalizeUserRequirements([{ type: 'experience', label: '3 years of Python', minYears: 3 }]));
    expect(three.items.find((i) => i.type === 'experience')!.status).toBe('exact');
    const undated = sampleModel();
    (undated.sections[1].items as { meta?: string }[]).forEach((it) => { it.meta = undefined; });
    const r2 = score(undated);
    expect(r2.items.find((i) => i.type === 'experience')!.status).toBe('not_evaluated');
  });
  it('does not infer a degree level that the resume does not state', () => {
    const m = sampleModel();
    m.sections[3] = { type: 'education', title: 'Education', items: [{ title: 'Mathematics', subtitle: 'Home tutored' }] };
    const r = score(m);
    expect(r.items.find((i) => i.type === 'qualification')!.status).toBe('not_evaluated');
  });
  it('seniority is compared only when the resume title states a level', () => {
    const m = sampleModel();
    (m.sections[1].items as { title?: string }[])[0].title = 'Backend Engineer';
    expect(score(m).items.find((i) => i.requirementId === 'derived:seniority')!.status).toBe('not_evaluated');
  });
});

describe('weighted scoring', () => {
  const run = (model = sampleModel(), requirements = reqs(), confirmed = true) => computeMatch({ model, requirements, jdTitle: 'Senior Backend Engineer', confirmed, now: NOW });

  it('weights sum to 100 and the version is recorded', () => {
    expect(DIMENSIONS.reduce((a, d) => a + d.weight, 0)).toBe(100);
    expect(run().scoringVersion).toBe(SCORING_VERSION);
  });
  it('is deterministic: identical input gives identical output', () => {
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
  it('never mutates its inputs', () => {
    const model = deepFreeze(sampleModel()); const r = deepFreeze(reqs());
    expect(() => run(model, r)).not.toThrow();
  });
  it('redistributes the weight of not-applicable dimensions proportionally and discloses it', () => {
    // Only required skills in the JD and no JD title: every other dimension is N/A.
    const only = normalizeUserRequirements([{ type: 'required_skill', label: 'NestJS' }, { type: 'required_skill', label: 'Rust' }]);
    const r = computeMatch({ model: sampleModel(), requirements: only, confirmed: true, now: NOW });
    const applicable = r.dimensions.filter((d) => d.applicable);
    expect(applicable.map((d) => d.id)).toEqual(expect.arrayContaining(['required_skills']));
    expect(applicable.reduce((a, d) => a + d.effectiveWeight, 0)).toBeCloseTo(100, 0);
    const req = r.dimensions.find((d) => d.id === 'required_skills')!;
    expect(req.score).toBe(50); // one exact (1.0) + one missing (0)
    // Total equals the weighted mean over applicable dimensions only.
    const manual = Math.round(applicable.reduce((a, d) => a + d.weight * d.score!, 0) / applicable.reduce((a, d) => a + d.weight, 0));
    expect(r.totalScore).toBe(manual);
    expect(r.coverage.limitations.join(' ')).toMatch(/redistributed/);
    expect(r.coverage.applicableWeight).toBeLessThan(100);
  });
  it('a better resume scores higher than a worse one for the same JD', () => {
    const weak = sampleModel({ sections: [{ type: 'skills', title: 'Skills', items: [{ tags: ['Excel'] }] } as never] });
    expect(run().totalScore).toBeGreaterThan(run(weak).totalScore);
  });
  it('shows low confidence when the JD gave little to evaluate or is unconfirmed', () => {
    const tiny = normalizeUserRequirements([{ type: 'required_skill', label: 'NestJS' }]);
    expect(computeMatch({ model: sampleModel(), requirements: tiny, confirmed: true, now: NOW }).coverage.confidence).toBe('low');
    expect(run(sampleModel(), reqs(), false).coverage.limitations.join(' ')).toMatch(/not confirmed/);
    expect(run(sampleModel(), reqs(), false).coverage.confidence).not.toBe('high');
  });
  it('excluded requirements do not affect the score', () => {
    const rs = reqs().map((r) => (r.normalized === 'terraform' ? { ...r, included: false } : r));
    const r = computeMatch({ model: sampleModel(), requirements: rs, jdTitle: 'Senior Backend Engineer', confirmed: true, now: NOW });
    expect(r.items.some((i) => i.label === 'Terraform')).toBe(false);
  });
  it('never claims hiring outcomes and says missing is not proof of absence', () => {
    const r = run();
    expect(r.disclaimer).toMatch(/not a hiring probability/i);
    expect(r.disclaimer).toMatch(/not found in this resume/i);
  });
  it('keeps every dimension explained', () => {
    expect(run().dimensions.every((d) => d.explanation.length > 10)).toBe(true);
  });
});

describe('SSRF guard and safe retrieval', () => {
  it('classifies private/reserved addresses as non-public', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::7f00:1']) {
      expect(isPublicIp(ip)).toBe(false);
    }
    for (const ip of ['93.184.216.34', '8.8.8.8', '2606:2800:220:1:248:1893:25c8:1946']) expect(isPublicIp(ip)).toBe(true);
    expect(isPublicIp('not-an-ip')).toBe(false);
  });
  it('rejects unsafe URL shapes before any network call', () => {
    for (const u of ['ftp://example.com/x', 'file:///etc/passwd', 'http://localhost/x', 'http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data', 'https://user:pw@example.com/', 'https://example.com:8443/', 'http://intranet/', 'http://service.internal/', 'javascript:alert(1)', 'not a url']) {
      expect(() => validateUrl(u)).toThrow();
    }
    expect(() => validateUrl('https://jobs.example.com/roles/1')).not.toThrow();
  });

  const page = (body: string, status = 200, headers: Record<string, string> = { 'content-type': 'text/html' }): HttpResult => ({ status, headers, body: Buffer.from(body) });
  const deps = (routes: Record<string, HttpResult>, ips: Record<string, string[]> = {}): FetchDeps & { calls: string[] } => {
    const calls: string[] = [];
    return {
      calls,
      resolve: async (h) => ips[h] ?? ['93.184.216.34'],
      request: async (u, ip) => { calls.push(`${ip}|${u.host}${u.pathname}`); return routes[u.host + u.pathname] ?? page('', 404); },
    };
  };
  const JOB_HTML = `<html><head><title>Backend Engineer - Acme</title></head><body><main><h1>Backend Engineer</h1><p>Requirements</p><ul><li>5+ years of experience with Node.js</li><li>PostgreSQL and Docker</li></ul><p>${'We build payments software for merchants across Europe. '.repeat(6)}</p></main></body></html>`;

  it('pins the connection to the validated IP and blocks hostnames resolving to private ranges', async () => {
    const d = deps({ 'evil.example.com/robots.txt': page('', 404), 'evil.example.com/job': page(JOB_HTML) }, { 'evil.example.com': ['10.0.0.5'] });
    const out = await importJobFromUrl('https://evil.example.com/job', d);
    expect(out.status).toBe('unsupported_source');
    expect(d.calls).toEqual([]);
    const ok = deps({ 'jobs.example.com/robots.txt': page('', 404), 'jobs.example.com/job': page(JOB_HTML) });
    await importJobFromUrl('https://jobs.example.com/job', ok);
    expect(ok.calls.every((c) => c.startsWith('93.184.216.34|'))).toBe(true);
  });
  it('mixed public + private answers are rejected (rebinding defence)', async () => {
    const d = deps({}, { 'rebind.example.com': ['93.184.216.34', '127.0.0.1'] });
    expect((await importJobFromUrl('https://rebind.example.com/job', d)).status).toBe('unsupported_source');
  });
  it('re-validates every redirect hop (redirect to a private address is blocked)', async () => {
    const d = deps({ 'jobs.example.com/robots.txt': page('', 404), 'jobs.example.com/job': page('', 302, { location: 'http://169.254.169.254/latest/meta-data' }) });
    const out = await importJobFromUrl('https://jobs.example.com/job', d);
    expect(out.status).toBe('unsupported_source');
    expect(d.calls.some((c) => c.includes('169.254'))).toBe(false);
  });
  it('limits redirects', async () => {
    const d = deps({ 'a.example.com/x': page('', 302, { location: 'https://a.example.com/x' }) });
    await expect(safeGet(new URL('https://a.example.com/x'), d)).rejects.toThrow(/too many times/);
  });
  it('imports a public job page and reports status imported only with real content', async () => {
    const d = deps({ 'jobs.example.com/robots.txt': page('User-agent: *\nDisallow: /private/'), 'jobs.example.com/job': page(JOB_HTML) });
    const out = await importJobFromUrl('https://jobs.example.com/job?utm=1#frag', d);
    expect(out.status).toBe('imported');
    expect(out.canonicalUrl).toBe('https://jobs.example.com/job');
    expect(out.text).toContain('PostgreSQL');
  });
  it('prefers schema.org JobPosting data when present', () => {
    const ld = { '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Platform Engineer', hiringOrganization: { name: 'Acme' }, jobLocation: { address: { addressLocality: 'Berlin', addressCountry: 'DE' } }, description: '<p>Requirements</p><ul><li>Terraform</li><li>AWS</li></ul>' };
    const j = extractJob(`<html><script type="application/ld+json">${JSON.stringify(ld)}</script></html>`);
    expect(j).toMatchObject({ title: 'Platform Engineer', company: 'Acme', location: 'Berlin, DE' });
    expect(j.text).toContain('Terraform');
  });
  it('honours robots.txt', async () => {
    const d = deps({ 'jobs.example.com/robots.txt': page('User-agent: *\nDisallow: /job'), 'jobs.example.com/job': page(JOB_HTML) });
    const out = await importJobFromUrl('https://jobs.example.com/job', d);
    expect(out.status).toBe('manual_paste_required');
    expect(d.calls.some((c) => c.endsWith('/job'))).toBe(false);
    expect(robotsAllows('User-agent: *\nDisallow: /a\nAllow: /a/b', '/a/b/c')).toBe(true);
    expect(robotsAllows('User-agent: *\nDisallow: /a', '/a/b')).toBe(false);
  });
  it('LinkedIn, Naukri and Indeed are accepted as input but not fetched: manual paste fallback', async () => {
    for (const u of ['https://www.linkedin.com/jobs/view/123', 'https://www.naukri.com/job-listings-x', 'https://in.indeed.com/viewjob?jk=1']) {
      const d = deps({});
      const out = await importJobFromUrl(u, d);
      expect(out.status).toBe('manual_paste_required');
      expect(out.reason).toMatch(/Paste the job description/);
      expect(d.calls).toEqual([]);
    }
  });
  it('login walls, blocks, missing pages and non-HTML types fall back without claiming success', async () => {
    const wall = deps({ 'jobs.example.com/robots.txt': page('', 404), 'jobs.example.com/job': page('', 403) });
    expect((await importJobFromUrl('https://jobs.example.com/job', wall)).status).toBe('manual_paste_required');
    const login = deps({ 'jobs.example.com/robots.txt': page('', 404), 'jobs.example.com/job': page('<html><body><main>Please sign in to continue. ' + 'x'.repeat(300) + '</main></body></html>') });
    expect((await importJobFromUrl('https://jobs.example.com/job', login)).status).toBe('manual_paste_required');
    const gone = deps({ 'jobs.example.com/robots.txt': page('', 404), 'jobs.example.com/job': page('', 404) });
    expect((await importJobFromUrl('https://jobs.example.com/job', gone)).status).toBe('retrieval_failed');
    const pdf = deps({ 'jobs.example.com/robots.txt': page('', 404), 'jobs.example.com/job': page('%PDF', 200, { 'content-type': 'application/pdf' }) });
    expect((await importJobFromUrl('https://jobs.example.com/job', pdf)).status).toBe('unsupported_source');
    const tiny = deps({ 'jobs.example.com/robots.txt': page('', 404), 'jobs.example.com/job': page('<html><body>Hi</body></html>') });
    expect((await importJobFromUrl('https://jobs.example.com/job', tiny)).status).toBe('manual_paste_required');
  });
  it('maps oversize and timeout errors to retrieval_failed', async () => {
    const d: FetchDeps = { resolve: async () => ['93.184.216.34'], request: async () => { throw new Error('too_large'); } };
    const out = await importJobFromUrl('https://jobs.example.com/job', d);
    expect(out.status).toBe('retrieval_failed');
    expect(out.reason).toMatch(/too large/);
  });
});

describe('ResumeMatchService (ownership, retention, history)', () => {
  const jdRow = (over: Record<string, unknown> = {}) => ({
    id: 'j1', tenantId: 't1', userId: 'u1', title: 'Senior Backend Engineer', company: null, location: null, sourceType: 'PASTE', sourceDomain: null, canonicalUrl: null, rawText: null,
    contentHash: 'h', requirements: reqs(), extractionVersion: '1.0.0', revision: 1, confirmationStatus: 'CONFIRMED', createdAt: new Date(), updatedAt: new Date(), ...over,
  });
  const mk = (over: Record<string, any> = {}) => {
    const prisma: any = {
      jobDescription: {
        findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(async ({ data }: any) => ({ ...jdRow(), ...data, id: 'j1' })), update: jest.fn(async ({ data }: any) => ({ ...jdRow(), ...data })),
        delete: jest.fn(), findMany: jest.fn().mockResolvedValue([]), ...over.jobDescription,
      },
      resumeMatchReport: {
        findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(),
        create: jest.fn(async ({ data }: any) => ({ id: 'rep1', createdAt: new Date(), ...data })), ...over.resumeMatchReport,
      },
    };
    const resumes: any = { get: jest.fn().mockResolvedValue({ id: 'r1' }) };
    const source: any = { load: jest.fn().mockResolvedValue({ resumeId: 'r1', name: 'Eng CV', targetRole: null, model: sampleModel(), versionId: 'v1', versionNumber: 2, hash: 'abc' }) };
    return { svc: new ResumeMatchService(prisma, resumes, source), prisma, resumes, source };
  };

  it('filters every JD lookup by tenant AND owner and returns a non-disclosing 404', async () => {
    const { svc, prisma } = mk();
    await expect(svc.getJd(OTHER, 'j1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.jobDescription.findFirst).toHaveBeenCalledWith({ where: { id: 'j1', tenantId: 't2', userId: 'u2' } });
  });
  it('filters report lookups by tenant AND owner', async () => {
    const { svc, prisma } = mk();
    await expect(svc.getReport(AUTH, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.resumeMatchReport.findFirst.mock.calls[0][0].where).toEqual({ id: 'x', tenantId: 't1', userId: 'u1' });
    await svc.listReports(AUTH, 'r1');
    expect(prisma.resumeMatchReport.findMany.mock.calls[0][0].where).toMatchObject({ resumeId: 'r1', tenantId: 't1', userId: 'u1' });
  });
  it('does not store the raw JD text unless the user opts in, and never returns it', async () => {
    const { svc, prisma } = mk();
    const res: any = await svc.createJd(AUTH, { title: 'Senior Backend Engineer', text: SAMPLE_JD });
    expect(prisma.jobDescription.create.mock.calls[0][0].data.rawText).toBeNull();
    expect(prisma.jobDescription.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', userId: 'u1' });
    expect(res.rawText).toBeUndefined();
    expect(res.tenantId).toBeUndefined();
    const kept: any = await svc.createJd(AUTH, { title: 'T', text: SAMPLE_JD, retainRawText: true });
    expect(prisma.jobDescription.create.mock.calls[1][0].data.rawText).toContain('PostgreSQL');
    expect(kept.hasRawText).toBe(true);
    expect(kept.rawText).toBeUndefined();
  });
  it('editing requirements bumps the revision and resets confirmation; confirming sets it', async () => {
    const { svc, prisma } = mk({ jobDescription: { findFirst: jest.fn().mockResolvedValue(jdRow()) } });
    await svc.updateJd(AUTH, 'j1', { requirements: [{ type: 'required_skill', label: 'Rust' }] });
    expect(prisma.jobDescription.update.mock.calls[0][0].data).toMatchObject({ revision: { increment: 1 }, confirmationStatus: 'UNCONFIRMED' });
    await svc.updateJd(AUTH, 'j1', { confirm: true });
    expect(prisma.jobDescription.update.mock.calls[1][0].data).toMatchObject({ confirmationStatus: 'CONFIRMED' });
  });
  it('ties each report to the exact resume version and JD revision and scoring version', async () => {
    const { svc, prisma, source } = mk({ jobDescription: { findFirst: jest.fn().mockResolvedValue(jdRow({ revision: 3 })) } });
    const rep: any = await svc.createReport(AUTH, 'r1', { jobDescriptionId: 'j1', resumeVersionId: 'v1' });
    expect(source.load).toHaveBeenCalledWith(AUTH, 'r1', 'v1');
    expect(prisma.resumeMatchReport.create.mock.calls[0][0].data).toMatchObject({ resumeVersionId: 'v1', resumeVersionNumber: 2, jdRevision: 3, scoringVersion: SCORING_VERSION, tenantId: 't1', userId: 'u1', resumeContentHash: 'abc' });
    expect(rep.totalScore).toBeGreaterThan(0);
    expect(rep.items.every((i: any) => i.explanation)).toBe(true);
  });
  it('rejects an unknown scoring version', async () => {
    const { svc } = mk({ jobDescription: { findFirst: jest.fn().mockResolvedValue(jdRow()) } });
    await expect(svc.createReport(AUTH, 'r1', { jobDescriptionId: 'j1', scoringVersion: '9.9.9' })).rejects.toThrow(/not available/);
  });
  it('reports go stale when the JD changes after scoring; recalculation creates a new history row', async () => {
    const rep = { id: 'rep0', tenantId: 't1', userId: 'u1', resumeId: 'r1', resumeVersionId: 'v1', jdRevision: 1, jobDescription: jdRow({ revision: 2 }), jobDescriptionId: 'j1', createdAt: new Date(), dimensionScores: [], coverage: {}, evidence: [], summary: {}, scoringVersion: '1.0.0', totalScore: 50, resumeVersionNumber: 2 };
    const { svc, prisma, source } = mk({ resumeMatchReport: { findFirst: jest.fn().mockResolvedValue(rep) } });
    expect(((await svc.getReport(AUTH, 'rep0')) as any).stale).toBe(true);
    await svc.recalculate(AUTH, 'rep0');
    expect(source.load).toHaveBeenCalledWith(AUTH, 'r1', 'v1');
    expect(prisma.resumeMatchReport.create).toHaveBeenCalledTimes(1);
    expect(prisma.resumeMatchReport.create.mock.calls[0][0].data.jdRevision).toBe(2);
  });
  it('URL import creates a JD only when content was really retrieved', async () => {
    const { svc, prisma } = mk();
    const res: any = await svc.importUrl(AUTH, { url: 'https://www.linkedin.com/jobs/view/1' });
    expect(res.status).toBe('manual_paste_required');
    expect(res.jobDescription).toBeNull();
    expect(prisma.jobDescription.create).not.toHaveBeenCalled();
  });
  it('jdView hides owner ids and raw text', () => {
    const v: any = jdView(jdRow({ rawText: 'secret' }) as any);
    expect(v.rawText).toBeUndefined(); expect(v.userId).toBeUndefined(); expect(v.tenantId).toBeUndefined(); expect(v.hasRawText).toBe(true);
  });
});

describe('feature flag', () => {
  it('resume-match can be disabled by configuration', () => {
    expect(featureEnabled('resume-match', 'resume-match,crm')).toBe(false);
    expect(featureEnabled('resume-match', '')).toBe(true);
  });
});

describe('alternatives ("X or Y")', () => {
  it('is one requirement satisfied by the best-supported alternative', () => {
    const rs = analyzeJd('Requirements\n- Node.js or Python\n- PostgreSQL', 'Backend Engineer').requirements;
    const alt = rs.find((r) => r.alternatives?.length);
    expect(alt?.label).toBe('Python or Node.js');
    expect(rs.filter((r) => r.type === 'required_skill')).toHaveLength(2);
    const r = computeMatch({ model: sampleModel(), requirements: rs, confirmed: true, now: new Date('2026-06-01') });
    expect(r.items.find((i) => i.label === 'Python or Node.js')!.status).toBe('exact');
  });
});
