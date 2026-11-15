import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, Headers, HttpCode, HttpException, Injectable, Module, NotFoundException,
  Param, ParseUUIDPipe, Post, Query, Res, UnsupportedMediaTypeException, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { CareerProfileModule } from '../career-profile/career-profile.module';
import { CareerProfileService, FullProfile } from '../career-profile/career-profile.service';
import { MAX_UPLOAD_BYTES, sniff } from '../import-export/file-validate';
import { parseResumeText } from '../import-export/resume-parser';
import { extractDocx, extractPdf } from '../import-export/text-extract';
import { PrismaService } from '../prisma/prisma.service';
import {
  CHOICES, Choice, classify, Classified, Conflict, csvToSuggestion, emptyProfileDto, jsonToSuggestion, MAX_STRUCTURED_BYTES, planMerge,
  ProfileDto, SourceKind, StagedField, toFields,
} from './staging';

export const RETENTION_DAYS = 7;
/** Official provider connections need provider terms, scopes and consent review (doc 43 s3, P2). None is wired, so nothing can be connected. */
export const PROVIDERS: Record<string, never> = {};

export class SelectionDto {
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @IsString({ each: true }) accept?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @IsString({ each: true }) reject?: string[];
}
export class DecisionItemDto {
  @IsString() @MaxLength(40) conflictId: string;
  @IsIn(CHOICES) choice: Choice;
}
export class ResolveDto { @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => DecisionItemDto) decisions: DecisionItemDto[] }
export class ConfirmDto { @IsBoolean() confirm: boolean }

type Row = Prisma.CareerImportJobGetPayload<object>;

export function profileToDto(p: FullProfile | null): ProfileDto | null {
  if (!p) return null;
  const o = <T>(v: T | null | undefined) => (v == null ? undefined : v);
  return {
    fullName: p.fullName, email: o(p.email), phone: o(p.phone), location: o(p.location), headline: o(p.headline), summary: o(p.summary),
    links: ((p.links as unknown as Array<{ label: string; url: string }>) ?? []).map((l) => ({ label: l.label, url: l.url })),
    experiences: p.experiences.map((e) => ({
      employerName: e.employerName, jobTitle: e.jobTitle, employmentType: o(e.employmentType), location: o(e.location), startDate: e.startDate, endDate: o(e.endDate),
      isCurrent: e.isCurrent, description: o(e.description), bullets: e.bullets.map((b) => ({ kind: b.kind, content: b.content, isUserConfirmed: b.isUserConfirmed })),
    })),
    skills: p.skills.map((s) => ({ name: s.name, category: o(s.category), proficiency: o(s.proficiency), yearsUsed: o(s.yearsUsed) })),
    educations: p.educations.map((e) => ({ institution: e.institution, degree: e.degree, field: o(e.field), startDate: o(e.startDate), endDate: o(e.endDate), grade: o(e.grade) })),
    projects: p.projects.map((x) => ({ name: x.name, url: o(x.url), description: o(x.description), technologies: x.technologies })),
    certifications: p.certifications.map((c) => ({ name: c.name, issuer: o(c.issuer), issuedDate: o(c.issuedDate), expiryDate: o(c.expiryDate) })),
    languages: p.languages.map((l) => ({ name: l.name, proficiency: o(l.proficiency) })),
  };
}

const isText = (b: Buffer) => !b.subarray(0, 4096).includes(0);

@Injectable()
export class CareerImportsService {
  constructor(private prisma: PrismaService, private profiles: CareerProfileService) {}

  private async current(u: AuthUser): Promise<{ raw: FullProfile | null; dto: ProfileDto | null }> {
    try { const raw = await this.profiles.get(u); return { raw, dto: profileToDto(raw) }; } catch (e) { if (e instanceof NotFoundException) return { raw: null, dto: null }; throw e; }
  }
  private async audit(u: AuthUser, jobId: string, action: string, detail: Record<string, number | string> = {}) {
    await this.prisma.importAuditEvent.create({ data: { tenantId: u.tenantId, userId: u.userId, jobId, action, detail } }); // counts only, never content
  }
  private async purgeExpired(u: AuthUser) {
    await this.prisma.careerImportJob.deleteMany({ where: { tenantId: u.tenantId, userId: u.userId, expiresAt: { lt: new Date() } } });
  }
  private async own(u: AuthUser, id: string): Promise<Row> {
    await this.purgeExpired(u);
    const r = await this.prisma.careerImportJob.findFirst({ where: { id, tenantId: u.tenantId, userId: u.userId } });
    if (!r) throw new NotFoundException('Import not found or expired');
    return r;
  }
  private fieldsOf = (r: Row) => r.fields as unknown as StagedField[];
  private decisionsOf = (r: Row) => (r.decisions ?? {}) as unknown as Record<string, Choice>;

