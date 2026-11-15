import { parseRange, wordCount } from '../common/text-utils';
import { RenderModel } from '../render-model/render-model.types';
import { Requirement } from '../resume-match/jd-analyzer';
import { computeMatch, EvidenceRef, MatchItem, MatchStatus } from '../resume-match/matcher';
import { TAXONOMY_VERSION } from '../resume-match/taxonomy';

/**
 * Standalone, deterministic ATS compatibility engine (doc 07). It reuses the shared matching primitives (taxonomy, JD requirements,
 * evidence matcher) but has its OWN dimension model, weights and version. It is never added to, or presented as, the Resume Match score
 * (doc 23), the Quality score (doc 20) or the Parsing Test score (doc 21). No LLM decides anything. Same input -> same output.
 * Bump ATS_VERSION whenever weights, thresholds or rules change; old reports keep the version they were produced with.
 */
export const ATS_VERSION = 'ats-1.0.0';
export const ATS_TAXONOMY_VERSION = TAXONOMY_VERSION;

export type AtsDimensionId =
  | 'required_skills' | 'preferred_skills' | 'experience' | 'role_title' | 'keyword_coverage' | 'semantic' | 'structure' | 'clarity';

export const ATS_DIMENSIONS: Array<{ id: AtsDimensionId; label: string; weight: number; needsJob: boolean; what: string }> = [
  { id: 'required_skills', label: 'Required skills match', weight: 20, needsJob: true, what: 'Required skills with direct resume evidence' },
  { id: 'preferred_skills', label: 'Preferred skills match', weight: 10, needsJob: true, what: 'Preferred skills with direct or related evidence' },
  { id: 'experience', label: 'Relevant experience evidence', weight: 20, needsJob: true, what: 'Years of experience, responsibilities and skills shown in real work, not only listed' },
  { id: 'role_title', label: 'Role and title relevance', weight: 10, needsJob: true, what: 'Job title and level, where the resume states them' },
  { id: 'keyword_coverage', label: 'Keyword coverage', weight: 10, needsJob: true, what: 'Share of distinct posting keywords found anywhere on the resume (each counted once)' },
  { id: 'semantic', label: 'Semantic relevance (lexical)', weight: 10, needsJob: true, what: 'Word-overlap similarity between posting and resume; no AI model is used' },
  { id: 'structure', label: 'Structure and parseability', weight: 10, needsJob: false, what: 'Standard headings, contact details, consistent dates and a sensible section order' },
  { id: 'clarity', label: 'Content clarity and completeness', weight: 10, needsJob: false, what: 'Summary, bullets per role, bullet length, outcomes and overall length' },
];

export const ATS_DISCLAIMER =
  'This is an internal ATS compatibility estimate for this resume and this posting. Employer systems use their own parsing and ranking rules, so it does not predict whether any system will pass or rank you. "Not found" means not found in this resume, not that you lack the skill. File-level parser checks live in the separate Parsing Test.';

export type AtsStatus = MatchStatus | 'pass' | 'warn' | 'fail';
export interface AtsItem {
  key: string;
  label: string;
  dimension: AtsDimensionId;
  status: AtsStatus;
  /** 0-1 credit towards the dimension. */
  points: number;
  method: string;
  explanation: string;
  evidence: EvidenceRef[];
  action?: string;
}
export interface AtsDimension {
  id: AtsDimensionId; label: string; weight: number; applicable: boolean; effectiveWeight: number; score: number | null; maxScore: 100;
  itemCount: number; explanation: string; matched: string[]; weak: string[]; missing: string[];
}
export interface AtsResult {
  atsVersion: string;
  taxonomyVersion: string;
  score: number;
  dimensions: AtsDimension[];
  items: AtsItem[];
  coverage: { applicableWeight: number; requirementsIncluded: number; confidence: 'high' | 'medium' | 'low'; limitations: string[] };
  strongMatches: string[];
  weakOrMissing: string[];
  improvements: string[];
  disclaimer: string;
}
export interface AtsInput {
  model: RenderModel;
  requirements: Requirement[];
  jdTitle?: string;
  targetRole?: string | null;
  confirmed: boolean;
  now?: Date;
}

const POINT_STATUS = (p: number): AtsStatus => (p >= 0.8 ? 'pass' : p >= 0.4 ? 'warn' : 'fail');
const round2 = (n: number) => Math.round(n * 100) / 100;

