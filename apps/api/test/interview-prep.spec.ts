import { NotFoundException } from '@nestjs/common';
import { buildQuestions, evaluateAnswer, resumeCorpus } from '../src/interview-prep/interview-logic';
import { InterviewService } from '../src/interview-prep/interview.service';
import { RenderModel } from '../src/render-model/render-model.types';

const model = {
  schemaVersion: 1, template: { id: 't', version: 1 }, page: { size: 'A4', marginPt: 40 }, theme: {} as any,
  header: { name: 'Ada', headline: 'Backend engineer', contacts: [], links: [] },
  sections: [
    { type: 'experience', title: 'Experience', items: [
      { title: 'Engineer', subtitle: 'Acme', meta: '2020 - 2024', bullets: ['Cut API latency by 40% by adding Redis caching', 'Led a team of 4 on the billing migration'] },
    ] },
    { type: 'skills', title: 'Skills', items: [{ tags: ['Redis', 'Kubernetes', 'Rust'] }] },
    { type: 'projects', title: 'Projects', items: [{ title: 'Rusty', text: 'A toy in Rust', tags: ['Rust'] }] },
  ],
} as unknown as RenderModel;

describe('buildQuestions', () => {
  const qs = buildQuestions(model, { roleTitle: 'Platform Engineer', company: 'Globex', focusSkills: ['Redis', 'Terraform'] });

  it('grounds resume questions in exact resume text with an evidence reference', () => {
    const grounded = qs.filter((q) => q.grounding === 'RESUME');
    expect(grounded.length).toBeGreaterThan(3);
    for (const q of grounded) {
      expect(q.evidence).toBeDefined();
      if (q.evidence!.ref.includes('.bullets[') && (q.evidence!.ref)) expect(resumeCorpus(model)).toContain(q.evidence!.excerpt.replace(/…$/, '').toLowerCase());
    }
    expect(qs.some((q) => q.evidence?.ref === 'experience[0].bullets[0]')).toBe(true);
  });

  it('separates general-knowledge and gap questions from claims about the candidate', () => {
    const kube = qs.find((q) => q.text.includes('Kubernetes'))!;
    expect(kube).toMatchObject({ grounding: 'GENERAL', notOnResume: true });
    expect(kube.hint).toMatch(/do not imply work experience/);
    const gap = qs.find((q) => q.category === 'GAP_PREPARATION')!;
    expect(gap.text).toMatch(/Terraform/);
    expect(gap.text).toMatch(/does not show it/);
    expect(gap.evidence).toBeUndefined();
  });

  it('distinguishes project use from work use and includes job-specific questions', () => {
    expect(qs.find((q) => q.text.includes('Rusty'))).toMatchObject({ grounding: 'RESUME', evidence: { ref: 'projects[0]' } });
    expect(qs.filter((q) => q.category === 'JOB_SPECIFIC').some((q) => q.text.includes('Platform Engineer role at Globex'))).toBe(true);
  });

  it('is deterministic with unique ids, and works with an empty resume', () => {
    expect(JSON.stringify(buildQuestions(model, { roleTitle: 'X' }))).toBe(JSON.stringify(buildQuestions(model, { roleTitle: 'X' })));
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
    const empty = buildQuestions({ ...model, sections: [] } as RenderModel);
    expect(empty.length).toBeGreaterThanOrEqual(2);
  });
});