  async view(u: AuthUser, r: Row) {
    const fields = this.fieldsOf(r);
    const base = {
      id: r.id, status: r.status, sourceKind: r.sourceKind, sizeBytes: r.sizeBytes, parserVersion: r.parserVersion, warnings: r.warnings,
      createdAt: r.createdAt, expiresAt: r.expiresAt, confirmedAt: r.confirmedAt, undoable: !!r.undo,
    };
    if (r.status !== 'review_ready') return { ...base, fields, conflicts: [] as Conflict[], decisions: this.decisionsOf(r), result: r.result ?? null, counts: this.counts(fields as Classified[]) };
    const { dto } = await this.current(u);
    const c = classify(fields, dto);
    return { ...base, fields: c.fields, conflicts: c.conflicts, decisions: this.decisionsOf(r), result: null, counts: this.counts(c.fields) };
  }
  private counts(f: Array<Partial<Classified> & StagedField>) {
    const n = (p: (x: any) => boolean) => f.filter(p).length;
    return {
      total: f.length, pending: n((x) => x.status === 'pending'), accepted: n((x) => x.status === 'accepted'), rejected: n((x) => x.status === 'rejected'), merged: n((x) => x.status === 'merged'),
      new: n((x) => x.classification === 'new'), duplicate: n((x) => x.classification === 'duplicate'), conflict: n((x) => x.classification === 'conflict'),
    };
  }

  async create(u: AuthUser, file: { buffer: Buffer; originalname?: string }, idempotencyKey?: string) {
    if (idempotencyKey) {
      if (idempotencyKey.length > 80) throw new BadRequestException('Idempotency-Key is too long.');
      const prev = await this.prisma.careerImportJob.findFirst({ where: { tenantId: u.tenantId, userId: u.userId, idempotencyKey } });
      if (prev) return { created: false, job: await this.view(u, prev) };
    }
    const buf = file.buffer;
    let kind: SourceKind; let suggestion;
    try {
      let sniffed: 'pdf' | 'docx' | undefined;
      try { if (buf.length >= 8) sniffed = sniff(buf); } catch (e) { if (!(e instanceof UnsupportedMediaTypeException)) throw e; }
      if (sniffed) {
        kind = sniffed;
        const ex = sniffed === 'pdf' ? await extractPdf(buf) : extractDocx(buf);
        suggestion = parseResumeText(ex.lines);
        if (ex.truncated) suggestion.warnings.push('Only the first pages were read.');
        if (!suggestion.sectionsFound.length && !suggestion.fullName) throw new BadRequestException('Nothing importable was found in that file.');
      } else {
        const ext = /\.(json|csv)$/i.exec(file.originalname ?? '')?.[1]?.toLowerCase();
        if (!ext) throw new UnsupportedMediaTypeException('Only PDF, DOCX, JSON and CSV files can be imported.');
        if (buf.length > MAX_STRUCTURED_BYTES) throw new BadRequestException('That file is larger than 1 MB.');
        if (!isText(buf)) throw new UnsupportedMediaTypeException('That file is not plain text.');
        kind = ext as SourceKind;
        const text = buf.toString('utf8');
        suggestion = kind === 'json' ? jsonToSuggestion(text) : csvToSuggestion(text);
      }
    } finally {
      buf.fill(0); // raw source bytes are never kept
    }
    const now = new Date();
    const fields = toFields(suggestion, kind, now.toISOString());
    const row = await this.prisma.careerImportJob.create({
      data: {
        tenantId: u.tenantId, userId: u.userId, status: 'review_ready', sourceKind: kind, sizeBytes: buf.length || 0, parserVersion: fields[0]?.parserVersion ?? '',
        idempotencyKey: idempotencyKey ?? null, warnings: suggestion.warnings as unknown as Prisma.InputJsonValue, fields: fields as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(now.getTime() + RETENTION_DAYS * 86_400_000),
      },
    });
    await this.audit(u, row.id, 'received', { kind, fields: fields.length });
    await this.audit(u, row.id, 'review_ready', { fields: fields.length, warnings: suggestion.warnings.length });
    return { created: true, job: await this.view(u, row) };
  }

