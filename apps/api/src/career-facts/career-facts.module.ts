import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Response } from 'express';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { SKILLS, TAXONOMY_VERSION, findSkills, normalizeLabel, skillById } from '../resume-match/taxonomy';
import {
  AchievementData, buildAchievementDraft, CLIENT_ORIGINS, FactKind, KINDS, Metric, metricProblem, sameMetric, validateFactData,
} from './facts.logic';

export class CreateFactDto {
  @IsIn(KINDS as unknown as string[]) kind: FactKind;
  @IsOptional() @IsIn(CLIENT_ORIGINS as unknown as string[]) origin?: (typeof CLIENT_ORIGINS)[number];
  @IsString() @MinLength(1) @MaxLength(150) title: string;
  @IsOptional() @IsString() @MaxLength(200) source?: string;
  @IsObject() data: Record<string, unknown>;
  /** Only honoured for USER_ENTERED facts without an unconfirmed metric. Imported and AI facts always start as drafts. */
  @IsOptional() @IsBoolean() confirmNow?: boolean;
}
export class UpdateFactDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(150) title?: string;
  @IsOptional() @IsString() @MaxLength(200) source?: string;
  @IsOptional() @IsObject() data?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}
export class ConfirmDto { @IsOptional() @IsBoolean() confirmMetric?: boolean }
export class RestoreDto { @IsInt() @Min(1) revision: number }
export class DraftDto {
  @IsString() @MaxLength(600) text: string;
  @IsOptional() @IsString() @MaxLength(150) experienceRef?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(15) @IsString({ each: true }) skills?: string[];
}
export class NormalizeDto { @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @MaxLength(80, { each: true }) names: string[] }

type Row = Prisma.CareerFactGetPayload<object>;
const view = (r: Row) => ({
  id: r.id, kind: r.kind, origin: r.origin, status: r.status, title: r.title, data: r.data, source: r.source, revision: r.revision,
  confirmedAt: r.confirmedAt, createdAt: r.createdAt, updatedAt: r.updatedAt,
});

@Injectable()
export class CareerFactsService {
  constructor(private prisma: PrismaService) {}
  private own(u: AuthUser, id: string) {
    return this.prisma.careerFact.findFirst({ where: { id, tenantId: u.tenantId, userId: u.userId } }).then((r) => { if (!r) throw new NotFoundException('Fact not found'); return r; });
  }

  async create(u: AuthUser, dto: CreateFactDto) {
    const data = validateFactData(dto.kind, dto.data);
    const origin = dto.origin ?? 'USER_ENTERED';
    let status = 'DRAFT'; let confirmedAt: Date | null = null;
    if (dto.confirmNow) {
      if (origin !== 'USER_ENTERED') throw new BadRequestException('Imported or AI-written facts must be reviewed and confirmed separately.');
      const p = metricProblem(dto.kind, data); if (p) throw new BadRequestException(p);
      status = 'CONFIRMED'; confirmedAt = new Date();
    }
    const row = await this.prisma.careerFact.create({
      data: { tenantId: u.tenantId, userId: u.userId, kind: dto.kind, origin, status, title: dto.title.trim(), data: data as unknown as Prisma.InputJsonValue, source: dto.source?.trim() || null, confirmedAt,
        revisions: { create: { revision: 1, snapshot: { title: dto.title.trim(), data, status, origin, source: dto.source?.trim() || null } as unknown as Prisma.InputJsonValue, note: 'Created' } } },
    });
    return view(row);
  }

  async createDraft(u: AuthUser, dto: DraftDto) {
    const d = buildAchievementDraft(dto.text, { experienceRef: dto.experienceRef, skills: dto.skills });
    const row = await this.prisma.careerFact.create({
      data: { tenantId: u.tenantId, userId: u.userId, kind: 'ACHIEVEMENT', origin: 'USER_ENTERED', status: 'DRAFT', title: d.title, data: d.data as unknown as Prisma.InputJsonValue, source: 'Written by you as rough text',
        revisions: { create: { revision: 1, snapshot: { title: d.title, data: d.data, status: 'DRAFT', origin: 'USER_ENTERED', source: null } as unknown as Prisma.InputJsonValue, note: 'Draft created from rough text' } } },
    });
    return { fact: view(row), missing: d.missing, hints: d.hints };
  }

