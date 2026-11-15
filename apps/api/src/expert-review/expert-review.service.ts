import { BadRequestException, GoneException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { projectShare } from '../feedback-sharing/feedback-logic';
import { PrismaService } from '../prisma/prisma.service';
import { ResumeSourceService } from '../resume-source/resume-source.service';
import { CreateReviewDto, DecideDto, GrantDto, RecordFeedbackDto } from './dto/expert-review.dto';
import {
  PACKAGES, packageById, PAYMENT_NOT_CONFIGURED_NOTE, PAYMENT_PROVIDER, PaymentProvider, reviewerById, REVIEWERS, reviewStatus, Scope,
} from './expert-review-logic';

const MAX_REQUESTS = 50;
type Req = Awaited<ReturnType<PrismaService['expertReviewRequest']['findFirstOrThrow']>>;
type Fb = Awaited<ReturnType<PrismaService['expertReviewFeedback']['findFirstOrThrow']>>;

export function requestView(r: Req, count = 0, now = new Date()) {
  return {
    id: r.id, resumeId: r.resumeId, versionNumber: r.versionNumber, reviewer: { id: r.reviewerId, displayName: r.reviewerLabel }, packageId: r.packageId,
    scope: r.scope as unknown as Scope, status: reviewStatus(r, now), consentAt: r.consentAt, expiresAt: r.expiresAt, revokedAt: r.revokedAt,
    payment: { status: r.paymentStatus, reference: r.paymentRef }, feedbackCount: count, createdAt: r.createdAt,
  };
}
export const feedbackView = (f: Fb) => ({
  id: f.id, requestId: f.requestId, section: f.section, clarity: f.clarity, relevance: f.relevance, evidence: f.evidence, presentation: f.presentation,
  comment: f.comment, status: f.status, decisionNote: f.decisionNote, decidedAt: f.decidedAt, createdAt: f.createdAt,
});

@Injectable()
export class ExpertReviewService {
  constructor(private prisma: PrismaService, private source: ResumeSourceService, @Inject(PAYMENT_PROVIDER) private payment: PaymentProvider) {}

  reviewers() { return REVIEWERS; }
  packages() { return { payment: { configured: false, provider: this.payment.id, note: PAYMENT_NOT_CONFIGURED_NOTE }, packages: PACKAGES }; }

  /** Tenant AND owner on every lookup; foreign ids look like missing ones. */
  private async owned(user: AuthUser, id: string) {
    const r = await this.prisma.expertReviewRequest.findFirst({ where: { id, tenantId: user.tenantId, userId: user.userId } });
    if (!r) throw new NotFoundException('Review request not found');
    return r;
  }
  /** Audit rows hold the event kind and an id or section key only, never resume text or comments. */
  private event(user: AuthUser, requestId: string, kind: string, ref?: string) {
    return this.prisma.expertReviewEvent.create({ data: { requestId, tenantId: user.tenantId, userId: user.userId, kind, ref: ref ?? null } });
  }
  private assertActive(r: Req, now: Date, what: string) {
    const s = reviewStatus(r, now);
    if (s !== 'ACTIVE') throw new GoneException(s === 'REVOKED' ? `This review access was revoked; ${what}.` : `This review access has expired; ${what}.`);
  }

  async create(user: AuthUser, dto: CreateReviewDto, now = new Date()) {
    if (dto.consent !== true) throw new BadRequestException('A review needs your explicit consent to the scope you chose. Nothing is shared by default.');
    const reviewer = reviewerById(dto.reviewerId); const pkg = packageById(dto.packageId);
    if (!reviewer) throw new NotFoundException('Reviewer not found');
    if (!pkg) throw new NotFoundException('Package not found');
    if (dto.sections.length > pkg.maxSections) throw new BadRequestException(`${pkg.label} covers up to ${pkg.maxSections} sections.`);
    if ((await this.prisma.expertReviewRequest.count({ where: { tenantId: user.tenantId, userId: user.userId } })) >= MAX_REQUESTS) throw new BadRequestException(`You can keep up to ${MAX_REQUESTS} review requests`);
    const own = { resume: { tenantId: user.tenantId, profile: { userId: user.userId } } };
    const version = await this.prisma.resumeVersion.findFirst({
      where: { resumeId: dto.resumeId, ...(dto.resumeVersionId ? { id: dto.resumeVersionId } : {}), ...own }, orderBy: { versionNumber: 'desc' },
    });
    if (!version) {
      const resume = await this.prisma.resume.findFirst({ where: { id: dto.resumeId, tenantId: user.tenantId, profile: { userId: user.userId } }, select: { id: true } });
      if (!resume || dto.resumeVersionId) throw new NotFoundException('Resume version not found');
      throw new BadRequestException('Save a version of this resume first: only an immutable saved version can be reviewed.');
    }
    const scope: Scope = { sections: dto.sections, contacts: { ...dto.contacts }, links: dto.links ?? 'hidden' };
    const pay = await this.payment.checkout({ packageId: pkg.id });
    const r = await this.prisma.expertReviewRequest.create({
      data: {
        tenantId: user.tenantId, userId: user.userId, resumeId: dto.resumeId, resumeVersionId: version.id, versionNumber: version.versionNumber,
        reviewerId: reviewer.id, reviewerLabel: reviewer.displayName, packageId: pkg.id, scope: scope as any, consentAt: now,
        expiresAt: new Date(now.getTime() + dto.expiresInDays * 86_400_000), paymentStatus: pay.status, paymentRef: pay.reference,
      },
    });
    await this.event(user, r.id, 'REQUESTED'); await this.event(user, r.id, 'GRANTED');
    return requestView(r, 0, now);
  }

  async list(user: AuthUser) {
    const rows = await this.prisma.expertReviewRequest.findMany({
      where: { tenantId: user.tenantId, userId: user.userId }, orderBy: { createdAt: 'desc' }, take: 50, include: { _count: { select: { feedback: true } } },
    });
    return rows.map((r) => requestView(r, (r as any)._count?.feedback ?? 0));
  }

  async get(user: AuthUser, id: string) {
    const r = await this.owned(user, id);
    return requestView(r, await this.prisma.expertReviewFeedback.count({ where: { requestId: r.id } }));
  }

  /** Re-grant (extend) access with fresh consent. A revoked request stays revoked: start a new one. */
  async grant(user: AuthUser, id: string, dto: GrantDto, now = new Date()) {
    if (dto.consent !== true) throw new BadRequestException('Extending access needs your explicit consent.');
    const r = await this.owned(user, id);
    if (r.revokedAt) throw new GoneException('This review access was revoked. Create a new request to share again.');
    const u = await this.prisma.expertReviewRequest.update({ where: { id: r.id }, data: { consentAt: now, expiresAt: new Date(now.getTime() + dto.expiresInDays * 86_400_000) } });
    await this.event(user, r.id, 'GRANTED');
    return requestView(u, 0, now);
  }

  /** Immediate and idempotent. Recorded feedback is kept. */
  async revoke(user: AuthUser, id: string, now = new Date()) {
    const r = await this.owned(user, id);
    if (r.revokedAt) return requestView(r, 0, now);
    const u = await this.prisma.expertReviewRequest.update({ where: { id: r.id }, data: { revokedAt: now } });
    await this.event(user, r.id, 'REVOKED');
    return requestView(u, 0, now);
  }

  /** What the reviewer receives: read-only, allowlisted by scope, this version only. Gone once revoked or expired. Every view is audited. */
  async preview(user: AuthUser, id: string, now = new Date()) {
    const r = await this.owned(user, id);
    this.assertActive(r, now, 'the reviewer sees nothing');
    const src = await this.source.load(user, r.resumeId, r.resumeVersionId);
    await this.event(user, r.id, 'PREVIEWED');
    return { requestId: r.id, versionNumber: r.versionNumber, reviewer: r.reviewerLabel, readOnly: true, expiresAt: r.expiresAt, resume: projectShare(src.model, r.scope as unknown as Scope) };
  }

  async recordFeedback(user: AuthUser, id: string, dto: RecordFeedbackDto, now = new Date()) {
    const r = await this.owned(user, id);
    this.assertActive(r, now, 'it no longer accepts feedback');
    if (!dto.comment && dto.clarity == null && dto.relevance == null && dto.evidence == null && dto.presentation == null) throw new BadRequestException('Add at least one rating or a comment.');
    if (dto.section && !(r.scope as unknown as Scope).sections.includes(dto.section)) throw new BadRequestException('That section was not part of the shared scope.');
    const f = await this.prisma.expertReviewFeedback.create({
      data: {
        requestId: r.id, tenantId: user.tenantId, userId: user.userId, section: dto.section ?? null, clarity: dto.clarity ?? null, relevance: dto.relevance ?? null,
        evidence: dto.evidence ?? null, presentation: dto.presentation ?? null, comment: dto.comment ?? null,
      },
    });
    await this.event(user, r.id, 'FEEDBACK_RECORDED', f.id);
    return feedbackView(f);
  }

  async listFeedback(user: AuthUser, id: string) {
    const r = await this.owned(user, id);
    return (await this.prisma.expertReviewFeedback.findMany({ where: { requestId: r.id }, orderBy: { createdAt: 'desc' } })).map(feedbackView);
  }

  /** The candidate decides. Accepting records the decision only: it never edits the resume or creates a version. */
  async decide(user: AuthUser, id: string, fid: string, dto: DecideDto, now = new Date()) {
    const r = await this.owned(user, id);
    const f = await this.prisma.expertReviewFeedback.findFirst({ where: { id: fid, requestId: r.id, tenantId: user.tenantId, userId: user.userId } });
    if (!f) throw new NotFoundException('Feedback not found');
    const u = await this.prisma.expertReviewFeedback.update({ where: { id: f.id }, data: { status: dto.decision, decisionNote: dto.note ?? null, decidedAt: now } });
    await this.event(user, r.id, dto.decision, f.id);
    return feedbackView(u);
  }

  async audit(user: AuthUser, id: string) {
    const r = await this.owned(user, id);
    return (await this.prisma.expertReviewEvent.findMany({ where: { requestId: r.id }, orderBy: { createdAt: 'asc' } })).map((e) => ({ id: e.id, kind: e.kind, ref: e.ref, createdAt: e.createdAt }));
  }

  /** Deletes the request, its feedback and its audit trail. */
  async remove(user: AuthUser, id: string) {
    const r = await this.owned(user, id);
    await this.prisma.expertReviewRequest.delete({ where: { id: r.id } });
  }
}