const STANDARD_HEADINGS: Record<string, RegExp> = {
  experience: /^(work |professional |employment )?(experience|history)|^employment/i,
  education: /^education|^academic|^qualifications?$/i,
  skills: /^(technical |key |core )?skills|^competenc/i,
  summary: /^(professional |career )?(summary|profile|objective)|^about/i,
  projects: /^projects?/i, certifications: /^certif|^licen[cs]es/i, languages: /^languages?/i,
};
const EXPECTED_ORDER = ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'languages'];
const ACTION_VERB = /^(built|led|designed|developed|created|managed|delivered|improved|reduced|increased|launched|implemented|migrated|automated|owned|shipped|wrote|analy[sz]ed|mentored|reviewed|optimi[sz]ed|coordinated|drove|established|streamlined|architected|maintained|supported|trained|negotiated|planned|resolved|deployed|integrated|tested|taught|researched|presented|grew|saved|cut|won)\b/i;

// ---- own checks: structure/parseability (render model only; file-level parsing is doc 21) ----
function structureItems(m: RenderModel, now: Date): AtsItem[] {
  const out: AtsItem[] = [];
  const add = (key: string, label: string, points: number, explanation: string, action?: string, evidence: EvidenceRef[] = []) =>
    out.push({ key, label, dimension: 'structure', status: POINT_STATUS(points), points: round2(points), method: 'structure_rule', explanation, evidence, action: points >= 0.8 ? undefined : action });

  const contacts = m.header.contacts.join(' ');
  const hasEmail = /\S+@\S+\.\S+/.test(contacts);
  const hasPhone = (contacts.match(/\d/g) ?? []).length >= 7;
  const hasName = m.header.name.trim().length > 1;
  const cp = (hasName ? 0.4 : 0) + (hasEmail ? 0.35 : 0) + (hasPhone ? 0.25 : 0);
  add('contact', 'Name, email and phone present', cp,
    cp >= 0.8 ? 'Name, email and phone are present in the header.' : `Missing from the header: ${[!hasName && 'name', !hasEmail && 'email', !hasPhone && 'phone'].filter(Boolean).join(', ')}.`,
    'Add the missing contact details to your profile so they appear in the header.');

  const titled = m.sections.filter((s) => s.title?.trim());
  const recognised = titled.filter((s) => STANDARD_HEADINGS[s.type]?.test(s.title.trim()) ?? true);
  const hp = titled.length ? recognised.length / titled.length : 0;
  add('headings', 'Recognisable section headings', hp,
    hp >= 0.8 ? 'Section headings use common names (Experience, Education, Skills).' : `${titled.length - recognised.length} heading(s) use unusual names that some systems may not recognise: ${titled.filter((s) => !recognised.includes(s)).map((s) => `"${s.title}"`).join(', ')}.`,
    'Use plain headings such as Experience, Education and Skills.');

  const exp = m.sections.find((s) => s.type === 'experience' && (s.items?.length ?? 0) > 0);
  const edu = m.sections.some((s) => s.type === 'education' && (s.items?.length ?? 0) > 0);
  const skills = m.sections.some((s) => s.type === 'skills' && (s.items?.length ?? 0) > 0);
  const core = (exp ? 0.5 : 0) + (edu ? 0.25 : 0) + (skills ? 0.25 : 0);
  add('core_sections', 'Experience, education and skills sections', core,
    core >= 0.8 ? 'All three core sections have content.' : `Core sections without content: ${[!exp && 'experience', !edu && 'education', !skills && 'skills'].filter(Boolean).join(', ')}.`,
    'Add the missing sections if they apply to you; career starters can lead with education or projects.');

  const roles = (exp?.items ?? []);
  const dated = roles.filter((r) => parseRange(r.meta, now));
  const dp = roles.length ? dated.length / roles.length : 1;
  const formats = new Set(roles.filter((r) => r.meta).map((r) => (/[a-z]{3}/i.test(r.meta!) ? 'month-name' : /\d{1,2}[/.-]\d{4}/.test(r.meta!) ? 'numeric' : 'year')));
  const fp = formats.size > 1 ? 0.6 : 1;
  const datePts = roles.length ? dp * fp : 1;
  add('dates', 'Consistent, readable dates', datePts,
    roles.length === 0 ? 'No dated roles to check.' : dp < 1 ? `${roles.length - dated.length} role(s) have no readable date range.` : formats.size > 1 ? 'Dates mix more than one format.' : 'Every role has a readable date range in one format.',
    'Give every role a start and end date written the same way, for example "Jan 2020 - Present".');

  const idx = m.sections.map((s) => EXPECTED_ORDER.indexOf(s.type)).filter((i) => i >= 0);
  const inOrder = idx.every((v, i) => i === 0 || v >= idx[i - 1]);
  const eduFirst = m.sections.findIndex((s) => s.type === 'education') < m.sections.findIndex((s) => s.type === 'experience');
  const op = inOrder ? 1 : (eduFirst && !roles.length) || eduFirst ? 0.8 : 0.5; // education-first is accepted for early-career profiles
  add('order', 'Sensible section order', op, inOrder ? 'Sections follow the usual order.' : 'Sections are in an unusual order; most systems and readers expect summary, experience, then skills and education.',
    'Move experience above skills, education and certifications unless you are early in your career.');

  const heavy = m.sections.some((s) => (s.items ?? []).some((i) => /[|│┃]{2,}|\t/.test([i.title, i.subtitle, i.text].filter(Boolean).join(' '))));
  add('layout', 'Plain text content (no table-like text)', heavy ? 0.4 : 1, heavy ? 'Some entries contain tab or pipe-separated text that can scramble when parsed.' : 'Content is plain text with no table-like separators.', 'Replace tabs and repeated pipes with ordinary sentences or separate bullets.');
  return out;
}

