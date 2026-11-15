import { Injectable } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { runQualityRules } from '../quality-review/quality-engine';
import { ResumeSourceService } from '../resume-source/resume-source.service';
import { buildProjection, RecruiterProjection, ViewMode } from './recruiter-projection';

export interface ViewRequest { mode?: ViewMode; anonymize?: boolean; annotations?: boolean; versionId?: string; targetRole?: string; keywords?: string[] }

/** Read-only: loads the resume through the owner-checked source and builds a projection. Writes nothing, stores nothing. */
@Injectable()
export class RecruiterViewService {
  constructor(private source: ResumeSourceService) {}

  async view(user: AuthUser, resumeId: string, req: ViewRequest): Promise<RecruiterProjection & { resume: { id: string; name: string; versionId: string | null; versionNumber: number | null } }> {
    const src = await this.source.load(user, resumeId, req.versionId);
    const projection = buildProjection(src.model, {
      mode: req.mode ?? 'quick', anonymize: !!req.anonymize, targetRole: req.targetRole ?? src.targetRole ?? undefined, keywords: req.keywords,
      annotations: req.annotations ? runQualityRules(src.model) : undefined,
    });
    return { ...projection, resume: { id: src.resumeId, name: src.name, versionId: src.versionId, versionNumber: src.versionNumber } };
  }

  async annotations(user: AuthUser, resumeId: string, versionId?: string, anonymize = false) {
    const p = await this.view(user, resumeId, { mode: 'full', annotations: true, versionId, anonymize });
    return { resume: p.resume, anonymized: p.anonymized, annotations: p.annotations };
  }
}