  async list(u: AuthUser, limit = 20, offset = 0) {
    await this.purgeExpired(u);
    const rows = await this.prisma.careerImportJob.findMany({ where: { tenantId: u.tenantId, userId: u.userId }, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit, 1), 50), skip: Math.max(offset, 0) });
    return rows.map((r) => ({ id: r.id, status: r.status, sourceKind: r.sourceKind, createdAt: r.createdAt, expiresAt: r.expiresAt, fieldCount: this.fieldsOf(r).length }));
  }

  async get(u: AuthUser, id: string) { return this.view(u, await this.own(u, id)); }

  private assertReview(r: Row) { if (r.status !== 'review_ready') throw new ConflictException('This import has already been confirmed.'); }

  /** Review queue: mark fields accepted or rejected. Nothing reaches the profile. */
  async preview(u: AuthUser, id: string, dto: SelectionDto) {
    const r = await this.own(u, id); this.assertReview(r);
    const fields = this.fieldsOf(r); const ids = new Set(fields.map((f) => f.id));
    const accept = dto.accept ?? []; const reject = dto.reject ?? [];
    const bad = [...accept, ...reject].filter((x) => !ids.has(x));
    if (bad.length) throw new BadRequestException(`Unknown field ids: ${bad.slice(0, 5).join(', ')}`);
    if (accept.some((x) => reject.includes(x))) throw new BadRequestException('A field cannot be both accepted and rejected.');
    for (const f of fields) { if (accept.includes(f.id)) f.status = 'accepted'; else if (reject.includes(f.id)) f.status = 'rejected'; }
    const row = await this.prisma.careerImportJob.update({ where: { id: r.id }, data: { fields: fields as unknown as Prisma.InputJsonValue } });
    return this.view(u, row);
  }

  async resolve(u: AuthUser, id: string, dto: ResolveDto) {
    const r = await this.own(u, id); this.assertReview(r);
    const { dto: prof } = await this.current(u);
    const { conflicts } = classify(this.fieldsOf(r), prof);
    const byId = new Map(conflicts.map((c) => [c.id, c]));
    const decisions = { ...this.decisionsOf(r) };
    for (const d of dto.decisions) {
      const c = byId.get(d.conflictId);
      if (!c) throw new BadRequestException(`Unknown conflict: ${d.conflictId}`);
      if (!c.choices.includes(d.choice)) throw new BadRequestException(`"${d.choice.replace('_', ' ')}" is not available for this item.`);
      decisions[d.conflictId] = d.choice;
    }
    const row = await this.prisma.careerImportJob.update({ where: { id: r.id }, data: { decisions: decisions as unknown as Prisma.InputJsonValue } });
    await this.audit(u, r.id, 'conflicts_resolved', { count: dto.decisions.length });
    return this.view(u, row);
  }

  private async plan(u: AuthUser, r: Row) {
    const { dto, raw } = await this.current(u);
    const decisions = this.decisionsOf(r);
    const plan = planMerge(dto, this.fieldsOf(r), decisions);
    return { plan, dto, raw };
  }
  private summarise(plan: ReturnType<typeof planMerge>) {
    const n = (a: string) => plan.changes.filter((c) => c.action === a).length;
    return { add: n('add'), replace: n('replace'), skip: n('skip'), unresolved: plan.unresolved, error: plan.error ?? null, changes: plan.changes };
  }

  /** Reversible preview: shows exactly what confirming would do. Writes nothing. */
  async mergePreview(u: AuthUser, id: string) {
    const r = await this.own(u, id); this.assertReview(r);
    const { plan } = await this.plan(u, r);
    return this.summarise(plan);
  }

  async confirm(u: AuthUser, id: string, dto: ConfirmDto) {
    if (dto.confirm !== true) throw new BadRequestException('Send {"confirm": true} to merge the accepted items.');
    const r = await this.own(u, id); this.assertReview(r);
    const { plan, dto: before, raw } = await this.plan(u, r);
    if (plan.unresolved.length) throw new ConflictException({ message: 'Resolve every conflict before merging.', unresolved: plan.unresolved });
    if (plan.error) throw new BadRequestException(plan.error);
    const s = this.summarise(plan);
    if (!s.add && !s.replace) throw new BadRequestException('Nothing to merge: accept at least one new or changed item.');
    const saved = await this.profiles.upsert(u, plan.profile as never);
    const fields = this.fieldsOf(r).map((f) => (plan.changes.some((c) => c.fieldId === f.id && c.action !== 'skip') ? { ...f, status: 'merged' as const } : f));
    const row = await this.prisma.careerImportJob.update({
      where: { id: r.id },
      data: {
        status: 'confirmed', confirmedAt: new Date(), fields: fields as unknown as Prisma.InputJsonValue, result: s as unknown as Prisma.InputJsonValue,
        undo: { before: before ?? null, hadProfile: !!raw, afterUpdatedAt: saved.updatedAt.toISOString() } as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit(u, r.id, 'confirmed', { added: s.add, replaced: s.replace, skipped: s.skip });
    return this.view(u, row);
  }

  /** Restore the profile to how it was before this import, but only if nothing else changed it since. */
  async undo(u: AuthUser, id: string) {
    const r = await this.own(u, id);
    if (r.status !== 'confirmed' || !r.undo) throw new ConflictException('There is nothing to undo for this import.');
    const undo = r.undo as unknown as { before: ProfileDto | null; hadProfile: boolean; afterUpdatedAt: string };
    const { raw } = await this.current(u);
    if (!raw || raw.updatedAt.toISOString() !== undo.afterUpdatedAt) throw new ConflictException('Your profile changed after this import, so it cannot be undone automatically.');
    if (undo.hadProfile && undo.before) await this.profiles.upsert(u, undo.before as never);
    else await this.profiles.remove(u);
    const fields = this.fieldsOf(r).map((f) => (f.status === 'merged' ? { ...f, status: 'accepted' as const } : f));
    const row = await this.prisma.careerImportJob.update({ where: { id: r.id }, data: { status: 'review_ready', confirmedAt: null, undo: Prisma.DbNull, result: Prisma.DbNull, fields: fields as unknown as Prisma.InputJsonValue } });
    await this.audit(u, r.id, 'undone');
    return this.view(u, row);
  }

  async remove(u: AuthUser, id: string) {
    const r = await this.own(u, id);
    await this.prisma.careerImportJob.delete({ where: { id: r.id } });
    await this.audit(u, id, 'discarded', { status: r.status });
  }

  async auditTrail(u: AuthUser, limit = 50) {
    return this.prisma.importAuditEvent.findMany({ where: { tenantId: u.tenantId, userId: u.userId }, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit, 1), 200) });
  }
}

