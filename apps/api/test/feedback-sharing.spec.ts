import { BadRequestException, GoneException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateShareDto, LogFeedbackDto } from '../src/feedback-sharing/dto/feedback.dto';
import { contactKind, projectShare, shareStatus, summariseFeedback } from '../src/feedback-sharing/feedback-logic';
import { FeedbackService } from '../src/feedback-sharing/feedback.service';
import { RenderModel } from '../src/render-model/render-model.types';

const user = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
const R = '11111111-1111-4111-8111-111111111111';
const V = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-06-01T00:00:00Z');
const model = {
  header: { name: 'Ada', headline: 'Engineer', contacts: ['ada@example.com', '+44 7700 900123', 'London, UK'], links: [{ label: 'GitHub', url: 'https://github.com/ada' }] },
  sections: [{ type: 'summary', title: 'Summary', text: 's' }, { type: 'experience', title: 'Experience', items: [] }, { type: 'education', title: 'Education', items: [] }],
} as unknown as RenderModel;
const perms = { sections: ['summary', 'experience'], contacts: { email: 'hidden', phone: 'hidden', location: 'visible' }, links: 'hidden' };
const share = (over: any = {}) => ({
  id: 's1', tenantId: 't1', userId: 'u1', resumeId: R, resumeVersionId: V, versionNumber: 2, recipientLabel: 'Recruiter A', purpose: 'FEEDBACK', permissions: perms,
  expiresAt: new Date(NOW.getTime() + 86_400_000), revokedAt: null, createdAt: NOW, ...over,
});

describe('projection', () => {
  it('contains only granted sections and visible contact kinds; links hidden by default', () => {
    const p = projectShare(model, perms as any);
    expect(p.sections.map((s) => s.type)).toEqual(['summary', 'experience']);
    expect(p.header.contacts).toEqual(['London, UK']);
    expect(p.header.links).toEqual([]);
    expect(JSON.stringify(p)).not.toMatch(/ada@example|7700/);
    const all = projectShare(model, { ...perms, contacts: { email: 'visible', phone: 'visible', location: 'visible' }, links: 'visible' } as any);
    expect(all.header.contacts).toHaveLength(3);
    expect(all.header.links).toHaveLength(1);
  });
  it('classifies contacts', () => {
    expect(contactKind('a@b.co')).toBe('email');
    expect(contactKind('+1 (555) 010-2030')).toBe('phone');
    expect(contactKind('Berlin')).toBe('location');
  });
  it('derives status, revoked wins over expiry', () => {
    expect(shareStatus({ revokedAt: null, expiresAt: new Date('2026-05-01') }, NOW)).toBe('EXPIRED');
    expect(shareStatus({ revokedAt: NOW, expiresAt: new Date('2026-05-01') }, NOW)).toBe('REVOKED');
    expect(shareStatus({ revokedAt: null, expiresAt: new Date('2026-07-01') }, NOW)).toBe('ACTIVE');
  });
  it('summary averages ratings and warns on small samples', () => {
    const s = summariseFeedback([{ clarity: 4, relevance: 2, status: 'NEW' }, { clarity: 5, status: 'ACCEPTED' }]);
    expect(s.dimensions.clarity).toEqual({ count: 2, average: 4.5 });
    expect(s.dimensions.evidence).toEqual({ count: 0, average: null });
    expect(s).toMatchObject({ entries: 2, accepted: 1, pending: 1 });
    expect(s.note).toMatch(/very little feedback/);
  });
});

