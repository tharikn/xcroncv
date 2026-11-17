import {
  Body, Controller, Delete, Get, HttpCode, Optional, Param, ParseUUIDPipe, Patch, Post, Query, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AuthUser } from '../common/auth/auth.types';
import { Public } from '../common/auth/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { DomainEvents } from '../common/domain-events';
import { renderHtml } from '../export/html.renderer';
import { renderPdf } from '../export/pdf.renderer';
import { safeFilename } from '../export/filename';
import { CreateResumeDto, CreateVersionDto, UpdateResumeDto } from './dto/resume.dto';
import { ResumesService } from './resumes.service';

@Controller('resumes')
export class ResumesController {
  constructor(private svc: ResumesService, @Optional() private events?: DomainEvents) {}

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateResumeDto) { return this.svc.create(u, dto); }
  @Get() list(@CurrentUser() u: AuthUser, @Query('page') page?: string, @Query('pageSize') ps?: string) {
    return this.svc.list(u, Math.max(1, Number(page) || 1), Math.max(1, Number(ps) || 20));
  }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateResumeDto) {
    return this.svc.update(u, id, dto);
  }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.remove(u, id);
  }

  @Post(':id/versions') version(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateVersionDto) {
    return this.svc.createVersion(u, id, dto);
  }
  @Get(':id/versions') versions(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.listVersions(u, id);
  }

  @Get(':id/render-model')
  async renderModel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return (await this.svc.renderModel(u, id)).model;
  }

  @Post(':id/share') @HttpCode(200)
  async share(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.createShare(u, id);
  }

  @Delete(':id/share') @HttpCode(204)
  async revokeShare(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.revokeShare(u, id);
  }

  // Export: bytes are streamed to the client and never persisted. The client saves to a local folder.
  @Post(':id/export/html')
  async exportHtml(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { model, name } = await this.svc.renderModel(u, id);
    this.events?.emit(u, 'resume.exported', { resumeId: id, format: 'html' });
    this.headers(res, 'text/html; charset=utf-8', safeFilename(name, 'html'));
    res.send(renderHtml(model));
  }

  @Post(':id/export/pdf')
  async exportPdf(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { model, name } = await this.svc.renderModel(u, id);
    this.events?.emit(u, 'resume.exported', { resumeId: id, format: 'pdf' });
    this.headers(res, 'application/pdf', safeFilename(name, 'pdf'));
    renderPdf(model, res);
  }

  private headers(res: Response, type: string, filename: string) {
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}

@Controller('public/resumes')
export class PublicResumeController {
  constructor(private svc: ResumesService) {}
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':token')
  async view(@Param('token') token: string, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return this.svc.publicShare(token);
  }
}