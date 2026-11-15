import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { hashModel } from '../resume-source/resume-source.service';
import { addDays, buildReminders } from './reminders';
import { CreateVaultEntryDto, UpdateVaultEntryDto, VaultQueryDto } from './dto/vault.dto';

type Entry = Awaited<ReturnType<PrismaService['applicationResumeEntry']['findFirstOrThrow']>>;

export interface VaultView {
  id: string; employerLabel: string; jobTitle: string | null; externalJobId: string | null; appliedOn: string;
  resume: { id: string; versionId: string; versionNumber: number; contentHash: string; versionAvailable: boolean; newerVersionExists: boolean };
  coverLetterVersionRef: string | null; stage: string; notes: string | null; followUpOn: string | null; followUpDone: boolean;
  followUpOverdue: boolean; createdAt: Date; updatedAt: Date;
}

export function entryView(e: Entry, ctx: { available: boolean; latest: number | null }, today = new Date().toISOString().slice(0, 10)): VaultView {
  return {
    id: e.id, employerLabel: e.employerLabel, jobTitle: e.jobTitle, externalJobId: e.externalJobId, appliedOn: e.appliedOn,
    resume: {
      id: e.resumeId, versionId: e.resumeVersionId, versionNumber: e.resumeVersionNumber, contentHash: e.resumeContentHash,
      versionAvailable: ctx.available, newerVersionExists: ctx.latest != null && ctx.latest > e.resumeVersionNumber,
    },
    coverLetterVersionRef: e.coverLetterVersionRef, stage: e.stage, notes: e.notes, followUpOn: e.followUpOn, followUpDone: e.followUpDone,
    followUpOverdue: !!e.followUpOn && !e.followUpDone && e.followUpOn < today,
    createdAt: e.createdAt, updatedAt: e.updatedAt,
  };
}

/** Application-to-resume history. Stores only a reference to an immutable saved version plus a hash; never document bytes. */
@Injectable()
export class VaultService {
  constructor(private prisma: PrismaService) {}

  private async owned(user: AuthUser, id: string) {
    const e = await this.prisma.applicationResumeEntry.findFirst({ where: { id, tenantId: user.tenantId, userId: user.userId } });
    if (!e) throw new NotFoundException('Vault entry not found');
    return e;
  }

  private async context(user: AuthUser, rows: Entry[]) {
    if (!rows.length) return (_e: Entry) => ({ available: true, latest: null as number | null });
    const resumeIds = [...new Set(rows.map((r) => r.resumeId))];
    const own = { resume: { tenantId: user.tenantId, profile: { userId: user.userId } } };
    const versions = await this.prisma.resumeVersion.findMany({ where: { resumeId: { in: resumeIds }, ...own }, select: { id: true, resumeId: true, versionNumber: true } });
    const latest = new Map<string, number>();
    for (const v of versions) latest.set(v.resumeId, Math.max(latest.get(v.resumeId) ?? 0, v.versionNumber));
    const ids = new Set(versions.map((v) => v.id));
    return (e: Entry) => ({ available: ids.has(e.resumeVersionId), latest: latest.get(e.resumeId) ?? null });
  }

  async create(user: AuthUser, dto: CreateVaultEntryDto) {
    const own = { resume: { tenantId: user.tenantId, profile: { userId: user.userId } } };
    const version = await this.prisma.resumeVersion.findFirst({
      where: { resumeId: dto.resumeId, ...(dto.resumeVersionId ? { id: dto.resumeVersionId } : {}), ...own }, orderBy: { versionNumber: 'desc' },
    });
    if (!version) {
      const resume = await this.prisma.resume.findFirst({ where: { id: dto.resumeId, tenantId: user.tenantId, profile: { userId: user.userId } }, select: { id: true } });
      if (!resume || dto.resumeVersionId) throw new NotFoundException('Resume version not found');
      throw new BadRequestException('Save a version of this resume first: the vault records an immutable version, not a working draft.');
    }
    const e = await this.prisma.applicationResumeEntry.create({
      data: {
        tenantId: user.tenantId, userId: user.userId, employerLabel: dto.employerLabel, jobTitle: dto.jobTitle ?? null,
        externalJobId: dto.externalJobId ?? null, appliedOn: dto.appliedOn, resumeId: dto.resumeId, resumeVersionId: version.id,
        resumeVersionNumber: version.versionNumber, resumeContentHash: hashModel(version.structuredSnapshot),
        coverLetterVersionRef: dto.coverLetterVersionRef ?? null, stage: dto.stage ?? 'APPLIED', notes: dto.notes ?? null, followUpOn: dto.followUpOn ?? null,
      },
    });
    return entryView(e, { available: true, latest: version.versionNumber });
  }