describe('evaluateAnswer', () => {
  const q = { text: 'Your resume says: "Cut API latency by 40% by adding Redis caching". Tell me about it.', grounding: 'RESUME' as const, category: 'BEHAVIOURAL' as const, evidence: { ref: 'x', excerpt: 'Cut API latency by 40% by adding Redis caching' } };
  const corpus = resumeCorpus(model);
  const good = 'When our API latency was hurting checkout, my role was to find the bottleneck. I profiled the endpoints, decided to add Redis caching and implemented it with a 5 minute TTL. As a result latency dropped by 40% and we saved 2 servers.';

  it('rates a structured, specific, aligned answer highly', () => {
    const f = evaluateAnswer(q, good, corpus);
    expect(f.starCoverage).toEqual({ situation: true, task: true, action: true, result: true });
    expect(f.structure.rating).toBe('strong');
    expect(f.specificity.rating).toBe('strong');
    expect(f.evidenceAlignment.rating).toBe('strong');
    expect(f.unsupportedTerms).toEqual([]);
  });

  it('coaches a thin answer and warns about claims that are not on the resume', () => {
    const f = evaluateAnswer(q, 'I used Kafka and Spark a lot.', corpus);
    expect(f.structure.rating).toBe('improve');
    expect(f.clarity.rating).toBe('improve');
    expect(f.unsupportedTerms).toEqual(['kafka', 'spark']);
    expect(f.evidenceAlignment.tip).toMatch(/not on this resume version/);
  });

  it('does not flag terms already present in the question or resume', () => {
    expect(evaluateAnswer(q, good, corpus).unsupportedTerms).not.toContain('redis');
  });

  it('gives guidance, not a score, and avoids judging voice or personality', () => {
    const f: any = evaluateAnswer(q, good, corpus);
    expect(JSON.stringify(Object.keys(f))).not.toMatch(/score|overall|total/i);
    expect(f.note).toMatch(/not a score/);
    expect(f.note).toMatch(/accent, appearance or personality/);
  });
});

describe('InterviewService', () => {
  const user = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
  const questions = buildQuestions(model);
  const row = (over: any = {}) => ({ id: 's1', tenantId: 't1', userId: 'u1', title: 'T', resumeId: 'r', resumeVersionId: null, roleTitle: null, company: null, questions, generator: 'deterministic-1', createdAt: new Date(), updatedAt: new Date(), ...over });
  const mk = (found: any = row()) => {
    const prisma: any = {
      interviewPrepSession: {
        create: jest.fn().mockImplementation(async (a: any) => row(a.data)), findFirst: jest.fn().mockResolvedValue(found), findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockImplementation(async (a: any) => row(a.data)), delete: jest.fn(),
      },
    };
    const source: any = { load: jest.fn().mockResolvedValue({ resumeId: 'r', name: 'My resume', model, versionId: null, versionNumber: null, hash: 'h' }) };
    return { svc: new InterviewService(prisma, source), prisma, source };
  };

  it('loads the resume through the owner-checked source and stores the owner from the token', async () => {
    const { svc, prisma, source } = mk();
    const v = await svc.create(user, { resumeId: 'r', roleTitle: 'Dev' });
    expect(source.load).toHaveBeenCalledWith(user, 'r', undefined);
    expect(prisma.interviewPrepSession.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', userId: 'u1', title: 'My resume practice' });
    expect(v.progress.total).toBeGreaterThan(0);
  });

  it('filters by tenant and owner; foreign sessions are 404', async () => {
    const { svc, prisma } = mk(null);
    await expect(svc.get(user, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.interviewPrepSession.findFirst).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't1', userId: 'u1' } });
    await expect(svc.remove(user, 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stores an answer with feedback and marks the question practised; works even if the resume is gone', async () => {
    const { svc, prisma, source } = mk();
    source.load.mockRejectedValue(new NotFoundException());
    await svc.feedback(user, 's1', 'q-1', { answer: 'I walked through my career. At Acme I led a team and cut latency by 40%.' });
    const saved = prisma.interviewPrepSession.update.mock.calls[0][0].data.questions.find((q: any) => q.id === 'q-1');
    expect(saved.practiced).toBe(true);
    expect(saved.feedback.relevance).toBeDefined();
    await expect(svc.updateQuestion(user, 's1', 'nope', { practiced: true })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('editing an answer clears stale feedback', async () => {
    const withFb = row({ questions: questions.map((q) => (q.id === 'q-1' ? { ...q, answer: 'old', feedback: { x: 1 } } : q)) });
    const { svc, prisma } = mk(withFb);
    await svc.updateQuestion(user, 's1', 'q-1', { answer: 'new' });
    expect(prisma.interviewPrepSession.update.mock.calls[0][0].data.questions.find((q: any) => q.id === 'q-1').feedback).toBeNull();
  });
});
