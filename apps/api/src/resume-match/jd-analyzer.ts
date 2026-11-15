import { createHash } from 'crypto';
import { contentWords, truncate } from '../common/text-utils';
import { findSkills, normalizeLabel, skillById } from './taxonomy';

/** Bump when extraction rules change. Stored on every JobDescription. */
export const EXTRACTION_VERSION = '1.0.0';

export type RequirementType = 'required_skill' | 'preferred_skill' | 'responsibility' | 'experience' | 'qualification';
export const REQUIREMENT_TYPES: RequirementType[] = ['required_skill', 'preferred_skill', 'responsibility', 'experience', 'qualification'];

export interface Requirement {
  id: string;
  type: RequirementType;
  label: string;
  /** Taxonomy skill id when the requirement names a known skill. */
  normalized?: string;
  /** Minimum years (experience requirements only), explicit in the JD text. */
  minYears?: number;
  /** Other taxonomy skills accepted for an "X or Y" years statement. */
  alternatives?: string[];
  /** Degree level 1-4 (qualification requirements): 1 diploma, 2 bachelor, 3 master, 4 doctorate. */
  degreeLevel?: number;
  /** The JD sentence/span the requirement came from (short, never the whole JD). */
  sourceText: string;
  confidence: number;
  included: boolean;
  /** true when the skill sat in a requirements list or had a cue word (required/preferred/must); false when only named in prose. */
  explicit?: boolean;
  origin: 'EXTRACTED' | 'USER';
}

export type Seniority = 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'principal';
export const SENIORITY_ORDER: Seniority[] = ['intern', 'junior', 'mid', 'senior', 'lead', 'principal'];

export interface JdAnalysis {
  requirements: Requirement[];
  seniority?: Seniority;
  detectedTitle?: string;
  workMode?: 'remote' | 'hybrid' | 'onsite';
  warnings: string[];
}

type Section = 'required' | 'preferred' | 'responsibilities' | 'qualifications' | 'about' | null;

