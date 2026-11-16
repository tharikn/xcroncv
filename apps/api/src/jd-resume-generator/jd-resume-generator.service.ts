import { Injectable, Logger, Optional } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { analyzeJd, JdAnalysis, Requirement } from '../resume-match/jd-analyzer';
import { CareerProfileService, FullProfile } from '../career-profile/career-profile.service';
import { TEMPLATE_CATALOG } from '../templates/template.catalog';
import { TemplateVersionPackage, SectionType } from '../templates/template.types';
import { AiService } from '../ai/ai.service';
import { GenerateFromJdDto } from './dto/jd-resume-generator.dto';

/** All ATS_FIRST templates, computed once at module load time (catalog is immutable). */
const ATS_TEMPLATES: TemplateVersionPackage[] = TEMPLATE_CATALOG.filter((t) => t.atsProfile === 'ATS_FIRST');

/** Deterministic, non-cryptographic seed for picking a template from userId. */
function seededIndex(userId: string, len: number): number {
  let hash = 5381;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) + hash) ^ userId.charCodeAt(i);
    hash = hash >>> 0; // keep as unsigned 32-bit
  }
  return hash % len;
}

export interface SuggestedSection {
  key: SectionType;
  label: string;
  priority: number;
}

export interface JdResumeGeneratorResult {
  templateId: string;
  templateName: string;
  templateCategory: string;
  suggestedSections: SuggestedSection[];
  summary: string;
  summarySource: 'ai' | 'rule-based';
  matchedSkills: string[];
  jdAnalysis: JdAnalysis;
  allTemplates: Array<Pick<TemplateVersionPackage, 'id' | 'name' | 'category' | 'description' | 'tags' | 'atsProfile' | 'layout' | 'sectionOrder' | 'theme' | 'careerLevels' | 'style'>>;
}

const SECTION_LABELS: Record<SectionType, string> = {
  summary: 'Professional Summary',
  experience: 'Work Experience',
  skills: 'Skills',
  education: 'Education',
  projects: 'Projects',
  certifications: 'Certifications',
  languages: 'Languages',
};

@Injectable()
export class JdResumeGeneratorService {
  private readonly logger = new Logger(JdResumeGeneratorService.name);

  constructor(
    private readonly careerProfileService: CareerProfileService,
    @Optional() private readonly aiService: AiService | null,
  ) {}

  async generate(user: AuthUser, dto: GenerateFromJdDto): Promise<JdResumeGeneratorResult> {
    // 1. Analyze the JD (rule-based, no LLM)
    const jdAnalysis = analyzeJd(dto.jdText, dto.jobTitle);

    // 2. Load user's career profile (may not exist — handle gracefully)
    let profile: FullProfile | null = null;
    try {
      profile = await this.careerProfileService.get(user);
    } catch {
      // Profile not found — proceed with empty profile; still generate a template suggestion
    }

    // 3. Select template: use override if provided, else pick deterministically from ATS_FIRST pool
    const template = this.selectTemplate(user.userId, dto.templateId);

    // 4. Match skills from JD to user profile
    const matchedSkills = this.matchSkills(jdAnalysis.requirements, profile);

    // 5. Build section priority list based on template's sectionOrder + JD content
    const suggestedSections = this.buildSuggestedSections(template, jdAnalysis, profile);

    // 6. Generate summary (AI-enhanced if available and enabled, else rule-based)
    const { summary, source: summarySource } = await this.generateSummary(user, profile, jdAnalysis, dto, matchedSkills);

    return {
      templateId: template.id,
      templateName: template.name,
      templateCategory: template.category,
      suggestedSections,
      summary,
      summarySource,
      matchedSkills,
      jdAnalysis,
      allTemplates: ATS_TEMPLATES.map(({ id, name, category, description, tags, atsProfile, layout, sectionOrder, theme, careerLevels, style }) => ({
        id, name, category, description, tags, atsProfile, layout, sectionOrder, theme, careerLevels, style,
      })),
    };
  }

  /** Select a template: explicit override → auto-selected ATS_FIRST (seeded by userId). */
  private selectTemplate(userId: string, templateId?: string): TemplateVersionPackage {
    if (templateId) {
      const override = ATS_TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATE_CATALOG.find((t) => t.id === templateId);
      if (override) return override;
      this.logger.warn(`Template id "${templateId}" not found; falling back to auto-selection`);
    }
    if (ATS_TEMPLATES.length === 0) {
      // Fallback to first available template if catalog is somehow empty
      return TEMPLATE_CATALOG[0];
    }
    return ATS_TEMPLATES[seededIndex(userId, ATS_TEMPLATES.length)];
  }

  /** Match user profile skills to JD required/preferred skills by name normalization. */
  private matchSkills(requirements: Requirement[], profile: FullProfile | null): string[] {
    if (!profile?.skills?.length) return [];

    const skillReqs = requirements.filter((r) => r.type === 'required_skill' || r.type === 'preferred_skill');
    if (!skillReqs.length) return [];

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const profileSkillNames = profile.skills.map((s) => normalize(s.name));

    const matched = new Set<string>();
    for (const req of skillReqs) {
      const reqNorm = normalize(req.normalized ?? req.label);
      // Direct match or contained match
      for (let i = 0; i < profileSkillNames.length; i++) {
        const pNorm = profileSkillNames[i];
        if (pNorm === reqNorm || pNorm.includes(reqNorm) || reqNorm.includes(pNorm)) {
          matched.add(profile.skills[i].name);
        }
      }
      // Also check alternatives
      for (const alt of req.alternatives ?? []) {
        const altNorm = normalize(alt);
        for (let i = 0; i < profileSkillNames.length; i++) {
          if (profileSkillNames[i] === altNorm || profileSkillNames[i].includes(altNorm)) {
            matched.add(profile.skills[i].name);
          }
        }
      }
    }
    return [...matched];
  }

