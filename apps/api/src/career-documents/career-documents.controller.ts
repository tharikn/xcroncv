import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { CareerDocumentsService } from './career-documents.service';
import { CreateDocumentDto, CreateVersionDto } from './dto/doc.dto';

@Controller('career-documents')
export class CareerDocumentsController {
  constructor(private svc: CareerDocumentsService) {}

  @Get('types') types() { return this.svc.types(); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateDocumentDto) { return this.svc.create(u, dto); }
  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.list(u); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('version') version?: string) { return this.svc.get(u, id, version ? Number(version) || undefined : undefined); }
  @Post(':id/versions') version(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateVersionDto) { return this.svc.createVersion(u, id, dto); }
  @Post(':id/claims/validate') @HttpCode(200) validate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.validate(u, id); }
  @Get(':id/diff') diff(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('from', ParseIntPipe) from: number, @Query('to', ParseIntPipe) to: number) { return this.svc.diff(u, id, from, to); }

  @Post(':id/export/:format') @HttpCode(200) @Header('Cache-Control', 'no-store')
  async export(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('format') format: string, @Res() res: Response) {
    if (format !== 'txt' && format !== 'md' && format !== 'docx' && format !== 'pdf') throw new BadRequestException('Format must be txt, md, docx or pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const f = await this.svc.export(u, id, format);
    res.setHeader('Content-Type', f.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${f.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(f.body);
  }

  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}
