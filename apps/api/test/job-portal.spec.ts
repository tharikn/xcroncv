import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { JobPortalService } from '../src/job-portal/job-portal.service';
import { buildProposal, requirementTerms } from '../src/job-portal/tailoring';

const profile: any = {
  skills: [{ id: 's1', name: 'Docker' }, { id: 's2', name: 'Kubernetes', isUserConfirmed: false }],
  experiences: [{ id: 'e1', jobTitle: 'Engineer', employerName: 'Acme', bullets: [{ content: 'Deployed services on AWS' }] }], projects: [],
};

describe('tailoring proposals', () => {
  it('merges host requirements with known description terms, de-duplicated and capped', () => {
    const t = requirementTerms('We use Docker daily and AWS.', ['docker', 'Mentoring']);
    expect(t).toEqual(expect.arrayContaining(['docker', 'Mentoring', 'Cloud platform']));
    expect(t.filter((x) => x.toLowerCase() === 'docker')).toHaveLength(1);
    expect(requirementTerms('x'.repeat(30), Array.from({ length: 50 }, (_, i) => `t${i}`))).toHaveLength(30);
  });
  it('points only at confirmed facts and never proposes adding unsupported skills', () => {
    const items = buildProposal(profile, ['Docker', 'Kubernetes', 'aws']);
    expect(items.find((i) => i.requirement === 'Docker')).toMatchObject({ type: 'EMPHASISE_SKILL', refs: [{ id: 's1' }] });
    expect(items.find((i) => i.requirement === 'aws')).toMatchObject({ type: 'LEAD_WITH_EXPERIENCE', refs: [{ id: 'e1' }] });
    const k = items.find((i) => i.requirement === 'Kubernetes')!; // unconfirmed skill is ignored
    expect(k.type).toBe('NO_RECORDED_EVIDENCE');
    expect(k.refs).toEqual([]);
    expect(k.note).toMatch(/only if it is true/);
    for (const i of items) expect(i.type === 'NO_RECORDED_EVIDENCE' || i.refs.length > 0).toBe(true);
  });
});

