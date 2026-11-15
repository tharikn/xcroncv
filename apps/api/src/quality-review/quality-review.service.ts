import { Injectable, NotFoundException } from '@nestjs/common';
import { Writable } from 'stream';
import { renderPdf } from '../export/pdf.renderer';
import { renderDocx } from '../import-export/docx.renderer';
import { extractDocx, extractPdf } from '../import-export/text-extract';
import { checkExtraction, EXPORT_CHECK_VERSION } from './export-check';
import { Prisma, QualityReview } from '@prisma/client';
import { AuthUser } from '../common/auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ResumesService } from '../resumes/resumes.service';
import { ResumeSourceService } from '../resume-source/resume-source.service';
import { compareReviews, Finding, QUALITY_DISCLAIMER, QualityScore, reviewResume } from './quality-engine';

@Injectable()
export class QualityReviewService {
  constructor(private prisma: PrismaService, private resumes: ResumesService, private source: ResumeSourceService) {}

  private async owned(user: AuthUser, id: string) {
    const r = await this.prisma.qualityReview.findFirst({ where: { id, tenantId: user.tenantId, userId: user.userId } });
    if (!r) throw new NotFoundException('Quality review not found');
    return r;
  }

  /** Runs the deterministic rules, stores the evidence-linked result (no document content beyond short excerpts) and diffs against the previous review. */
  async run(user: AuthUser, resumeId: string, versionId?: string) {
    const src = await this.source.load(user, resumeId, versionId);
    const result = reviewResume(src.model);
    const previous = await this.prisma.qualityReview.findFirst({
      where: { resumeId, tenantId: user.tenantId, userId: user.userId }, orderBy: { createdAt: 'desc' },
    });
    const row = await this.prisma.qualityReview.create({
      data: {
        tenantId: user.tenantId, userId: user.userId, resumeId, resumeVersionId: src.versionId, resumeVersionNumber: src.versionNumber, resumeContentHash: src.hash,
        scoringVersion: result.scoringVersion, score: result.score, readiness: result.readiness,
        dimensionScores: result.dimensions as unknown as Prisma.InputJsonValue,
        coverage: { ...result.coverage, counts: result.counts } as unknown as Prisma.InputJsonValue,
        findings: result.findings as unknown as Prisma.InputJsonValue,
      },
    });
    const comparison = previous
      ? compareReviews({ id: previous.id, score: previous.score, scoringVersion: previous.scoringVersion, findings: previous.findings as unknown as Finding[] },
        { score: result.score, scoringVersion: result.scoringVersion, findings: result.findings })
      : null;
    return { ...this.view(row, src.name), comparison };
  }

  /**
   * Generates the PDF and DOCX in memory, reads them back with the real extractors and reports what survived.
   * Nothing is stored: not the files, not the extracted text. Kept separate from the quality score.
   */
  async exportCheck(user: AuthUser, resumeId: string, versionId?: string) {
    const src = await this.source.load(user, resumeId, versionId);
    const chunks: Buffer[] = [];
    const sink = new Writable({ write(c, _e, cb) { chunks.push(Buffer.from(c)); cb(); } });
    const done = new Promise<void>((res, rej) => { sink.on('finish', () => res()); sink.on('error', rej); });
    renderPdf(src.model, sink);
    await done;
    const pdfBytes = Buffer.concat(chunks);
    const pdf = await extractPdf(pdfBytes);
    const docx = extractDocx(renderDocx(src.model));
    return {
      checkVersion: EXPORT_CHECK_VERSION, resumeVersionNumber: src.versionNumber,
      checks: [checkExtraction(src.model, 'pdf', pdf.lines, pdf.pages ?? null), checkExtraction(src.model, 'docx', docx.lines, null)],
      note: 'This reads back files generated in memory with a standard text extractor. It is not an employer ATS result or a prediction. Nothing was stored.',
    };
  }

  async list(user: AuthUser, resumeId: string) {
    await this.resumes.get(user, resumeId);
    const rows = await this.prisma.qualityReview.findMany({
      where: { resumeId, tenantId: user.tenantId, userId: user.userId }, orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, resumeId: true, resumeVersionId: true, resumeVersionNumber: true, scoringVersion: true, score: true, readiness: true, createdAt: true },
    });
    return rows;
  }

  async get(user: AuthUser, id: string) { return this.view(await this.owned(user, id)); }

  async remove(user: AuthUser, id: string) {
    const r = await this.owned(user, id);
    await this.prisma.qualityReview.delete({ where: { id: r.id } });
  }

  private view(r: QualityReview, resumeName?: string) {
    const cov = r.coverage as unknown as QualityScore['coverage'] & { counts: QualityScore['counts'] };
    const { counts, ...coverage } = cov;
    return {
      id: r.id, resumeId: r.resumeId, resumeName: resumeName ?? null, resumeVersionId: r.resumeVersionId, resumeVersionNumber: r.resumeVersionNumber,
      scoringVersion: r.scoringVersion, score: r.score, readiness: r.readiness, dimensions: r.dimensionScores as unknown as QualityScore['dimensions'],
      coverage, counts, findings: r.findings as unknown as Finding[], disclaimer: QUALITY_DISCLAIMER, createdAt: r.createdAt,
    };
  }
}
