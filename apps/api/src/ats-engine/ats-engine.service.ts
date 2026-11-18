import { Injectable, NotFoundException } from '@nestjs/common';
import { AtsReport, Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { Requirement } from '../resume-match/jd-analyzer';
import { ResumesService } from '../resumes/resumes.service';
import { ResumeSourceService } from '../resume-source/resume-source.service';
import { AtsDimension, AtsItem, AtsResult, ATS_DISCLAIMER, computeAts } from './ats-engine';
import { RunAtsDto } from './dto/ats.dto';

@Injectable()
export class AtsEngineService {
  constructor(private prisma: PrismaService, private resumes: ResumesService, private source: ResumeSourceService) {}

  private async owned(user: AuthUser, id: string) {
    const r = await this.prisma.atsReport.findFirst({ where: { id, tenantId: user.tenantId, userId: user.userId } });
    if (!r) throw new NotFoundException('ATS report not found');
    return r;
  }

  /** Scores one owned resume (live or immutable version) against one owned, stored job description. Stores the evidence-linked result only. */
  async run(user: AuthUser, resumeId: string, dto: RunAtsDto) {
    const { jd, src, result } = await this.compute(user, resumeId, dto.jobDescriptionId, dto.resumeVersionId);
    const row = await this.prisma.atsReport.create({
      data: {
        tenantId: user.tenantId, userId: user.userId, resumeId, resumeVersionId: src.versionId, resumeVersionNumber: src.versionNumber, resumeContentHash: src.hash,
        jobDescriptionId: jd.id, jdRevision: jd.revision, jdTitle: jd.title, jdCompany: jd.company, jobConfirmed: jd.confirmationStatus === 'CONFIRMED',
        atsVersion: result.atsVersion, taxonomyVersion: result.taxonomyVersion, score: result.score,
        dimensions: result.dimensions as unknown as Prisma.InputJsonValue, items: result.items as unknown as Prisma.InputJsonValue,
        coverage: { ...result.coverage, strongMatches: result.strongMatches, weakOrMissing: result.weakOrMissing, improvements: result.improvements } as unknown as Prisma.InputJsonValue,
      },
    });
    return this.view(row, src.name);
  }

  /**
   * Computes (without storing) the same ATS evidence-linked estimate an assistant or the ATS screen shows:
   * score, dimensions, weak or missing items and suggested improvements for one owned resume + job posting.
   */
  async score(user: AuthUser, resumeId: string, jobId: string, versionId?: string) {
    const { src, result } = await this.compute(user, resumeId, jobId, versionId);
    return { ...result, resumeId, resumeName: src.name, resumeVersionId: src.versionId, resumeVersionNumber: src.versionNumber };
  }

  private async compute(user: AuthUser, resumeId: string, jobId: string, versionId?: string) {
    const jd = await this.prisma.jobDescription.findFirst({ where: { id: jobId, tenantId: user.tenantId, userId: user.userId } });
    if (!jd) throw new NotFoundException('Job description not found');
    const src = await this.source.load(user, resumeId, versionId);
    const result = computeAts({
      model: src.model, requirements: (jd.requirements as unknown as Requirement[]) ?? [], jdTitle: jd.title, targetRole: src.targetRole,
      confirmed: jd.confirmationStatus === 'CONFIRMED',
    });
    // keep the job context the same way the stored report does
    return { jd, src, result };
  }

  async list(user: AuthUser, resumeId: string) {
    await this.resumes.get(user, resumeId);
    return this.prisma.atsReport.findMany({
      where: { resumeId, tenantId: user.tenantId, userId: user.userId }, orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, resumeId: true, resumeVersionNumber: true, jobDescriptionId: true, jdTitle: true, jdCompany: true, atsVersion: true, score: true, createdAt: true },
    });
  }

  async get(user: AuthUser, id: string) { return this.view(await this.owned(user, id)); }

  async remove(user: AuthUser, id: string) {
    const r = await this.owned(user, id);
    await this.prisma.atsReport.delete({ where: { id: r.id } });
  }

  private view(r: AtsReport, resumeName?: string) {
    const cov = r.coverage as unknown as AtsResult['coverage'] & { strongMatches: string[]; weakOrMissing: string[]; improvements: string[] };
    const { strongMatches, weakOrMissing, improvements, ...coverage } = cov;
    return {
      id: r.id, resumeId: r.resumeId, resumeName: resumeName ?? null, resumeVersionId: r.resumeVersionId, resumeVersionNumber: r.resumeVersionNumber,
      job: { id: r.jobDescriptionId, title: r.jdTitle, company: r.jdCompany, revision: r.jdRevision, confirmed: r.jobConfirmed },
      atsVersion: r.atsVersion, taxonomyVersion: r.taxonomyVersion, score: r.score, dimensions: r.dimensions as unknown as AtsDimension[],
      items: r.items as unknown as AtsItem[], coverage, strongMatches, weakOrMissing, improvements, disclaimer: ATS_DISCLAIMER, createdAt: r.createdAt,
    };
  }
}