@Controller('career-imports')
export class CareerImportsController {
  constructor(private svc: CareerImportsService) {}

  /** Staging only: bytes are parsed in memory, zeroed, and never stored. Nothing touches the profile. */
  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 } }))
  async create(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File | undefined, @Headers('idempotency-key') key: string | undefined, @Res({ passthrough: true }) res: Response) {
    if (!file?.buffer) throw new BadRequestException('Choose a PDF, DOCX, JSON or CSV file to import.');
    res.setHeader('Cache-Control', 'no-store');
    const out = await this.svc.create(u, { buffer: file.buffer, originalname: file.originalname }, key);
    res.status(out.created ? 201 : 200);
    return out.job;
  }

  @Get() list(@CurrentUser() u: AuthUser, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.svc.list(u, Number(limit) || 20, Number(offset) || 0); }
  @Get('audit') audit(@CurrentUser() u: AuthUser, @Query('limit') limit?: string) { return this.svc.auditTrail(u, Number(limit) || 50); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) { res.setHeader('Cache-Control', 'no-store'); return this.svc.get(u, id); }
  @Post(':id/preview') @HttpCode(200) preview(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() b: SelectionDto) { return this.svc.preview(u, id, b); }
  @Post(':id/merge-preview') @HttpCode(200) mergePreview(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.mergePreview(u, id); }
  @Post(':id/resolve-conflicts') @HttpCode(200) resolve(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() b: ResolveDto) { return this.svc.resolve(u, id, b); }
  @Post(':id/confirm') @HttpCode(200) confirm(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() b: ConfirmDto) { return this.svc.confirm(u, id, b); }
  @Post(':id/undo') @HttpCode(200) undo(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.undo(u, id); }
  @Delete(':id') @HttpCode(204) async remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { await this.svc.remove(u, id); }
}

@Controller('provider-connections')
export class ProviderConnectionsController {
  @Post(':provider/authorize')
  authorize(@Param('provider') provider: string) {
    if (!(provider in PROVIDERS)) {
      throw new HttpException({ message: 'No official import provider is connected in this deployment. Export your data from the other service as a file and import it here instead.', provider: provider.slice(0, 40) }, 501);
    }
    throw new HttpException('Not available', 501);
  }
}

export { emptyProfileDto };

@Module({ imports: [CareerProfileModule], controllers: [CareerImportsController, ProviderConnectionsController], providers: [CareerImportsService] })
export class CareerImportsModule {}
