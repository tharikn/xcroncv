import { EvidenceRef, Finding, MatchStatus, Requirement, RequirementType, Severity } from './insights.api';

/** Pure helpers for the insights pages (unit tested in insights.format.spec.ts). */

export const STATUS_LABEL: Record<MatchStatus, string> = {
  exact: 'Strong evidence', partial: 'Partial evidence', related: 'Related skill', missing: 'Not found', not_evaluated: 'Not evaluated',
};
export const TYPE_LABEL: Record<RequirementType | 'derived', string> = {
  required_skill: 'Required skill', preferred_skill: 'Preferred skill', responsibility: 'Responsibility', experience: 'Experience', qualification: 'Qualification', derived: 'Derived check',
};
export const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Critical', warning: 'Warning', suggestion: 'Suggestion', info: 'Note' };
export const READINESS_LABEL: Record<string, string> = {
  ready: 'Ready to export', review_recommended: 'Review recommended before exporting', needs_attention: 'Needs attention before exporting',
};
export const CONFIDENCE_LABEL: Record<string, string> = { high: 'High coverage', medium: 'Medium coverage', low: 'Low coverage' };

/** Colour band only for visual grouping; the number is never presented as a probability. */
export function scoreBand(score: number): 'strong' | 'fair' | 'weak' { return score >= 75 ? 'strong' : score >= 50 ? 'fair' : 'weak'; }

export function evidenceLocation(e: EvidenceRef): string {
  const where = e.itemTitle ? `${cap(e.section)}: ${e.itemTitle}` : cap(e.section);
  const bullet = e.bulletIndex !== undefined ? `, bullet ${e.bulletIndex + 1}` : '';
  return `${where}${bullet}`;
}
export function findingLocation(f: Finding): string {
  const e = f.evidence;
  const where = e.itemTitle ? `${cap(e.section)}: ${e.itemTitle}` : cap(e.section);
  return e.bulletIndex !== undefined ? `${where}, bullet ${e.bulletIndex + 1}` : where;
}
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Server DTO whitelist: send only the fields the API accepts (it rejects unknown properties). */
export function toRequirementInput(r: Requirement) {
  return {
    id: r.id, type: r.type, label: r.label, included: r.included, minYears: r.minYears, alternatives: r.alternatives, explicit: r.explicit,
    sourceText: r.sourceText?.slice(0, 220), confidence: r.confidence, origin: r.origin,
  } as unknown as Requirement;
}

export function groupRequirements(reqs: Requirement[]): Array<{ type: RequirementType; label: string; items: Requirement[] }> {
  const order: RequirementType[] = ['required_skill', 'preferred_skill', 'experience', 'qualification', 'responsibility'];
  return order.map((type) => ({ type, label: TYPE_LABEL[type] + 's', items: reqs.filter((r) => r.type === type) })).filter((g) => g.items.length);
}

export function newRequirement(type: RequirementType, label: string): Requirement {
  return { id: `new-${Math.random().toString(36).slice(2, 9)}`, type, label: label.trim(), sourceText: 'Added by you', confidence: 1, included: true, origin: 'USER' };
}

export function includedCount(reqs: Requirement[]): number { return reqs.filter((r) => r.included).length; }

export function deltaText(delta: number | null): string {
  if (delta === null) return 'not comparable';
  return delta === 0 ? 'no change' : `${delta > 0 ? '+' : ''}${delta}`;
}

/** Downloadable plain-text summary built in the browser (never stored by the server). */
export function reportToText(r: { job: { title: string; company?: string | null }; totalScore: number; resumeName: string | null; resumeVersionNumber: number | null; summary: { strong: string[]; partial: string[]; related: string[]; missing: string[]; nextActions: string[]; disclaimer: string } }): string {
  const list = (h: string, xs: string[]) => (xs.length ? `${h}\n${xs.map((x) => `- ${x}`).join('\n')}\n` : '');
  return [
    `Resume match: ${r.job.title}${r.job.company ? ' at ' + r.job.company : ''}`,
    `Resume: ${r.resumeName ?? 'Resume'}${r.resumeVersionNumber ? ' (version ' + r.resumeVersionNumber + ')' : ' (working draft)'}`,
    `Match score: ${r.totalScore} / 100`, '',
    list('Strong evidence', r.summary.strong), list('Partial evidence', r.summary.partial), list('Related skills', r.summary.related), list('Not found in this resume', r.summary.missing),
    list('Next actions', r.summary.nextActions), r.summary.disclaimer,
  ].join('\n');
}
