import { BadRequestException, NotFoundException } from '@nestjs/common';
import { buildQuestions, giveFeedback, MAX_QUESTIONS } from '../src/interview-copilot/copilot-logic';
import { InterviewCopilotService } from '../src/interview-copilot/interview-copilot.service';

const profile: any = {
  skills: [{ id: 's1', name: 'Docker' }, { id: 's2', name: 'PostgreSQL', isUserConfirmed: false }],
  experiences: [{ id: 'e1', jobTitle: 'Backend Engineer', employerName: 'Acme', isCurrent: true, startDate: '2022-01', bullets: [{ content: 'Deployed services on AWS' }] }], projects: [],
};

describe('question generation', () => {
  const qs = buildQuestions(profile, 'Platform Engineer', ['Cloud platform', 'Docker', 'Kubernetes', 'aws']);
  it('grounds each question in the resume or the posting and explains why', () => {
    expect(qs[0].id).toBe('q-recent');
    for (const q of qs) expect(q.why.length).toBeGreaterThan(10);
    expect(qs.find((q) => q.id === 'q-s1')?.why).toMatch(/skills list/);
    expect(qs.find((q) => q.kind === 'EXPERIENCE' && q.text.includes('Acme'))).toBeTruthy();
  });
  it('marks unsupported requirements as gap questions and says so honestly', () => {
    const g = qs.find((q) => q.kind === 'GAP' && q.text.includes('Kubernetes'))!;
    expect(g.why).toMatch(/does not mention it/);
    expect(g.text).toMatch(/honest|approach/i);
  });
  it('ignores unconfirmed skills and caps the list', () => {
    expect(buildQuestions(profile, 'X', ['PostgreSQL']).find((q) => q.kind === 'GAP')).toBeTruthy();
    expect(buildQuestions(profile, 'X', Array.from({ length: 30 }, (_, i) => `t${i}`)).length).toBeLessThanOrEqual(MAX_QUESTIONS);
  });
});

describe('feedback', () => {
  const q = { id: 'q-x', kind: 'EXPERIENCE' as const, text: 'Tell me about a time you used Docker in your work at Acme.', why: 'w' };
  const good = 'At Acme our team had a deployment problem and my task was to make releases repeatable. I built Docker images for each service and set up the pipeline, which reduced release time from 2 hours to 20 minutes, so that we could ship daily.';
  it('rates content aspects, never the person, and has no numeric score', () => {
    const f = giveFeedback(good, q, profile);
    expect(f.map((d) => d.key)).toEqual(['relevance', 'structure', 'specificity', 'evidence', 'clarity']);
    expect(f.find((d) => d.key === 'structure')!.status).toBe('STRONG');
    expect(f.find((d) => d.key === 'specificity')!.status).toBe('STRONG');
    expect(f.find((d) => d.key === 'evidence')!.status).toBe('STRONG');
    expect(JSON.stringify(f)).not.toMatch(/score|confiden|tone|accent|emotion|personality|hire/i);
  });
  it('gives actionable, honest pointers for a thin answer and never quotes it', () => {
    const f = giveFeedback('I used it a lot.', q, profile);
    expect(f.every((d) => d.status === 'COULD_IMPROVE')).toBe(true);
    expect(f.find((d) => d.key === 'specificity')!.observation).toMatch(/only real ones/);
    expect(JSON.stringify(f)).not.toContain('I used it a lot');
  });
});

