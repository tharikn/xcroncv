import { contentWords, parseRange, textUnits, TextUnit, truncate, unionMonths } from '../common/text-utils';
import { RenderModel } from '../render-model/render-model.types';
import {
  degreeLevelOf, DEGREE_NAMES, detectSeniority, Requirement, SENIORITY_ORDER,
} from './jd-analyzer';
import { mentionsSkill, skillById, SkillCategory } from './taxonomy';

/**
 * Deterministic requirement matcher + scorer (docs 23, 29). No LLM decides anything here.
 * Same input -> same output. Bump SCORING_VERSION whenever weights, thresholds or taxonomy change.
 */
export const SCORING_VERSION = '1.0.0';

export type DimensionId = 'required_skills' | 'experience' | 'role_seniority' | 'responsibilities' | 'preferred_skills' | 'education' | 'domain_tools' | 'semantic';

export const DIMENSIONS: Array<{ id: DimensionId; label: string; weight: number; what: string }> = [
  { id: 'required_skills', label: 'Required skills', weight: 25, what: 'Required skills with direct resume evidence' },
  { id: 'experience', label: 'Relevant experience', weight: 20, what: 'Explicit years of experience and skills shown in actual work, not only listed' },
  { id: 'role_seniority', label: 'Role and seniority', weight: 15, what: 'Job title and level, where the resume states them' },
  { id: 'responsibilities', label: 'Responsibilities', weight: 15, what: 'Evidence of doing similar work' },
  { id: 'preferred_skills', label: 'Preferred skills', weight: 10, what: 'Preferred skills with direct or related evidence' },
  { id: 'education', label: 'Education and certifications', weight: 5, what: 'Explicit degree/certification criteria against stated resume facts' },
  { id: 'domain_tools', label: 'Domain, tools and keywords', weight: 5, what: 'Domain terms and tools named in the posting' },
  { id: 'semantic', label: 'Language similarity', weight: 5, what: 'Supporting lexical overlap between posting and resume (no AI model)' },
];

export type MatchStatus = 'exact' | 'related' | 'partial' | 'missing' | 'not_evaluated';
const POINTS: Record<Exclude<MatchStatus, 'not_evaluated'>, number> = { exact: 1, partial: 0.5, related: 0.4, missing: 0 };

export interface EvidenceRef {
  section: string; itemIndex: number; itemTitle?: string; field: string; bulletIndex?: number; excerpt: string;
}

export interface MatchItem {
  requirementId: string;
  label: string;
  type: Requirement['type'] | 'derived';
  dimension: DimensionId;
  status: MatchStatus;
  /** exact_keyword | synonym | listed_only | related_skill | explicit_years | keyword_overlap | degree_level | title_overlap | seniority_level | demonstration_ratio | lexical_cosine */
  method: string;
  confidence: number;
  points: number;
  evidence: EvidenceRef[];
  sourceText?: string;
  explanation: string;
  action?: string;
}

export interface DimensionResult {
  id: DimensionId; label: string; weight: number; applicable: boolean;
  /** Weight after redistributing the weight of not-applicable dimensions. */
  effectiveWeight: number; score: number | null; itemCount: number; explanation: string;
}

export interface MatchResult {
  scoringVersion: string;
  totalScore: number;
  dimensions: DimensionResult[];
  items: MatchItem[];
  coverage: {
    applicableWeight: number; dimensionsApplicable: number; dimensionsTotal: number;
    requirementsIncluded: number; requirementsEvaluated: number; confidence: 'high' | 'medium' | 'low'; limitations: string[];
  };
  summary: {
    counts: Record<MatchStatus, number>;
    strong: string[]; partial: string[]; related: string[]; missing: string[]; notEvaluated: string[]; nextActions: string[];
  };
  disclaimer: string;
}

export const DISCLAIMER =
  'This is a job-specific alignment score between this resume and this posting. It is not a hiring probability, a chance of selection or an employer ATS result. "Missing" means not found in this resume, not that you lack the skill.';