describe('FeedbackService', () => {
  function mk(over: any = {}) {
    const prisma: any = {
      feedbackShare: {
        create: jest.fn().mockImplementation(async (a: any) => share(a.data)), findFirst: jest.fn().mockResolvedValue(share()), findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockImplementation(async (a: any) => share(a.data)), delete: jest.fn(), ...over.share,
      },
      feedbackEntry: {
        create: jest.fn().mockImplementation(async (a: any) => ({ id: 'f1', status: 'NEW', createdAt: NOW, ...a.data })), findFirst: jest.fn().mockResolvedValue({ id: 'f1', shareId: 's1', status: 'NEW' }),
        findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockImplementation(async (a: any) => ({ id: 'f1', shareId: 's1', ...a.data })), count: jest.fn().mockResolvedValue(0), ...over.entry,
      },
      resumeVersion: { findFirst: jest.fn().mockResolvedValue({ id: V, versionNumber: 2 }), ...over.version },
      resume: { findFirst: jest.fn().mockResolvedValue({ id: R }) },
    };
    const source: any = { load: jest.fn().mockResolvedValue({ model }) };
    return { svc: new FeedbackService(prisma, source), prisma, source };
  }
  const dto = { resumeId: R, recipientLabel: 'Recruiter A', sections: ['summary'], contacts: { email: 'hidden', phone: 'hidden', location: 'hidden' }, expiresInDays: 7, consent: true } as any;

  it('needs explicit consent and shares nothing by default', async () => {
    const { svc, prisma } = mk();
    await expect(svc.create(user, { ...dto, consent: false }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.feedbackShare.create).not.toHaveBeenCalled();
    await svc.create(user, dto, NOW);
    const data = prisma.feedbackShare.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: 't1', userId: 'u1', resumeVersionId: V, versionNumber: 2 });
    expect(data.permissions.links).toBe('hidden');
    expect(data.expiresAt).toEqual(new Date('2026-06-08T00:00:00Z'));
  });

  it('scopes a share to one saved version: refuses drafts and foreign versions', async () => {
    const none = mk({ version: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(none.svc.create(user, dto, NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(none.svc.create(user, { ...dto, resumeVersionId: V }, NOW)).rejects.toBeInstanceOf(NotFoundException);
    expect(none.prisma.resumeVersion.findFirst.mock.calls[0][0].where.resume).toEqual({ tenantId: 't1', profile: { userId: 'u1' } });
  });

  it('filters every lookup by tenant and owner', async () => {
    const { svc, prisma } = mk({ share: { findFirst: jest.fn().mockResolvedValue(null) } });
    for (const f of [() => svc.get(user, 'x'), () => svc.revoke(user, 'x'), () => svc.preview(user, 'x'), () => svc.logFeedback(user, 'x', { comment: 'c' }), () => svc.summary(user, 'x'), () => svc.remove(user, 'x')]) {
      await expect(f()).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(prisma.feedbackShare.findFirst).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't1', userId: 'u1' } });
  });

  it('preview loads exactly the shared version through the owner-checked source and is gone after revoke/expiry', async () => {
    const { svc, source } = mk();
    const p = await svc.preview(user, 's1', NOW);
    expect(source.load).toHaveBeenCalledWith(user, R, V);
    expect(p.readOnly).toBe(true);
    expect(p.resume.sections.map((s: any) => s.type)).toEqual(['summary', 'experience']);
    await expect(mk({ share: { findFirst: jest.fn().mockResolvedValue(share({ revokedAt: NOW })) } }).svc.preview(user, 's1', NOW)).rejects.toBeInstanceOf(GoneException);
    await expect(mk({ share: { findFirst: jest.fn().mockResolvedValue(share({ expiresAt: new Date('2026-05-01') })) } }).svc.preview(user, 's1', NOW)).rejects.toBeInstanceOf(GoneException);
  });

  it('revoke is immediate and idempotent', async () => {
    const a = mk();
    const r = await a.svc.revoke(user, 's1', NOW);
    expect(r.status).toBe('REVOKED');
    const b = mk({ share: { findFirst: jest.fn().mockResolvedValue(share({ revokedAt: NOW })) } });
    await b.svc.revoke(user, 's1', NOW);
    expect(b.prisma.feedbackShare.update).not.toHaveBeenCalled();
  });

  it('feedback is only accepted on an active share and needs content', async () => {
    const { svc, prisma } = mk();
    await expect(svc.logFeedback(user, 's1', {}, NOW)).rejects.toBeInstanceOf(BadRequestException);
    await svc.logFeedback(user, 's1', { clarity: 4, comment: 'Clear' }, NOW);
    expect(prisma.feedbackEntry.create.mock.calls[0][0].data).toMatchObject({ shareId: 's1', tenantId: 't1', userId: 'u1', clarity: 4 });
    const revoked = mk({ share: { findFirst: jest.fn().mockResolvedValue(share({ revokedAt: NOW })) } });
    await expect(revoked.svc.logFeedback(user, 's1', { comment: 'late' }, NOW)).rejects.toBeInstanceOf(GoneException);
  });

  it('the candidate decides; accepting never edits the resume and a new version must really exist and be newer', async () => {
    const { svc, prisma } = mk({ version: { findFirst: jest.fn().mockResolvedValue({ id: 'v3' }) } });
    await svc.decide(user, 's1', '33333333-3333-4333-8333-333333333333', { decision: 'ACCEPTED', appliedVersionNumber: 3 }, NOW);
    expect(prisma.feedbackEntry.update.mock.calls[0][0].data).toMatchObject({ status: 'ACCEPTED', appliedVersionNumber: 3, decidedAt: NOW });
    await expect(svc.decide(user, 's1', 'f', { decision: 'ACCEPTED', appliedVersionNumber: 2 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.decide(user, 's1', 'f', { decision: 'DECLINED', appliedVersionNumber: 3 })).rejects.toBeInstanceOf(BadRequestException);
    const missing = mk({ version: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(missing.svc.decide(user, 's1', 'f', { decision: 'ACCEPTED', appliedVersionNumber: 9 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('feedback entries are tied to the share and owner (foreign feedback id is 404)', async () => {
    const { svc, prisma } = mk({ entry: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(svc.decide(user, 's1', 'f', { decision: 'DECLINED' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.feedbackEntry.findFirst).toHaveBeenCalledWith({ where: { id: 'f', shareId: 's1', tenantId: 't1', userId: 'u1' } });
  });
});

describe('validation', () => {
  it('rejects unknown sections, bad ratings and long expiry', async () => {
    const bad = plainToInstance(CreateShareDto, { resumeId: 'x', recipientLabel: '', sections: ['secrets'], contacts: { email: 'visible', phone: 'maybe', location: 'hidden' }, expiresInDays: 400, consent: 'yes' });
    const props = (await validate(bad)).map((e) => e.property).sort();
    expect(props).toEqual(['consent', 'contacts', 'expiresInDays', 'recipientLabel', 'resumeId', 'sections']);
    expect((await validate(plainToInstance(LogFeedbackDto, { clarity: 9 }))).length).toBe(1);
  });
});