describe('JobPortalService', () => {
  const user = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
  const NOW = new Date();
  const ctx = (o: any = {}) => ({ id: 'c1', tenantId: 't1', userId: 'u1', hostId: 'xcron-jobs', externalId: 'j9', title: 'Eng', company: 'Acme', location: null, applyUrl: null, description: 'Docker and AWS needed daily.', requirements: ['Docker'], updatedAt: NOW, ...o });
  const dto = (o: any = {}) => ({ hostId: 'xcron-jobs', externalId: 'j9', title: 'Eng', company: 'Acme', description: '<b>Docker</b> and AWS needed daily.', consent: true, ...o });
  const mk = (over: any = {}) => {
    const prisma: any = {
      portalJobContext: {
        findFirst: jest.fn().mockResolvedValue(over.ctx === undefined ? ctx() : over.ctx), findUnique: jest.fn().mockResolvedValue(over.existing ?? null), count: jest.fn().mockResolvedValue(over.count ?? 0),
        upsert: jest.fn().mockImplementation(async (a: any) => ctx({ ...a.create })), findMany: jest.fn().mockResolvedValue([ctx()]), delete: jest.fn(),
      },
      resume: { findFirst: jest.fn().mockResolvedValue(over.resume === undefined ? { id: 'r1' } : over.resume) },
      resumeVersion: { findFirst: jest.fn().mockResolvedValue(over.version === undefined ? { id: 'v1' } : over.version) },
      tailoringProposal: {
        create: jest.fn().mockImplementation(async (a: any) => ({ id: 'p1', decisions: {}, createdAt: NOW, ...a.data })), findFirst: jest.fn().mockResolvedValue(over.proposal === undefined ? null : over.proposal),
        findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockImplementation(async (a: any) => ({ id: 'p1', jobContextId: 'c1', resumeId: 'r1', items: over.proposal?.items ?? [], createdAt: NOW, ...a.data })), deleteMany: jest.fn(),
      },
      portalApplication: {
        findFirst: jest.fn().mockResolvedValue(over.app ?? null), create: jest.fn().mockImplementation(async (a: any) => ({ id: 'a1', ...a.data })),
        findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockImplementation(async (a: any) => ({ id: 'a1', ...a.data })), delete: jest.fn(), deleteMany: jest.fn(),
      },
    };
    const profiles: any = { get: jest.fn().mockResolvedValue(profile) };
    return { svc: new JobPortalService(prisma, profiles), prisma };
  };

  it('needs consent, sanitises, and keys the context by tenant, user and opaque host ref', async () => {
    await expect(mk().svc.upsertContext(user, dto({ consent: false }))).rejects.toBeInstanceOf(BadRequestException);
    const { svc, prisma } = mk();
    const r: any = await svc.upsertContext(user, dto({ requirements: ['Mentoring'] }));
    const a = prisma.portalJobContext.upsert.mock.calls[0][0];
    expect(a.where.tenantId_userId_hostId_externalId).toEqual({ tenantId: 't1', userId: 'u1', hostId: 'xcron-jobs', externalId: 'j9' });
    expect(a.create.description).not.toContain('<b>');
    expect(r.requirements).toContain('Mentoring');
    await expect(mk().svc.upsertContext(user, dto({ applyUrl: 'javascript:x' }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(mk({ count: 300 }).svc.upsertContext(user, dto())).rejects.toBeInstanceOf(ConflictException);
  });
  it('hides foreign jobs and resumes', async () => {
    const a = mk({ ctx: null });
    await expect(a.svc.getContext(user, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(a.prisma.portalJobContext.findFirst).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't1', userId: 'u1' } });
    const b = mk({ resume: null });
    await expect(b.svc.createProposal(user, 'c1', { resumeId: 'r9' })).rejects.toBeInstanceOf(NotFoundException);
    expect(b.prisma.resume.findFirst).toHaveBeenCalledWith({ where: { id: 'r9', tenantId: 't1', profile: { userId: 'u1' } } });
  });
  it('creates a proposal that is pending and applies nothing; decisions are per item', async () => {
    const { svc, prisma } = mk();
    const p: any = await svc.createProposal(user, 'c1', { resumeId: 'r1' });
    expect(p.items.every((i: any) => i.decision === 'PENDING')).toBe(true);
    expect(p.notice).toMatch(/change nothing until you edit/);
    expect(prisma.resume.findFirst).toHaveBeenCalled();
    const d = mk({ proposal: { id: 'p1', items: [{ id: 'i0s', type: 'EMPHASISE_SKILL', refs: [], requirement: 'x', note: 'n' }], decisions: {} } });
    const out: any = await d.svc.decide(user, 'p1', { itemId: 'i0s', decision: 'ACCEPT' });
    expect(out.items[0].decision).toBe('ACCEPT');
    await expect(d.svc.decide(user, 'p1', { itemId: 'nope', decision: 'ACCEPT' })).rejects.toBeInstanceOf(NotFoundException);
  });
  it('records the exact saved resume version only with confirmation and ownership', async () => {
    await expect(mk().svc.record(user, { jobContextId: 'c1', resumeId: 'r1', versionNumber: 2, confirm: false })).rejects.toBeInstanceOf(BadRequestException);
    await expect(mk({ version: null }).svc.record(user, { jobContextId: 'c1', resumeId: 'r1', versionNumber: 9, confirm: true })).rejects.toBeInstanceOf(NotFoundException);
    await expect(mk({ ctx: null }).svc.record(user, { jobContextId: 'c1', resumeId: 'r1', versionNumber: 1, confirm: true })).rejects.toBeInstanceOf(NotFoundException);
    const ok = mk();
    await ok.svc.record(user, { jobContextId: 'c1', resumeId: 'r1', versionNumber: 2, confirm: true });
    expect(ok.prisma.portalApplication.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', userId: 'u1', versionNumber: 2, resumeId: 'r1' });
    const dup = mk({ app: { id: 'a0' } });
    expect(((await dup.svc.record(user, { jobContextId: 'c1', resumeId: 'r1', versionNumber: 2, confirm: true })) as any).id).toBe('a0');
    expect(dup.prisma.portalApplication.create).not.toHaveBeenCalled();
  });
  it('host status is only a user-mirrored label; deletion cascades the job references', async () => {
    const a = mk({ app: { id: 'a1' } });
    const s: any = await a.svc.setHostStatus(user, 'a1', { hostStatus: '<b>Interview</b>' });
    expect(s.hostStatus).toBe('Interview');
    await expect(mk().svc.setHostStatus(user, 'a1', { hostStatus: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    const r = mk();
    await r.svc.removeContext(user, 'c1');
    expect(r.prisma.tailoringProposal.deleteMany).toHaveBeenCalled();
    expect(r.prisma.portalApplication.deleteMany).toHaveBeenCalled();
  });
});
