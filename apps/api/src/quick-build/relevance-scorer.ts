import { contentWords } from '../common/text-utils';
import { FullProfile } from '../career-profile/career-profile.service';
import { JdAnalysis, Requirement } from '../resume-match/jd-analyzer';
import { findSkills, normalizeLabel } from '../resume-match/taxonomy';
import { SectionType, TemplateVersionPackage } from '../templates/template.types';

/**
 * Deterministic JD ↔ profile relevance scoring.
 *
 * AI is deliberately absent here: ranking decides what the recruiter sees first, so it must be
 * reproducible, auditable and free of hallucinated "relevance". Weights change only with a version bump.
 */
export const RELEVANCE_VERSION = '1.0.0';

export interface JdSignal {
  requiredIds: string[];
  preferredIds: string[];
  requiredTerms: string[];
  preferredTerms: string[];
  keywordBag: Map<string, number>;
  titleTerms: string[];
  degreeLevel: number;
  wantsCertifications: boolean;
  wantsLanguages: boolean;
}

export interface ItemScore {
  index: number;
  score: number;
}

export interface ProfileScores {
  experience: ItemScore[];
  projects: ItemScore[];
  education: ItemScore[];
  certifications: ItemScore[];
  skills: ItemScore[];
  languages: ItemScore[];
  sectionRelevance: Record<SectionType, number>;
  matchedSkillIds: string[];
}

const CERT_RE = /\b(certified|certification|certificate|accredit|licen[cs]e|pmp|aws certified|scrum master|cissp)\b/i;
const LANG_RE = /\b(languages?|bilingual|fluent|multilingual|english|spanish|french|german|mandarin|arabic|hindi|tamil)\b/i;

const idsOf = (reqs: Requirement[]) => reqs
  .map((r) => r.normalized ?? normalizeLabel(r.label))
  .filter((id): id is string => !!id);

const termsOf = (reqs: Requirement[]) => new Set(reqs.flatMap((r) => contentWords(r.label)));

const jaccard = (a: string[], b: string[]): number => {
  if (!a.length || !b.length) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let shared = 0;
  for (const t of A) if (B.has(t)) shared += 1;
  return shared / (A.size + B.size - shared);
};