const HEADINGS: Array<[Section, RegExp]> = [
  ['preferred', /^(?:\W*)(preferred|nice[- ]to[- ]have|bonus|desirable|good to have|pluses|it would be (?:great|a plus)|extra credit)\b/i],
  ['required', /^(?:\W*)(requirements?|required|must[- ]have|what you(?:'|’)ll need|what we(?:'|’)re looking for|you have|you bring|minimum|essential|skills? (?:and|&) experience|who you are|qualifications?)\b/i],
  ['responsibilities', /^(?:\W*)(responsibilit|what you(?:'|’)ll do|the role|key duties|duties|you will|in this role|day[- ]to[- ]day)/i],
  ['about', /^(?:\W*)(about (?:us|the company|you)|who we are|benefits|perks|what we offer|why join|compensation|equal opportunity)/i],
];

const PREFERRED_CUE = /\b(preferred|nice to have|bonus|a plus|is a plus|desirable|good to have|advantage|ideally)\b/i;
const REQUIRED_CUE = /\b(required|must|essential|mandatory|minimum|need to|proficien|strong|solid|expert)\b/i;
const YEARS = /(\d{1,2})\s*(?:\+|plus)?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?)\b/i;
const DEGREE: Array<[RegExp, number, string]> = [
  [/\b(ph\.?d|doctorate|doctoral)\b/i, 4, 'Doctorate'],
  [/\b(master(?:'|’)?s|master of|m\.?sc|m\.?eng|mba|m\.?tech|postgraduate)\b/i, 3, "Master's degree"],
  [/\b(bachelor(?:'|’)?s?|b\.?sc|b\.?eng|b\.?tech|undergraduate|bs\/ms|degree in|university degree|college degree)\b/i, 2, "Bachelor's degree"],
  [/\b(diploma|associate degree)\b/i, 1, 'Diploma'],
];
const CERT = /\b(certified|certification|certificate|aws certified|pmp|cissp|scrum master)\b/i;
const RESP_VERBS = /^(?:\W*)(build|design|develop|implement|lead|own|manage|maintain|collaborate|work|ship|deliver|create|write|review|mentor|drive|improve|optimi[sz]e|partner|define|architect|deploy|monitor|support|troubleshoot|analy[sz]e|coordinate|contribute|plan|test|automate|integrate|migrate|participate|ensure)\b/i;

export function hashText(text: string): string {
  return createHash('sha256').update(text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()).digest('hex').slice(0, 32);
}

/** Treat JD text as untrusted: strip markup/control characters, collapse whitespace, keep line structure. */
export function sanitizeJdText(raw: string): string {
  return raw
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function headingOf(line: string): Section | undefined {
  const t = line.trim();
  if (!t || t.length > 70) return undefined;
  if (/[.;]$/.test(t) && !t.endsWith(':')) return undefined;
  for (const [sec, re] of HEADINGS) if (re.test(t)) return sec;
  return undefined;
}

export function detectSeniority(text: string): Seniority | undefined {
  const t = text.toLowerCase();
  if (/\b(principal|staff|distinguished|architect)\b/.test(t)) return 'principal';
  if (/\b(lead|head of|manager|team lead|tech lead)\b/.test(t)) return 'lead';
  if (/\b(senior|sr\.?)\b/.test(t)) return 'senior';
  if (/\b(junior|jr\.?|entry[- ]level|graduate|associate)\b/.test(t)) return 'junior';
  if (/\b(intern|internship|trainee)\b/.test(t)) return 'intern';
  if (/\b(mid[- ]level|intermediate)\b/.test(t)) return 'mid';
  return undefined;
}

/** Deterministic ids: same text -> same ids (sequence suffix only disambiguates duplicates within one analysis). */
function makeIds(reqs: Omit<Requirement, 'id'>[]): Requirement[] {
  const seen = new Map<string, number>();
  return reqs.map((r) => {
    const base = `${r.type}|${r.normalized ?? r.label.toLowerCase()}|${r.minYears ?? ''}`;
    const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    return { ...r, id: `r-${createHash('sha1').update(base).digest('hex').slice(0, 10)}${n > 1 ? `-${n}` : ''}` };
  });
}

/**
 * Rule-based JD analysis. No LLM. Output is a DRAFT for the user to confirm/edit; confidence reflects how explicit the cue was.
 */
export function analyzeJd(rawText: string, title?: string): JdAnalysis {
  const text = sanitizeJdText(rawText);
  const lines = text.split('\n').map((l) => l.replace(/^[\s\-*•·▪●○◦–—>]+/, '').trim()).filter(Boolean);
  const warnings: string[] = [];
  const out: Array<Omit<Requirement, 'id'>> = [];
  const dedupe = new Set<string>();
  const push = (r: Omit<Requirement, 'id'>) => {
    const key = `${r.type}|${r.normalized ?? r.label.toLowerCase()}|${r.minYears ?? ''}`;
    if (dedupe.has(key)) return;
    // A skill that is both required and preferred keeps the stronger (required) classification.
    if (r.normalized && (r.type === 'preferred_skill') && dedupe.has(`required_skill|${r.normalized}|`)) return;
    dedupe.add(key); out.push(r);
  };

  let section: Section = null;
  for (const line of lines) {
    const h = headingOf(line);
    if (h !== undefined) { section = h; if (line.length < 60) continue; }
    if (section === 'about') continue;
    const src = truncate(line, 220);
    const hits = findSkills(line);

    // Experience: explicit "N years" statements only. Never inferred.
    const y = YEARS.exec(line);
    if (y && !/\b(company|founded|since|established|over \d+ years of history)\b/i.test(line)) {
      const minYears = +y[1];
      const ctx = hits[0];
      const alts = ctx && hits.length > 1 && hits.length <= 3 && /\bor\b|\//i.test(line) ? hits.slice(1).map((h) => h.id) : undefined;
      const label = ctx ? `${minYears}+ years of ${[ctx.id, ...(alts ?? [])].map((i) => skillById(i)!.label).join(' or ')}` : `${minYears}+ years of relevant experience`;
      push({ type: 'experience', label, normalized: ctx?.id, alternatives: alts, minYears, sourceText: src, confidence: ctx ? 0.9 : 0.75, included: true, origin: 'EXTRACTED' });
    }

    // Qualifications (degrees and certifications).
    const deg = DEGREE.find(([re]) => re.test(line));
    if (deg && (section === 'required' || section === 'qualifications' || section === 'preferred' || /\b(degree|diploma|equivalent)\b/i.test(line))) {
      push({ type: 'qualification', label: deg[2], degreeLevel: deg[1], sourceText: src, confidence: 0.85, included: !PREFERRED_CUE.test(line), origin: 'EXTRACTED' });
    } else if (CERT.test(line) && line.length < 200) {
      push({ type: 'qualification', label: truncate(line, 80), sourceText: src, confidence: 0.6, included: true, origin: 'EXTRACTED' });
    }

    const preferredByCue = PREFERRED_CUE.test(line);
    const requiredByCue = REQUIRED_CUE.test(line);
    const isPreferred = section === 'preferred' || (preferredByCue && !requiredByCue);
    const isResponsibility = section === 'responsibilities' || (section === null && RESP_VERBS.test(line) && hits.length === 0);

    // Skills: every taxonomy skill named in the line.
    // "X or Y" / "X/Y" is ONE requirement satisfied by either skill, not two separate hard requirements.
    const orGroup = hits.length > 1 && hits.length <= 3 && /\bor\b|\//i.test(line) && !/\band\b|,/i.test(line);
    for (const hit of orGroup ? hits.slice(0, 1) : hits) {
      const sk = skillById(hit.id)!;
      const alts = orGroup ? hits.slice(1).map((h) => h.id) : undefined;
      const explicit = section === 'required' || section === 'preferred' || preferredByCue || requiredByCue;
      push({
        type: isPreferred ? 'preferred_skill' : 'required_skill', alternatives: alts,
        label: alts ? [sk.id, ...alts].map((i) => skillById(i)!.label).join(' or ') : sk.label, normalized: sk.id, sourceText: src,
        // Skills named only inside responsibility prose are context, not hard criteria: lower confidence, still user-editable.
        confidence: explicit ? 0.9 : section === 'responsibilities' ? 0.6 : 0.7,
        // Skills named only in prose count as keywords (5% dimension); domain terms outside requirement lists start excluded.
        explicit, included: !(section === 'responsibilities' && (hits.length > 4 || sk.category === 'domain')) && !(sk.category === 'domain' && !explicit), origin: 'EXTRACTED',

      });
    }

    // Responsibilities: action sentences that are not just a skill list.
    if (isResponsibility && contentWords(line).length >= 3 && line.length >= 20 && !/^\s*(?:[\w.#+ /]+,\s*){3,}[\w.#+ /]+$/.test(line)) {
      push({ type: 'responsibility', label: truncate(line, 120), sourceText: src, confidence: 0.8, included: true, origin: 'EXTRACTED' });
    }
  }

  const analysis = makeIds(out);
  const required = analysis.filter((r) => r.type === 'required_skill').length;
  if (analysis.length === 0) warnings.push('No requirements could be extracted automatically. Add them manually, or paste more of the job description.');
  else if (required === 0) warnings.push('No required skills were detected. Check that the posting lists its requirements.');
  if (text.length < 300) warnings.push('The job description is short, so the score will have low coverage.');

  const seniority = detectSeniority(`${title ?? ''}\n${lines.slice(0, 6).join('\n')}`);
  const wm = /\bremote\b/i.test(text) ? 'remote' : /\bhybrid\b/i.test(text) ? 'hybrid' : /\bon[- ]?site\b|\bin[- ]office\b/i.test(text) ? 'onsite' : undefined;
  return { requirements: analysis, seniority, detectedTitle: title?.trim() || undefined, workMode: wm, warnings };
}

/** Re-normalize user-supplied requirements: attach taxonomy ids, clamp, ensure ids exist. Server never trusts client-sent normalization. */
export function normalizeUserRequirements(input: Array<Partial<Requirement> & { label: string; type: RequirementType }>): Requirement[] {
  const base = input.map((r) => {
    const label = r.label.trim().slice(0, 200);
    const isSkill = r.type === 'required_skill' || r.type === 'preferred_skill';
    const alt = Array.isArray(r.alternatives) && r.alternatives.length > 0;
    const normalized = isSkill || r.type === 'experience' ? (normalizeLabel(label) ?? (alt ? findSkills(label)[0]?.id : undefined)) : undefined;
    const deg = r.type === 'qualification' ? DEGREE.find(([re]) => re.test(label)) : undefined;
    const origin: Requirement['origin'] = r.origin === 'EXTRACTED' ? 'EXTRACTED' : 'USER';
    return {
      type: r.type, label: normalized && isSkill && !alt ? skillById(normalized)!.label : label, normalized,
      minYears: r.type === 'experience' && typeof r.minYears === 'number' ? Math.min(50, Math.max(0, Math.floor(r.minYears))) : undefined,
      alternatives: (r.type === 'experience' || isSkill) && Array.isArray(r.alternatives) ? r.alternatives.filter((a) => typeof a === 'string' && !!skillById(a)).slice(0, 4) : undefined,
      degreeLevel: deg?.[1] ?? (r.type === 'qualification' ? r.degreeLevel : undefined),
      sourceText: truncate(r.sourceText ?? (origin === 'USER' ? 'Added by you' : label), 220),
      confidence: origin === 'USER' ? 1 : Math.min(1, Math.max(0, r.confidence ?? 0.7)),
      included: r.included !== false, explicit: r.origin === 'EXTRACTED' ? r.explicit : undefined, origin,
    } as Omit<Requirement, 'id'>;
  });
  return makeIds(base);
}

/** Highest recognisable degree level in resume text, or null when the text does not state one (never inferred). */
export function degreeLevelOf(text: string): number | null {
  const hit = DEGREE.filter(([re]) => re.test(text)).map(([, lvl]) => lvl);
  return hit.length ? Math.max(...hit) : null;
}
export const DEGREE_NAMES: Record<number, string> = { 1: 'Diploma', 2: "Bachelor's", 3: "Master's", 4: 'Doctorate' };