  /** Build section suggestions ordered by template's sectionOrder with priority weights. */
  private buildSuggestedSections(
    template: TemplateVersionPackage,
    jdAnalysis: JdAnalysis,
    profile: FullProfile | null,
  ): SuggestedSection[] {
    const hasResponsibilities = jdAnalysis.requirements.some((r) => r.type === 'responsibility');
    const hasSkillRequirements = jdAnalysis.requirements.some((r) => r.type === 'required_skill' || r.type === 'preferred_skill');
    const hasProfile = !!profile;

    return template.sectionOrder.map((key, index) => {
      let priority = template.sectionOrder.length - index; // base: template position matters

      // Boost sections that are relevant to the JD or the profile
      if (key === 'summary') priority += 5;
      if (key === 'skills' && hasSkillRequirements) priority += 4;
      if (key === 'experience' && hasResponsibilities) priority += 4;
      if (key === 'certifications' && jdAnalysis.requirements.some((r) => r.type === 'qualification')) priority += 2;
      if (key === 'projects' && hasProfile && (profile?.projects?.length ?? 0) > 0) priority += 1;
      if (key === 'languages' && hasProfile && (profile?.languages?.length ?? 0) > 0) priority += 1;

      return { key, label: SECTION_LABELS[key] ?? key, priority };
    });
  }

  /** Generate professional summary using AI if available, else rule-based fallback. */
  private async generateSummary(
    user: AuthUser,
    profile: FullProfile | null,
    jdAnalysis: JdAnalysis,
    dto: GenerateFromJdDto,
    matchedSkills: string[],
  ): Promise<{ summary: string; source: 'ai' | 'rule-based' }> {
    // Attempt AI-enhanced summary if service is injected and AI is not disabled
    if (this.aiService) {
      try {
        const headline = profile?.headline ?? dto.jobTitle ?? jdAnalysis.detectedTitle ?? 'professional';
        const topSkills = matchedSkills.slice(0, 8).join(', ') ||
          jdAnalysis.requirements.filter((r) => r.type === 'required_skill').slice(0, 5).map((r) => r.label).join(', ');
        const years = profile?.experiences?.length
          ? Math.max(...profile.experiences.map((e) => {
              const start = new Date(e.startDate).getFullYear();
              const end = e.isCurrent ? new Date().getFullYear() : (e.endDate ? new Date(e.endDate).getFullYear() : start);
              return end - start;
            }).filter((y) => y >= 0))
          : undefined;

        const suggestion = await this.aiService.suggest(user, {
          task: 'SUMMARY_DRAFT',
          text: profile?.summary ?? '',
          context: {
            title: dto.jobTitle ?? jdAnalysis.detectedTitle ?? headline,
            years: years && years > 0 ? years : undefined,
            skills: topSkills ? topSkills.split(', ') : undefined,
          },
        });

        const output = suggestion.output as { text?: string } | null;
        if (output?.text) return { summary: output.text, source: 'ai' };
      } catch (err) {
        // AI unavailable, quota exceeded, or disabled — fall through to rule-based
        this.logger.debug(`AI summary unavailable: ${(err as Error).message}; using rule-based fallback`);
      }
    }

    return { summary: this.ruleSummary(profile, jdAnalysis, dto, matchedSkills), source: 'rule-based' };
  }

  /** Rule-based summary: deterministic, no LLM. Composed from profile + JD signals. */
  private ruleSummary(
    profile: FullProfile | null,
    jdAnalysis: JdAnalysis,
    dto: GenerateFromJdDto,
    matchedSkills: string[],
  ): string {
    const name = profile?.fullName ?? 'Candidate';
    const title = dto.jobTitle ?? jdAnalysis.detectedTitle ?? profile?.headline ?? 'professional';
    const seniority = jdAnalysis.seniority ? `${jdAnalysis.seniority}-level ` : '';

    const topSkills = matchedSkills.slice(0, 5);
    const jdSkills = jdAnalysis.requirements
      .filter((r) => r.type === 'required_skill')
      .slice(0, 5)
      .map((r) => r.label);
    const skillList = [...new Set([...topSkills, ...jdSkills])].slice(0, 5);

    const expCount = profile?.experiences?.length ?? 0;
    const expPart = expCount > 0 ? ` with ${expCount > 1 ? `${expCount} roles` : 'hands-on experience'}` : '';

    const companyPart = dto.company ? ` Eager to contribute to ${dto.company}.` : '';
    const skillPart = skillList.length ? ` Core competencies include: ${skillList.join(', ')}.` : '';

    return `${seniority}${title}${expPart}. Applying proven skills to this role.${skillPart}${companyPart}`.trim();
  }

  /** Convenience: return all ATS-compatible templates for the gallery endpoint. */
  getAtsTemplates(): TemplateVersionPackage[] {
    return ATS_TEMPLATES;
  }
}
