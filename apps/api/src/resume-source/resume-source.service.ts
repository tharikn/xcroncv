import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { AuthUser } from '../common/auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { RenderModel } from '../render-model/render-model.types';
import { ResumesService } from '../resumes/resumes.service';

export interface ResumeSource {
  resumeId: string;
  name: string;
  targetRole?: string | null;
  model: RenderModel;
  /** null = working draft (live render model); otherwise an immutable saved version. */
  versionId: string | null;
  versionNumber: number | null;
  hash: string;
}

export function hashModel(model: unknown): string {
  return createHash('sha256').update(JSON.stringify(model)).digest('hex').slice(0, 32);
}

/**
 * Loads the SAME render model used by preview/export (no separate layout logic) for a resume the caller owns,
 * either live or from an immutable saved version. Ownership is tenant AND owner on every query.
 */
@Injectable()
export class ResumeSourceService {
  constructor(private prisma: PrismaService, private resumes: ResumesService) {}

  async load(user: AuthUser, resumeId: string, versionId?: string): Promise<ResumeSource> {
    const resume = await this.resumes.get(user, resumeId); // 404 (non-disclosing) unless tenant + owner match
    if (versionId) {
      const v = await this.prisma.resumeVersion.findFirst({
        where: { id: versionId, resumeId, resume: { tenantId: user.tenantId, profile: { userId: user.userId } } },
      });
      if (!v) throw new NotFoundException('Resume version not found');
      const model = v.structuredSnapshot as unknown as RenderModel;
      return { resumeId, name: resume.name, targetRole: resume.targetRole, model, versionId: v.id, versionNumber: v.versionNumber, hash: hashModel(model) };
    }
    const { model, name } = await this.resumes.renderModel(user, resumeId);
    return { resumeId, name, targetRole: resume.targetRole, model, versionId: null, versionNumber: null, hash: hashModel(model) };
  }
}
