import { BadRequestException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ResumeSourceService } from '../resume-source/resume-source.service';
import { CreateShareDto, DecideFeedbackDto, LogFeedbackDto } from './dto/feedback.dto';
import { Permissions, projectShare, shareStatus, summariseFeedback } from './feedback-logic';

type Share = Awaited<ReturnType<PrismaService['feedbackShare']['findFirstOrThrow']>>;
type Entry = Awaited<ReturnType<PrismaService['feedbackEntry']['findFirstOrThrow']>>;

export function shareView(s: Share, count = 0, now = new Date()) {
  return {
    id: s.id, resumeId: s.resumeId, versionNumber: s.versionNumber, recipientLabel: s.recipientLabel, purpose: s.purpose,
    permissions: s.permissions as unknown as Permissions, status: shareStatus(s, now), expiresAt: s.expiresAt, revokedAt: s.revokedAt,
    feedbackCount: count, createdAt: s.createdAt,
  };
}
export const entryView = (e: Entry) => ({
  id: e.id, shareId: e.shareId, clarity: e.clarity, relevance: e.relevance, evidence: e.evidence, presentation: e.presentation, comment: e.comment,
  status: e.status, decisionNote: e.decisionNote, appliedVersionNumber: e.appliedVersionNumber, decidedAt: e.decidedAt, createdAt: e.createdAt,
});

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService, private source: ResumeSourceService) {}

  /** Tenant AND owner on every lookup; foreign ids look like missing ones. */
  private async owned(user: AuthUser, id: string) {
    const s = await this.prisma.feedbackShare.findFirst({ where: { id, tenantId: user.tenantId, userId: user.userId } });
    if (!s) throw new NotFoundException('Share not found');
    return s;
  }

  async create(user: AuthUser, dto: CreateShareDto, now = new Date()) {
    if (dto.consent !== true) throw new BadRequestException('Sharing needs your explicit confirmation. Nothing is shared by default.');
    const own = { resume: { tenantId: user.tenantId, profile: { userId: user.userId } } };
    const version = await this.prisma.resumeVersion.findFirst({
      where: { resumeId: dto.resumeId, ...(dto.resumeVersionId ? { id: dto.resumeVersionId } : {}), ...own }, orderBy: { versionNumber: 'desc' },
    });
    if (!version) {
      const resume = await this.prisma.resume.findFirst({ where: { id: dto.resumeId, tenantId: user.tenantId, profile: { userId: user.userId } }, select: { id: true } });
      if (!resume || dto.resumeVersionId) throw new NotFoundException('Resume version not found');
      throw new BadRequestException('Save a version of this resume first: only an immutable saved version can be shared.');
    }
    const permissions: Permissions = { sections: dto.sections, contacts: { ...dto.contacts }, links: dto.links ?? 'hidden' };
    const s = await this.prisma.feedbackShare.create({
      data: {
        tenantId: user.tenantId, userId: user.userId, resumeId: dto.resumeId, resumeVersionId: version.id, versionNumber: version.versionNumber,
        recipientLabel: dto.recipientLabel, permissions: permissions as any, expiresAt: new Date(now.getTime() + dto.expiresInDays * 86_400_000),
      },
    });
    return shareView(s, 0, now);
  }

  async list(user: AuthUser) {
    const rows = await this.prisma.feedbackShare.findMany({
      where: { tenantId: user.tenantId, userId: user.userId }, orderBy: { createdAt: 'desc' }, take: 50, include: { _count: { select: { feedback: true } } },
    });
    return rows.map((r) => shareView(r, (r as any)._count?.feedback ?? 0));
  }

  async get(user: AuthUser, id: string) {
    const s = await this.owned(user, id);
    return shareView(s, await this.prisma.feedbackEntry.count({ where: { shareId: s.id } }));
  }

  /** Immediate and idempotent. Existing feedback is kept. */
  async revoke(user: AuthUser, id: string, now = new Date()) {
    const s = await this.owned(user, id);
    const r = s.revokedAt ? s : await this.prisma.feedbackShare.update({ where: { id: s.id }, data: { revokedAt: now } });
    return shareView(r, 0, now);
  }

  /** What the recipient would receive: read-only, allowlisted, this version only. Gone once revoked or expired. */
  async preview(user: AuthUser, id: string, now = new Date()) {
    const s = await this.owned(user, id);
    const status = shareStatus(s, now);
    if (status !== 'ACTIVE') throw new GoneException(status === 'REVOKED' ? 'This share was revoked.' : 'This share has expired.');
    const src = await this.source.load(user, s.resumeId, s.resumeVersionId);
    return { shareId: s.id, versionNumber: s.versionNumber, recipientLabel: s.recipientLabel, readOnly: true, expiresAt: s.expiresAt, resume: projectShare(src.model, s.permissions as unknown as Permissions) };
  }

  async logFeedback(user: AuthUser, id: string, dto: LogFeedbackDto, now = new Date()) {
    const s = await this.owned(user, id);
    const status = shareStatus(s, now);
    if (status !== 'ACTIVE') throw new GoneException(status === 'REVOKED' ? 'This share was revoked; it no longer accepts feedback.' : 'This share has expired; it no longer accepts feedback.');
    if (!dto.comment && dto.clarity == null && dto.relevance == null && dto.evidence == null && dto.presentation == null) {
      throw new BadRequestException('Add at least one rating or a comment.');
    }
    const e = await this.prisma.feedbackEntry.create({
      data: {
        shareId: s.id, tenantId: user.tenantId, userId: user.userId, clarity: dto.clarity ?? null, relevance: dto.relevance ?? null,
        evidence: dto.evidence ?? null, presentation: dto.presentation ?? null, comment: dto.comment ?? null,
      },
    });
    return entryView(e);
  }

  async listFeedback(user: AuthUser, id: string) {
    const s = await this.owned(user, id);
    return (await this.prisma.feedbackEntry.findMany({ where: { shareId: s.id }, orderBy: { createdAt: 'desc' } })).map(entryView);
  }

  async summary(user: AuthUser, id: string) {
    const s = await this.owned(user, id);
    return summariseFeedback(await this.prisma.feedbackEntry.findMany({ where: { shareId: s.id } }));
  }

  /** The candidate decides. Accepting never edits the resume; it can only record which new version you made from it. */
  async decide(user: AuthUser, id: string, fid: string, dto: DecideFeedbackDto, now = new Date()) {
    const s = await this.owned(user, id);
    const e = await this.prisma.feedbackEntry.findFirst({ where: { id: fid, shareId: s.id, tenantId: user.tenantId, userId: user.userId } });
    if (!e) throw new NotFoundException('Feedback not found');
    if (dto.appliedVersionNumber != null) {
      if (dto.decision !== 'ACCEPTED') throw new BadRequestException('Only accepted feedback can reference a new version.');
      if (dto.appliedVersionNumber <= s.versionNumber) throw new BadRequestException('The new version must be newer than the one you shared.');
      const v = await this.prisma.resumeVersion.findFirst({ where: { resumeId: s.resumeId, versionNumber: dto.appliedVersionNumber, resume: { tenantId: user.tenantId, profile: { userId: user.userId } } } });
      if (!v) throw new NotFoundException('That resume version does not exist');
    }
    const u = await this.prisma.feedbackEntry.update({
      where: { id: e.id }, data: { status: dto.decision, decisionNote: dto.note ?? null, appliedVersionNumber: dto.appliedVersionNumber ?? null, decidedAt: now },
    });
    return entryView(u);
  }

  async remove(user: AuthUser, id: string) {
    const s = await this.owned(user, id);
    await this.prisma.feedbackShare.delete({ where: { id: s.id } });
  }
}