  async list(user: AuthUser, q: VaultQueryDto = {}, page = 1, pageSize = 50) {
    const rows = await this.prisma.applicationResumeEntry.findMany({
      where: {
        tenantId: user.tenantId, userId: user.userId, ...(q.stage ? { stage: q.stage } : {}), ...(q.resumeId ? { resumeId: q.resumeId } : {}),
        ...(q.employer ? { employerLabel: { contains: q.employer, mode: 'insensitive' as const } } : {}),
      },
      orderBy: [{ appliedOn: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: Math.min(pageSize, 100),
    });
    const ctx = await this.context(user, rows);
    return rows.map((r) => entryView(r, ctx(r)));
  }

  async get(user: AuthUser, id: string) {
    const e = await this.owned(user, id);
    const ctx = await this.context(user, [e]);
    return entryView(e, ctx(e));
  }

  /** The exact structured version that was sent (read-only). 404 if the resume or version was later deleted. */
  async snapshot(user: AuthUser, id: string) {
    const e = await this.owned(user, id);
    const v = await this.prisma.resumeVersion.findFirst({ where: { id: e.resumeVersionId, resume: { tenantId: user.tenantId, profile: { userId: user.userId } } } });
    if (!v) throw new NotFoundException('That resume version no longer exists. The record keeps its reference and hash.');
    return { entryId: e.id, versionNumber: v.versionNumber, contentHash: e.resumeContentHash, model: v.structuredSnapshot };
  }

  async update(user: AuthUser, id: string, dto: UpdateVaultEntryDto) {
    const e = await this.owned(user, id);
    const data: Record<string, unknown> = {};
    for (const k of ['stage', 'notes', 'jobTitle', 'coverLetterVersionRef', 'followUpOn', 'followUpDone'] as const) if (dto[k] !== undefined) data[k] = dto[k];
    const u = await this.prisma.applicationResumeEntry.update({ where: { id: e.id }, data });
    const ctx = await this.context(user, [u]);
    return entryView(u, ctx(u));
  }

  /** In-app reminders for this owner's open applications (overdue, today, next 7 days, plus labelled suggestions). */
  async reminders(user: AuthUser, today = new Date().toISOString().slice(0, 10)) {
    const rows = await this.prisma.applicationResumeEntry.findMany({
      where: { tenantId: user.tenantId, userId: user.userId, stage: { notIn: ['OFFER', 'REJECTED', 'WITHDRAWN'] } },
      orderBy: { appliedOn: 'asc' }, take: 500,
    });
    const items = buildReminders(rows, today);
    return { today, counts: { overdue: items.filter((i) => i.kind === 'OVERDUE').length, dueToday: items.filter((i) => i.kind === 'DUE_TODAY').length, upcoming: items.filter((i) => i.kind === 'UPCOMING').length, suggested: items.filter((i) => i.kind === 'SUGGESTED').length }, items };
  }

  /** Moves the follow-up forward by N days from today (or from the existing future date) and reopens it. */
  async snooze(user: AuthUser, id: string, days: number, today = new Date().toISOString().slice(0, 10)) {
    const e = await this.owned(user, id);
    const from = e.followUpOn && e.followUpOn > today ? e.followUpOn : today;
    const u = await this.prisma.applicationResumeEntry.update({ where: { id: e.id }, data: { followUpOn: addDays(from, days), followUpDone: false } });
    const ctx = await this.context(user, [u]);
    return entryView(u, ctx(u));
  }

  async remove(user: AuthUser, id: string) {
    const e = await this.owned(user, id);
    await this.prisma.applicationResumeEntry.delete({ where: { id: e.id } });
  }
}
