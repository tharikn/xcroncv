import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth/auth.types';
import { TemplatesService } from '../templates/templates.service';
import { profileInclude } from '../career-profile/career-profile.service';
import { buildRenderModel, defaultSections, SectionConfig } from '../render-model/render-model.builder';
import { RenderModel } from '../render-model/render-model.types';
import { CreateResumeDto, CreateVersionDto, UpdateResumeDto } from './dto/resume.dto';

@Injectable()
export class ResumesService {
  constructor(private prisma: PrismaService, private templates: TemplatesService) {}

  /** Ownership check is part of every query: resume must belong to the caller's profile AND tenant. */
  private async owned(user: AuthUser, id: string) {
    const r = await this.prisma.resume.findFirst({
      where: { id, tenantId: user.tenantId, profile: { userId: user.userId } },
    });
    if (!r) throw new NotFoundException('Resume not found'); // non-disclosing
    return r;
  }

  async create(user: AuthUser, dto: CreateResumeDto) {
    const profile = await this.prisma.careerProfile.findUnique({ where: { userId: user.userId } });
    if (!profile) throw new ConflictException('Create a career profile before creating a resume');
    const tpl = dto.templateVersion
      ? this.templates.getVersion(dto.templateId, dto.templateVersion)
      : this.templates.getLatest(dto.templateId);
    return this.prisma.resume.create({
      data: {
        profileId: profile.id, tenantId: user.tenantId, name: dto.name, targetRole: dto.targetRole,
        templateId: tpl.id, templateVersion: tpl.version,
        sections: defaultSections(tpl) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  list(user: AuthUser, page = 1, pageSize = 20) {
    return this.prisma.resume.findMany({
      where: { tenantId: user.tenantId, profile: { userId: user.userId } },
      orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: Math.min(pageSize, 100),
      select: { id: true, name: true, targetRole: true, templateId: true, templateVersion: true, status: true, updatedAt: true },
    });
  }

  get(user: AuthUser, id: string) { return this.owned(user, id); }

  async update(user: AuthUser, id: string, dto: UpdateResumeDto) {
    const cur = await this.owned(user, id);
    let templateId = cur.templateId; let templateVersion = cur.templateVersion;
    if (dto.templateId || dto.templateVersion) {
      const tpl = dto.templateVersion
        ? this.templates.getVersion(dto.templateId ?? cur.templateId, dto.templateVersion)
        : this.templates.getLatest(dto.templateId ?? cur.templateId);
      templateId = tpl.id; templateVersion = tpl.version; // changing template never touches content
    }
    return this.prisma.resume.update({
      where: { id },
      data: {
        name: dto.name, targetRole: dto.targetRole, status: dto.status, templateId, templateVersion,
        sections: dto.sections as unknown as Prisma.InputJsonValue | undefined,
        overrides: dto.overrides as unknown as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async remove(user: AuthUser, id: string) {
    await this.owned(user, id);
    await this.prisma.resume.delete({ where: { id } });
  }

  /** Normalized model used by BOTH preview and export (single layout source of truth). */
  async renderModel(user: AuthUser, id: string): Promise<{ model: RenderModel; name: string }> {
    const resume = await this.owned(user, id);
    const profile = await this.prisma.careerProfile.findUniqueOrThrow({
      where: { id: resume.profileId }, include: profileInclude,
    });
    const tpl = this.templates.getVersion(resume.templateId, resume.templateVersion);
    const model = buildRenderModel(profile, tpl, resume.sections as unknown as SectionConfig[], resume.overrides);
    return { model, name: resume.name };
  }

  async createVersion(user: AuthUser, id: string, dto: CreateVersionDto) {
    const { model } = await this.renderModel(user, id);
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.resumeVersion.findFirst({ where: { resumeId: id }, orderBy: { versionNumber: 'desc' } });
      return tx.resumeVersion.create({
        data: {
          resumeId: id, versionNumber: (last?.versionNumber ?? 0) + 1,
          structuredSnapshot: model as unknown as Prisma.InputJsonValue, changeSummary: dto.changeSummary,
        },
        select: { id: true, versionNumber: true, changeSummary: true, createdAt: true },
      });
    });
  }

  async listVersions(user: AuthUser, id: string) {
    await this.owned(user, id);
    return this.prisma.resumeVersion.findMany({
      where: { resumeId: id }, orderBy: { versionNumber: 'desc' },
      select: { id: true, versionNumber: true, changeSummary: true, createdAt: true },
    });
  }
}