const ev = (u: TextUnit, excerpt = u.text): EvidenceRef => ({
  section: u.section, itemIndex: u.itemIndex, itemTitle: u.itemTitle, field: u.field, bulletIndex: u.bulletIndex, excerpt: truncate(excerpt, 160),
});

const skillDimension = (r: Requirement, category?: SkillCategory): DimensionId =>
  category === 'domain' || r.explicit === false ? 'domain_tools' : r.type === 'preferred_skill' ? 'preferred_skills' : 'required_skills';

function matchSkill(r: Requirement, units: TextUnit[], category?: SkillCategory): MatchItem {
  const id = r.normalized!;
  const sk = skillById(id)!;
  const base = { requirementId: r.id, label: r.label, type: r.type, dimension: skillDimension(r, category), sourceText: r.sourceText } as const;
  const hits = units.map((u) => ({ u, hit: mentionsSkill(u.text, id) })).filter((x) => x.hit);
  const demo = hits.filter((x) => x.u.demonstrated);
  if (demo.length) {
    const viaSynonym = demo.every((x) => !x.hit!.exactLabel);
    return {
      ...base, status: 'exact', method: viaSynonym ? 'synonym' : 'exact_keyword', confidence: viaSynonym ? 0.9 : 0.95, points: POINTS.exact,
      evidence: demo.slice(0, 3).map((x) => ev(x.u)),
      explanation: `${sk.label} appears in ${demo.length} place${demo.length > 1 ? 's' : ''} where you describe your work${viaSynonym ? ` (as "${demo[0].hit!.alias}")` : ''}.`,
    };
  }
  if (hits.length) {
    return {
      ...base, status: 'partial', method: 'listed_only', confidence: 0.6, points: POINTS.partial, evidence: hits.slice(0, 3).map((x) => ev(x.u)),
      explanation: `${sk.label} is listed (skills, summary or headline) but not shown in a job or project.`,
      action: `If it is true, show ${sk.label} in an experience bullet or project. Do not add it otherwise.`,
    };
  }
  const relatedHits = (sk.related ?? []).flatMap((rid) => units.map((u) => ({ u, rid, hit: mentionsSkill(u.text, rid) })).filter((x) => x.hit));
  if (relatedHits.length) {
    const first = relatedHits[0];
    return {
      ...base, status: 'related', method: 'related_skill', confidence: 0.5, points: POINTS.related, evidence: relatedHits.slice(0, 2).map((x) => ev(x.u)),
      explanation: `${sk.label} was not found, but a related skill (${skillById(first.rid)!.label}) is on the resume.`,
      action: `Mention ${sk.label} only if you have actually used it.`,
    };
  }
  return {
    ...base, status: 'missing', method: 'exact_keyword', confidence: 0.9, points: 0, evidence: [],
    explanation: `No evidence of ${sk.label} found in this resume.`,
    action: `Add ${sk.label} only if it reflects work you have actually done.`,
  };
}

