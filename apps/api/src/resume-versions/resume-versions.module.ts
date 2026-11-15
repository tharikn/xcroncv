import {
  BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query, Res,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Response } from 'express';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { renderPdf } from '../export/pdf.renderer';
import { safeFilename } from '../export/filename';
import { renderDocx } from '../import-export/docx.renderer';
import { PrismaService } from '../prisma/prisma.service';
import { RenderModel } from '../render-model/render-model.types';
import { ResumesModule } from '../resumes/resumes.module';
import { UpdateResumeDto } from '../resumes/dto/resume.dto';
import { ResumesService } from '../resumes/resumes.service';
import { contentHash, diffModels, layoutFrom } from './version-diff';

const KINDS = ['MASTER', 'ROLE', 'JOB'];
const SECTION_TYPES = ['summary', 'experience', 'skills', 'education', 'projects', 'certifications', 'languages'];

export class VariantDto {
  @IsIn(KINDS) kind: string;
  @IsOptional() @IsString() @MaxLength(120) company?: string;
  @IsOptional() @IsString() @MaxLength(120) jobTitle?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
export class NewVariantDto extends VariantDto {
  @IsString() @MinLength(1) @MaxLength(100) name: string;
}
export class SnapshotDto {
  @IsOptional() @IsString() @MaxLength(200) changeSummary?: string;
  @IsOptional() @IsString() @MaxLength(60) label?: string;
}
export class RestoreDto { @IsOptional() @IsBoolean() applyLayout?: boolean }
/** Draft save with optimistic concurrency: `expectedUpdatedAt` is the updatedAt the editor last saw. */
export class DraftDto extends UpdateResumeDto {
  @IsDateString() expectedUpdatedAt: string;
}

@Injectable()
export class ResumeVersionsService {
  constructor(private prisma: PrismaService, private resumes: ResumesService) {}

  /* ---------- variants ---------- */
  async getVariant(u: AuthUser, id: string) {
    await this.resumes.get(u, id);
    return (await this.prisma.resumeVariant.findFirst({ where: { resumeId: id, tenantId: u.tenantId, userId: u.userId } })) ?? { resumeId: id, kind: null };
  }
  async setVariant(u: AuthUser, id: string, dto: VariantDto) {
    await this.resumes.get(u, id);
    if (dto.kind === 'MASTER') {
      const other = await this.prisma.resumeVariant.findFirst({ where: { tenantId: u.tenantId, userId: u.userId, kind: 'MASTER', NOT: { resumeId: id } } });
      if (other) throw new ConflictException('You already have a master resume. Change its type first.');
    }
    const data = { kind: dto.kind, company: dto.company ?? null, jobTitle: dto.jobTitle ?? null, notes: dto.notes ?? null };
    return this.prisma.resumeVariant.upsert({ where: { resumeId: id }, create: { tenantId: u.tenantId, userId: u.userId, resumeId: id, ...data }, update: data });
  }
  async listVariants(u: AuthUser) {
    const vs = await this.prisma.resumeVariant.findMany({ where: { tenantId: u.tenantId, userId: u.userId }, orderBy: { createdAt: 'asc' } });
    const names = await this.prisma.resume.findMany({ where: { id: { in: vs.map((v) => v.resumeId) }, tenantId: u.tenantId, profile: { userId: u.userId } }, select: { id: true, name: true, updatedAt: true } });
    return vs.filter((v) => names.some((n) => n.id === v.resumeId)).map((v) => ({ ...v, name: names.find((n) => n.id === v.resumeId)!.name, updatedAt: names.find((n) => n.id === v.resumeId)!.updatedAt }));
  }
  /** Copy a resume's layout configuration into a new role- or job-specific variant. Content stays in the shared career profile. */
  async newVariant(u: AuthUser, id: string, dto: NewVariantDto) {
    const src = await this.resumes.get(u, id);
    if (dto.kind === 'MASTER') throw new BadRequestException('A new variant cannot be the master. Use ROLE or JOB.');
    return this.prisma.$transaction(async (tx) => {
      const resume = await tx.resume.create({
        data: { profileId: src.profileId, tenantId: src.tenantId, name: dto.name.trim(), targetRole: dto.jobTitle ?? src.targetRole, templateId: src.templateId, templateVersion: src.templateVersion,
          sections: src.sections as Prisma.InputJsonValue, overrides: src.overrides as Prisma.InputJsonValue },
      });
      const variant = await tx.resumeVariant.create({ data: { tenantId: u.tenantId, userId: u.userId, resumeId: resume.id, kind: dto.kind, parentResumeId: id, company: dto.company ?? null, jobTitle: dto.jobTitle ?? null, notes: dto.notes ?? null } });
      return { resume, variant };
    });
  }