  async list(u: AuthUser, q: { kind?: string; status?: string; skill?: string; q?: string }) {
    const where: Prisma.CareerFactWhereInput = { tenantId: u.tenantId, userId: u.userId, ...(q.kind ? { kind: q.kind } : {}), ...(q.status ? { status: q.status } : { status: { not: 'ARCHIVED' } }) };
    let rows = await this.prisma.careerFact.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 200 });
    if (q.q) { const n = q.q.toLowerCase(); rows = rows.filter((r) => JSON.stringify([r.title, r.data]).toLowerCase().includes(n)); }
    if (q.skill) { const id = normalizeLabel(q.skill); rows = rows.filter((r) => ((r.data as unknown as AchievementData).skills ?? []).some((s) => (id ? normalizeLabel(s) === id : s.toLowerCase() === q.skill!.toLowerCase()))); }
    return rows.map(view);
  }

  async get(u: AuthUser, id: string) { return view(await this.own(u, id)); }

  /** Edits create a new revision; they never rewrite history. Changing a metric requires re-confirmation. */
  async update(u: AuthUser, id: string, dto: UpdateFactDto) {
    const cur = await this.own(u, id);
    const data = dto.data ? validateFactData(cur.kind as FactKind, dto.data) : (cur.data as unknown as AchievementData);
    let status = cur.status; let confirmedAt = cur.confirmedAt;
    if (dto.data && cur.kind === 'ACHIEVEMENT') {
      const before = (cur.data as unknown as AchievementData).metric; const after = (data as AchievementData).metric;
      const metric: Metric | undefined = after && !sameMetric(before, after) ? { ...after, confirmed: false } : after;
      if (metric) (data as AchievementData).metric = metric;
      if (cur.status === 'CONFIRMED' && metricProblem('ACHIEVEMENT', data)) { status = 'DRAFT'; confirmedAt = null; }
    }
    const title = dto.title?.trim() ?? cur.title; const source = dto.source !== undefined ? dto.source.trim() || null : cur.source;
    const revision = cur.revision + 1;
    const [row] = await this.prisma.$transaction([
      this.prisma.careerFact.update({ where: { id }, data: { title, source, data: data as unknown as Prisma.InputJsonValue, status, confirmedAt, revision } }),
      this.prisma.careerFactRevision.create({ data: { factId: id, revision, snapshot: { title, data, status, origin: cur.origin, source } as unknown as Prisma.InputJsonValue, note: dto.note ?? (status !== cur.status ? 'Edited; needs confirmation again' : 'Edited') } }),
    ]);
    return view(row);
  }

  /** Explicit confirmation. A metric is confirmed only when the user says so. */
  async confirm(u: AuthUser, id: string, dto: ConfirmDto) {
    const cur = await this.own(u, id);
    const data = cur.data as unknown as AchievementData;
    if (cur.kind === 'ACHIEVEMENT' && data.metric && !data.metric.confirmed) {
      if (!dto.confirmMetric) throw new BadRequestException('Confirm the number is accurate before confirming this achievement.');
      data.metric = { ...data.metric, confirmed: true };
    }
    const revision = cur.revision + 1;
    const [row] = await this.prisma.$transaction([
      this.prisma.careerFact.update({ where: { id }, data: { status: 'CONFIRMED', confirmedAt: new Date(), data: data as unknown as Prisma.InputJsonValue, revision } }),
      this.prisma.careerFactRevision.create({ data: { factId: id, revision, snapshot: { title: cur.title, data, status: 'CONFIRMED', origin: cur.origin, source: cur.source } as unknown as Prisma.InputJsonValue, note: 'Confirmed by you' } }),
    ]);
    return view(row);
  }

  async archive(u: AuthUser, id: string) {
    const cur = await this.own(u, id); const revision = cur.revision + 1;
    const [row] = await this.prisma.$transaction([
      this.prisma.careerFact.update({ where: { id }, data: { status: 'ARCHIVED', revision } }),
      this.prisma.careerFactRevision.create({ data: { factId: id, revision, snapshot: { title: cur.title, data: cur.data, status: 'ARCHIVED', origin: cur.origin, source: cur.source } as unknown as Prisma.InputJsonValue, note: 'Archived' } }),
    ]);
    return view(row);
  }

  async revisions(u: AuthUser, id: string) {
    await this.own(u, id);
    return this.prisma.careerFactRevision.findMany({ where: { factId: id }, orderBy: { revision: 'desc' }, select: { revision: true, snapshot: true, note: true, createdAt: true } });
  }

  /** Restoring appends a NEW revision with the old content; history is never rewritten. */
  async restore(u: AuthUser, id: string, revision: number) {
    const cur = await this.own(u, id);
    const old = await this.prisma.careerFactRevision.findUnique({ where: { factId_revision: { factId: id, revision } } });
    if (!old) throw new NotFoundException('Revision not found');
    const s = old.snapshot as unknown as { title: string; data: unknown; status: string; source: string | null };
    const next = cur.revision + 1;
    const status = s.status === 'ARCHIVED' ? 'DRAFT' : s.status;
    const [row] = await this.prisma.$transaction([
      this.prisma.careerFact.update({ where: { id }, data: { title: s.title, data: s.data as Prisma.InputJsonValue, status, source: s.source, revision: next, confirmedAt: status === 'CONFIRMED' ? new Date() : null } }),
      this.prisma.careerFactRevision.create({ data: { factId: id, revision: next, snapshot: { ...s, status } as unknown as Prisma.InputJsonValue, note: `Restored from revision ${revision}` } }),
    ]);
    return view(row);
  }

  async remove(u: AuthUser, id: string) { await this.own(u, id); await this.prisma.careerFact.delete({ where: { id } }); }
  async removeAll(u: AuthUser) { return { deleted: (await this.prisma.careerFact.deleteMany({ where: { tenantId: u.tenantId, userId: u.userId } })).count }; }

  async export(u: AuthUser) {
    const rows = await this.prisma.careerFact.findMany({ where: { tenantId: u.tenantId, userId: u.userId }, include: { revisions: { orderBy: { revision: 'asc' } } }, orderBy: { createdAt: 'asc' } });
    return { exportedAt: new Date().toISOString(), count: rows.length, facts: rows.map((r) => ({ ...view(r), revisions: r.revisions.map((v) => ({ revision: v.revision, snapshot: v.snapshot, note: v.note, createdAt: v.createdAt })) })) };
  }
}

