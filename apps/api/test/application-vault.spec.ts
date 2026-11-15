import { BadRequestException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { featureEnabled } from '../src/common/features';
import { CreateVaultEntryDto, UpdateVaultEntryDto } from '../src/application-vault/dto/vault.dto';
import { entryView, VaultService } from '../src/application-vault/vault.service';
import { hashModel } from '../src/resume-source/resume-source.service';

const user = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
const R = '11111111-1111-4111-8111-111111111111';
const V = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-06-01T00:00:00Z');
const snapshot = { header: { name: 'Ada' }, sections: [] };
const version = (n = 2, id = V) => ({ id, resumeId: R, versionNumber: n, structuredSnapshot: snapshot });
const entry = (over: any = {}) => ({
  id: 'e1', tenantId: 't1', userId: 'u1', employerLabel: 'Acme', jobTitle: null, externalJobId: null, appliedOn: '2026-05-01', resumeId: R, resumeVersionId: V,
  resumeVersionNumber: 2, resumeContentHash: hashModel(snapshot), coverLetterVersionRef: null, stage: 'APPLIED', notes: null, followUpOn: null, followUpDone: false,
  createdAt: NOW, updatedAt: NOW, ...over,
});

function mk(over: any = {}) {
  const prisma: any = {
    applicationResumeEntry: {
      create: jest.fn().mockImplementation(async (a: any) => entry(a.data)), findFirst: jest.fn().mockResolvedValue(entry()), findMany: jest.fn().mockResolvedValue([entry()]),
      update: jest.fn().mockImplementation(async (a: any) => entry(a.data)), delete: jest.fn(), ...over.entry,
    },
    resumeVersion: { findFirst: jest.fn().mockResolvedValue(version()), findMany: jest.fn().mockResolvedValue([{ id: V, resumeId: R, versionNumber: 2 }]), ...over.version },
    resume: { findFirst: jest.fn().mockResolvedValue({ id: R }), ...over.resume },
  };
  return { svc: new VaultService(prisma), prisma };
}

describe('ApplicationVault', () => {
  it('records the latest saved version with a content hash and the owner from the token', async () => {
    const { svc, prisma } = mk();
    const v = await svc.create(user, { employerLabel: 'Acme', appliedOn: '2026-05-01', resumeId: R });
    const data = prisma.applicationResumeEntry.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: 't1', userId: 'u1', resumeVersionId: V, resumeVersionNumber: 2, resumeContentHash: hashModel(snapshot), stage: 'APPLIED' });
    expect(prisma.resumeVersion.findFirst.mock.calls[0][0].where.resume).toEqual({ tenantId: 't1', profile: { userId: 'u1' } });
    expect(v.resume.versionNumber).toBe(2);
  });

  it('refuses a resume with no saved version and hides foreign resumes/versions', async () => {
    const noVersion = mk({ version: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(noVersion.svc.create(user, { employerLabel: 'A', appliedOn: '2026-05-01', resumeId: R })).rejects.toBeInstanceOf(BadRequestException);
    const foreign = mk({ version: { findFirst: jest.fn().mockResolvedValue(null) }, resume: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(foreign.svc.create(user, { employerLabel: 'A', appliedOn: '2026-05-01', resumeId: R })).rejects.toBeInstanceOf(NotFoundException);
    await expect(noVersion.svc.create(user, { employerLabel: 'A', appliedOn: '2026-05-01', resumeId: R, resumeVersionId: V })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('filters every lookup by tenant AND owner', async () => {
    const { svc, prisma } = mk({ entry: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(svc.get(user, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.applicationResumeEntry.findFirst).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't1', userId: 'u1' } });
    await expect(svc.update(user, 'x', { notes: 'n' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.remove(user, 'x')).rejects.toBeInstanceOf(NotFoundException);
    await svc.list(user, { employer: 'ac' });
    expect(prisma.applicationResumeEntry.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', userId: 'u1' });
  });

  it('later resume edits cannot alter the historical record: update only touches status fields', async () => {
    const { svc, prisma } = mk();
    await svc.update(user, 'e1', { stage: 'INTERVIEWING', notes: 'Phone screen', resumeVersionId: 'hack', resumeId: 'hack' } as any);
    const data = prisma.applicationResumeEntry.update.mock.calls[0][0].data;
    expect(data).toEqual({ stage: 'INTERVIEWING', notes: 'Phone screen' });
  });

  it('the update DTO does not accept resume references', async () => {
    const dto = plainToInstance(UpdateVaultEntryDto, { stage: 'OFFER' });
    expect(await validate(dto)).toHaveLength(0);
    expect(Object.keys(dto)).not.toContain('resumeVersionId');
  });

  it('flags when a newer version exists or the version was deleted, and overdue follow-ups', () => {
    const v = entryView(entry({ followUpOn: '2026-05-20' }) as any, { available: false, latest: 5 }, '2026-06-01');
    expect(v.resume).toMatchObject({ versionAvailable: false, newerVersionExists: true });
    expect(v.followUpOverdue).toBe(true);
    expect(entryView(entry({ followUpOn: '2026-05-20', followUpDone: true }) as any, { available: true, latest: 2 }, '2026-06-01').followUpOverdue).toBe(false);
  });

  it('snapshot returns the immutable version, or 404 with the reference kept when it is gone', async () => {
    const ok = await mk().svc.snapshot(user, 'e1');
    expect(ok).toMatchObject({ versionNumber: 2, contentHash: hashModel(snapshot) });
    await expect(mk({ version: { findFirst: jest.fn().mockResolvedValue(null) } }).svc.snapshot(user, 'e1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('validates dates and stage', async () => {
    const bad = plainToInstance(CreateVaultEntryDto, { employerLabel: '', appliedOn: '2026-13-40', resumeId: 'nope', stage: 'HIRED' });
    const errs = (await validate(bad)).map((e) => e.property).sort();
    expect(errs).toEqual(['appliedOn', 'employerLabel', 'resumeId', 'stage']);
  });

  it('can be disabled by configuration', () => {
    expect(featureEnabled('resume-vault', 'resume-vault,crm')).toBe(false);
    expect(featureEnabled('resume-vault', '')).toBe(true);
  });
});

describe('ApplicationVault reminders', () => {
  const { buildReminders, addDays } = require('../src/application-vault/reminders');
  const T = '2026-06-10';
  const e = (over: any) => ({ id: 'x', employerLabel: 'Acme', jobTitle: null, appliedOn: '2026-06-01', stage: 'APPLIED', followUpOn: null, followUpDone: false, ...over });

  it('classifies overdue, today, upcoming and stale-without-date, ordered by urgency', () => {
    const r = buildReminders([
      e({ id: 'up', followUpOn: '2026-06-15' }), e({ id: 'old', followUpOn: '2026-06-05' }), e({ id: 'now', followUpOn: T }),
      e({ id: 'far', followUpOn: '2026-07-30' }), e({ id: 'stale', appliedOn: '2026-05-01' }), e({ id: 'fresh', appliedOn: '2026-06-08' }),
    ], T);
    expect(r.map((x: any) => `${x.entryId}:${x.kind}`)).toEqual(['old:OVERDUE', 'now:DUE_TODAY', 'up:UPCOMING', 'stale:SUGGESTED']);
    expect(r[0].label).toBe('Follow-up was due 5 days ago');
    expect(r[3].label).toMatch(/Suggestion only/);
  });
  it('ignores done follow-ups and closed stages, and never suggests for advanced stages', () => {
    const r = buildReminders([
      e({ id: 'done', followUpOn: '2026-06-01', followUpDone: true }), e({ id: 'rej', stage: 'REJECTED', followUpOn: '2026-06-01' }),
      e({ id: 'offer', stage: 'OFFER', followUpOn: '2026-06-01' }), e({ id: 'int', stage: 'INTERVIEWING', appliedOn: '2026-01-01' }),
    ], T);
    expect(r).toEqual([]);
  });
  it('adds days across month ends', () => { expect(addDays('2026-06-28', 5)).toBe('2026-07-03'); });

  it('reminders query only this owner and open stages; snooze moves forward and reopens', async () => {
    const { svc, prisma } = mk({ entry: { findMany: jest.fn().mockResolvedValue([entry({ followUpOn: '2026-06-05' })]) } });
    const out = await svc.reminders(user, T);
    expect(prisma.applicationResumeEntry.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', userId: 'u1', stage: { notIn: ['OFFER', 'REJECTED', 'WITHDRAWN'] } });
    expect(out.counts).toMatchObject({ overdue: 1 });
    await svc.snooze(user, 'e1', 3, T);
    expect(prisma.applicationResumeEntry.update.mock.calls[0][0].data).toEqual({ followUpOn: '2026-06-13', followUpDone: false });
    const future = mk({ entry: { findFirst: jest.fn().mockResolvedValue(entry({ followUpOn: '2026-06-20' })) } });
    await future.svc.snooze(user, 'e1', 2, T);
    expect(future.prisma.applicationResumeEntry.update.mock.calls[0][0].data.followUpOn).toBe('2026-06-22');
    const foreign = mk({ entry: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(foreign.svc.snooze(user, 'e1', 1, T)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('snooze days are bounded', async () => {
    const { SnoozeDto } = require('../src/application-vault/dto/vault.dto');
    expect((await validate(plainToInstance(SnoozeDto, { days: 0 }))).length).toBe(1);
    expect((await validate(plainToInstance(SnoozeDto, { days: 61 }))).length).toBe(1);
    expect((await validate(plainToInstance(SnoozeDto, { days: 7 }))).length).toBe(0);
  });
});
