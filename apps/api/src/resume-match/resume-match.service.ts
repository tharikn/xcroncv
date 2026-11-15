import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JobDescription, Prisma, ResumeMatchReport } from '@prisma/client';
import { AuthUser } from '../common/auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ResumesService } from '../resumes/resumes.service';
import { ResumeSourceService } from '../resume-source/resume-source.service';
import {
  CreateJobDescriptionDto, CreateMatchReportDto, ImportUrlDto, UpdateJobDescriptionDto,
} from './dto/resume-match.dto';
import {
  analyzeJd, EXTRACTION_VERSION, hashText, normalizeUserRequirements, Requirement, sanitizeJdText,
} from './jd-analyzer';
import { defaultDeps, FetchDeps, importJobFromUrl } from './jd-fetch';
import { computeMatch, DISCLAIMER, DimensionResult, MatchItem, MatchResult, SCORING_VERSION } from './matcher';


export function jdView(jd: JobDescription, extra: Record<string, unknown> = {}) {
  const { rawText, tenantId, userId, ...rest } = jd; // never expose tenant/owner ids or the raw text
  void tenantId; void userId;
  return { ...rest, hasRawText: !!rawText, ...extra };
}

@Injectable()
export class ResumeMatchService {
  fetchDeps: FetchDeps = defaultDeps;
  constructor(private prisma: PrismaService, private resumes: ResumesService, private source: ResumeSourceService) {}

  /** Ownership is part of every query: tenant AND owner. Non-disclosing 404. */
  private async ownedJd(user: AuthUser, id: string) {
    const jd = await this.prisma.jobDescription.findFirst({ where: { id, tenantId: user.tenantId, userId: user.userId } });
    if (!jd) throw new NotFoundException('Job description not found');
    return jd;
  }

  private async ownedReport(user: AuthUser, id: string) {
    const r = await this.prisma.resumeMatchReport.findFirst({ where: { id, tenantId: user.tenantId, userId: user.userId }, include: { jobDescription: true } });
    if (!r) throw new NotFoundException('Match report not found');
    return r;
  }

  // ---- job descriptions ---------------------------------------------------------------------
  private async persistJd(user: AuthUser, d: {
    title: string; company?: string; location?: string; text: string; retain?: boolean; sourceType: 'PASTE' | 'URL'; sourceDomain?: string; canonicalUrl?: string;
  }) {
    const text = sanitizeJdText(d.text);
    const analysis = analyzeJd(text, d.title);
    const jd = await this.prisma.jobDescription.create({
      data: {
        tenantId: user.tenantId, userId: user.userId, title: d.title.trim(), company: d.company?.trim() || null, location: d.location?.trim() || null,
        sourceType: d.sourceType, sourceDomain: d.sourceDomain, canonicalUrl: d.canonicalUrl,
        rawText: d.retain ? text : null, contentHash: hashText(text),
        requirements: analysis.requirements as unknown as Prisma.InputJsonValue, extractionVersion: EXTRACTION_VERSION,
      },
    });
    return jdView(jd, { warnings: analysis.warnings, detected: { seniority: analysis.seniority ?? null, workMode: analysis.workMode ?? null } });
  }

  createJd(user: AuthUser, dto: CreateJobDescriptionDto) {
    return this.persistJd(user, { title: dto.title, company: dto.company, location: dto.location, text: dto.text, retain: dto.retainRawText, sourceType: 'PASTE' });
  }

  async importUrl(user: AuthUser, dto: ImportUrlDto) {
    const out = await importJobFromUrl(dto.url, this.fetchDeps);
    if (out.status !== 'imported') {
      return { status: out.status, reason: out.reason, sourceDomain: out.sourceDomain ?? null, jobDescription: null };
    }
    const jd = await this.persistJd(user, {
      title: out.title || 'Imported job', company: out.company, location: out.location, text: out.text!, retain: dto.retainRawText,
      sourceType: 'URL', sourceDomain: out.sourceDomain, canonicalUrl: out.canonicalUrl,
    });
    return { status: out.status, reason: out.reason, sourceDomain: out.sourceDomain, jobDescription: jd };
  }

  async listJds(user: AuthUser) {
    const rows = await this.prisma.jobDescription.findMany({ where: { tenantId: user.tenantId, userId: user.userId }, orderBy: { updatedAt: 'desc' }, take: 100 });
    return rows.map((r) => {
      const reqs = (r.requirements as unknown as Requirement[]) ?? [];
      return jdView({ ...r, requirements: [] as unknown as Prisma.JsonValue }, { requirementCount: reqs.filter((q) => q.included).length });
    });
  }

  async getJd(user: AuthUser, id: string) { return jdView(await this.ownedJd(user, id)); }

