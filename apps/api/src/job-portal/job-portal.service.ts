import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CareerProfileService } from '../career-profile/career-profile.service';
import { normalizeUrl, sanitizeText } from '../job-clipper/clip-logic';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProposalDto, DecisionDto, RecordApplicationDto, UpdateApplicationDto, UpsertJobContextDto } from './dto/portal.dto';
import { buildProposal, ProposalItem, requirementTerms } from './tailoring';

const MAX_CONTEXTS = 300;
type Ctx = Awaited<ReturnType<PrismaService['portalJobContext']['findFirstOrThrow']>>;
const ctxView = (c: Ctx, full = false) => ({
  id: c.id, hostId: c.hostId, externalId: c.externalId, title: c.title, company: c.company, location: c.location, applyUrl: c.applyUrl,
  requirements: c.requirements as string[], updatedAt: c.updatedAt, ...(full ? { description: c.description } : {}),
});

@Injectable()
export class JobPortalService {
  constructor(private prisma: PrismaService, private profiles: CareerProfileService) {}
  private who(u: AuthUser) { return { tenantId: u.tenantId, userId: u.userId }; }

  private async ctx(u: AuthUser, id: string) {
    const c = await this.prisma.portalJobContext.findFirst({ where: { id, ...this.who(u) } });
    if (!c) throw new NotFoundException('Job not found');
    return c;
  }
  /** Resume ownership: tenant AND the profile's owner. */
  private async resume(u: AuthUser, resumeId: string) {
    const r = await this.prisma.resume.findFirst({ where: { id: resumeId, tenantId: u.tenantId, profile: { userId: u.userId } } });
    if (!r) throw new NotFoundException('Resume not found');
    return r;
  }

  // ---- normalized job-context contract (upsert by opaque host ref) ----
  async upsertContext(u: AuthUser, dto: UpsertJobContextDto) {
    if (dto.consent !== true) throw new BadRequestException('Confirm that this job should be added to your account');
    let applyUrl: string | null = null;
    if (dto.applyUrl) { const n = normalizeUrl(dto.applyUrl); if (!n) throw new BadRequestException('applyUrl must be http or https without credentials'); applyUrl = n.url; }
    const description = sanitizeText(dto.description);
    if (description.length < 20) throw new BadRequestException('The description is too short to analyse');
    const where = { tenantId_userId_hostId_externalId: { ...this.who(u), hostId: dto.hostId, externalId: dto.externalId } };
    const existing = await this.prisma.portalJobContext.findUnique({ where });
    if (!existing && (await this.prisma.portalJobContext.count({ where: this.who(u) })) >= MAX_CONTEXTS) throw new ConflictException(`You can keep up to ${MAX_CONTEXTS} jobs`);
    const data = {
      title: sanitizeText(dto.title, 200), company: sanitizeText(dto.company, 200), location: dto.location ? sanitizeText(dto.location, 120) : null, applyUrl, description,
      requirements: requirementTerms(description, (dto.requirements ?? []).map((r) => sanitizeText(r, 80))),
    };
    const row = await this.prisma.portalJobContext.upsert({ where, create: { ...this.who(u), hostId: dto.hostId, externalId: dto.externalId, ...data }, update: data });
    return ctxView(row, true);
  }
  async listContexts(u: AuthUser) {
    const rows = await this.prisma.portalJobContext.findMany({ where: this.who(u), orderBy: { updatedAt: 'desc' }, take: 50 });
    return rows.map((r) => ctxView(r));
  }
  async getContext(u: AuthUser, id: string) { return ctxView(await this.ctx(u, id), true); }
  async removeContext(u: AuthUser, id: string) {
    await this.ctx(u, id);
    await this.prisma.tailoringProposal.deleteMany({ where: { jobContextId: id, ...this.who(u) } });
    await this.prisma.portalApplication.deleteMany({ where: { jobContextId: id, ...this.who(u) } });
    await this.prisma.portalJobContext.delete({ where: { id } });
  }

