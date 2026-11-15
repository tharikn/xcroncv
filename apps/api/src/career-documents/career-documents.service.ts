import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CareerProfileService } from '../career-profile/career-profile.service';
import { sanitizeText } from '../job-clipper/clip-logic';
import { PrismaService } from '../prisma/prisma.service';
import { buildDraft, Claim, DocType, diffSections, DOC_TYPES, renderText, Section, TYPE_INFO, validateClaims } from './doc-logic';
import { CreateDocumentDto, CreateVersionDto } from './dto/doc.dto';
import { renderDocDocx, renderDocPdf } from './doc-export';
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const MAX_DOCS = 100;
const MAX_VERSIONS = 50;

@Injectable()
export class CareerDocumentsService {
  constructor(private prisma: PrismaService, private profiles: CareerProfileService) {}
  private who(u: AuthUser) { return { tenantId: u.tenantId, userId: u.userId }; }

  types() { return DOC_TYPES.map((id) => ({ id, label: TYPE_INFO[id].label, inputs: TYPE_INFO[id].inputs, disclaimer: TYPE_INFO[id].disclaimer ?? null })); }

  private async owned(u: AuthUser, id: string) {
    const d = await this.prisma.careerDocument.findFirst({ where: { id, ...this.who(u) }, include: { versions: { orderBy: { versionNumber: 'asc' } } } });
    if (!d) throw new NotFoundException('Document not found');
    return d;
  }
  private view(d: Awaited<ReturnType<CareerDocumentsService['owned']>>, versionNumber?: number) {
    const v = d.versions.find((x) => x.versionNumber === (versionNumber ?? d.currentVersion)) ?? d.versions[d.versions.length - 1];
    return {
      id: d.id, type: d.type, typeLabel: TYPE_INFO[d.type as DocType]?.label ?? d.type, title: d.title, currentVersion: d.currentVersion,
      disclaimer: TYPE_INFO[d.type as DocType]?.disclaimer ?? null, createdAt: d.createdAt, updatedAt: d.updatedAt,
      versions: d.versions.map((x) => ({ versionNumber: x.versionNumber, changeSummary: x.changeSummary, createdAt: x.createdAt })),
      version: v ? { versionNumber: v.versionNumber, sections: v.sections as unknown as Section[], claims: v.claims as unknown as Claim[] } : null,
    };
  }

  async create(u: AuthUser, dto: CreateDocumentDto) {
    if ((await this.prisma.careerDocument.count({ where: this.who(u) })) >= MAX_DOCS) throw new BadRequestException(`You can keep up to ${MAX_DOCS} documents`);
    const profile = await this.profiles.get(u);
    const { sections, claims } = buildDraft(dto.type, profile as never, dto.inputs ?? {}, dto.tone);
    const doc = await this.prisma.careerDocument.create({
      data: {
        ...this.who(u), type: dto.type, title: dto.title ?? TYPE_INFO[dto.type].label,
        versions: { create: [{ versionNumber: 1, sections: sections as never, claims: claims as never, changeSummary: 'Draft from your profile' }] },
      },
      include: { versions: true },
    });
    return this.view(doc);
  }

  async list(u: AuthUser) {
    const rows = await this.prisma.careerDocument.findMany({ where: this.who(u), orderBy: { updatedAt: 'desc' }, take: 50 });
    return rows.map((d) => ({ id: d.id, type: d.type, typeLabel: TYPE_INFO[d.type as DocType]?.label ?? d.type, title: d.title, currentVersion: d.currentVersion, updatedAt: d.updatedAt }));
  }

  async get(u: AuthUser, id: string, version?: number) { return this.view(await this.owned(u, id), version); }

  /** Immutable versions. Edited sections become user-authored and lose their evidence links; untouched sections keep theirs. */
  async createVersion(u: AuthUser, id: string, dto: CreateVersionDto) {
    const d = await this.owned(u, id);
    if (d.versions.length >= MAX_VERSIONS) throw new BadRequestException(`A document can have up to ${MAX_VERSIONS} versions`);
    const cur = d.versions.find((v) => v.versionNumber === d.currentVersion)!;
    const prev = cur.sections as unknown as Section[]; const prevClaims = cur.claims as unknown as Claim[];
    const edits = new Map(dto.sections.map((s) => [s.id, sanitizeText(s.text, 6000)]));
    for (const id2 of edits.keys()) if (!prev.some((s) => s.id === id2)) throw new BadRequestException(`Unknown section ${id2}`);
    const sections: Section[] = prev.map((s) => {
      const t = edits.get(s.id);
      return t !== undefined && t !== s.text ? { ...s, text: t, origin: 'USER' } : s;
    });
    const changed = new Set(sections.filter((s, i) => s.text !== prev[i].text).map((s) => s.id));
    if (!changed.size) throw new BadRequestException('Nothing changed');
    const claims: Claim[] = [...prevClaims.filter((c) => !changed.has(c.sectionId)), ...[...changed].map((sid): Claim => ({ sectionId: sid, text: sections.find((s) => s.id === sid)!.text.slice(0, 120), label: 'USER_AUTHORED', evidence: null }))];
    const n = Math.max(...d.versions.map((v) => v.versionNumber)) + 1;
    await this.prisma.careerDocumentVersion.create({ data: { documentId: id, versionNumber: n, sections: sections as never, claims: claims as never, changeSummary: dto.changeSummary ?? null } });
    await this.prisma.careerDocument.update({ where: { id }, data: { currentVersion: n } });
    return this.view(await this.owned(u, id));
  }

  async validate(u: AuthUser, id: string) {
    const d = await this.owned(u, id);
    const v = d.versions.find((x) => x.versionNumber === d.currentVersion)!;
    const profile = await this.profiles.get(u).catch(() => ({ fullName: '', experiences: [], skills: [], projects: [] }));
    return validateClaims(profile as never, v.claims as unknown as Claim[], v.sections as unknown as Section[]);
  }

  async diff(u: AuthUser, id: string, from: number, to: number) {
    const d = await this.owned(u, id);
    const a = d.versions.find((v) => v.versionNumber === from); const b = d.versions.find((v) => v.versionNumber === to);
    if (!a || !b) throw new NotFoundException('Version not found');
    return { from, to, sections: diffSections(a.sections as unknown as Section[], b.sections as unknown as Section[]) };
  }

  /** Streamed and discarded: nothing about the generated file is stored. */
  async export(u: AuthUser, id: string, format: 'txt' | 'md' | 'docx' | 'pdf') {
    const d = await this.owned(u, id);
    const v = d.versions.find((x) => x.versionNumber === d.currentVersion)!;
    const name = d.title.replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'document';
    const filename = `${name}-v${v.versionNumber}.${format}`;
    if (format === 'docx') return { filename, body: renderDocDocx(d.title, v.sections as unknown as Section[]), contentType: DOCX_TYPE };
    if (format === 'pdf') return { filename, body: await renderDocPdf(d.title, v.sections as unknown as Section[]), contentType: 'application/pdf' };
    return { filename, body: renderText(d.title, v.sections as unknown as Section[], format), contentType: format === 'md' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8' };
  }

  async remove(u: AuthUser, id: string) {
    await this.owned(u, id);
    await this.prisma.careerDocument.delete({ where: { id } }); // versions cascade
  }
}
