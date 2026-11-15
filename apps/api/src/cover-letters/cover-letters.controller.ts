import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { safeFilename } from '../export/filename';
import { renderLetterHtml, renderLetterPdf, lettersToText } from './cover-letter.render';
import { CoverLettersService } from './cover-letters.service';
import { BindDto, CreateDraftDto, CreateLetterVersionDto, UpdateLetterDto, ValidateClaimsDto } from './dto/cover-letter.dto';

@Controller('cover-letters')
export class CoverLettersController {
  constructor(private svc: CoverLettersService) {}

  @Get('templates') templates() { return this.svc.templates(); }
  @Post('drafts') draft(@CurrentUser() u: AuthUser, @Body() dto: CreateDraftDto) { return this.svc.createDraft(u, dto); }
  @Get() list(@CurrentUser() u: AuthUser, @Query('page') page?: string) { return this.svc.list(u, Math.max(1, Number(page) || 1)); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Patch(':id') rename(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLetterDto) { return this.svc.rename(u, id, dto.title); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }

  @Post(':id/versions')
  version(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateLetterVersionDto) { return this.svc.createVersion(u, id, dto); }

  @Post(':id/claims/validate') @HttpCode(200)
  validate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ValidateClaimsDto) { return this.svc.validate(u, id, dto); }

  /** Export bytes are streamed and never stored by the server. */
  @Post(':id/export/:format') @HttpCode(200)
  async export(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('format') format: string, @Res() res: Response) {
    if (!['pdf', 'html', 'txt'].includes(format)) throw new BadRequestException('Format must be pdf, html or txt');
    const { title, sections } = await this.svc.exportable(u, id);
    const type = format === 'pdf' ? 'application/pdf' : format === 'html' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(title, format).replace(/^\.|^$/, 'cover-letter')}"`);
    res.setHeader('Cache-Control', 'no-store');
    if (format === 'pdf') renderLetterPdf(title, sections, res);
    else res.send(format === 'html' ? renderLetterHtml(title, sections) : lettersToText(sections));
  }
}

/** Host application references are opaque; they never authorise access to host records. */
@Controller('applications')
export class ApplicationCoverLetterController {
  constructor(private svc: CoverLettersService) {}

  @Post(':ref/cover-letter-bindings')
  bind(@CurrentUser() u: AuthUser, @Param('ref') ref: string, @Body() dto: BindDto) {
    if (!/^[\w.:-]{1,120}$/.test(ref)) throw new BadRequestException('Invalid application reference');
    return this.svc.bind(u, ref, dto);
  }

  @Get(':ref/cover-letter-bindings')
  bindings(@CurrentUser() u: AuthUser, @Param('ref') ref: string) {
    if (!/^[\w.:-]{1,120}$/.test(ref)) throw new BadRequestException('Invalid application reference');
    return this.svc.listBindings(u, ref);
  }
}