  /* ---------- optimistic concurrency ---------- */
  async saveDraft(u: AuthUser, id: string, dto: DraftDto) {
    const cur = await this.resumes.get(u, id);
    if (new Date(dto.expectedUpdatedAt).getTime() !== cur.updatedAt.getTime()) {
      throw new ConflictException({ message: 'This resume was changed somewhere else. Reload to see the latest version before saving.', current: cur });
    }
    const { expectedUpdatedAt: _e, ...rest } = dto;
    return this.resumes.update(u, id, rest as UpdateResumeDto);
  }

  /* ---------- immutable snapshots ---------- */
  private async append(tx: Prisma.TransactionClient, u: AuthUser, resumeId: string, snapshot: RenderModel, summary: string | undefined, meta: { label?: string; restoredFrom?: number; profileUpdatedAt?: Date }) {
    const last = await tx.resumeVersion.findFirst({ where: { resumeId }, orderBy: { versionNumber: 'desc' } });
    const v = await tx.resumeVersion.create({ data: { resumeId, versionNumber: (last?.versionNumber ?? 0) + 1, structuredSnapshot: snapshot as unknown as Prisma.InputJsonValue, changeSummary: summary } });
    const m = await tx.resumeVersionMeta.create({
      data: { tenantId: u.tenantId, userId: u.userId, versionId: v.id, resumeId, contentHash: contentHash(snapshot), templateId: snapshot.template.id, templateVersion: snapshot.template.version,
        profileUpdatedAt: meta.profileUpdatedAt ?? null, label: meta.label ?? null, restoredFrom: meta.restoredFrom ?? null },
    });
    return { id: v.id, versionNumber: v.versionNumber, changeSummary: v.changeSummary, createdAt: v.createdAt, meta: this.metaView(m) };
  }
  private metaView(m: { contentHash: string; templateId: string; templateVersion: number; profileUpdatedAt: Date | null; label: string | null; restoredFrom: number | null }) {
    return { contentHash: m.contentHash, templateId: m.templateId, templateVersion: m.templateVersion, profileUpdatedAt: m.profileUpdatedAt, label: m.label, restoredFrom: m.restoredFrom };
  }

  async snapshot(u: AuthUser, id: string, dto: SnapshotDto) {
    const resume = await this.resumes.get(u, id);
    const { model } = await this.resumes.renderModel(u, id);
    const profile = await this.prisma.careerProfile.findUnique({ where: { id: resume.profileId }, select: { updatedAt: true } });
    return this.prisma.$transaction((tx) => this.append(tx, u, id, model, dto.changeSummary, { label: dto.label, profileUpdatedAt: profile?.updatedAt }));
  }

  async list(u: AuthUser, id: string) {
    await this.resumes.get(u, id);
    const vs = await this.prisma.resumeVersion.findMany({ where: { resumeId: id }, orderBy: { versionNumber: 'desc' }, select: { id: true, versionNumber: true, changeSummary: true, createdAt: true } });
    const metas = await this.prisma.resumeVersionMeta.findMany({ where: { resumeId: id } });
    return vs.map((v) => { const m = metas.find((x) => x.versionId === v.id); return { ...v, meta: m ? this.metaView(m) : null }; });
  }

  private async load(u: AuthUser, id: string, n: number) {
    await this.resumes.get(u, id);
    const v = await this.prisma.resumeVersion.findUnique({ where: { resumeId_versionNumber: { resumeId: id, versionNumber: n } } });
    if (!v) throw new NotFoundException('Version not found');
    const meta = await this.prisma.resumeVersionMeta.findUnique({ where: { versionId: v.id } });
    return { v, meta };
  }

