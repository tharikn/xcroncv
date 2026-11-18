import { Injectable, Logger, Optional } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { AuthUser } from '../common/auth/auth.types';
import { FullProfile } from '../career-profile/career-profile.service';
import { JdAnalysis } from '../resume-match/jd-analyzer';
import { ProfileScores } from './relevance-scorer';

export interface SummaryResult {
  text: string;
  source: 'ai' | 'rule-based';
}

/**
 * Optional AI text layer for Quick Build.
 *
 * AI only ever rewrites already-selected text (the summary). It never decides relevance, placement,
 * page breaks or styles, and a failure is always invisible: the deterministic text is used instead.
 */
@Injectable()
export class ContentOptimizer {
  private readonly logger = new Logger(ContentOptimizer.name);

  constructor(@Optional() private readonly ai?: AiService | null) {}

  async summary(
    user: AuthUser,
    profile: FullProfile,
    jd: JdAnalysis,
    jobTitle: string | undefined,
    scores: ProfileScores,
    useAi: boolean,
  ): Promise<SummaryResult> {
    const fallback = this.ruleSummary(profile, jd, jobTitle, scores);
    if (!useAi || !this.ai) return { text: fallback, source: 'rule-based' };

    try {
      const skills = [
        ...scores.matchedSkillIds.slice(0, 8),
        ...jd.requirements.filter((r) => r.type === 'required_skill').slice(0, 5).map((r) => r.label),
      ];
      const suggestion = await this.ai.suggest(user, {
        task: 'SUMMARY_DRAFT',
        text: profile.summary ?? '',
        context: {
          title: jobTitle ?? jd.detectedTitle ?? profile.headline ?? undefined,
          skills: [...new Set(skills)].slice(0, 10),
        },
      });
      const output = suggestion.output as { text?: string } | null;
      const text = output?.text?.trim();
      // Never let an AI rewrite shorten away the whole summary or invent a wall of text.
      if (text && text.length >= 40 && text.length <= 900) return { text, source: 'ai' };
    } catch (err) {
      this.logger.debug(`AI summary unavailable: ${(err as Error).message}; using the deterministic summary`);
    }
    return { text: fallback, source: 'rule-based' };
  }

  /** Deterministic shortening at a sentence boundary. Used when space is tight, never mid-word. */
  shorten(text: string, maxChars: number): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= maxChars) return clean;
    const cut = clean.slice(0, maxChars);
    const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '), cut.lastIndexOf(', '));
    if (lastStop > maxChars * 0.55) return cut.slice(0, lastStop + 1).trim();
    const lastSpace = cut.lastIndexOf(' ');
    return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxChars).trim()}…`;
  }

  private ruleSummary(profile: FullProfile, jd: JdAnalysis, jobTitle: string | undefined, scores: ProfileScores): string {
    const title = jobTitle ?? jd.detectedTitle ?? profile.headline ?? 'professional';
    const titleHasLevel = /\b(intern|junior|mid|senior|staff|lead|principal|sr\.?|jr\.?)\b/i.test(title);
    const seniority = jd.seniority && !titleHasLevel ? `${jd.seniority}-level ` : '';
    const topSkills = scores.matchedSkillIds.slice(0, 5);
    const jdSkills = jd.requirements
      .filter((r) => r.type === 'required_skill')
      .slice(0, 5)
      .map((r) => r.label);
    const skills = [...new Set([...topSkills, ...jdSkills])].slice(0, 5);
    const roles = profile.experiences.length;
    const rolePart = roles > 1 ? ` with ${roles} roles of hands-on delivery` : roles === 1 ? ' with hands-on delivery experience' : '';
    const skillPart = skills.length ? ` Core strengths: ${skills.join(', ')}.` : '';
    return `${seniority}${title}${rolePart}. Focused on measurable outcomes and fast ramp-up.${skillPart}`.trim();
  }
}
