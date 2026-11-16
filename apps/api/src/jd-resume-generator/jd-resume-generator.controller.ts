import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { MAX_UPLOAD_BYTES, sniff } from '../import-export/file-validate';
import { extractDocx, extractPdf } from '../import-export/text-extract';
import { sanitizeJdText } from '../resume-match/jd-analyzer';
import { GenerateFromJdDto } from './dto/jd-resume-generator.dto';
import { JdResumeGeneratorService } from './jd-resume-generator.service';

@Controller('jd-resume-generator')
export class JdResumeGeneratorController {
  constructor(private readonly svc: JdResumeGeneratorService) {}

  /**
   * POST /jd-resume-generator/analyze
   * Accepts raw JD text, returns JD analysis + optimized resume model.
   * Nothing is persisted — stream and discard.
   */
  @Post('analyze')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  analyze(@CurrentUser() u: AuthUser, @Body() dto: GenerateFromJdDto) {
    return this.svc.generate(u, dto);
  }

  /**
   * POST /jd-resume-generator/analyze/upload
   * Accepts a PDF or DOCX file, extracts text, then delegates to analyze.
   * File bytes are zeroed after text extraction — never stored.
   */
  @Post('analyze/upload')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 } }))
  async analyzeUpload(
    @CurrentUser() u: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!file?.buffer) throw new BadRequestException('Upload a PDF or DOCX file containing the job description.');

    res.setHeader('Cache-Control', 'no-store');

    const buf = file.buffer;
    let jdText: string;
    let jobTitle: string | undefined;

    try {
      const kind = sniff(buf); // throws UnsupportedMediaTypeException for non-PDF/DOCX
      let lines: string[];

      if (kind === 'pdf') {
        const extracted = await extractPdf(buf);
        lines = extracted.lines;
      } else {
        const extracted = extractDocx(buf);
        lines = extracted.lines;
      }

      jdText = sanitizeJdText(lines.join('\n'));

      if (!jdText || jdText.length < 50) {
        throw new BadRequestException('Could not extract enough text from the uploaded file. Please paste the job description as text instead.');
      }

      // Attempt to infer a job title from the first non-empty lines (heuristic)
      const firstLine = lines.find((l) => l.trim().length > 3 && l.trim().length < 120);
      if (firstLine) jobTitle = firstLine.trim();
    } catch (e) {
      if (e instanceof UnsupportedMediaTypeException || e instanceof BadRequestException) throw e;
      throw new BadRequestException('Failed to extract text from the uploaded file.');
    } finally {
      buf.fill(0); // zero file bytes — never keep raw source
    }

    const dto: GenerateFromJdDto = { jdText, jobTitle };
    return this.svc.generate(u, dto);
  }

  /**
   * GET /jd-resume-generator/templates
   * Returns all ATS-compatible templates for the gallery/switcher UI.
   */
  @Get('templates')
  getTemplates(@CurrentUser() _u: AuthUser) {
    return { templates: this.svc.getAtsTemplates() };
  }
}