export function buildJdSignal(jd: JdAnalysis, jdText: string, jobTitle?: string): JdSignal {
  const required = jd.requirements.filter((r) => r.type === 'required_skill');
  const preferred = jd.requirements.filter((r) => r.type === 'preferred_skill');
  const keywordBag = new Map<string, number>();
  for (const r of jd.requirements) {
    const weight = r.type === 'required_skill' ? 3 : r.type === 'preferred_skill' ? 2 : r.type === 'responsibility' ? 1.5 : 1;
    for (const term of contentWords(`${r.label} ${r.sourceText}`)) {
      keywordBag.set(term, (keywordBag.get(term) ?? 0) + weight * r.confidence);
    }
  }
  const degree = jd.requirements.find((r) => r.type === 'qualification' && (r.degreeLevel ?? 0) > 0);
  return {
    requiredIds: [...new Set(idsOf(required))],
    preferredIds: [...new Set(idsOf(preferred))],
    requiredTerms: [...termsOf(required)],
    preferredTerms: [...termsOf(preferred)],
    keywordBag,
    titleTerms: contentWords(jobTitle ?? jd.detectedTitle ?? ''),
    degreeLevel: degree?.degreeLevel ?? 0,
    wantsCertifications: CERT_RE.test(jdText),
    wantsLanguages: LANG_RE.test(jdText),
  };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const normalizeText = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const hasTerm = (text: string, term: string) => text.includes(term);

const skillOverlap = (text: string, signal: JdSignal): number => {
  const found = new Set(findSkills(text).map((h) => h.id));
  if (!signal.requiredIds.length && !signal.preferredIds.length) return 0;
  const requiredHits = signal.requiredIds.filter((id) => found.has(id)).length;
  const preferredHits = signal.preferredIds.filter((id) => found.has(id)).length;
  const requiredScore = signal.requiredIds.length ? requiredHits / signal.requiredIds.length : 0;
  const preferredScore = signal.preferredIds.length ? preferredHits / signal.preferredIds.length : 0;
  return clamp01(requiredScore * 0.75 + preferredScore * 0.25);
};

/** Weighted keyword coverage: how much of the posting's vocabulary this text covers. */
const keywordCoverage = (text: string, signal: JdSignal): number => {
  const terms = contentWords(text);
  if (!terms.length || !signal.keywordBag.size) return 0;
  let total = 0;
  let hit = 0;
  for (const [term, weight] of signal.keywordBag) {
    total += weight;
    if (terms.some((t) => t === term || (term.length > 3 && t.startsWith(term.slice(0, 4))))) hit += weight;
  }
  return total > 0 ? clamp01(hit / total) : 0;
};

const recency = (endDate?: string | null, isCurrent = false): number => {
  if (isCurrent) return 1;
  const year = Number((endDate ?? '').slice(0, 4));
  if (!Number.isFinite(year) || year <= 0) return 0.5;
  const age = Math.max(0, new Date().getFullYear() - year);
  return clamp01(Math.pow(0.88, age));
};

const specificity = (text: string): number => {
  let score = 0;
  if (/\d/.test(text)) score += 0.5;
  if (/\b(increased|reduced|improved|delivered|launched|led|built|shipped|cut|saved|scaled)\b/i.test(text)) score += 0.3;
  if (/\b(team|stakeholders|customers|revenue|latency|users|budget|%)\b/i.test(text)) score += 0.2;
  return clamp01(score);
};

const textOf = (parts: Array<string | null | undefined>) => normalizeText(parts.filter(Boolean).join(' '));

const rank = (scores: number[]): ItemScore[] =>
  scores
    .map((score, index) => ({ index, score: Math.round(clamp01(score) * 1000) / 1000 }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

/** Score every profile entry against the posting. Pure function of its inputs. */
export function scoreProfile(profile: FullProfile, signal: JdSignal): ProfileScores {
  const experience = rank(profile.experiences.map((e) => {
    const text = textOf([e.jobTitle, e.employerName, e.description, ...e.bullets.map((b) => b.content)]);
    return 0.45 * skillOverlap(text, signal)
      + 0.2 * jaccard(contentWords(e.jobTitle), signal.titleTerms)
      + 0.15 * recency(e.endDate, e.isCurrent)
      + 0.1 * specificity(text)
      + 0.1 * keywordCoverage(text, signal);
  }));

  const projects = rank(profile.projects.map((p) => {
    const text = textOf([p.name, p.description, ...p.technologies]);
    return 0.45 * skillOverlap(text, signal)
      + 0.3 * keywordCoverage(text, signal)
      + 0.15 * specificity(text)
      + 0.1 * (1 - Math.min(1, profile.projects.indexOf(p) / Math.max(1, profile.projects.length)));
  }));

  const education = rank(profile.educations.map((e) => {
    const text = textOf([e.degree, e.field, e.institution]);
    const level = /ph\.?d|doctor/i.test(e.degree) ? 4 : /master|mba|m\.?sc/i.test(e.degree) ? 3 : /bachelor|b\.?sc|b\.?tech|degree/i.test(e.degree) ? 2 : 1;
    const degreeMatch = signal.degreeLevel ? clamp01(1 - Math.abs(signal.degreeLevel - level) * 0.25) : 0.4;
    return 0.55 * degreeMatch + 0.25 * keywordCoverage(text, signal) + 0.2 * recency(e.endDate);
  }));

  const certifications = rank(profile.certifications.map((c) => {
    const text = textOf([c.name, c.issuer]);
    const certMatch = signal.wantsCertifications ? 0.6 : 0.15;
    return 0.5 * certMatch + 0.3 * keywordCoverage(text, signal) + 0.2 * recency(c.issuedDate);
  }));

  const skillScores = profile.skills.map((s) => {
    const id = normalizeLabel(s.name);
    if (id && signal.requiredIds.includes(id)) return 1;
    if (id && signal.preferredIds.includes(id)) return 0.7;
    const text = normalizeText(s.name);
    if (signal.requiredTerms.some((t) => hasTerm(text, t))) return 0.85;
    if (signal.preferredTerms.some((t) => hasTerm(text, t))) return 0.6;
    return 0.15 + 0.2 * keywordCoverage(text, signal);
  });

  const languages = rank(profile.languages.map((l) =>
    (signal.wantsLanguages ? 0.75 : 0.15) + 0.25 * keywordCoverage(normalizeText(l.name), signal)));

  const skills = rank(skillScores);
  const matchedSkillIds = profile.skills
    .filter((_, i) => skillScores[i] >= 0.85)
    .map((s) => normalizeLabel(s.name))
    .filter((id): id is string => !!id);

  const top = (list: ItemScore[], n = 3) => (list.length ? list.slice(0, n).reduce((sum, s) => sum + s.score, 0) / Math.min(n, list.length) : 0);

  const sectionRelevance: Record<SectionType, number> = {
    summary: 0.9,
    experience: profile.experiences.length ? clamp01(0.55 + 0.45 * top(experience)) : 0,
    skills: profile.skills.length ? clamp01(signal.requiredIds.length ? 0.85 : 0.5) : 0,
    education: profile.educations.length ? clamp01(signal.degreeLevel ? 0.75 : 0.45) : 0,
    projects: profile.projects.length ? clamp01(0.25 + 0.75 * top(projects)) : 0,
    certifications: profile.certifications.length ? clamp01((signal.wantsCertifications ? 0.7 : 0.35) + 0.3 * top(certifications)) : 0,
    languages: profile.languages.length ? clamp01(signal.wantsLanguages ? 0.7 : 0.2) : 0,
  };

  return { experience, projects, education, certifications, skills, languages, sectionRelevance, matchedSkillIds };
}

/** Order sections by template intent + JD relevance. Template position is a prior, not a lock. */
export function orderSections(
  template: TemplateVersionPackage,
  relevance: Record<SectionType, number>,
): Array<{ key: SectionType; order: number; relevance: number }> {
  const order = template.sectionOrder.length ? template.sectionOrder : (Object.keys(relevance) as SectionType[]);
  const n = Math.max(1, order.length);
  return order
    .map((key, index) => {
      const prior = 1 - index / n;
      return { key, relevance: relevance[key] ?? 0, order: Math.round((0.55 * prior + 0.45 * (relevance[key] ?? 0)) * 1000) / 1000 };
    })
    .sort((a, b) => b.order - a.order || order.indexOf(a.key) - order.indexOf(b.key));
}