describe('InterviewCopilotService', () => {
  const user = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
  const NOW = new Date();
  const sess = (o: any = {}) => ({ id: 's1', tenantId: 't1', userId: 'u1', jobTitle: 'Eng', resumeId: 'r1', versionNumber: 1, terms: [], retainAnswers: false, status: 'ACTIVE', createdAt: NOW, answers: [],
    questions: [{ id: 'q-recent', kind: 'GENERAL', text: 'Walk me through', why: 'w' }], ...o });
  const mk = (over: any = {}) => {
    const prisma: any = {
      resume: { findFirst: jest.fn().mockResolvedValue(over.resume === undefined ? { id: 'r1' } : over.resume) },
      resumeVersion: { findFirst: jest.fn().mockResolvedValue(over.version === undefined ? { id: 'v1' } : over.version) },
      copilotSession: {
        findFirst: jest.fn().mockResolvedValue(over.session === undefined ? sess() : over.session), count: jest.fn().mockResolvedValue(over.count ?? 0),
        create: jest.fn().mockImplementation(async (a: any) => sess({ ...a.data, answers: [] })), findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}), delete: jest.fn(),
      },
      copilotAnswer: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({}), updateMany: jest.fn() },
    };
    return { svc: new InterviewCopilotService(prisma, { get: jest.fn().mockResolvedValue(profile) } as any), prisma };
  };
  const dto = (o: any = {}) => ({ resumeId: 'r1', versionNumber: 1, jobTitle: 'Platform Engineer', jobDescription: 'We run Docker and Kubernetes.', retainAnswers: false, confirmPracticeOnly: true, ...o });

  it('requires practice-only confirmation, an owned resume and a saved version', async () => {
    await expect(mk().svc.create(user, dto({ confirmPracticeOnly: false }))).rejects.toBeInstanceOf(BadRequestException);
    const a = mk({ resume: null });
    await expect(a.svc.create(user, dto())).rejects.toBeInstanceOf(NotFoundException);
    expect(a.prisma.resume.findFirst).toHaveBeenCalledWith({ where: { id: 'r1', tenantId: 't1', profile: { userId: 'u1' } } });
    await expect(mk({ version: null }).svc.create(user, dto())).rejects.toBeInstanceOf(NotFoundException);
  });
  it('stores extracted terms but not the raw job description, and retention is off by default', async () => {
    const { svc, prisma } = mk();
    const s: any = await svc.create(user, dto());
    const data = prisma.copilotSession.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: 't1', userId: 'u1', retainAnswers: false });
    expect(JSON.stringify(data)).not.toContain('We run');
    expect(s.mode).toBe('TEXT_PRACTICE');
    expect(s.notice).toMatch(/Practice only/);
  });
  it('does not persist answer text unless the user opted in', async () => {
    const off = mk();
    const r: any = await off.svc.answer(user, 's1', { questionId: 'q-recent', text: 'I built things at Acme.' });
    expect(off.prisma.copilotAnswer.create.mock.calls[0][0].data.text).toBeNull();
    expect(r.retained).toBe(false);
    const on = mk({ session: sess({ retainAnswers: true }) });
    await on.svc.answer(user, 's1', { questionId: 'q-recent', text: 'I built things at Acme.' });
    expect(on.prisma.copilotAnswer.create.mock.calls[0][0].data.text).toBe('I built things at Acme.');
    await expect(off.svc.answer(user, 's1', { questionId: 'nope', text: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });
  it('turning retention off wipes stored text; delete removes the session; foreign sessions 404', async () => {
    const a = mk({ session: sess({ retainAnswers: true }) });
    await a.svc.consent(user, 's1', { retainAnswers: false });
    expect(a.prisma.copilotAnswer.updateMany).toHaveBeenCalledWith({ where: { sessionId: 's1' }, data: { text: null } });
    await a.svc.remove(user, 's1');
    expect(a.prisma.copilotSession.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    const m = mk({ session: null });
    await expect(m.svc.get(user, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(m.prisma.copilotSession.findFirst.mock.calls[0][0].where).toEqual({ id: 'x', tenantId: 't1', userId: 'u1' });
  });
  it('the summary counts aspects of answers and rates no one', async () => {
    const fb = [{ key: 'relevance', status: 'STRONG' }, { key: 'clarity', status: 'COULD_IMPROVE' }];
    const { svc } = mk({ session: sess({ answers: [{ feedback: fb }, { feedback: fb }] }) });
    const s: any = await svc.summary(user, 's1');
    expect(s.dimensions.relevance).toEqual({ strong: 2, couldImprove: 0 });
    expect(s.note).toMatch(/not a rating of you/);
    expect(JSON.stringify(s)).not.toMatch(/"score"/);
  });
});