function matchYears(r: Requirement, model: RenderModel, now: Date): MatchItem {
  const base = { requirementId: r.id, label: r.label, type: r.type, dimension: 'experience' as const, sourceText: r.sourceText };
  const exp = model.sections.find((s) => s.type === 'experience')?.items ?? [];
  // "5 years of Node.js or Python": any of the accepted skills counts (union of the roles mentioning them).
  const accepted = r.normalized ? [r.normalized, ...(r.alternatives ?? [])] : [];
  const parsed = exp.map((it, i) => {
    const text = [it.title, it.subtitle, it.text, ...(it.bullets ?? [])].filter(Boolean).join(' \n ');
    return { it, i, range: parseRange(it.meta, now), mentions: accepted.length ? accepted.some((id) => !!mentionsSkill(text, id)) : true };
  });
  if (!parsed.some((p) => p.range)) {
    return { ...base, status: 'not_evaluated', method: 'explicit_years', confidence: 0, points: 0, evidence: [], explanation: 'The resume has no explicit job dates, so years of experience were not evaluated (never guessed).' };
  }
  const relevant = parsed.filter((p) => p.mentions && p.range);
  const months = unionMonths(relevant.map((p) => p.range!));
  const years = Math.round((months / 12) * 10) / 10;
  const need = r.minYears ?? 0;
  const evidence = relevant.slice(0, 3).map((p): EvidenceRef => ({ section: 'experience', itemIndex: p.i, itemTitle: p.it.title, field: 'meta', excerpt: truncate(`${p.it.title ?? ''} ${p.it.meta ? `(${p.it.meta})` : ''}`, 120) }));
  const subject = accepted.length ? accepted.map((id) => skillById(id)!.label).join(' or ') : 'relevant roles';
  if (years >= need) return { ...base, status: 'exact', method: 'explicit_years', confidence: 0.85, points: 1, evidence, explanation: `About ${years} years across roles that mention ${subject}; the posting asks for ${need}+.` };
  if (years >= need * 0.5 && years > 0) return { ...base, status: 'partial', method: 'explicit_years', confidence: 0.85, points: 0.5, evidence, explanation: `About ${years} years across roles that mention ${subject}; the posting asks for ${need}+.`, action: 'Dates come from your resume. Check they are complete and accurate.' };
  return { ...base, status: 'missing', method: 'explicit_years', confidence: 0.8, points: 0, evidence, explanation: years ? `About ${years} years across roles that mention ${subject}; the posting asks for ${need}+.` : `No dated role mentions ${subject}.` };
}

function matchResponsibility(r: Requirement, units: TextUnit[]): MatchItem {
  const base = { requirementId: r.id, label: r.label, type: r.type, dimension: 'responsibilities' as const, sourceText: r.sourceText };
  const kw = [...new Set(contentWords(r.sourceText || r.label))];
  if (kw.length < 2) return { ...base, status: 'not_evaluated', method: 'keyword_overlap', confidence: 0, points: 0, evidence: [], explanation: 'Too little detail in this statement to compare.' };
  let best: { u: TextUnit; ratio: number } | null = null;
  for (const u of units.filter((x) => x.demonstrated && (x.field === 'bullets' || x.field === 'text'))) {
    const w = new Set(contentWords(u.text));
    const ratio = kw.filter((k) => w.has(k)).length / kw.length;
    if (!best || ratio > best.ratio) best = { u, ratio };
  }
  const pct = best ? Math.round(best.ratio * 100) : 0;
  if (best && best.ratio >= 0.55) return { ...base, status: 'exact', method: 'keyword_overlap', confidence: 0.75, points: 1, evidence: [ev(best.u)], explanation: `A bullet covers ${pct}% of this statement's key terms.` };
  if (best && best.ratio >= 0.25) return { ...base, status: 'partial', method: 'keyword_overlap', confidence: 0.6, points: 0.5, evidence: [ev(best.u)], explanation: `The closest bullet covers ${pct}% of this statement's key terms.`, action: 'If you did this kind of work, say so in plain words in a relevant bullet.' };
  return { ...base, status: 'missing', method: 'keyword_overlap', confidence: 0.7, points: 0, evidence: [], explanation: 'No bullet or project text covers this responsibility.', action: 'Add it only if it reflects your real work.' };
}

