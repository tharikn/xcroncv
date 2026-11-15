import { BadRequestException, NotFoundException } from '@nestjs/common';
import { analyzeProfile, assess, currentRoleId, mentions, suggestMilestones, ProfileLike } from '../src/career-path/analysis';
import { CareerPathService } from '../src/career-path/career-path.service';
import { CompensationProvider, normalizeObservations } from '../src/career-path/compensation';
import { roleById, ROLES } from '../src/career-path/role-taxonomy';

const profile = (over: Partial<ProfileLike> = {}): ProfileLike => ({
  skills: [{ id: 's1', name: 'TypeScript' }, { id: 's2', name: 'PostgreSQL' }, { id: 's3', name: 'Docker' }, { id: 's4', name: 'Git' }],
  experiences: [{ id: 'e1', jobTitle: 'Backend Engineer', employerName: 'Acme', isCurrent: true, startDate: '2022-01', description: null,
    bullets: [{ content: 'Built REST APIs with NestJS and wrote Jest unit tests' }, { content: 'Mentored two junior developers' }] }],
  projects: [], ...over,
});

describe('role taxonomy', () => {
  it('is internally consistent: unique ids, adjacency targets exist, every role has requirements', () => {
    const ids = new Set(ROLES.map((r) => r.id));
    expect(ids.size).toBe(ROLES.length);
    for (const r of ROLES) { expect(r.required.length).toBeGreaterThan(2); for (const a of r.adjacent) expect(ids.has(a)).toBe(true); }
  });
});

describe('matching', () => {
  it('matches whole tokens only', () => {
    expect(mentions('Worked with Google Cloud', 'go')).toBe(false);
    expect(mentions('Wrote Go services', 'go')).toBe(true);
    expect(mentions('React and Redux', 'r')).toBe(false);
    expect(mentions('CI/CD pipeline', 'ci/cd')).toBe(true);
    expect(mentions('C# developer', 'c#')).toBe(true);
  });
});

describe('evidence assessment', () => {
  it('separates listed skills, experience-only evidence and no recorded evidence', () => {
    const a = assess(profile(), roleById('backend-engineer')!);
    const by = Object.fromEntries(a.map((s) => [s.label, s]));
    expect(by['SQL'].status).toBe('RECORDED_SKILL');
    expect(by['REST APIs'].status).toBe('RECORDED_IN_EXPERIENCE'); // in a bullet, not on the skills list
    expect(by['REST APIs'].evidence[0]).toMatchObject({ type: 'experience', id: 'e1' });
    expect(by['Testing'].status).toBe('RECORDED_IN_EXPERIENCE');
    const k8s = assess(profile(), roleById('devops-engineer')!).find((s) => s.label === 'Kubernetes')!;
    expect(k8s.status).toBe('NO_RECORDED_EVIDENCE');
    expect(k8s.evidence).toEqual([]);
  });
  it('ignores skills and bullets the user has not confirmed', () => {
    const p = profile({ skills: [{ id: 's9', name: 'Kubernetes', isUserConfirmed: false }] });
    expect(assess(p, roleById('devops-engineer')!).find((s) => s.label === 'Kubernetes')!.status).toBe('NO_RECORDED_EVIDENCE');
  });
});