@Controller('career-facts')
export class CareerFactsController {
  constructor(private svc: CareerFactsService) {}
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateFactDto) { return this.svc.create(u, dto); }
  @Get() list(@CurrentUser() u: AuthUser, @Query('kind') kind?: string, @Query('status') status?: string, @Query('skill') skill?: string, @Query('q') q?: string) { return this.svc.list(u, { kind, status, skill, q }); }
  @Get('export') async export(@CurrentUser() u: AuthUser, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Disposition', 'attachment; filename="career-facts.json"'); res.json(await this.svc.export(u));
  }
  @Delete() removeAll(@CurrentUser() u: AuthUser, @Query('confirm') confirm?: string) {
    if (confirm !== 'all') throw new BadRequestException('Add ?confirm=all to delete every fact.');
    return this.svc.removeAll(u);
  }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFactDto) { return this.svc.update(u, id, dto); }
  @Post(':id/confirm') @HttpCode(200) confirm(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmDto) { return this.svc.confirm(u, id, dto); }
  @Post(':id/archive') @HttpCode(200) archive(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.archive(u, id); }
  @Get(':id/revisions') revisions(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.revisions(u, id); }
  @Post(':id/restore') @HttpCode(200) restore(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RestoreDto) { return this.svc.restore(u, id, dto.revision); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}

@Controller()
export class AchievementDraftsController {
  constructor(private svc: CareerFactsService) {}
  /** Turn rough text into a structured DRAFT. Never invents context, outcomes or numbers. */
  @Post('achievement-drafts') draft(@CurrentUser() u: AuthUser, @Body() dto: DraftDto) { return this.svc.createDraft(u, dto); }
  @Get('achievement-drafts') drafts(@CurrentUser() u: AuthUser) { return this.svc.list(u, { kind: 'ACHIEVEMENT', status: 'DRAFT' }); }
}

@Controller('skill-taxonomy')
export class SkillTaxonomyController {
  @Get() search(@Query('q') q?: string, @Query('category') category?: string) {
    const n = (q ?? '').trim().toLowerCase();
    const skills = SKILLS.filter((s) => (!category || s.category === category) && (!n || s.label.toLowerCase().includes(n) || s.aliases.some((a) => a.includes(n))))
      .slice(0, 50).map((s) => ({ id: s.id, label: s.label, category: s.category }));
    return { version: TAXONOMY_VERSION, skills };
  }
  /** Map free-text skill names onto canonical labels; unknown names are returned unmatched, never guessed. */
  @Post('normalize') @HttpCode(200) normalize(@Body() dto: NormalizeDto) {
    return { version: TAXONOMY_VERSION, results: dto.names.map((input) => { const id = normalizeLabel(input); const s = id ? skillById(id) : undefined; return { input, matched: !!s, id: s?.id, label: s?.label, category: s?.category }; }) };
  }
  @Post('detect') @HttpCode(200) detect(@Body() body: { text?: string }) {
    return { version: TAXONOMY_VERSION, skills: findSkills(String(body?.text ?? '').slice(0, 5000)).map((h) => { const s = skillById(h.id)!; return { id: s.id, label: s.label, category: s.category }; }) };
  }
}

@Module({ controllers: [CareerFactsController, AchievementDraftsController, SkillTaxonomyController], providers: [CareerFactsService], exports: [CareerFactsService] })
export class CareerFactsModule {}