  // ---- tailoring proposals (evidence mapped, reviewable, never applied automatically) ----
  async createProposal(u: AuthUser, contextId: string, dto: CreateProposalDto) {
    const c = await this.ctx(u, contextId);
    await this.resume(u, dto.resumeId);
    const profile = await this.profiles.get(u);
    const items = buildProposal(profile as never, c.requirements as string[]);
    const row = await this.prisma.tailoringProposal.create({ data: { ...this.who(u), jobContextId: contextId, resumeId: dto.resumeId, items: items as never } });
    return this.proposalView(row);
  }
  private proposalView(p: { id: string; jobContextId: string; resumeId: string; items: unknown; decisions: unknown; createdAt: Date }) {
    const items = p.items as ProposalItem[]; const decisions = p.decisions as Record<string, string>;
    return {
      id: p.id, jobContextId: p.jobContextId, resumeId: p.resumeId, createdAt: p.createdAt,
      items: items.map((i) => ({ ...i, decision: decisions[i.id] ?? 'PENDING' })),
      notice: 'Suggestions only. They point at facts already in your profile and change nothing until you edit your resume yourself.',
    };
  }
  async proposals(u: AuthUser, contextId: string) {
    await this.ctx(u, contextId);
    const rows = await this.prisma.tailoringProposal.findMany({ where: { jobContextId: contextId, ...this.who(u) }, orderBy: { createdAt: 'desc' }, take: 10 });
    return rows.map((r) => this.proposalView(r));
  }
  async decide(u: AuthUser, id: string, dto: DecisionDto) {
    const p = await this.prisma.tailoringProposal.findFirst({ where: { id, ...this.who(u) } });
    if (!p) throw new NotFoundException('Proposal not found');
    if (!(p.items as unknown as ProposalItem[]).some((i) => i.id === dto.itemId)) throw new NotFoundException('Suggestion not found');
    const decisions = { ...(p.decisions as Record<string, string>), [dto.itemId]: dto.decision };
    return this.proposalView(await this.prisma.tailoringProposal.update({ where: { id }, data: { decisions } }));
  }

  // ---- exact resume version used per application ----
  async record(u: AuthUser, dto: RecordApplicationDto) {
    if (dto.confirm !== true) throw new BadRequestException('Confirm that you used this resume version for this job');
    await this.ctx(u, dto.jobContextId);
    await this.resume(u, dto.resumeId);
    const v = await this.prisma.resumeVersion.findFirst({ where: { resumeId: dto.resumeId, versionNumber: dto.versionNumber } });
    if (!v) throw new NotFoundException('Resume version not found. Save a version first so the exact content is recorded.');
    if (dto.proposalId) {
      const p = await this.prisma.tailoringProposal.findFirst({ where: { id: dto.proposalId, jobContextId: dto.jobContextId, ...this.who(u) } });
      if (!p) throw new NotFoundException('Proposal not found');
    }
    const existing = await this.prisma.portalApplication.findFirst({ where: { ...this.who(u), jobContextId: dto.jobContextId, resumeId: dto.resumeId, versionNumber: dto.versionNumber } });
    if (existing) return existing;
    return this.prisma.portalApplication.create({ data: { ...this.who(u), jobContextId: dto.jobContextId, resumeId: dto.resumeId, versionNumber: dto.versionNumber, proposalId: dto.proposalId ?? null } });
  }
  async applications(u: AuthUser) {
    const rows = await this.prisma.portalApplication.findMany({ where: this.who(u), orderBy: { createdAt: 'desc' }, take: 50 });
    return rows;
  }
  async setHostStatus(u: AuthUser, id: string, dto: UpdateApplicationDto) {
    const a = await this.prisma.portalApplication.findFirst({ where: { id, ...this.who(u) } });
    if (!a) throw new NotFoundException('Application not found');
    return this.prisma.portalApplication.update({ where: { id }, data: { hostStatus: sanitizeText(dto.hostStatus, 40) || null } });
  }
  async removeApplication(u: AuthUser, id: string) {
    const a = await this.prisma.portalApplication.findFirst({ where: { id, ...this.who(u) } });
    if (!a) throw new NotFoundException('Application not found');
    await this.prisma.portalApplication.delete({ where: { id } });
  }
}