// ---- own checks: clarity and completeness ----
function clarityItems(m: RenderModel): AtsItem[] {
  const out: AtsItem[] = [];
  const add = (key: string, label: string, points: number, explanation: string, action?: string) =>
    out.push({ key, label, dimension: 'clarity', status: POINT_STATUS(points), points: round2(points), method: 'clarity_rule', explanation, evidence: [], action: points >= 0.8 ? undefined : action });
  const summary = m.sections.find((s) => s.type === 'summary')?.text?.trim() ?? '';
  const sw = wordCount(summary);
  add('summary', 'Summary present and concise', !summary ? 0.3 : sw < 15 ? 0.6 : sw > 90 ? 0.6 : 1,
    !summary ? 'No summary was found.' : sw < 15 ? `The summary is very short (${sw} words).` : sw > 90 ? `The summary is long (${sw} words).` : `The summary is ${sw} words.`, 'Write two to four sentences on your role, strengths and focus.');

  const roles = m.sections.filter((s) => s.type === 'experience').flatMap((s) => s.items ?? []);
  const bullets = roles.flatMap((r) => r.bullets ?? []);
  const withDetail = roles.filter((r) => (r.bullets?.length ?? 0) >= 2).length;
  add('role_detail', 'Each role has supporting detail', roles.length ? withDetail / roles.length : 0,
    roles.length ? `${withDetail} of ${roles.length} role(s) have at least two bullets.` : 'No experience entries were found.', 'Add two to five bullets per role describing what you did and achieved.');

  if (bullets.length) {
    const wl = bullets.map(wordCount);
    const okLen = wl.filter((n) => n >= 6 && n <= 35).length / bullets.length;
    add('bullet_length', 'Bullets are neither fragments nor paragraphs', okLen, `${Math.round(okLen * 100)}% of bullets are 6-35 words.`, 'Keep each bullet to one clear sentence of roughly 8-30 words.');
    const verbs = bullets.filter((b) => ACTION_VERB.test(b.trim())).length / bullets.length;
    add('action_verbs', 'Bullets start with action verbs', Math.min(1, verbs / 0.6), `${Math.round(verbs * 100)}% of bullets start with a common action verb.`, 'Start bullets with what you did, for example "Built", "Led" or "Reduced".');
    const metrics = bullets.filter((b) => /\d/.test(b)).length / bullets.length;
    add('outcomes', 'Bullets include figures where you have them', Math.min(1, metrics / 0.3), `${Math.round(metrics * 100)}% of bullets contain a number.`, 'Add real figures (size, time, volume) only where you can stand behind them.');
  }
  const words = m.sections.reduce((a, s) => a + wordCount(s.text ?? '') + (s.items ?? []).reduce((b, i) => b + wordCount([i.title, i.subtitle, i.text, ...(i.bullets ?? []), ...(i.tags ?? [])].filter(Boolean).join(' ')), 0), 0);
  add('length', 'Reasonable overall length', words < 150 ? 0.4 : words < 250 ? 0.7 : words > 1400 ? 0.5 : words > 1000 ? 0.8 : 1, `The resume has about ${words} words.`, words < 250 ? 'Add detail about your work and skills.' : 'Trim older or less relevant content.');
  return out;
}

const EXP_DIMS = new Set(['experience', 'responsibilities']);
const MAP: Record<string, AtsDimensionId | undefined> = {
  required_skills: 'required_skills', preferred_skills: 'preferred_skills', experience: 'experience', responsibilities: 'experience',
  role_seniority: 'role_title', semantic: 'semantic', // domain_tools items are folded into the keyword-once pass below
};

const fromMatch = (i: MatchItem, dimension: AtsDimensionId): AtsItem => ({
  key: i.requirementId, label: i.label, dimension, status: i.status, points: i.points, method: i.method, explanation: i.explanation, evidence: i.evidence, action: i.action,
});

