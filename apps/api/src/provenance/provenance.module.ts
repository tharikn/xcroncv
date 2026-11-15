import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RenderModel } from '../render-model/render-model.types';
import { ResumesModule } from '../resumes/resumes.module';
import { ResumesService } from '../resumes/resumes.service';
import { factText } from '../career-facts/facts.logic';
import {
  analyzeRewrite, assess, Assessment, diffEvidence, Evidence, extractClaims, missingAcknowledgements, summarize, Unsupported,
} from './provenance.logic';

export class CheckDto { @IsOptional() @IsInt() @Min(1) versionNumber?: number }
export class LinkDto {
  @IsString() @MinLength(8) @MaxLength(64) claimKey: string;
  @IsUUID() factId: string;
}
export class RewriteDto {
  @IsString() @MinLength(1) @MaxLength(1500) original: string;
  @IsString() @MinLength(1) @MaxLength(1500) proposed: string;
  @IsOptional() @IsUUID() resumeId?: string;
  @IsOptional() @IsIn(['AI_REWRITTEN', 'USER_EDIT']) origin?: 'AI_REWRITTEN' | 'USER_EDIT';
}
export class ApproveDto { @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(200, { each: true }) acknowledged: string[] }

@Injectable()
export class ProvenanceService {
  constructor(private prisma: PrismaService, private resumes: ResumesService) {}

  /** Evidence = the candidate's CONFIRMED facts plus their own career profile entries (unconfirmed bullets/skills are flagged as such). */
  async loadEvidence(u: AuthUser): Promise<Evidence[]> {
    const out: Evidence[] = [];
    const facts = await this.prisma.careerFact.findMany({ where: { tenantId: u.tenantId, userId: u.userId, status: 'CONFIRMED', kind: 'ACHIEVEMENT' } });
    for (const f of facts) {
      const d = f.data as unknown as { context?: string; action: string; outcome?: string; scope?: string; skills?: string[]; metric?: { value: string; label: string; confirmed: boolean } };
      out.push({ id: f.id, source: 'FACT', label: f.title, confirmed: true, origin: f.origin as Evidence['origin'], skills: d.skills ?? [],
        text: [d.context, factText({ action: d.action, outcome: d.outcome } as never), d.scope, d.metric?.confirmed ? `${d.metric.value} ${d.metric.label}` : ''].filter(Boolean).join('. ') });
    }
    const p = await this.prisma.careerProfile.findUnique({
      where: { userId: u.userId },
      include: { experiences: { include: { bullets: true } }, skills: true, educations: true, certifications: true, projects: true },
    });
    if (p && p.tenantId === u.tenantId) {
      for (const e of p.experiences) {
        out.push({ id: `exp:${e.id}`, source: 'PROFILE', label: `${e.jobTitle} at ${e.employerName}`, text: `${e.jobTitle} ${e.employerName}`, confirmed: true, origin: 'USER_ENTERED', employer: e.employerName, title: e.jobTitle, start: e.startDate, end: e.endDate ?? undefined, current: e.isCurrent });
        for (const b of e.bullets) out.push({ id: `bullet:${b.id}`, source: 'PROFILE', label: `${e.jobTitle}: bullet`, text: b.content, confirmed: b.isUserConfirmed, origin: b.isUserConfirmed ? 'USER_ENTERED' : 'IMPORTED' });
      }
      for (const s of p.skills) out.push({ id: `skill:${s.id}`, source: 'PROFILE', label: `Skill: ${s.name}`, text: s.name, skills: [s.name], confirmed: s.isUserConfirmed, origin: s.isUserConfirmed ? 'USER_ENTERED' : 'IMPORTED' });
      for (const e of p.educations) out.push({ id: `edu:${e.id}`, source: 'PROFILE', label: `${e.degree}, ${e.institution}`, text: [e.degree, e.field, e.institution].filter(Boolean).join(', '), confirmed: true, origin: 'USER_ENTERED' });
      for (const c of p.certifications) out.push({ id: `cert:${c.id}`, source: 'PROFILE', label: c.name, text: [c.name, c.issuer].filter(Boolean).join(', '), confirmed: true, origin: 'USER_ENTERED' });
      for (const pr of p.projects) out.push({ id: `proj:${pr.id}`, source: 'PROFILE', label: pr.name, text: [pr.name, pr.description].filter(Boolean).join(': '), confirmed: true, origin: 'USER_ENTERED' });
    }
    return out;
  }