function matchQualification(r: Requirement, model: RenderModel): MatchItem {
  const base = { requirementId: r.id, label: r.label, type: r.type, dimension: 'education' as const, sourceText: r.sourceText };
  const edu = model.sections.find((s) => s.type === 'education')?.items ?? [];
  const certs = model.sections.find((s) => s.type === 'certifications')?.items ?? [];
  if (r.degreeLevel) {
    const levels = edu.map((e, i) => ({ e, i, lvl: degreeLevelOf([e.title, e.subtitle, e.text].filter(Boolean).join(' ')) }));
    const known = levels.filter((l) => l.lvl !== null);
    if (!known.length) return { ...base, status: 'not_evaluated', method: 'degree_level', confidence: 0, points: 0, evidence: [], explanation: 'The degree level is not stated on the resume, so it was not evaluated (never inferred).' };
    const top = known.reduce((a, b) => (b.lvl! > a.lvl! ? b : a));
    const evidence: EvidenceRef[] = [{ section: 'education', itemIndex: top.i, itemTitle: top.e.title, field: 'title', excerpt: truncate([top.e.title, top.e.subtitle].filter(Boolean).join(', '), 120) }];
    if (top.lvl! >= r.degreeLevel) return { ...base, status: 'exact', method: 'degree_level', confidence: 0.9, points: 1, evidence, explanation: `${DEGREE_NAMES[top.lvl!]} level stated; the posting asks for ${DEGREE_NAMES[r.degreeLevel]}.` };
    if (/\b(equivalent|or relevant experience|or experience)\b/i.test(r.sourceText)) return { ...base, status: 'partial', method: 'degree_level', confidence: 0.7, points: 0.5, evidence, explanation: `The posting accepts equivalent experience; the highest stated level is ${DEGREE_NAMES[top.lvl!]}.` };
    return { ...base, status: 'missing', method: 'degree_level', confidence: 0.85, points: 0, evidence, explanation: `The highest stated level is ${DEGREE_NAMES[top.lvl!]}; the posting asks for ${DEGREE_NAMES[r.degreeLevel]}.` };
  }
  const kw = [...new Set(contentWords(r.label))];
  let bestRatio = 0; let bestIdx = -1;
  certs.forEach((c, i) => {
    const w = new Set(contentWords(`${c.title ?? ''} ${c.subtitle ?? ''}`));
    const ratio = kw.length ? kw.filter((k) => w.has(k)).length / kw.length : 0;
    if (ratio > bestRatio) { bestRatio = ratio; bestIdx = i; }
  });
  if (bestRatio >= 0.5) return { ...base, status: 'exact', method: 'keyword_overlap', confidence: 0.8, points: 1, evidence: [{ section: 'certifications', itemIndex: bestIdx, itemTitle: certs[bestIdx].title, field: 'title', excerpt: truncate(certs[bestIdx].title ?? '', 120) }], explanation: 'A listed certification matches.' };
  return { ...base, status: 'missing', method: 'keyword_overlap', confidence: 0.7, points: 0, evidence: [], explanation: 'No matching certification found on this resume.', action: 'List it only if you hold it.' };
}

