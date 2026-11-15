import { BadRequestException } from '@nestjs/common';
import { findSkills, skillById } from '../resume-match/taxonomy';

export const KINDS = ['ACHIEVEMENT', 'PREFERENCE', 'CAREER_BREAK'] as const;
export type FactKind = (typeof KINDS)[number];
/** EXTERNALLY_VERIFIED exists in the model but can only be set by a trusted verification provider with user consent: none is wired, so the API refuses it. */
export const CLIENT_ORIGINS = ['USER_ENTERED', 'IMPORTED', 'AI_REWRITTEN'] as const;
export const WORK_MODES = ['remote', 'hybrid', 'onsite'] as const;

export interface Metric { value: string; unit?: string; label: string; confirmed: boolean }
export interface AchievementData {
  context?: string; action: string; outcome?: string; scope?: string; skills: string[]; metric?: Metric;
  period?: { start?: string; end?: string }; experienceRef?: string;
}
export interface PreferenceData { roles: string[]; locations: string[]; workModes: string[]; notes?: string }
export interface BreakData { start?: string; end?: string; note?: string }

const PARTIAL_DATE = /^\d{4}(-(0[1-9]|1[0-2]))?$/;
const str = (v: unknown, max: number, field: string, errs: string[], required = false): string | undefined => {
  if (v === undefined || v === null || v === '') { if (required) errs.push(`${field} is required`); return undefined; }
  if (typeof v !== 'string') { errs.push(`${field} must be text`); return undefined; }
  const t = v.trim();
  if (!t) { if (required) errs.push(`${field} is required`); return undefined; }
  if (t.length > max) { errs.push(`${field} must be at most ${max} characters`); return undefined; }
  return t;
};
const list = (v: unknown, max: number, itemMax: number, field: string, errs: string[]): string[] => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) { errs.push(`${field} must be a list`); return []; }
  if (v.length > max) errs.push(`${field} can have at most ${max} items`);
  const out: string[] = [];
  for (const x of v.slice(0, max)) { const s = str(x, itemMax, field, errs); if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s); }
  return out;
};
const date = (v: unknown, field: string, errs: string[]): string | undefined => {
  const s = str(v, 7, field, errs); if (!s) return undefined;
  if (!PARTIAL_DATE.test(s)) { errs.push(`${field} must be YYYY or YYYY-MM`); return undefined; }
  return s;
};
const period = (start: string | undefined, end: string | undefined, errs: string[]) => { if (start && end && start > end) errs.push('The end date is before the start date'); };

/** Validate and clean the kind-specific payload. Unknown properties are dropped; every problem is reported at once. */
export function validateFactData(kind: FactKind, raw: unknown): AchievementData | PreferenceData | BreakData {
  const errs: string[] = [];
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  let out: AchievementData | PreferenceData | BreakData;
  if (kind === 'ACHIEVEMENT') {
    const m = d['metric'] as Record<string, unknown> | undefined; let metric: Metric | undefined;
    if (m !== undefined && m !== null) {
      const value = str(m['value'], 40, 'Metric value', errs, true); const label = str(m['label'], 120, 'Metric label', errs, true);
      if (value && label) metric = { value, label, unit: str(m['unit'], 20, 'Metric unit', errs), confirmed: m['confirmed'] === true };
    }
    const start = date((d['period'] as Record<string, unknown> | undefined)?.['start'], 'Start date', errs);
    const end = date((d['period'] as Record<string, unknown> | undefined)?.['end'], 'End date', errs);
    period(start, end, errs);
    out = {
      context: str(d['context'], 500, 'Context', errs), action: str(d['action'], 600, 'What you did', errs, true) ?? '', outcome: str(d['outcome'], 500, 'Outcome', errs),
      scope: str(d['scope'], 300, 'Scope', errs), skills: list(d['skills'], 15, 60, 'Skills', errs), ...(metric ? { metric } : {}),
      ...(start || end ? { period: { start, end } } : {}), experienceRef: str(d['experienceRef'], 150, 'Role or employer', errs),
    };
  } else if (kind === 'PREFERENCE') {
    const modes = list(d['workModes'], 3, 10, 'Work modes', errs).map((x) => x.toLowerCase());
    if (modes.some((x) => !(WORK_MODES as readonly string[]).includes(x))) errs.push('Work modes must be remote, hybrid or onsite');
    out = { roles: list(d['roles'], 10, 80, 'Roles', errs), locations: list(d['locations'], 10, 80, 'Locations', errs), workModes: modes, notes: str(d['notes'], 500, 'Notes', errs) };
  } else {
    const start = date(d['start'], 'Start date', errs); const end = date(d['end'], 'End date', errs); period(start, end, errs);
    out = { start, end, note: str(d['note'], 300, 'Note', errs) };
  }
  if (errs.length) throw new BadRequestException(errs);
  return JSON.parse(JSON.stringify(out)); // drop undefined
}

/** A metric must be confirmed by the candidate before the fact can be CONFIRMED. */
export function metricProblem(kind: FactKind, data: unknown): string | undefined {
  if (kind !== 'ACHIEVEMENT') return undefined;
  const m = (data as AchievementData).metric;
  return m && !m.confirmed ? 'Confirm the number is accurate before confirming this achievement.' : undefined;
}

export function sameMetric(a?: Metric, b?: Metric): boolean { return (a?.value ?? '') === (b?.value ?? '') && (a?.unit ?? '') === (b?.unit ?? '') && (a?.label ?? '') === (b?.label ?? ''); }

const METRIC_RE = /(?:[$£€]\s?\d[\d,.]*\s?[kmb]?|\b\d[\d,.]*\s?(?:%|percent|x)\B|\b\d[\d,.]*\+?\s+(?:years?|users?|customers?|clients?|engineers?|people|projects?|systems?|teams?|requests?)\b)/i;

export interface Draft { title: string; data: AchievementData; missing: string[]; hints: string[] }

/**
 * Deterministic draft from rough text. Nothing is invented: the text becomes "what you did"; a number found in it becomes an
 * UNCONFIRMED metric candidate; skills are only those named in the text. Missing parts are listed so the user can fill them.
 */
export function buildAchievementDraft(text: string, extra: { experienceRef?: string; skills?: string[] } = {}): Draft {
  const action = text.trim().replace(/\s+/g, ' ');
  if (action.length < 8) throw new BadRequestException('Describe what you did in at least a short sentence.');
  const hints: string[] = [];
  const m = METRIC_RE.exec(action);
  const metric: Metric | undefined = m ? { value: m[0].trim(), label: 'Detected in your text', confirmed: false } : undefined;
  if (metric) hints.push(`We found "${metric.value}" in your text. It is only a suggestion until you confirm it is accurate.`);
  const named = findSkills(action).map((h) => skillById(h.id)?.label).filter((x): x is string => !!x);
  const skills = [...new Set([...(extra.skills ?? []), ...named])].slice(0, 15);
  const missing: string[] = ['context', ...(/\b(?:result|resulting|led to|reduced|increased|improved|cut|saved|grew|delivered)\b/i.test(action) ? [] : ['outcome'])];
  if (!extra.experienceRef) missing.push('experienceRef');
  return {
    title: action.length > 80 ? `${action.slice(0, 77)}...` : action,
    data: { action: action.slice(0, 600), skills, ...(metric ? { metric } : {}), ...(extra.experienceRef ? { experienceRef: extra.experienceRef.slice(0, 150) } : {}) },
    missing, hints,
  };
}

export const factText = (d: AchievementData): string => [d.action, d.outcome].filter(Boolean).join('. ');