  private async model(u: AuthUser, resumeId: string, versionNumber?: number): Promise<RenderModel> {
    const live = await this.resumes.renderModel(u, resumeId); // ownership check
    if (!versionNumber) return live.model;
    const v = await this.prisma.resumeVersion.findUnique({ where: { resumeId_versionNumber: { resumeId, versionNumber } } });
    if (!v) throw new NotFoundException('Version not found');
    return v.structuredSnapshot as unknown as RenderModel;
  }

  async check(u: AuthUser, resumeId: string, dto: CheckDto) {
    const model = await this.model(u, resumeId, dto.versionNumber);
    const evidence = await this.loadEvidence(u);
    const links = await this.prisma.provenanceLink.findMany({ where: { tenantId: u.tenantId, userId: u.userId, resumeId } });
    const assessments: Assessment[] = extractClaims(model).map((c) => assess(c, evidence, links.filter((l) => l.claimKey === c.key)));
    return {
      resumeId, versionNumber: dto.versionNumber ?? null, checkedAt: new Date().toISOString(),
      note: 'Support is checked against your confirmed facts and your own career profile. "Absent" means no evidence is linked yet, not that the statement is false. Nothing is changed by this check.',
      summary: summarize(assessments),
      claims: assessments.map((a) => ({ key: a.claim.key, section: a.claim.section, kind: a.claim.kind, text: a.claim.text, support: a.support, origin: a.origin, issues: a.issues, evidence: a.evidence })),
    };
  }

  /** Evidence-level comparison of two versions (or a version and the working draft). Read-only. */
  async compare(u: AuthUser, resumeId: string, from: string, to: string) {
    const ref = (r: string) => { if (r === 'draft') return undefined; const n = Number(r); if (!Number.isInteger(n) || n < 1) throw new BadRequestException('Use a version number or "draft".'); return n; };
    const [fa, ta] = [ref(from), ref(to)];
    const [ma, mb] = [await this.model(u, resumeId, fa), await this.model(u, resumeId, ta)];
    const evidence = await this.loadEvidence(u);
    const links = await this.prisma.provenanceLink.findMany({ where: { tenantId: u.tenantId, userId: u.userId, resumeId } });
    const run = (m: RenderModel) => extractClaims(m).map((c) => assess(c, evidence, links.filter((l) => l.claimKey === c.key)));
    return {
      from: fa ? `Version ${fa}` : 'Working draft', to: ta ? `Version ${ta}` : 'Working draft',
      note: 'Both versions are checked against your current confirmed facts and profile. "No evidence linked" does not mean a statement is false.',
      ...diffEvidence(run(ma), run(mb)),
    };
  }

  async link(u: AuthUser, resumeId: string, dto: LinkDto) {
    const model = await this.model(u, resumeId);
    const claim = extractClaims(model).find((c) => c.key === dto.claimKey);
    if (!claim) throw new NotFoundException('That statement is not in this resume any more. Run the check again.');
    const fact = await this.prisma.careerFact.findFirst({ where: { id: dto.factId, tenantId: u.tenantId, userId: u.userId } });
    if (!fact) throw new NotFoundException('Fact not found');
    if (fact.status !== 'CONFIRMED') throw new BadRequestException('Only confirmed facts can be used as evidence. Confirm the fact first.');
    const exists = await this.prisma.provenanceLink.findFirst({ where: { resumeId, claimKey: dto.claimKey, factId: dto.factId, userId: u.userId } });
    if (exists) return exists;
    return this.prisma.provenanceLink.create({ data: { tenantId: u.tenantId, userId: u.userId, resumeId, claimKey: dto.claimKey, claimText: claim.text, factId: dto.factId } });
  }
  async links(u: AuthUser, resumeId: string) { await this.resumes.renderModel(u, resumeId); return this.prisma.provenanceLink.findMany({ where: { tenantId: u.tenantId, userId: u.userId, resumeId } }); }
  async unlink(u: AuthUser, resumeId: string, id: string) {
    const r = await this.prisma.provenanceLink.deleteMany({ where: { id, resumeId, tenantId: u.tenantId, userId: u.userId } });
    if (!r.count) throw new NotFoundException('Link not found');
  }

