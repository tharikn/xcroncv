import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth/auth.types';
import { DomainEvents } from '../common/domain-events';
import { wordCount } from '../common/text-utils';
import { CareerProfileService, FullProfile } from '../career-profile/career-profile.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildRenderModel } from '../render-model/render-model.builder';
import { RenderModel } from '../render-model/render-model.types';
import { buildAdaptiveLayout, LAYOUT_ENGINE_VERSION, LayoutPlan } from '../resume-layout';
import { analyzeJd, detectJdTitle, sanitizeJdText } from '../resume-match/jd-analyzer';
import { TEMPLATE_CATALOG } from '../templates/template.catalog';
import { TemplateVersionPackage } from '../templates/template.types';
import { TemplatesService } from '../templates/templates.service';
import { applyContentPlan, limitToPlan } from './apply-content-plan';
import { ContentOptimizer } from './content-optimizer';
import { ContentPlan, orderedSectionKeys, selectContent } from './content-selector';
import { QuickBuildDto } from './dto/quick-build.dto';
import { BuildReport, QuickBuildPayload } from './quick-build.types';
import { buildJdSignal, scoreProfile } from './relevance-scorer';

/** Deterministic, non-cryptographic seed so a user's auto-picked template is stable. */
function seededIndex(userId: string, len: number): number {
  let hash = 5381;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) + hash) ^ userId.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash % Math.max(1, len);
}

export interface QuickBuildCreated {
  resume: { id: string; name: string; templateId: string; templateVersion: number; createdAt: Date };
  report: BuildReport;
  plan: LayoutPlan;
}