  /** Full snapshot plus an integrity check: the stored hash must still match the stored content. */
  async get(u: AuthUser, id: string, n: number) {
    const { v, meta } = await this.load(u, id, n);
    const hash = contentHash(v.structuredSnapshot);
    return { id: v.id, versionNumber: v.versionNumber, changeSummary: v.changeSummary, createdAt: v.createdAt, snapshot: v.structuredSnapshot, meta: meta ? this.metaView(meta) : null, integrity: meta ? { valid: meta.contentHash === hash, hash } : { valid: null, hash, note: 'This version was saved before integrity hashes were recorded.' } };
  }

  private async side(u: AuthUser, id: string, ref: string): Promise<{ label: string; model: RenderModel }> {
    if (ref === 'draft') return { label: 'Working draft', model: (await this.resumes.renderModel(u, id)).model };
    const n = Number(ref); if (!Number.isInteger(n) || n < 1) throw new BadRequestException('Use a version number or "draft".');
    const { v } = await this.load(u, id, n);
    return { label: `Version ${n}`, model: v.structuredSnapshot as unknown as RenderModel };
  }
  async compare(u: AuthUser, id: string, from: string, to: string) {
    const [a, b] = [await this.side(u, id, from), await this.side(u, id, to)];
    return { from: a.label, to: b.label, ...diffModels(a.model, b.model) };
  }

  /** Restoring never edits history: it appends a NEW version holding the old content. */
  async restore(u: AuthUser, id: string, n: number, dto: RestoreDto) {
    const { v } = await this.load(u, id, n);
    const snap = v.structuredSnapshot as unknown as RenderModel;
    const created = await this.prisma.$transaction((tx) => this.append(tx, u, id, snap, `Restored from version ${n}`, { restoredFrom: n }));
    let layout: ReturnType<typeof layoutFrom> | undefined;
    if (dto.applyLayout) { layout = layoutFrom(snap, SECTION_TYPES); await this.resumes.update(u, id, layout as unknown as UpdateResumeDto); }
    return { ...created, layoutApplied: !!layout };
  }

  async exportVersion(u: AuthUser, id: string, n: number, format: 'pdf' | 'docx', res: Response) {
    const { v } = await this.load(u, id, n);
    const resume = await this.resumes.get(u, id);
    const snap = v.structuredSnapshot as unknown as RenderModel;
    const name = safeFilename(`${resume.name} v${n}`, format);
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    if (format === 'pdf') { res.setHeader('Content-Type', 'application/pdf'); renderPdf(snap, res); }
    else { res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); res.send(renderDocx(snap)); }
  }
}

@Controller('resumes')
export class ResumeVersionsController {
  constructor(private svc: ResumeVersionsService) {}
  @Get(':id/variant') variant(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.getVariant(u, id); }
  @Put(':id/variant') setVariant(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VariantDto) { return this.svc.setVariant(u, id, dto); }
  @Post(':id/variants') newVariant(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NewVariantDto) { return this.svc.newVariant(u, id, dto); }

  @Put(':id/draft') draft(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DraftDto) { return this.svc.saveDraft(u, id, dto); }

  @Post(':id/snapshots') snapshot(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SnapshotDto) { return this.svc.snapshot(u, id, dto); }
  @Get(':id/snapshots') list(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.list(u, id); }
  @Get(':id/snapshots/compare') compare(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('from') from = '', @Query('to') to = 'draft') { return this.svc.compare(u, id, from, to); }
  @Get(':id/snapshots/:n') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('n', ParseIntPipe) n: number) { return this.svc.get(u, id, n); }
  @Post(':id/snapshots/:n/restore') @HttpCode(200) restore(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('n', ParseIntPipe) n: number, @Body() dto: RestoreDto) { return this.svc.restore(u, id, n, dto); }
  @Post(':id/snapshots/:n/export/:format') @HttpCode(200)
  export(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('n', ParseIntPipe) n: number, @Param('format') format: string, @Res() res: Response) {
    if (format !== 'pdf' && format !== 'docx') throw new BadRequestException('Format must be pdf or docx.');
    return this.svc.exportVersion(u, id, n, format, res);
  }
}

@Controller('resume-variants')
export class ResumeVariantsController {
  constructor(private svc: ResumeVersionsService) {}
  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.listVariants(u); }
}

@Module({ imports: [ResumesModule], controllers: [ResumeVersionsController, ResumeVariantsController], providers: [ResumeVersionsService], exports: [ResumeVersionsService] })
export class ResumeVersionsModule {}