  /** Analyse a proposed rewrite (for example from the AI assistant). Stores the proposal for review; nothing is applied. */
  async propose(u: AuthUser, dto: RewriteDto) {
    if (dto.resumeId) await this.resumes.renderModel(u, dto.resumeId);
    const evidence = await this.loadEvidence(u);
    const a = analyzeRewrite(dto.original, dto.proposed, evidence.filter((e) => e.confirmed).map((e) => e.text));
    const row = await this.prisma.rewriteProposal.create({
      data: { tenantId: u.tenantId, userId: u.userId, resumeId: dto.resumeId ?? null, origin: dto.origin ?? 'AI_REWRITTEN', original: dto.original, proposed: dto.proposed,
        diff: a.diff as unknown as Prisma.InputJsonValue, unsupported: a.unsupported as unknown as Prisma.InputJsonValue, verdict: a.verdict },
    });
    return this.view(row);
  }
  private view(r: Prisma.RewriteProposalGetPayload<object>) {
    return { id: r.id, resumeId: r.resumeId, origin: r.origin, original: r.original, proposed: r.proposed, diff: r.diff, unsupported: r.unsupported as unknown as Unsupported[], verdict: r.verdict, status: r.status, acknowledged: r.acknowledged, decidedAt: r.decidedAt, createdAt: r.createdAt };
  }
  private async own(u: AuthUser, id: string) {
    const r = await this.prisma.rewriteProposal.findFirst({ where: { id, tenantId: u.tenantId, userId: u.userId } });
    if (!r) throw new NotFoundException('Proposal not found'); return r;
  }
  async listProposals(u: AuthUser, status?: string) {
    return (await this.prisma.rewriteProposal.findMany({ where: { tenantId: u.tenantId, userId: u.userId, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 })).map((r) => this.view(r));
  }
  async getProposal(u: AuthUser, id: string) { return this.view(await this.own(u, id)); }

  /** Approval is explicit: every unsupported addition must be acknowledged one by one. The server records approval; the client then saves the text. */
  async approve(u: AuthUser, id: string, dto: ApproveDto) {
    const r = await this.own(u, id);
    if (r.status !== 'PENDING') throw new ConflictException(`This proposal was already ${r.status.toLowerCase()}.`);
    const missing = missingAcknowledgements(r.unsupported as unknown as Unsupported[], dto.acknowledged);
    if (missing.length) throw new BadRequestException({ message: 'Confirm each new claim is true before approving.', unacknowledged: missing });
    const row = await this.prisma.rewriteProposal.update({ where: { id }, data: { status: 'APPROVED', acknowledged: dto.acknowledged as unknown as Prisma.InputJsonValue, decidedAt: new Date() } });
    return { ...this.view(row), finalText: row.proposed };
  }
  async reject(u: AuthUser, id: string) {
    const r = await this.own(u, id);
    if (r.status !== 'PENDING') throw new ConflictException(`This proposal was already ${r.status.toLowerCase()}.`);
    return this.view(await this.prisma.rewriteProposal.update({ where: { id }, data: { status: 'REJECTED', decidedAt: new Date() } }));
  }
}

@Controller()
export class ProvenanceController {
  constructor(private svc: ProvenanceService) {}
  @Post('resumes/:id/provenance/check') @HttpCode(200) check(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CheckDto) { return this.svc.check(u, id, dto); }
  @Get('resumes/:id/provenance/compare') compare(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('from') from = '', @Query('to') to = 'draft') { return this.svc.compare(u, id, from, to); }
  @Get('resumes/:id/provenance/links') links(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.links(u, id); }
  @Post('resumes/:id/provenance/links') link(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkDto) { return this.svc.link(u, id, dto); }
  @Delete('resumes/:id/provenance/links/:linkId') @HttpCode(204) unlink(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('linkId', ParseUUIDPipe) linkId: string) { return this.svc.unlink(u, id, linkId); }

  @Post('provenance/rewrites') propose(@CurrentUser() u: AuthUser, @Body() dto: RewriteDto) { return this.svc.propose(u, dto); }
  @Get('provenance/rewrites') list(@CurrentUser() u: AuthUser, @Query('status') status?: string) { return this.svc.listProposals(u, status); }
  @Get('provenance/rewrites/:id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.getProposal(u, id); }
  @Post('provenance/rewrites/:id/approve') @HttpCode(200) approve(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveDto) { return this.svc.approve(u, id, dto); }
  @Post('provenance/rewrites/:id/reject') @HttpCode(200) reject(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.reject(u, id); }
}

@Module({ imports: [ResumesModule], controllers: [ProvenanceController], providers: [ProvenanceService], exports: [ProvenanceService] })
export class ProvenanceModule {}
