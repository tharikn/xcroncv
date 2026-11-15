import { BadRequestException, GoneException, NotFoundException } from '@nestjs/common';
import { ExpertReviewService } from '../src/expert-review/expert-review.service';
import { NotConfiguredPaymentProvider, PACKAGES, REVIEWERS, reviewStatus } from '../src/expert-review/expert-review-logic';

const user = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
const NOW = new Date('2026-06-01T10:00:00Z');
const DAY = 86_400_000;
const model: any = {
  header: { name: 'Ada Lovelace', headline: 'Programmer', contacts: ['ada@example.com', '+44 20 7946 0000', 'London'], links: ['https://example.com/ada'] },
  sections: [{ type: 'summary', title: 'Summary' }, { type: 'experience', title: 'Experience' }, { type: 'skills', title: 'Skills' }],
};
const base = (o: any = {}) => ({
  id: 'r1', tenantId: 't1', userId: 'u1', resumeId: 'res1', resumeVersionId: 'v1', versionNumber: 2, reviewerId: 'rv-sample-tech', reviewerLabel: REVIEWERS[0].displayName,
  packageId: 'pk-full', scope: { sections: ['summary', 'experience'], contacts: { email: 'hidden', phone: 'hidden', location: 'hidden' }, links: 'hidden' },
  consentAt: NOW, expiresAt: new Date(NOW.getTime() + 7 * DAY), revokedAt: null, paymentStatus: 'NOT_CONFIGURED', paymentRef: null, createdAt: NOW, ...o,
});
const dto: any = { resumeId: 'res1', reviewerId: 'rv-sample-tech', packageId: 'pk-full', sections: ['summary', 'experience'], contacts: { email: 'hidden', phone: 'visible', location: 'hidden' }, expiresInDays: 7, consent: true };

function mk(over: any = {}) {
  const prisma: any = {
    resumeVersion: { findFirst: jest.fn().mockResolvedValue(over.version === undefined ? { id: 'v1', versionNumber: 2 } : over.version) },
    resume: { findFirst: jest.fn().mockResolvedValue(over.resume === undefined ? { id: 'res1' } : over.resume) },
    expertReviewRequest: {
      findFirst: jest.fn().mockResolvedValue(over.req === undefined ? base() : over.req), count: jest.fn().mockResolvedValue(over.count ?? 0),
      create: jest.fn().mockImplementation(async (a: any) => base(a.data)), findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(async (a: any) => base(a.data)), delete: jest.fn(),
    },
    expertReviewFeedback: {
      findFirst: jest.fn().mockResolvedValue(over.fb === undefined ? { id: 'f1', requestId: 'r1', status: 'NEW' } : over.fb), count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async (a: any) => ({ id: 'f1', status: 'NEW', ...a.data })), update: jest.fn().mockImplementation(async (a: any) => ({ id: 'f1', requestId: 'r1', ...a.data })),
    },
    expertReviewEvent: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
  };
  const source: any = { load: jest.fn().mockResolvedValue({ model }) };
  return { svc: new ExpertReviewService(prisma, source, new NotConfiguredPaymentProvider()), prisma, source };
}
const kinds = (p: any) => p.expertReviewEvent.create.mock.calls.map((c: any) => c[0].data.kind);

describe('directory and payment', () => {
  it('lists seeded reviewers with vetting, service level and conflict policy, and says payment is not configured', () => {
    const { svc } = mk();
    expect(svc.reviewers().length).toBeGreaterThan(0);
    for (const r of svc.reviewers()) { expect(r.vetting).toBeDefined(); expect(r.serviceLevelDays).toBeGreaterThan(0); expect(r.conflictPolicy).toBeTruthy(); }
    const p = svc.packages();
    expect(p.payment).toMatchObject({ configured: false, provider: 'none' });
    expect(p.payment.note).toMatch(/not charged/);
    expect(p.packages).toBe(PACKAGES);
  });
  it('default provider never produces a reference', async () => {
    expect(await new NotConfiguredPaymentProvider().checkout()).toMatchObject({ configured: false, status: 'NOT_CONFIGURED', reference: null });
  });
});