describe('analysis', () => {
  it('detects the current role family and prefers natural next steps', () => {
    expect(currentRoleId(profile())).toBe('backend-engineer');
    expect(currentRoleId(profile({ experiences: [] }))).toBeNull();
    expect(currentRoleId(profile({ experiences: [{ id: 'x', jobTitle: 'Software Engineer', employerName: 'A', bullets: [] }] }))).toBe('backend-engineer');
    const r = analyzeProfile(profile());
    expect(r.currentRole?.id).toBe('backend-engineer');
    expect(r.options.length).toBeLessThanOrEqual(5);
    expect(r.options.map((o) => o.roleId)).not.toContain('backend-engineer');
    expect(r.options[0].adjacentToCurrent).toBe(true);
    expect(r.notes.join(' ')).toMatch(/not that you lack the skill/);
  });
  it('every option cites supporting facts and states coverage as counts, never a score', () => {
    const r = analyzeProfile(profile(), { targetRoleId: 'devops-engineer' });
    expect(r.options[0]).toMatchObject({ roleId: 'devops-engineer', isTarget: true });
    for (const o of r.options) {
      expect(o.coverage.total).toBeGreaterThan(0);
      expect(o.why.length).toBeGreaterThan(0);
      for (const s of o.skills.filter((x) => x.status !== 'NO_RECORDED_EVIDENCE')) expect(s.evidence.length).toBeGreaterThan(0);
      expect(JSON.stringify(o)).not.toMatch(/probability|likelihood|hire/i);
    }
  });
  it('an empty profile yields zero coverage and an honest explanation', () => {
    const o = analyzeProfile(profile({ skills: [], experiences: [] }), { targetRoleId: 'data-analyst' }).options[0];
    expect(o.coverage.covered).toBe(0);
    expect(o.why.join(' ')).toMatch(/does not yet record evidence/);
  });
  it('milestones ask to record or build evidence, never claim a missing skill', () => {
    const m = suggestMilestones({ noRecordedEvidence: ['A', 'B', 'C', 'D', 'E', 'F'] });
    expect(m).toHaveLength(5);
    expect(m[0].title).toMatch(/Record or build evidence/);
  });
});

describe('compensation normalisation', () => {
  const NOW = new Date('2026-06-01T00:00:00Z');
  const good = { role: 'Backend Engineer', geography: 'Germany', currency: 'EUR', period: 'YEAR', p25: 50000, median: 60000, p75: 70000, sampleSize: 120, source: 'Licensed Survey 2026', observedAt: '2026-03-01', licensedUse: true };
  it('keeps only fully attributed, licensed, plausible observations', () => {
    expect(normalizeObservations([good], NOW)).toHaveLength(1);
    expect(normalizeObservations([{ ...good, source: '' }], NOW)).toHaveLength(0);
    expect(normalizeObservations([{ ...good, geography: undefined }], NOW)).toHaveLength(0);
    expect(normalizeObservations([{ ...good, currency: 'eur' }], NOW)).toHaveLength(0);
    expect(normalizeObservations([{ ...good, observedAt: 'nope' }], NOW)).toHaveLength(0);
    expect(normalizeObservations([{ ...good, observedAt: '2027-01-01' }], NOW)).toHaveLength(0);
    expect(normalizeObservations([{ ...good, licensedUse: false }], NOW)).toHaveLength(0);
    expect(normalizeObservations([{ ...good, median: undefined }], NOW)).toHaveLength(0);
    expect(normalizeObservations([{ ...good, p25: 90000 }], NOW)).toHaveLength(0);
    expect(normalizeObservations([{ ...good, median: -5 }], NOW)).toHaveLength(0);
  });
});

