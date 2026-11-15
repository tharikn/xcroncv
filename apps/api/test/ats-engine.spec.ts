import { NotFoundException } from '@nestjs/common';
import { ATS_DIMENSIONS, ATS_VERSION, computeAts } from '../src/ats-engine/ats-engine';
import { AtsEngineService } from '../src/ats-engine/ats-engine.service';
import { AtsModelController } from '../src/ats-engine/ats-engine.controller';
import { featureEnabled } from '../src/common/features';
import { analyzeJd } from '../src/resume-match/jd-analyzer';
import { RenderModel } from '../src/render-model/render-model.types';
import { AUTH, OTHER, SAMPLE_JD, deepFreeze, sampleModel } from './fixtures/resume-fixtures';

const NOW = new Date('2026-06-01');
const reqs = () => analyzeJd(SAMPLE_JD, 'Senior Backend Engineer').requirements;
const run = (m: RenderModel = sampleModel(), requirements = reqs(), confirmed = true) =>
  computeAts({ model: m, requirements, jdTitle: 'Senior Backend Engineer', confirmed, now: NOW });
const dim = (r: ReturnType<typeof run>, id: string) => r.dimensions.find((d) => d.id === id)!;

describe('ATS engine model', () => {
  it('weights follow doc 07 and total 100', () => {
    expect(ATS_DIMENSIONS.reduce((a, d) => a + d.weight, 0)).toBe(100);
    expect(Object.fromEntries(ATS_DIMENSIONS.map((d) => [d.id, d.weight]))).toEqual({
      required_skills: 20, preferred_skills: 10, experience: 20, role_title: 10, keyword_coverage: 10, semantic: 10, structure: 10, clarity: 10,
    });
  });
  it('is deterministic, versioned and does not mutate its input', () => {
    const model = deepFreeze(sampleModel());
    const a = run(model); const b = run(model);
    expect(a).toEqual(b);
    expect(a.atsVersion).toBe(ATS_VERSION);
    expect(a.taxonomyVersion).toBeDefined();
    expect(a.score).toBeGreaterThanOrEqual(0); expect(a.score).toBeLessThanOrEqual(100);
  });
  it('every dimension reports score, max, weight and matched/weak/missing; disclaimer is present', () => {
    const r = run();
    for (const d of r.dimensions) expect(d).toEqual(expect.objectContaining({ maxScore: 100, weight: expect.any(Number), matched: expect.any(Array), weak: expect.any(Array), missing: expect.any(Array) }));
    expect(r.disclaimer).toMatch(/does not predict/i);
  });
});