/** Role/seniority items derived from the posting title (the only place a title is explicit). */
function roleItems(jdTitle: string | undefined, model: RenderModel, targetRole?: string | null): MatchItem[] {
  const items: MatchItem[] = [];
  if (!jdTitle?.trim()) return items;
  const exp = model.sections.find((s) => s.type === 'experience')?.items ?? [];
  const resumeTitles = [...exp.map((e, i) => ({ t: e.title ?? '', i })), ...(model.header.headline ? [{ t: model.header.headline, i: -1 }] : []), ...(targetRole ? [{ t: targetRole, i: -2 }] : [])].filter((x) => x.t);
  const senWords = new Set(['senior', 'sr', 'junior', 'jr', 'lead', 'principal', 'staff', 'intern', 'associate', 'head', 'mid', 'level', 'entry']);
  const roleWords = [...new Set(contentWords(jdTitle))].filter((w) => !senWords.has(w));
  if (roleWords.length) {
    let best = { ratio: 0, t: '', i: 0 };
    for (const rt of resumeTitles) {
      const w = new Set(contentWords(rt.t));
      const ratio = roleWords.filter((k) => w.has(k)).length / roleWords.length;
      if (ratio > best.ratio) best = { ratio, t: rt.t, i: rt.i };
    }
    const evidence: EvidenceRef[] = best.t ? [{ section: best.i >= 0 ? 'experience' : 'header', itemIndex: Math.max(0, best.i), field: 'title', excerpt: truncate(best.t, 100) }] : [];
    const status: MatchStatus = best.ratio >= 0.5 ? 'exact' : best.ratio >= 0.25 ? 'partial' : 'missing';
    items.push({
      requirementId: 'derived:role-title', label: `Role: ${jdTitle.trim()}`, type: 'derived', dimension: 'role_seniority', status, method: 'title_overlap',
      confidence: 0.7, points: POINTS[status as 'exact'], evidence: status === 'missing' ? [] : evidence,
      explanation: status === 'missing' ? 'None of your job titles, headline or target role share the posting\'s role words.' : `Closest title: "${truncate(best.t, 60)}" (${Math.round(best.ratio * 100)}% of the role words).`,
      action: status === 'missing' ? 'A headline that states your target role helps readers see the fit, if it is accurate.' : undefined,
    });
  }
  const want = detectSeniority(jdTitle);
  if (want) {
    const current = exp[0]?.title ? detectSeniority(exp[0].title) : undefined;
    if (!current) {
      items.push({ requirementId: 'derived:seniority', label: `Level: ${want}`, type: 'derived', dimension: 'role_seniority', status: 'not_evaluated', method: 'seniority_level', confidence: 0, points: 0, evidence: [], explanation: 'Your most recent title does not state a level, so seniority was not evaluated (never inferred).' });
    } else {
      const diff = SENIORITY_ORDER.indexOf(current) - SENIORITY_ORDER.indexOf(want);
      const status: MatchStatus = diff >= 0 ? 'exact' : diff === -1 ? 'partial' : 'missing';
      items.push({ requirementId: 'derived:seniority', label: `Level: ${want}`, type: 'derived', dimension: 'role_seniority', status, method: 'seniority_level', confidence: 0.7, points: POINTS[status as 'exact'], evidence: [{ section: 'experience', itemIndex: 0, itemTitle: exp[0].title, field: 'title', excerpt: truncate(exp[0].title ?? '', 100) }], explanation: `Most recent title reads "${current}"; the posting reads "${want}".` });
    }
  }
  return items;
}