describe('CareerPathService', () => {
  const user = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
  const NOW = new Date();
  const plan = (over: any = {}) => ({ id: 'p1', tenantId: 't1', userId: 'u1', title: 'T', targetRoleId: 'devops-engineer', taxonomyVersion: '1', basis: {}, status: 'ACTIVE', notes: null, createdAt: NOW, updatedAt: NOW,
    milestones: [{ id: 'm1', planId: 'p1', title: 'x', targetDate: null, status: 'NOT_STARTED', notes: null, position: 0 }], ...over });
  const mk = (over: any = {}, providers: CompensationProvider[] = []) => {
    const prisma: any = {
      careerPlan: {
        findFirst: jest.fn().mockResolvedValue(over.plan === undefined ? plan() : over.plan), findMany: jest.fn().mockResolvedValue([plan()]), count: jest.fn().mockResolvedValue(over.count ?? 0),
        create: jest.fn().mockImplementation(async (a: any) => plan({ ...a.data, milestones: a.data.milestones.create.map((m: any, i: number) => ({ id: `m${i}`, status: 'NOT_STARTED', ...m })) })),
        update: jest.fn().mockResolvedValue({}), delete: jest.fn(),
      },
      careerMilestone: { create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}), delete: jest.fn() },
    };
    const profiles: any = { get: jest.fn().mockImplementation(async () => { if (over.noProfile) throw new NotFoundException('Career profile not found'); return profile(); }) };
    return { svc: new CareerPathService(prisma, profiles, providers), prisma };
  };

  it('analysis needs a profile and saves nothing', async () => {
    const a = mk();
    expect((await a.svc.analyze(user, {})).options.length).toBeGreaterThan(0);
    expect(a.prisma.careerPlan.create).not.toHaveBeenCalled();
    await expect(mk({ noProfile: true }).svc.analyze(user, {})).rejects.toBeInstanceOf(NotFoundException);
  });
  it('creates a plan with owner from the token, a basis snapshot and editable starter milestones', async () => {
    const { svc, prisma } = mk();
    const r: any = await svc.create(user, { roleId: 'devops-engineer' });
    const data = prisma.careerPlan.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: 't1', userId: 'u1', targetRoleId: 'devops-engineer', taxonomyVersion: '1' });
    expect(data.basis.noRecordedEvidence.length).toBeGreaterThan(0);
    expect(r.milestones.length).toBeGreaterThan(0);
    await expect(mk().svc.create(user, { roleId: 'astronaut' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(mk({ count: 20 }).svc.create(user, { roleId: 'devops-engineer' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('filters by tenant AND owner and hides foreign plans and milestones', async () => {
    const a = mk({ plan: null });
    await expect(a.svc.get(user, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(a.prisma.careerPlan.findFirst.mock.calls[0][0].where).toEqual({ id: 'x', tenantId: 't1', userId: 'u1' });
    await expect(a.svc.updateMilestone(user, 'x', 'm1', { status: 'DONE' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(mk().svc.updateMilestone(user, 'p1', 'not-mine', { status: 'DONE' })).rejects.toBeInstanceOf(NotFoundException);
  });
  it('updates milestones and reports progress', async () => {
    const { svc, prisma } = mk();
    await svc.updateMilestone(user, 'p1', 'm1', { status: 'DONE', targetDate: '2027-01-31' });
    expect(prisma.careerMilestone.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { status: 'DONE', targetDate: '2027-01-31' } });
    const p: any = await mk({ plan: plan({ milestones: [{ id: 'a', status: 'DONE', position: 0 }, { id: 'b', status: 'NOT_STARTED', position: 1 }] }) }).svc.get(user, 'p1');
    expect(p.progress).toEqual({ done: 1, total: 2 });
  });
  it('compensation: no source means no number; a provider yields only attributed rows; provider failure degrades', async () => {
    const none: any = await mk().svc.compensation(user, { role: 'Backend Engineer', location: 'Germany' });
    expect(none).toMatchObject({ available: false, observations: [] });
    expect(none.reason).toMatch(/does not estimate pay/);
    const provider: CompensationProvider = { id: 'p', fetch: async () => [
      { role: 'Backend Engineer', geography: 'Germany', currency: 'EUR', median: 60000, source: 'Survey', observedAt: '2026-01-01', licensedUse: true },
      { role: 'Backend Engineer', geography: 'Germany', currency: 'EUR', median: 99999, observedAt: '2026-01-01', licensedUse: true },
    ] };
    const some: any = await mk({}, [provider]).svc.compensation(user, { role: 'Backend Engineer' });
    expect(some.observations).toHaveLength(1);
    expect(some.observations[0]).toMatchObject({ source: 'Survey', geography: 'Germany', currency: 'EUR' });
    const broken: CompensationProvider = { id: 'b', fetch: async () => { throw new Error('down'); } };
    expect(((await mk({}, [broken]).svc.compensation(user, { role: 'x' })) as any).available).toBe(false);
  });
});