describe('job dimensions', () => {
  it('credits demonstrated skills and flags missing ones honestly with evidence', () => {
    const r = run();
    const req = dim(r, 'required_skills');
    expect(req.matched).toEqual(expect.arrayContaining(['PostgreSQL']));
    const nest = r.items.find((i) => i.dimension === 'required_skills' && /nest/i.test(i.label))!;
    expect(nest.evidence[0]).toMatchObject({ section: 'experience' });
    const pref = r.items.filter((i) => i.dimension === 'preferred_skills');
    const terraform = pref.find((i) => /terraform/i.test(i.label))!;
    expect(terraform.points).toBe(0);
    expect(terraform.action).toMatch(/only if/i); // never tells the user to invent experience
  });
  it('a skill only in the skills list scores below one shown in work', () => {
    const r = run();
    const k8s = r.items.find((i) => /kubernetes/i.test(i.label) && i.dimension === 'keyword_coverage')!;
    expect(k8s.points).toBeLessThan(1);
  });
  it('keyword coverage counts each keyword once; repeating a keyword does not raise the score', () => {
    const base = run();
    const m = sampleModel();
    (m.sections[1].items![0].bullets as string[]).push('Kubernetes Kubernetes Kubernetes Kubernetes Kubernetes Kubernetes.');
    const stuffed = run(m);
    const labels = stuffed.items.filter((i) => i.dimension === 'keyword_coverage').map((i) => i.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
    expect(dim(stuffed, 'keyword_coverage').itemCount).toBe(dim(base, 'keyword_coverage').itemCount);
  });
  it('job dimensions become not applicable (weight redistributed, not zero) when there are no requirements', () => {
    const r = run(sampleModel(), []);
    const job = r.dimensions.filter((d) => ATS_DIMENSIONS.find((x) => x.id === d.id)!.needsJob);
    expect(job.filter((d) => d.id !== 'role_title').every((d) => d.applicable === false)).toBe(true);
    expect(dim(r, 'structure').effectiveWeight + dim(r, 'clarity').effectiveWeight + job.reduce((a, d) => a + d.effectiveWeight, 0)).toBeCloseTo(100, 0);
    expect(r.coverage.confidence).toBe('low');
    expect(r.coverage.limitations.join(' ')).toMatch(/redistributed/);
  });
  it('lowers confidence and says so when requirements are unconfirmed', () => {
    const r = run(sampleModel(), reqs(), false);
    expect(r.coverage.limitations.join(' ')).toMatch(/not confirmed/);
    expect(r.coverage.confidence).not.toBe('high');
  });
  it('excluded requirements are ignored', () => {
    const all = reqs();
    const trimmed = all.map((r) => (/kubernetes/i.test(r.label) ? { ...r, included: false } : r));
    const r = run(sampleModel(), trimmed);
    expect(r.items.some((i) => /kubernetes/i.test(i.label) && i.dimension === 'required_skills')).toBe(false);
  });
  it('a resume with no relevant evidence scores clearly lower than a matching one', () => {
    const empty = sampleModel();
    empty.sections = [{ type: 'summary', title: 'Summary', text: 'Barista and shift supervisor in a busy cafe.' }];
    expect(run(empty).score).toBeLessThan(run().score - 20);
  });
});

describe('structure and clarity (job independent)', () => {
  it('a clean resume passes structure checks', () => {
    const d = dim(run(), 'structure');
    expect(d.score).toBeGreaterThanOrEqual(90);
  });
  it('flags missing contact details, unusual headings, unreadable and inconsistent dates', () => {
    const m = sampleModel();
    m.header.contacts = [];
    m.sections[1].title = 'My Journey';
    (m.sections[1].items as { meta?: string }[])[0].meta = 'sometime recently';
    (m.sections[1].items as { meta?: string }[])[1].meta = '2016-2019';
    const r = run(m);
    const get = (k: string) => r.items.find((i) => i.key === k)!;
    expect(get('contact').points).toBeLessThan(0.5);
    expect(get('headings').explanation).toMatch(/My Journey/);
    expect(get('dates').explanation).toMatch(/no readable date/);
    expect(get('dates').points).toBeLessThan(1);
  });
  it('does not penalise an education-first early-career order', () => {
    const m = sampleModel();
    const [sum, exp, sk, edu] = m.sections;
    m.sections = [sum, edu, exp, sk];
    expect(run(m).items.find((i) => i.key === 'order')!.points).toBeGreaterThanOrEqual(0.8);
  });
  it('clarity: flags missing summary, role without bullets and very short resumes', () => {
    const m = sampleModel();
    m.sections = [{ type: 'experience', title: 'Experience', items: [{ title: 'Engineer', subtitle: 'Acme', meta: 'Jan 2020 – Present', bullets: [] }] }];
    const r = run(m);
    expect(r.items.find((i) => i.key === 'summary')!.status).toBe('fail');
    expect(r.items.find((i) => i.key === 'role_detail')!.points).toBe(0);
    expect(r.items.find((i) => i.key === 'length')!.points).toBeLessThan(0.7);
    expect(r.improvements.length).toBeGreaterThan(0);
  });
  it('structure and clarity are applicable without a job description', () => {
    const r = run(sampleModel(), []);
    expect(dim(r, 'structure').applicable && dim(r, 'clarity').applicable).toBe(true);
    expect(r.score).toBeGreaterThan(0);
  });
});

describe('score separation', () => {
  it('result exposes ATS fields only, not match/quality/parsing score fields', () => {
    const r = run() as unknown as Record<string, unknown>;
    expect(Object.keys(r)).not.toEqual(expect.arrayContaining(['totalScore']));
    expect(r.scoringVersion).toBeUndefined();
    expect(r.atsVersion).toBe(ATS_VERSION);
  });
});

describe('AtsEngineService', () => {
  const jd = { id: 'j1', title: 'Senior Backend Engineer', company: 'Acme', revision: 3, confirmationStatus: 'CONFIRMED', requirements: reqs() };
  const mk = (jdRow: unknown = jd) => {
    const prisma: any = {
      jobDescription: { findFirst: jest.fn().mockResolvedValue(jdRow) },
      atsReport: {
        findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(),
        create: jest.fn(async ({ data }: any) => ({ id: 'a-new', createdAt: new Date(), ...data })),
      },
    };
    const resumes: any = { get: jest.fn().mockResolvedValue({ id: 'r1' }) };
    const source: any = { load: jest.fn().mockResolvedValue({ resumeId: 'r1', name: 'CV', targetRole: null, model: sampleModel(), versionId: 'v1', versionNumber: 2, hash: 'h1' }) };
    return { svc: new AtsEngineService(prisma, resumes, source), prisma, resumes, source };
  };
  it('scopes the job description lookup by tenant and owner and stores the report under tenant and owner with versions', async () => {
    const { svc, prisma } = mk();
    const out: any = await svc.run(AUTH, 'r1', { jobDescriptionId: 'j1', resumeVersionId: 'v1' });
    expect(prisma.jobDescription.findFirst.mock.calls[0][0].where).toEqual({ id: 'j1', tenantId: 't1', userId: 'u1' });
    expect(prisma.atsReport.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', userId: 'u1', resumeId: 'r1', resumeVersionNumber: 2, resumeContentHash: 'h1', atsVersion: ATS_VERSION, jdRevision: 3, jobConfirmed: true });
    expect(out.score).toBeGreaterThan(0);
    expect(out.job).toMatchObject({ title: 'Senior Backend Engineer', confirmed: true });
    expect(out.disclaimer).toBeDefined();
    expect(JSON.stringify(prisma.atsReport.create.mock.calls[0][0].data)).not.toMatch(/Ada Lovelace|ada@example\.com/); // no contact data stored
  });
  it('404 (non-disclosing) for a foreign job description, report, and without deleting', async () => {
    const { svc, prisma } = mk(null);
    await expect(svc.run(OTHER, 'r1', { jobDescriptionId: 'j1' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.atsReport.create).not.toHaveBeenCalled();
    await expect(svc.get(OTHER, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.atsReport.findFirst.mock.calls[0][0].where).toEqual({ id: 'x', tenantId: 't2', userId: 'u2' });
    await expect(svc.remove(OTHER, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.atsReport.delete).not.toHaveBeenCalled();
  });
  it('list checks resume ownership and filters by tenant and owner', async () => {
    const { svc, prisma, resumes } = mk();
    await svc.list(AUTH, 'r1');
    expect(resumes.get).toHaveBeenCalledWith(AUTH, 'r1');
    expect(prisma.atsReport.findMany.mock.calls[0][0].where).toEqual({ resumeId: 'r1', tenantId: 't1', userId: 'u1' });
  });
  it('model endpoint returns the versioned weights', () => {
    const m = new AtsModelController().model();
    expect(m.atsVersion).toBe(ATS_VERSION);
    expect(m.dimensions).toHaveLength(8);
  });
  it('can be disabled by feature flag', () => { expect(featureEnabled('ats-engine', 'ats-engine')).toBe(false); });
});