function cosine(a: string[], b: string[]): number {
  const fa = new Map<string, number>(); const fb = new Map<string, number>();
  a.forEach((w) => fa.set(w, (fa.get(w) ?? 0) + 1)); b.forEach((w) => fb.set(w, (fb.get(w) ?? 0) + 1));
  let dot = 0; let na = 0; let nb = 0;
  fa.forEach((v, k) => { dot += v * (fb.get(k) ?? 0); na += v * v; });
  fb.forEach((v) => { nb += v * v; });
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface MatchInput {
  model: RenderModel;
  requirements: Requirement[];
  jdTitle?: string;
  targetRole?: string | null;
  confirmed: boolean;
  now?: Date;
}

export function computeMatch(input: MatchInput): MatchResult {
  const now = input.now ?? new Date();
  const units = textUnits(input.model);
  const active = input.requirements.filter((r) => r.included);
  const items: MatchItem[] = [];

  for (const r of active) {
    if (r.type === 'required_skill' || r.type === 'preferred_skill') {
      if (r.normalized && r.alternatives?.length) {
        // "X or Y": the best-supported candidate satisfies the requirement.
        const cands = [r.normalized, ...r.alternatives].filter((id) => skillById(id))
          .map((id) => matchSkill({ ...r, normalized: id, alternatives: undefined }, units, skillById(r.normalized!)?.category));
        const best = cands.reduce((a, b) => (b.points > a.points ? b : a));
        items.push({ ...best, requirementId: r.id, label: r.label, explanation: cands.length > 1 ? `${best.explanation} (Any of: ${r.label}.)` : best.explanation });
      } else if (r.normalized) items.push(matchSkill(r, units, skillById(r.normalized)?.category));
      else {
        // Free-text skill not in the taxonomy: exact phrase search only, never guessed synonyms.
        const phrase = r.label.toLowerCase();
        const hits = units.filter((u) => u.text.toLowerCase().includes(phrase));
        const demo = hits.filter((u) => u.demonstrated);
        const dimension: DimensionId = r.type === 'preferred_skill' ? 'preferred_skills' : 'required_skills';
        const status: MatchStatus = demo.length ? 'exact' : hits.length ? 'partial' : 'missing';
        items.push({
          requirementId: r.id, label: r.label, type: r.type, dimension, status, method: hits.length ? (demo.length ? 'exact_keyword' : 'listed_only') : 'exact_keyword',
          confidence: hits.length ? 0.8 : 0.7, points: POINTS[status as 'exact'], evidence: (demo.length ? demo : hits).slice(0, 3).map((u) => ev(u)), sourceText: r.sourceText,
          explanation: demo.length ? `"${r.label}" appears where you describe your work.` : hits.length ? `"${r.label}" is listed but not shown in a job or project.` : `No evidence of "${r.label}" found in this resume.`,
          action: status === 'exact' ? undefined : `Add "${r.label}" only if it reflects work you have actually done.`,
        });
      }
    } else if (r.type === 'experience') items.push(matchYears(r, input.model, now));
    else if (r.type === 'responsibility') items.push(matchResponsibility(r, units));
    else if (r.type === 'qualification') items.push(matchQualification(r, input.model));
  }

  items.push(...roleItems(input.jdTitle, input.model, input.targetRole));

  // Derived: how many skills that were found are actually demonstrated in work (vs only listed).
  const skillItems = items.filter((i) => i.type === 'required_skill' || i.type === 'preferred_skill');
  const found = skillItems.filter((i) => ['exact', 'partial', 'related'].includes(i.status));
  if (skillItems.length) {
    const demonstrated = found.filter((i) => i.status === 'exact').length;
    const ratio = found.length ? demonstrated / found.length : 0;
    items.push({
      requirementId: 'derived:demonstration', label: 'Skills shown in real work', type: 'derived', dimension: 'experience',
      status: ratio >= 0.8 ? 'exact' : ratio >= 0.4 ? 'partial' : 'missing', method: 'demonstration_ratio', confidence: 0.8, points: ratio, evidence: [],
      explanation: found.length ? `${demonstrated} of the ${found.length} requested skills you have are shown in a job or project, not only listed.` : 'None of the requested skills were found on the resume.',
      action: found.length && demonstrated < found.length ? 'For skills that are only listed, add an experience bullet if you used them.' : undefined,
    });
  }

  // Derived: supporting lexical similarity (never decisive; 5%).
  const jdTokens = active.flatMap((r) => contentWords(`${r.label} ${r.sourceText}`));
  const resumeTokens = units.flatMap((u) => contentWords(u.text));
  if (jdTokens.length >= 5 && resumeTokens.length >= 5) {
    const sim = cosine(jdTokens, resumeTokens);
    const pts = Math.min(1, sim / 0.3);
    items.push({
      requirementId: 'derived:lexical', label: 'Overall language similarity', type: 'derived', dimension: 'semantic',
      status: pts >= 0.8 ? 'exact' : pts >= 0.4 ? 'partial' : 'missing', method: 'lexical_cosine', confidence: 0.5, points: Math.round(pts * 100) / 100, evidence: [],
      explanation: `Word overlap similarity ${(sim * 100).toFixed(0)}% (supporting signal only; counts for 5%).`,
    });
  }

  // ---- scoring ------------------------------------------------------------------------------
  const dims: DimensionResult[] = DIMENSIONS.map((d) => {
    const evaluated = items.filter((i) => i.dimension === d.id && i.status !== 'not_evaluated');
    const score = evaluated.length ? Math.round((evaluated.reduce((a, i) => a + i.points, 0) / evaluated.length) * 100) : null;
    const strong = evaluated.filter((i) => i.status === 'exact').length;
    return {
      id: d.id, label: d.label, weight: d.weight, applicable: score !== null, effectiveWeight: 0, score, itemCount: evaluated.length,
      explanation: score === null ? 'Not applicable: the posting gave nothing to evaluate here. Its weight was redistributed.' : `${strong} of ${evaluated.length} evaluated item${evaluated.length > 1 ? 's' : ''} fully supported. ${d.what}.`,
    };
  });
  const applicableWeight = dims.filter((d) => d.applicable).reduce((a, d) => a + d.weight, 0);
  for (const d of dims) d.effectiveWeight = d.applicable && applicableWeight ? Math.round((d.weight / applicableWeight) * 1000) / 10 : 0;
  const totalScore = applicableWeight ? Math.round(dims.filter((d) => d.applicable).reduce((a, d) => a + d.weight * d.score!, 0) / applicableWeight) : 0;

  // ---- coverage / confidence ----------------------------------------------------------------
  const reqItems = items.filter((i) => i.type !== 'derived');
  const evaluatedReq = reqItems.filter((i) => i.status !== 'not_evaluated').length;
  const limitations: string[] = [];
  if (!input.confirmed) limitations.push('You have not confirmed the extracted requirements yet.');
  if (applicableWeight < 100) limitations.push(`${100 - applicableWeight}% of the weight belongs to dimensions the posting or resume gave nothing to evaluate; it was redistributed.`);
  if (active.length < 3) limitations.push('Few requirements were available, so the score has low coverage.');
  if (!active.some((r) => r.type === 'required_skill')) limitations.push('No required skills were included.');
  if (reqItems.length && evaluatedReq < reqItems.length) limitations.push(`${reqItems.length - evaluatedReq} requirement(s) could not be evaluated from the resume text.`);
  const avgConf = active.length ? active.reduce((a, r) => a + r.confidence, 0) / active.length : 0;
  let confidence: 'high' | 'medium' | 'low' = 'high';
  if (applicableWeight < 80 || !input.confirmed || avgConf < 0.7 || (reqItems.length && evaluatedReq / reqItems.length < 0.8)) confidence = 'medium';
  if (applicableWeight < 50 || active.length < 3 || !active.some((r) => r.type === 'required_skill')) confidence = 'low';

  const counts: Record<MatchStatus, number> = { exact: 0, related: 0, partial: 0, missing: 0, not_evaluated: 0 };
  reqItems.forEach((i) => counts[i.status]++);
  const pick = (s: MatchStatus) => reqItems.filter((i) => i.status === s).map((i) => i.label);
  const nextActions = reqItems
    .filter((i) => i.action && (i.status === 'missing' || i.status === 'partial' || i.status === 'related'))
    .sort((a, b) => (a.type === 'required_skill' ? 0 : 1) - (b.type === 'required_skill' ? 0 : 1) || POINTS[a.status as 'exact'] - POINTS[b.status as 'exact'])
    .slice(0, 6).map((i) => `${i.label}: ${i.action}`);

  return {
    scoringVersion: SCORING_VERSION, totalScore, dimensions: dims, items,
    coverage: {
      applicableWeight, dimensionsApplicable: dims.filter((d) => d.applicable).length, dimensionsTotal: dims.length,
      requirementsIncluded: active.length, requirementsEvaluated: evaluatedReq, confidence, limitations,
    },
    summary: { counts, strong: pick('exact'), partial: pick('partial'), related: pick('related'), missing: pick('missing'), notEvaluated: pick('not_evaluated'), nextActions },
    disclaimer: DISCLAIMER,
  };
}
