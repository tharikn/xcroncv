import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post,
  UploadedFile, UseInterceptors, Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { PassThrough } from 'stream';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { renderPdf } from '../export/pdf.renderer';
import { renderDocx } from '../import-export/docx.renderer';
import { assertSafeDocx, MAX_UPLOAD_BYTES, sniff } from '../import-export/file-validate';
import { PrismaService } from '../prisma/prisma.service';
import { ResumesModule } from '../resumes/resumes.module';
import { ResumesService } from '../resumes/resumes.service';
import { adaptersFor } from './adapters';
import { expectedFrom, runParsingTest } from './engine';
import { FileKind, ParsingReport, RunResult, SUITE_VERSION } from './types';

export class RunParsingTestDto {
  @IsIn(['pdf', 'docx']) format: FileKind;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) parserProfiles?: string[];
}

function pdfBytes(model: Parameters<typeof renderPdf>[0]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const sink = new PassThrough(); const chunks: Buffer[] = [];
    sink.on('data', (c: Buffer) => chunks.push(c)); sink.on('end', () => resolve(Buffer.concat(chunks))); sink.on('error', reject);
    try { renderPdf(model, sink as never); } catch (e) { reject(e); }
  });
}

@Injectable()
export class ParsingTestService {
  constructor(private prisma: PrismaService, private resumes: ResumesService) {}

  /** Generate a fresh export of the resume in memory, test it against the known source, store report metadata only. */
  async runForResume(u: AuthUser, resumeId: string, dto: RunParsingTestDto) {
    const { model } = await this.resumes.renderModel(u, resumeId); // enforces tenant + owner
    const adapters = adaptersFor(dto.format, dto.parserProfiles);
    let bytes: Buffer | undefined = dto.format === 'pdf' ? await pdfBytes(model) : renderDocx(model);
    let result: RunResult;
    try { result = await runParsingTest(bytes, dto.format, adapters, expectedFrom(model)); }
    finally { bytes.fill(0); bytes = undefined; }
    return this.persist(u, resumeId, result);
  }

  /** Test a user-selected local file. Diagnostics only: there is no ground truth, so no score. */
  async runForUpload(u: AuthUser, file: Express.Multer.File | undefined, profiles?: string[]) {
    if (!file?.buffer) throw new BadRequestException('Choose a PDF or DOCX file to test.');
    try {
      const kind = sniff(file.buffer);
      if (kind === 'docx') assertSafeDocx(file.buffer);
      const result = await runParsingTest(file.buffer, kind, adaptersFor(kind, profiles));
      return this.persist(u, null, result);
    } finally {
      file.buffer.fill(0); // delete the uploaded bytes on every exit path
      (file as { buffer?: Buffer }).buffer = undefined;
    }
  }

  private async persist(u: AuthUser, resumeId: string | null, r: RunResult) {
    const row = await this.prisma.parsingTestReport.create({
      data: {
        tenantId: u.tenantId, userId: u.userId, resumeId, source: r.report.source, format: r.report.format, suiteVersion: SUITE_VERSION,
        parserProfiles: r.report.adapters.map((a) => a.id) as unknown as Prisma.InputJsonValue, score: r.report.score,
        report: r.report as unknown as Prisma.InputJsonValue, // findings + indicators only; no document text
      },
    });
    return { id: row.id, createdAt: row.createdAt, resumeId, report: r.report, preview: r.preview /* returned once, never stored */ };
  }

  async get(u: AuthUser, id: string) {
    const row = await this.prisma.parsingTestReport.findFirst({ where: { id, tenantId: u.tenantId, userId: u.userId } });
    if (!row) throw new NotFoundException('Report not found');
    return { id: row.id, createdAt: row.createdAt, resumeId: row.resumeId, report: row.report as unknown as ParsingReport };
  }

  async listForResume(u: AuthUser, resumeId: string) {
    await this.resumes.renderModel(u, resumeId); // ownership check
    const rows = await this.prisma.parsingTestReport.findMany({ where: { tenantId: u.tenantId, userId: u.userId, resumeId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((r) => this.meta(r));
  }

  async listUploads(u: AuthUser) {
    const rows = await this.prisma.parsingTestReport.findMany({ where: { tenantId: u.tenantId, userId: u.userId, resumeId: null }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((r) => this.meta(r));
  }

  private meta(r: { id: string; createdAt: Date; source: string; format: string; score: number | null; suiteVersion: string; report: Prisma.JsonValue }) {
    const findings = ((r.report as unknown as ParsingReport)?.findings ?? []);
    const count = (s: string) => findings.filter((f) => f.severity === s).length;
    return { id: r.id, createdAt: r.createdAt, source: r.source, format: r.format, score: r.score, suiteVersion: r.suiteVersion, errors: count('error'), warnings: count('warning') };
  }

  async remove(u: AuthUser, id: string) {
    const r = await this.prisma.parsingTestReport.deleteMany({ where: { id, tenantId: u.tenantId, userId: u.userId } });
    if (!r.count) throw new NotFoundException('Report not found');
  }
}

@Controller()
export class ParsingTestController {
  constructor(private svc: ParsingTestService) {}

  @Post('resumes/:id/parsing-tests') @Throttle({ default: { limit: 20, ttl: 60_000 } })
  run(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RunParsingTestDto) { return this.svc.runForResume(u, id, dto); }

  @Get('resumes/:id/parsing-tests')
  list(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.listForResume(u, id); }

  @Post('parsing-tests/upload') @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 } }))
  upload(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File | undefined) { return this.svc.runForUpload(u, file); }

  @Get('parsing-tests/uploads') uploads(@CurrentUser() u: AuthUser) { return this.svc.listUploads(u); }

  @Get('parsing-tests/:testId')
  async get(@CurrentUser() u: AuthUser, @Param('testId', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return this.svc.get(u, id);
  }

  @Delete('parsing-tests/:testId') @HttpCode(204)
  remove(@CurrentUser() u: AuthUser, @Param('testId', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}

@Module({ imports: [ResumesModule], controllers: [ParsingTestController], providers: [ParsingTestService] })
export class ParsingTestModule {}