@Injectable()
export class QuickBuildService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: CareerProfileService,
    private readonly templates: TemplatesService,
    private readonly optimizer: ContentOptimizer,
    @Optional() private readonly events?: DomainEvents,
  ) {}

  /** Full pipeline, no writes. Used by the preview endpoint and by `create`. */
  private async build(user: AuthUser, dto: QuickBuildDto): Promise<QuickBuildPayload & { profileId: string }> {
    const started = Date.now();
    const jdText = sanitizeJdText(dto.jdText);
    const jobTitle = dto.jobTitle?.trim() || detectJdTitle(jdText);
    const jd = analyzeJd(jdText, jobTitle);

    let profile: FullProfile;
    try {
      profile = await this.profiles.get(user);
    } catch {
      throw new ConflictException('Create a career profile before running Quick Build.');
    }

    const template = this.selectTemplate(user.userId, dto.templateId);
    const signal = buildJdSignal(jd, jdText, jobTitle);
    const scores = scoreProfile(profile, signal);

    // AI is a text layer only, and it runs before selection so the summary is part of the content.
    const summary = await this.optimizer.summary(user, profile, jd, jobTitle, scores, dto.useAi !== false);
    const content = selectContent(profile, jd, template, scores, {
      summaryText: summary.text,
      usedAi: summary.source === 'ai',
    });

    const keys = orderedSectionKeys(content);
    if (!keys.length) throw new ConflictException('Your profile has no content that can be placed on a resume.');

    const base = buildRenderModel(profile, template, keys.map((type) => ({ type, visible: true })), {});
    const selected = applyContentPlan(base, content);

    const maxPages = dto.maxPages ?? 2;
    const adaptive = buildAdaptiveLayout(selected, template, { maxPages, minLastPageFill: 0.5, maxImbalance: 0.35 });
    // The plan is authoritative: clamp the model to exactly what it paints.
    const model = limitToPlan(adaptive.model, adaptive.plan);

    const report = this.buildReport(model, content, adaptive, template, maxPages, summary.source, Date.now() - started);

    return {
      jd,
      template: {
        id: template.id, version: template.version, name: template.name,
        category: template.category, layout: template.layout, atsProfile: template.atsProfile,
      },
      content,
      plan: adaptive.plan,
      report,
      model,
      profileId: profile.id,
    };
  }

  /** POST /quick-build/preview — nothing is persisted. */
  async preview(user: AuthUser, dto: QuickBuildDto): Promise<QuickBuildPayload> {
    const { profileId: _profileId, ...payload } = await this.build(user, dto);
    return payload;
  }

  /** POST /quick-build — persists the validated resume, plan and diagnostics in one transaction-less write. */
  async create(user: AuthUser, dto: QuickBuildDto): Promise<QuickBuildCreated> {
    const built = await this.build(user, dto);
    const targetRole = dto.jobTitle?.trim() || built.jd.detectedTitle;
    const name = (dto.name?.trim() || `${targetRole ?? built.template.name} resume`).slice(0, 120);

    const sections = built.content.sections
      .filter((s) => s.included)
      .map((s) => ({ type: s.key, visible: true }));

    const created = await this.prisma.resume.create({
      data: {
        profileId: built.profileId,
        tenantId: user.tenantId,
        name,
        targetRole,
        templateId: built.template.id,
        templateVersion: built.template.version,
        sections: sections as unknown as Prisma.InputJsonValue,
        overrides: {} as Prisma.InputJsonValue,
        layoutPlan: built.plan as unknown as Prisma.InputJsonValue,
        renderSnapshot: built.model as unknown as Prisma.InputJsonValue,
        buildReport: built.report as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, name: true, templateId: true, templateVersion: true, createdAt: true },
    });

    this.events?.emit(user, 'resume.created', { resumeId: created.id, source: 'quick-build' });
    return { resume: created, report: built.report, plan: built.plan };
  }

  /** GET /quick-build/resumes/:id/report — why the layout looks the way it does. */
  async getReport(user: AuthUser, resumeId: string): Promise<{ report: BuildReport | null; plan: LayoutPlan | null }> {
    const resume = await this.prisma.resume.findFirst({
      where: { id: resumeId, tenantId: user.tenantId, profile: { userId: user.userId } },
      select: { layoutPlan: true, buildReport: true },
    });
    if (!resume) throw new NotFoundException('Resume not found');
    return {
      report: (resume.buildReport as unknown as BuildReport) ?? null,
      plan: (resume.layoutPlan as unknown as LayoutPlan) ?? null,
    };
  }

  private selectTemplate(userId: string, templateId?: string): TemplateVersionPackage {
    if (templateId) return this.templates.getLatest(templateId);
    const ats = TEMPLATE_CATALOG.filter((t) => t.atsProfile === 'ATS_FIRST');
    const pool = ats.length ? ats : TEMPLATE_CATALOG;
    return pool[seededIndex(userId, pool.length)];
  }

  private buildReport(
    model: RenderModel,
    content: ContentPlan,
    adaptive: ReturnType<typeof buildAdaptiveLayout>,
    template: TemplateVersionPackage,
    maxPages: number,
    summarySource: 'ai' | 'rule-based',
    durationMs: number,
  ): BuildReport {
    const { plan, violations, actions } = adaptive;
    const items = model.sections.reduce((n, s) => n + (s.items?.length ?? 0), 0);
    const bullets = model.sections.reduce((n, s) => n + (s.items ?? []).reduce((m, i) => m + (i.bullets?.length ?? 0), 0), 0);
    const words = wordCount(model.sections
      .flatMap((s) => [s.text ?? '', ...(s.items ?? []).flatMap((i) => [i.title ?? '', i.subtitle ?? '', i.text ?? '', ...(i.bullets ?? []), ...(i.tags ?? [])])])
      .filter(Boolean)
      .join(' '));
    return {
      version: 'qb-1',
      engineVersion: LAYOUT_ENGINE_VERSION,
      createdAt: new Date().toISOString(),
      durationMs,
      maxPages,
      pageCount: plan.metrics.pageCount,
      fills: {
        main: plan.metrics.mainFill,
        side: plan.metrics.sideFill,
        lastPage: plan.metrics.lastPageFill,
        imbalance: plan.metrics.imbalance,
      },
      repairs: plan.metrics.repairs,
      decisions: plan.decisions,
      violations,
      warnings: [...new Set([...plan.warnings, ...content.warnings])],
      usedAi: content.usedAi,
      summarySource,
      content: {
        sections: model.sections.length,
        items,
        bullets,
        words,
        dropped: content.sections.filter((s) => !s.included).map((s) => s.key),
      },
      template: {
        id: template.id, version: template.version, name: template.name, layout: template.layout, atsProfile: template.atsProfile,
      },
    };
  }
}