export function computeAts(input: AtsInput): AtsResult {
  const now = input.now ?? new Date();
  const active = input.requirements.filter((r) => r.included);
  const match = computeMatch({ model: input.model, requirements: input.requirements, jdTitle: input.jdTitle, targetRole: input.targetRole, confirmed: input.confirmed, now });

  const items: AtsItem[] = [];
  for (const i of match.items) {
    const d = MAP[i.dimension];
    if (!d || i.status === 'not_evaluated') continue;
    if (i.requirementId === 'derived:demonstration' && !EXP_DIMS.has(i.dimension)) continue;
    items.push(fromMatch(i, d));
  }
  // Keyword coverage: every distinct skill/domain keyword counted ONCE (repeats never help); any evidence level counts, listed-only counts half.
  const kwItems = match.items.filter((i) => i.type === 'required_skill' || i.type === 'preferred_skill');
  const seen = new Set<string>();
  const kw = kwItems.filter((i) => { const k = i.label.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return i.status !== 'not_evaluated'; });
  for (const i of kw) {
    const p = i.status === 'exact' ? 1 : i.status === 'missing' ? 0 : 0.5;
    items.push({ key: `kw:${i.requirementId}`, label: i.label, dimension: 'keyword_coverage', status: p === 1 ? 'exact' : p === 0 ? 'missing' : 'partial', points: p, method: 'keyword_once', evidence: i.evidence,
      explanation: p === 1 ? `"${i.label}" appears on the resume.` : p === 0 ? `"${i.label}" was not found anywhere on this resume.` : `"${i.label}" is present only as a related term or in a list.`, action: p === 1 ? undefined : i.action });
  }
  items.push(...structureItems(input.model, now), ...clarityItems(input.model));

  const dims: AtsDimension[] = ATS_DIMENSIONS.map((d) => {
    const own = items.filter((i) => i.dimension === d.id);
    const score = own.length ? Math.round((own.reduce((a, i) => a + i.points, 0) / own.length) * 100) : null;
    const matched = own.filter((i) => i.points >= 0.8).map((i) => i.label);
    const weak = own.filter((i) => i.points > 0 && i.points < 0.8).map((i) => i.label);
    const missing = own.filter((i) => i.points === 0).map((i) => i.label);
    return {
      id: d.id, label: d.label, weight: d.weight, applicable: score !== null, effectiveWeight: 0, score, maxScore: 100, itemCount: own.length, matched, weak, missing,
      explanation: score === null ? 'Not applicable: the posting gave nothing to evaluate here, so its weight was redistributed, not scored as zero.' : `${matched.length} of ${own.length} item${own.length > 1 ? 's' : ''} fully supported. ${d.what}.`,
    };
  });
  const aw = dims.filter((d) => d.applicable).reduce((a, d) => a + d.weight, 0);
  for (const d of dims) d.effectiveWeight = d.applicable && aw ? Math.round((d.weight / aw) * 1000) / 10 : 0;
  const score = aw ? Math.round(dims.filter((d) => d.applicable).reduce((a, d) => a + d.weight * d.score!, 0) / aw) : 0;

  const limitations: string[] = [];
  if (!input.confirmed) limitations.push('You have not confirmed the extracted requirements yet.');
  if (aw < 100) limitations.push(`${100 - aw}% of the weight belongs to dimensions with nothing to evaluate; it was redistributed.`);
  if (active.length < 3) limitations.push('Few requirements were available, so job-specific dimensions have low coverage.');
  if (!active.some((r) => r.type === 'required_skill')) limitations.push('No required skills were included in the posting.');
  limitations.push('Structure checks use the same render model as preview and export; they do not read an exported file (see the Parsing Test).');
  let confidence: 'high' | 'medium' | 'low' = 'high';
  if (!input.confirmed || aw < 80 || active.length < 5) confidence = 'medium';
  if (aw < 60 || active.length < 3 || !active.some((r) => r.type === 'required_skill')) confidence = 'low';

  const improvements = items
    .filter((i) => i.action && i.points < 0.8)
    .sort((a, b) => a.points - b.points || (a.dimension === 'required_skills' ? -1 : 1))
    .slice(0, 8).map((i) => `${i.label}: ${i.action}`);

  return {
    atsVersion: ATS_VERSION, taxonomyVersion: ATS_TAXONOMY_VERSION, score, dimensions: dims, items,
    coverage: { applicableWeight: aw, requirementsIncluded: active.length, confidence, limitations },
    strongMatches: items.filter((i) => i.points >= 0.8 && ['required_skills', 'preferred_skills', 'keyword_coverage'].includes(i.dimension)).map((i) => i.label).filter((v, i, a) => a.indexOf(v) === i),
    weakOrMissing: items.filter((i) => i.points < 0.8 && ['required_skills', 'preferred_skills', 'experience'].includes(i.dimension)).map((i) => i.label).filter((v, i, a) => a.indexOf(v) === i),
    improvements, disclaimer: ATS_DISCLAIMER,
  };
}