  async updateJd(user: AuthUser, id: string, dto: UpdateJobDescriptionDto) {
    const jd = await this.ownedJd(user, id);
    const data: Prisma.JobDescriptionUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.company !== undefined) data.company = dto.company.trim() || null;
    if (dto.location !== undefined) data.location = dto.location.trim() || null;
    let changed = false;
    if (dto.requirements) {
      const next = normalizeUserRequirements(dto.requirements as never);
      data.requirements = next as unknown as Prisma.InputJsonValue;
      changed = JSON.stringify(next) !== JSON.stringify(jd.requirements);
    }
    if (dto.title !== undefined && dto.title.trim() !== jd.title) changed = true; // the title drives role/seniority matching
    if (changed) { data.revision = { increment: 1 }; data.confirmationStatus = 'UNCONFIRMED'; }
    if (dto.confirm === true) data.confirmationStatus = 'CONFIRMED';
    if (dto.confirm === false) data.confirmationStatus = 'UNCONFIRMED';
    const updated = await this.prisma.jobDescription.update({ where: { id: jd.id }, data });
    return jdView(updated);
  }

  async deleteJd(user: AuthUser, id: string) {
    const jd = await this.ownedJd(user, id);
    await this.prisma.jobDescription.delete({ where: { id: jd.id } }); // reports cascade
  }

  // ---- reports ------------------------------------------------------------------------------
  private async calculate(user: AuthUser, resumeId: string, jd: JobDescription, versionId: string | undefined) {
    const src = await this.source.load(user, resumeId, versionId);
    const result = computeMatch({
      model: src.model, requirements: (jd.requirements as unknown as Requirement[]) ?? [], jdTitle: jd.title, targetRole: src.targetRole,
      confirmed: jd.confirmationStatus === 'CONFIRMED',
    });
    const row = await this.prisma.resumeMatchReport.create({
      data: {
        tenantId: user.tenantId, userId: user.userId, resumeId, resumeVersionId: src.versionId, resumeVersionNumber: src.versionNumber,
        resumeContentHash: src.hash, jobDescriptionId: jd.id, jdRevision: jd.revision, scoringVersion: result.scoringVersion, totalScore: result.totalScore,
        dimensionScores: result.dimensions as unknown as Prisma.InputJsonValue, coverage: result.coverage as unknown as Prisma.InputJsonValue,
        evidence: result.items as unknown as Prisma.InputJsonValue,
        summary: { ...result.summary, disclaimer: DISCLAIMER } as unknown as Prisma.InputJsonValue,
      },
    });
    return this.reportView(row, jd, src.name);
  }

  async createReport(user: AuthUser, resumeId: string, dto: CreateMatchReportDto) {
    if (dto.scoringVersion && dto.scoringVersion !== SCORING_VERSION) {
      throw new BadRequestException(`Scoring version ${dto.scoringVersion} is not available. Current version: ${SCORING_VERSION}.`);
    }
    const jd = await this.ownedJd(user, dto.jobDescriptionId);
    return this.calculate(user, resumeId, jd, dto.resumeVersionId);
  }

  async recalculate(user: AuthUser, reportId: string) {
    const r = await this.ownedReport(user, reportId);
    return this.calculate(user, r.resumeId, r.jobDescription, r.resumeVersionId ?? undefined);
  }

  async listReports(user: AuthUser, resumeId: string, jobDescriptionId?: string) {
    await this.resumes.get(user, resumeId); // ownership
    const rows = await this.prisma.resumeMatchReport.findMany({
      where: { resumeId, tenantId: user.tenantId, userId: user.userId, ...(jobDescriptionId ? { jobDescriptionId } : {}) },
      orderBy: { createdAt: 'desc' }, take: 100,
      select: {
        id: true, resumeId: true, resumeVersionId: true, resumeVersionNumber: true, jobDescriptionId: true, jdRevision: true, scoringVersion: true, totalScore: true, coverage: true, createdAt: true,
        jobDescription: { select: { title: true, company: true, revision: true } },
      },
    });
    return rows.map(({ jobDescription, ...r }) => ({
      ...r, jdTitle: jobDescription.title, jdCompany: jobDescription.company, stale: jobDescription.revision !== r.jdRevision,
      confidence: (r.coverage as { confidence?: string } | null)?.confidence ?? null,
    }));
  }

  async getReport(user: AuthUser, id: string) {
    const r = await this.ownedReport(user, id);
    return this.reportView(r, r.jobDescription);
  }

  async deleteReport(user: AuthUser, id: string) {
    const r = await this.ownedReport(user, id);
    await this.prisma.resumeMatchReport.delete({ where: { id: r.id } });
  }

  private reportView(r: ResumeMatchReport, jd: JobDescription, resumeName?: string) {
    return {
      id: r.id, resumeId: r.resumeId, resumeName: resumeName ?? null, resumeVersionId: r.resumeVersionId, resumeVersionNumber: r.resumeVersionNumber,
      jobDescriptionId: r.jobDescriptionId, jdRevision: r.jdRevision, stale: jd.revision !== r.jdRevision,
      job: { title: jd.title, company: jd.company, location: jd.location, sourceType: jd.sourceType, sourceDomain: jd.sourceDomain, confirmationStatus: jd.confirmationStatus },
      scoringVersion: r.scoringVersion, totalScore: r.totalScore,
      dimensions: r.dimensionScores as unknown as DimensionResult[], coverage: r.coverage as unknown as MatchResult['coverage'],
      items: r.evidence as unknown as MatchItem[], summary: r.summary as unknown as MatchResult['summary'] & { disclaimer: string },
      createdAt: r.createdAt,
    };
  }
}
