import { FullProfile } from '../career-profile/career-profile.service';
import { JdAnalysis } from '../resume-match/jd-analyzer';
import { SectionType, TemplateVersionPackage } from '../templates/template.types';
import { SectionVariant } from '../resume-layout/layout.types';
import { ItemScore, orderSections, ProfileScores, RELEVANCE_VERSION } from './relevance-scorer';

export const CONTENT_PLAN_VERSION = '1.0.0';

export interface RankedItem {
  /** Index in the profile collection, so the plan can be replayed against a fresh profile. */
  sourceIndex: number;
  score: number;
  /** How many bullets to keep for this item (0 = none). */
  bullets: number;
}

export interface SectionContent {
  key: SectionType;
  included: boolean;
  order: number;
  relevance: number;
  variant: SectionVariant;
  items: RankedItem[];
  excluded: Array<{ sourceIndex: number; reason: string }>;
}

export interface ContentPlan {
  version: string;
  sections: SectionContent[];
  summaryText?: string;
  matchedSkillIds: string[];
  warnings: string[];
  usedAi: boolean;
}

export interface SelectionOptions {
  summaryText?: string;
  usedAi?: boolean;
  /** Content ceilings before the layout repair ladder starts cutting. */
  limits?: Partial<Record<SectionType, number>>;
}

const DEFAULT_LIMITS: Record<SectionType, number> = {
  summary: 1,
  experience: 6,
  skills: 40,
  education: 3,
  projects: 4,
  certifications: 8,
  languages: 5,
};

const CORE: SectionType[] = ['summary', 'experience', 'skills', 'education'];

const bulletsFor = (key: SectionType, position: number): number => {
  if (key === 'experience') return position < 2 ? 4 : 3;
  if (key === 'projects') return 2;
  return 0;
};

/**
 * Selects what the resume will contain. Deterministic: the same profile + JD + template always
 * select the same entries in the same order. The layout engine may later cut further under pressure.
 */
export function selectContent(
  profile: FullProfile,
  jd: JdAnalysis,
  template: TemplateVersionPackage,
  scores: ProfileScores,
  opts: SelectionOptions = {},
): ContentPlan {
  const limits = { ...DEFAULT_LIMITS, ...(opts.limits ?? {}) };
  const limitsWarn: string[] = [];
  const order = orderSections(template, scores.sectionRelevance);
  const atsLocked = template.atsProfile === 'ATS_FIRST';
  const templateOrder = template.sectionOrder.length ? template.sectionOrder : order.map((o) => o.key);

  const rankOf = (key: SectionType, list: ItemScore[], total: number) => {
    const sorted = [...list].sort((a, b) => b.score - a.score || a.index - b.index);
    const cap = limits[key] ?? total;
    const kept = sorted.slice(0, Math.max(0, cap));
    const excluded = sorted.slice(Math.max(0, cap)).map((s) => ({
      sourceIndex: s.index,
      reason: `Below the ${key} limit (${cap}); lower JD relevance`,
    }));
    if (excluded.length) limitsWarn.push(`${key}: kept ${kept.length} of ${total} entries`);
    return { kept, excluded };
  };

  const build = (
    key: SectionType,
    list: ItemScore[],
    total: number,
    relevance: number,
  ): SectionContent => {
    const { kept, excluded } = rankOf(key, list, total);
    const includedByContent = total > 0;
    const includedByRelevance = CORE.includes(key) || relevance >= 0.12;
    const included = includedByContent && includedByRelevance;
    const items: RankedItem[] = included
      ? kept.map((s, position) => ({ sourceIndex: s.index, score: s.score, bullets: bulletsFor(key, position) }))
      : [];
    if (includedByContent && !includedByRelevance) {
      excluded.push({ sourceIndex: 0, reason: `Low JD relevance for ${key} (${Math.round(relevance * 100)}%)` });
    }
    return {
      key,
      included,
      order: atsLocked ? 1 - templateOrder.indexOf(key) / Math.max(1, templateOrder.length) : order.find((o) => o.key === key)?.order ?? 0,
      relevance,
      variant: 'normal',
      items,
      excluded,
    };
  };

  const sections: SectionContent[] = [
    build('summary', [{ index: 0, score: scores.sectionRelevance.summary }], profile.summary || opts.summaryText ? 1 : 0, scores.sectionRelevance.summary),
    build('experience', scores.experience, profile.experiences.length, scores.sectionRelevance.experience),
    build('skills', scores.skills, profile.skills.length, scores.sectionRelevance.skills),
    build('education', scores.education, profile.educations.length, scores.sectionRelevance.education),
    build('projects', scores.projects, profile.projects.length, scores.sectionRelevance.projects),
    build('certifications', scores.certifications, profile.certifications.length, scores.sectionRelevance.certifications),
    build('languages', scores.languages, profile.languages.length, scores.sectionRelevance.languages),
  ];

  if (atsLocked) {
    sections.sort((a, b) => templateOrder.indexOf(a.key) - templateOrder.indexOf(b.key));
  } else {
    sections.sort((a, b) => b.order - a.order || templateOrder.indexOf(a.key) - templateOrder.indexOf(b.key));
  }

  return {
    version: `${CONTENT_PLAN_VERSION}+${RELEVANCE_VERSION}`,
    sections,
    summaryText: opts.summaryText ?? profile.summary ?? undefined,
    matchedSkillIds: scores.matchedSkillIds,
    warnings: limitsWarn,
    usedAi: !!opts.usedAi,
  };
}

/** Sections the layout engine is allowed to consider, in paint order. */
export function orderedSectionKeys(plan: ContentPlan): SectionType[] {
  return plan.sections.filter((s) => s.included).map((s) => s.key);
}