describe('create (consent, scope, ownership)', () => {
  it('requires explicit consent and stores nothing without it', async () => {
    const { svc, prisma } = mk();
    await expect(svc.create(user, { ...dto, consent: false }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.expertReviewRequest.create).not.toHaveBeenCalled();
  });
  it('records consent, scope, expiry, owner from the token, pins the saved version and audits without content', async () => {
    const { svc, prisma } = mk();
    const r: any = await svc.create({ ...user, userId: 'u1' }, { ...dto, userId: 'evil', tenantId: 'evil' }, NOW);
    const data = prisma.expertReviewRequest.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: 't1', userId: 'u1', resumeVersionId: 'v1', versionNumber: 2, consentAt: NOW, paymentStatus: 'NOT_CONFIGURED', paymentRef: null });
    expect(data.expiresAt).toEqual(new Date(NOW.getTime() + 7 * DAY));
    expect(data.scope).toEqual({ sections: ['summary', 'experience'], contacts: { email: 'hidden', phone: 'visible', location: 'hidden' }, links: 'hidden' });
    expect(r.status).toBe('ACTIVE');
    expect(kinds(prisma)).toEqual(['REQUESTED', 'GRANTED']);
    for (const c of prisma.expertReviewEvent.create.mock.calls) expect(JSON.stringify(c[0].data)).not.toMatch(/Ada|Lovelace/);
  });
  it('looks up the version by tenant AND owner and refuses the working draft or foreign ids', async () => {
    const { svc, prisma } = mk({ version: null });
    await expect(svc.create(user, dto, NOW)).rejects.toBeInstanceOf(BadRequestException); // resume exists, no saved version
    expect(prisma.resumeVersion.findFirst.mock.calls[0][0].where.resume).toEqual({ tenantId: 't1', profile: { userId: 'u1' } });
    await expect(mk({ version: null, resume: null }).svc.create(user, dto, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(mk({ version: null }).svc.create(user, { ...dto, resumeVersionId: 'other' }, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('rejects unknown reviewer or package and scope wider than the package', async () => {
    const { svc } = mk();
    await expect(svc.create(user, { ...dto, reviewerId: 'nope' }, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.create(user, { ...dto, packageId: 'nope' }, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.create(user, { ...dto, packageId: 'pk-focused', sections: ['summary', 'experience', 'skills', 'education'] }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(mk({ count: 50 }).svc.create(user, dto, NOW)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('filters every lookup by tenant AND owner; foreign ids look missing', async () => {
    const { svc, prisma } = mk({ req: null });
    for (const call of [() => svc.get(user, 'x'), () => svc.revoke(user, 'x'), () => svc.preview(user, 'x'), () => svc.listFeedback(user, 'x'), () => svc.audit(user, 'x'), () => svc.remove(user, 'x'),
      () => svc.grant(user, 'x', { expiresInDays: 3, consent: true }), () => svc.recordFeedback(user, 'x', { comment: 'hi' }), () => svc.decide(user, 'x', 'f1', { decision: 'ACCEPTED' })]) {
      await expect(call()).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(prisma.expertReviewRequest.findFirst.mock.calls.every((c: any) => c[0].where.tenantId === 't1' && c[0].where.userId === 'u1')).toBe(true);
  });
});

describe('preview, expiry and revoke', () => {
  it('shows the reviewer only the granted sections and contacts, read-only, and audits the view', async () => {
    const { svc, prisma } = mk();
    const p: any = await svc.preview(user, 'r1', NOW);
    expect(p.readOnly).toBe(true);
    expect(p.resume.sections.map((s: any) => s.type)).toEqual(['summary', 'experience']);
    expect(p.resume.header.contacts).toEqual([]);
    expect(p.resume.header.links).toEqual([]);
    expect(kinds(prisma)).toEqual(['PREVIEWED']);
  });
  it('is gone once expired or revoked, with no source load and no audit row', async () => {
    const expired = mk({ req: base({ expiresAt: new Date(NOW.getTime() - 1) }) });
    await expect(expired.svc.preview(user, 'r1', NOW)).rejects.toBeInstanceOf(GoneException);
    expect(expired.source.load).not.toHaveBeenCalled();
    const revoked = mk({ req: base({ revokedAt: NOW }) });
    await expect(revoked.svc.preview(user, 'r1', NOW)).rejects.toThrow(/revoked/);
    expect(reviewStatus({ revokedAt: null, expiresAt: new Date(NOW.getTime() - 1) }, NOW)).toBe('EXPIRED');
  });
  it('revoke is immediate, audited once and idempotent', async () => {
    const { svc, prisma } = mk();
    const r: any = await svc.revoke(user, 'r1', NOW);
    expect(prisma.expertReviewRequest.update.mock.calls[0][0].data).toEqual({ revokedAt: NOW });
    expect(r.status).toBe('REVOKED');
    expect(kinds(prisma)).toEqual(['REVOKED']);
    const again = mk({ req: base({ revokedAt: NOW }) });
    await again.svc.revoke(user, 'r1', NOW);
    expect(again.prisma.expertReviewRequest.update).not.toHaveBeenCalled();
    expect(kinds(again.prisma)).toEqual([]);
  });
  it('grant extends with fresh consent, never revives a revoked request', async () => {
    const { svc, prisma } = mk();
    await expect(svc.grant(user, 'r1', { expiresInDays: 5, consent: false }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    await svc.grant(user, 'r1', { expiresInDays: 5, consent: true }, NOW);
    expect(prisma.expertReviewRequest.update.mock.calls[0][0].data.expiresAt).toEqual(new Date(NOW.getTime() + 5 * DAY));
    await expect(mk({ req: base({ revokedAt: NOW }) }).svc.grant(user, 'r1', { expiresInDays: 5, consent: true }, NOW)).rejects.toBeInstanceOf(GoneException);
  });
});

describe('feedback', () => {
  it('records section-linked feedback only while active and inside the scope', async () => {
    const { svc, prisma } = mk();
    await svc.recordFeedback(user, 'r1', { section: 'summary', clarity: 4, comment: 'Tighten it.' }, NOW);
    expect(prisma.expertReviewFeedback.create.mock.calls[0][0].data).toMatchObject({ requestId: 'r1', tenantId: 't1', userId: 'u1', section: 'summary', clarity: 4 });
    expect(kinds(prisma)).toEqual(['FEEDBACK_RECORDED']);
    await expect(svc.recordFeedback(user, 'r1', { section: 'skills', comment: 'x' }, NOW)).rejects.toThrow(/not part of the shared scope/);
    await expect(svc.recordFeedback(user, 'r1', {}, NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(mk({ req: base({ revokedAt: NOW }) }).svc.recordFeedback(user, 'r1', { comment: 'x' }, NOW)).rejects.toBeInstanceOf(GoneException);
    await expect(mk({ req: base({ expiresAt: new Date(NOW.getTime() - 1) }) }).svc.recordFeedback(user, 'r1', { comment: 'x' }, NOW)).rejects.toBeInstanceOf(GoneException);
  });
  it('accepting or declining records the decision and audits the id only; the resume is never touched', async () => {
    const { svc, prisma } = mk();
    const a: any = await svc.decide(user, 'r1', 'f1', { decision: 'ACCEPTED', note: 'Will rework' }, NOW);
    expect(a.status).toBe('ACCEPTED');
    await svc.decide(user, 'r1', 'f1', { decision: 'DECLINED' }, NOW);
    expect(kinds(prisma)).toEqual(['ACCEPTED', 'DECLINED']);
    expect(prisma.expertReviewEvent.create.mock.calls[0][0].data.ref).toBe('f1');
    expect(prisma.resumeVersion.findFirst).not.toHaveBeenCalled();
    expect((prisma as any).resumeVersion.create).toBeUndefined();
    expect(prisma.expertReviewFeedback.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'f1', requestId: 'r1', tenantId: 't1', userId: 'u1' });
    await expect(mk({ fb: null }).svc.decide(user, 'r1', 'zz', { decision: 'ACCEPTED' }, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('can still decide on feedback after the access ended', async () => {
    const { svc } = mk({ req: base({ revokedAt: NOW }) });
    await expect(svc.decide(user, 'r1', 'f1', { decision: 'DECLINED' }, NOW)).resolves.toMatchObject({ status: 'DECLINED' });
  });
});

describe('delete', () => {
  it('removes the request (feedback and audit cascade) and stores no document bytes', async () => {
    const { svc, prisma } = mk();
    await svc.remove(user, 'r1');
    expect(prisma.expertReviewRequest.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });
});
