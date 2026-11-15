import { DomainEvents } from '../common/domain-events';
import {
  BadRequestException, Controller, Module, Optional, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { safeFilename } from '../export/filename';
import { ResumesModule } from '../resumes/resumes.module';
import { ResumesService } from '../resumes/resumes.service';
import { renderDocx } from './docx.renderer';
import { MAX_UPLOAD_BYTES, sniff } from './file-validate';
import { parseResumeText } from './resume-parser';
import { extractDocx, extractPdf } from './text-extract';
import { renderXlsx } from './xlsx.renderer';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Module 06: transient import (PDF/DOCX -> suggestions) and DOCX/XLSX export. Nothing is persisted; bytes are streamed and discarded. */
@Controller()
export class ImportExportController {
  constructor(private resumes: ResumesService, @Optional() private events?: DomainEvents) {}

  /** Parse a user-selected local file. Bytes live only in this request's memory and are zeroed afterwards. */
  @Post('resume-imports/parse')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 } }))
  async parse(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File | undefined, @Res({ passthrough: true }) res: Response) {
    if (!file?.buffer) throw new BadRequestException('Choose a PDF or DOCX file to import.');
    try {
      const kind = sniff(file.buffer);
      const extracted = kind === 'pdf' ? await extractPdf(file.buffer) : extractDocx(file.buffer);
      const suggestion = parseResumeText(extracted.lines);
      if (extracted.truncated) suggestion.warnings.push('Only the first pages were read.');
      res.setHeader('Cache-Control', 'no-store');
      this.events?.emit(u, 'import.completed', { kind, pages: extracted.pages ?? null, warnings: suggestion.warnings.length });
      return { kind, pages: extracted.pages ?? null, suggestion };
    } finally {
      file.buffer.fill(0); // delete the uploaded bytes on every exit path (success, error, timeout)
      (file as { buffer?: Buffer }).buffer = undefined;
    }
  }

  @Post('resumes/:id/export/docx')
  async docx(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { model, name } = await this.resumes.renderModel(u, id);
    this.events?.emit(u, 'resume.exported', { resumeId: id, format: 'docx' });
    this.send(res, DOCX, safeFilename(name, 'docx'), renderDocx(model));
  }

  @Post('resumes/:id/export/xlsx')
  async xlsx(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { model, name } = await this.resumes.renderModel(u, id);
    this.events?.emit(u, 'resume.exported', { resumeId: id, format: 'xlsx' });
    this.send(res, XLSX, safeFilename(name, 'xlsx'), renderXlsx(model));
  }

  private send(res: Response, type: string, filename: string, bytes: Buffer) {
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(bytes);
  }
}

@Module({ imports: [ResumesModule], controllers: [ImportExportController] })
export class ImportExportModule {}
