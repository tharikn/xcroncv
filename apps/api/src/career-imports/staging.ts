/**
 * Pure staging logic for external career-data import (doc 43). No I/O: parses structured sources into a field-level
 * staging list, classifies each field against the current profile (new / duplicate / conflict) and plans a merge.
 * Nothing here writes to the profile; the service applies a plan only after explicit confirmation.
 */
import { BadRequestException } from '@nestjs/common';
import { ImportSuggestion, toYearMonth } from '../import-export/resume-parser';

export const PARSER_VERSION = 'career-import-1.0.0';
export const MAX_STRUCTURED_BYTES = 1024 * 1024;
export const MAX_CSV_ROWS = 2000;

export type SourceKind = 'pdf' | 'docx' | 'json' | 'csv';
export type Section = 'profile' | 'link' | 'experience' | 'skill' | 'education' | 'project' | 'certification' | 'language';
export type Confidence = 'high' | 'medium' | 'low';
export type FieldStatus = 'pending' | 'accepted' | 'rejected' | 'merged';
export type Classification = 'new' | 'duplicate' | 'conflict';
export type Choice = 'keep_existing' | 'use_imported' | 'keep_both';
export const CHOICES: Choice[] = ['keep_existing', 'use_imported', 'keep_both'];

export interface StagedField {
  id: string; section: Section; label: string; value: Record<string, any>;
  confidence: Confidence; sourceKind: SourceKind; sourceRef: string; parserVersion: string; importedAt: string; status: FieldStatus;
}
export interface Difference { field: string; existing: string; imported: string }
export interface Conflict { id: string; fieldId: string; section: Section; existing: string; imported: string; differences: Difference[]; choices: Choice[] }
export interface Classified extends StagedField { classification: Classification; conflictId?: string }

export interface ProfileDto {
  fullName?: string; email?: string; phone?: string; location?: string; headline?: string; summary?: string;
  links: Array<{ label: string; url: string }>;
  experiences: Array<{ employerName: string; jobTitle: string; employmentType?: string; location?: string; startDate: string; endDate?: string; isCurrent?: boolean; description?: string; bullets: Array<{ kind?: string; content: string; isUserConfirmed?: boolean }> }>;
  skills: Array<{ name: string; category?: string; proficiency?: string; yearsUsed?: number }>;
  educations: Array<{ institution: string; degree: string; field?: string; startDate?: string; endDate?: string; grade?: string }>;
  projects: Array<{ name: string; url?: string; description?: string; technologies?: string[] }>;
  certifications: Array<{ name: string; issuer?: string; issuedDate?: string; expiryDate?: string }>;
  languages: Array<{ name: string; proficiency?: string }>;
}
export const emptyProfileDto = (): ProfileDto => ({ links: [], experiences: [], skills: [], educations: [], projects: [], certifications: [], languages: [] });

const CAPS = { link: 10, experience: 40, skill: 100, education: 20, project: 30, certification: 30, language: 20 } as const;
const SECTION_KEY: Record<Exclude<Section, 'profile'>, keyof ProfileDto> = {
  link: 'links', experience: 'experiences', skill: 'skills', education: 'educations', project: 'projects', certification: 'certifications', language: 'languages',
};
export const SCALARS = ['fullName', 'email', 'phone', 'location', 'headline', 'summary'] as const;
const SCALAR_MAX: Record<string, number> = { fullName: 150, email: 254, phone: 40, location: 120, headline: 150, summary: 2000 };

/* ------------------------------------------------------------------ helpers */
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const t = String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  return t ? t.slice(0, max) : undefined;
};
const httpUrl = (v: unknown): string | undefined => {
  const t = str(v, 500); if (!t) return undefined;
  const withProto = /^https?:\/\//i.test(t) ? t : /^(www\.|[a-z0-9-]+\.[a-z]{2,}\/)/i.test(t) ? `https://${t}` : '';
  try { const u = new URL(withProto); return u.protocol === 'http:' || u.protocol === 'https:' ? withProto : undefined; } catch { return undefined; }
};
const urlKey = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
const bool = (v: unknown) => v === true || /^(true|yes|1|y|current|present)$/i.test(String(v ?? '').trim());

export function labelFor(section: Section, v: Record<string, any>): string {
  switch (section) {
    case 'profile': return `${v.field}: ${String(v.value).slice(0, 60)}`;
    case 'link': return `${v.label || 'Link'}: ${v.url}`;
    case 'experience': return `${v.jobTitle} at ${v.employerName}`;
    case 'skill': return v.name;
    case 'education': return `${v.degree}, ${v.institution}`;
    case 'project': return v.name;
    case 'certification': return v.name;
    case 'language': return v.name;
  }
}

/* ------------------------------------------------------------------ structured sources -> ImportSuggestion */
type Warn = (m: string) => void;
function dateOf(v: unknown, what: string, warn: Warn): string | undefined {
  const t = str(v, 30); if (!t) return undefined;
  const d = toYearMonth(t.replace(/^(\d{4}-\d{2})-\d{2}.*$/, '$1'));
  if (!d) warn(`A ${what} was not understood and was left blank.`);
  return d;
}
const arr = (v: unknown, cap: number, what: string, warn: Warn): unknown[] => {
  if (v == null) return [];
  if (!Array.isArray(v)) { warn(`"${what}" should be a list and was ignored.`); return []; }
  if (v.length > cap) warn(`Only the first ${cap} ${what} were read.`);
  return v.slice(0, cap);
};
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});

function emptySuggestion(): ImportSuggestion {
  return { links: [], experiences: [], skills: [], educations: [], projects: [], certifications: [], languages: [], sectionsFound: [], warnings: [] };
}

function bulletsOf(v: unknown, warn: Warn): Array<{ content: string }> {
  return arr(v, 30, 'bullets', warn).map((b) => str(b, 600)).filter((x): x is string => !!x).map((content) => ({ content }));
}

/** JSON in the platform's own profile shape, or the open JSON Resume schema (basics/work/education/...). */
export function jsonToSuggestion(text: string): ImportSuggestion {
  if (Buffer.byteLength(text) > MAX_STRUCTURED_BYTES) throw new BadRequestException('That file is larger than 1 MB.');
  let raw: unknown;
  try { raw = JSON.parse(text.replace(/^﻿/, '')); } catch { throw new BadRequestException('That is not valid JSON.'); }
  const o = obj(raw);
  if (!Object.keys(o).length) throw new BadRequestException('The JSON file does not contain a profile object.');
  const s = emptySuggestion(); const warn: Warn = (m) => s.warnings.push(m);
  const jr = 'basics' in o || 'work' in o || 'certificates' in o;
  const b = obj(o.basics);
  const loc = obj(b.location);
  if (jr) {
    s.fullName = str(b.name, 150); s.email = str(b.email, 254); s.phone = str(b.phone, 40); s.headline = str(b.label, 150); s.summary = str(b.summary, 2000);
    s.location = str([loc.city, loc.region, loc.countryCode].filter(Boolean).join(', '), 120);
    const urls = [{ label: 'Website', url: httpUrl(b.url) }, ...arr(b.profiles, 10, 'profiles', warn).map((p) => ({ label: str(obj(p).network, 60) ?? 'Profile', url: httpUrl(obj(p).url) }))];
    for (const l of urls) if (l.url) s.links.push({ label: l.label, url: l.url });
  } else {
    s.fullName = str(o.fullName, 150); s.email = str(o.email, 254); s.phone = str(o.phone, 40); s.location = str(o.location, 120);
    s.headline = str(o.headline, 150); s.summary = str(o.summary, 2000);
    for (const l of arr(o.links, 10, 'links', warn)) { const url = httpUrl(obj(l).url); if (url) s.links.push({ label: str(obj(l).label, 60) ?? 'Link', url }); else warn('A link without a valid web address was skipped.'); }
  }
  const exps = jr ? arr(o.work, 40, 'jobs', warn) : arr(o.experiences, 40, 'jobs', warn);
  for (const e0 of exps) {
    const e = obj(e0);
    const employerName = str(jr ? e.name : e.employerName, 150); const jobTitle = str(jr ? e.position : e.jobTitle, 150);
    const startDate = dateOf(e.startDate, 'start date', warn);
    if (!employerName || !jobTitle || !startDate) { warn('A job needs an employer, a title and a start date; one entry was skipped.'); continue; }
    const endDate = dateOf(e.endDate, 'end date', warn);
    const isCurrent = !endDate && (e.isCurrent === true || (jr && !e.endDate));
    const bullets = bulletsOf(jr ? e.highlights : (Array.isArray(e.bullets) ? e.bullets.map((x: any) => (typeof x === 'string' ? x : x?.content)) : []), warn);
    s.experiences.push({ employerName, jobTitle, startDate, endDate, isCurrent, location: str(e.location, 120), bullets, confidence: 'high' });
  }
  const skills = arr(o.skills, 100, 'skills', warn);
  for (const k of skills) {
    if (typeof k === 'string') { const name = str(k, 80); if (name) s.skills.push({ name }); continue; }
    const ko = obj(k);
    if (jr && Array.isArray(ko.keywords)) { for (const kw of ko.keywords.slice(0, 30)) { const name = str(kw, 80); if (name) s.skills.push({ name, category: str(ko.name, 60) }); } }
    else { const name = str(ko.name, 80); if (name) s.skills.push({ name, category: str(ko.category, 60) }); }
  }
  s.skills = s.skills.slice(0, 100);
  for (const e0 of arr(jr ? o.education : o.educations, 20, 'education entries', warn)) {
    const e = obj(e0); const institution = str(jr ? e.institution : e.institution, 150); const degree = str(jr ? e.studyType : e.degree, 150);
    if (!institution || !degree) { warn('An education entry needs an institution and a degree; one was skipped.'); continue; }
    s.educations.push({ institution, degree, field: str(jr ? e.area : e.field, 150), startDate: dateOf(e.startDate, 'start date', warn), endDate: dateOf(e.endDate, 'end date', warn), confidence: 'high' });
  }
  for (const p0 of arr(o.projects, 30, 'projects', warn)) {
    const p = obj(p0); const name = str(p.name, 150); if (!name) { warn('A project without a name was skipped.'); continue; }
    s.projects.push({ name, description: str(p.description, 1000), url: httpUrl(p.url), confidence: 'high' });
  }
  for (const c0 of arr(jr ? o.certificates : o.certifications, 30, 'certifications', warn)) {
    const name = str(obj(c0).name, 150); if (!name) { warn('A certification without a name was skipped.'); continue; }
    const issuer = str(obj(c0).issuer, 150);
    s.certifications.push({ name, confidence: 'high', ...(issuer ? { issuer } : {}) } as ImportSuggestion['certifications'][number]);
  }
  for (const l0 of arr(o.languages, 20, 'languages', warn)) {
    const l = obj(l0); const name = str(jr ? l.language : l.name, 60); if (!name) continue;
    s.languages.push({ name, proficiency: str(jr ? l.fluency : l.proficiency, 40) });
  }
  return finish(s);
}

/** Minimal RFC 4180 reader (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"' && cur === '') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; if (rows.length > MAX_CSV_ROWS + 1) throw new BadRequestException(`The CSV has more than ${MAX_CSV_ROWS} rows.`); }
    else cur += c;
  }
  if (q) throw new BadRequestException('The CSV has an unclosed quote.');
  row.push(cur); if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

/** CSV with a `type` column: profile | experience | education | skill | project | certification | language | link. */
export function csvToSuggestion(text: string): ImportSuggestion {
  if (Buffer.byteLength(text) > MAX_STRUCTURED_BYTES) throw new BadRequestException('That file is larger than 1 MB.');
  const rows = parseCsv(text);
  if (rows.length < 2) throw new BadRequestException('The CSV needs a header row and at least one data row.');
  const head = rows[0].map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const ti = head.indexOf('type');
  if (ti < 0) throw new BadRequestException('The CSV needs a "type" column (experience, education, skill, project, certification, language, link or profile).');
  const s = emptySuggestion(); const warn: Warn = (m) => s.warnings.push(m);
  const rowWarn = (n: number, m: string) => warn(`Row ${n}: ${m}`);
  rows.slice(1).forEach((r, idx) => {
    const n = idx + 2; const g = (col: string, max = 600) => { const i = head.indexOf(col); return i >= 0 ? str(r[i], max) : undefined; };
    const type = (g('type', 30) ?? '').toLowerCase();
    const w = (m: string) => rowWarn(n, m);
    switch (type) {
      case 'profile':
        for (const f of SCALARS) { const v = g(f.toLowerCase(), SCALAR_MAX[f]); if (v) (s as any)[f] = v; }
        break;
      case 'experience': {
        const employerName = g('employername', 150); const jobTitle = g('jobtitle', 150); const startDate = dateOf(g('startdate', 30), 'start date', w);
        if (!employerName || !jobTitle || !startDate) { w('a job needs employerName, jobTitle and a startDate; skipped.'); break; }
        const endDate = dateOf(g('enddate', 30), 'end date', w); const cur = bool(g('iscurrent', 10));
        const bullets = (g('bullets', 4000) ?? '').split('|').map((b) => str(b, 600)).filter((x): x is string => !!x).slice(0, 30).map((content) => ({ content }));
        s.experiences.push({ employerName, jobTitle, startDate, endDate, isCurrent: cur && !endDate, location: g('location', 120), bullets, confidence: 'high' });
        break;
      }
      case 'education': {
        const institution = g('institution', 150); const degree = g('degree', 150);
        if (!institution || !degree) { w('education needs institution and degree; skipped.'); break; }
        s.educations.push({ institution, degree, field: g('field', 150), startDate: dateOf(g('startdate', 30), 'start date', w), endDate: dateOf(g('enddate', 30), 'end date', w), confidence: 'high' });
        break;
      }
      case 'skill': { const name = g('name', 80); if (name) s.skills.push({ name, category: g('category', 60) }); else w('a skill needs a name; skipped.'); break; }
      case 'project': { const name = g('name', 150); if (name) s.projects.push({ name, description: g('description', 1000), url: httpUrl(g('url', 500)), confidence: 'high' }); else w('a project needs a name; skipped.'); break; }
      case 'certification': { const name = g('name', 150); if (name) s.certifications.push({ name, confidence: 'high', ...(g('issuer', 150) ? { issuer: g('issuer', 150) } : {}) } as ImportSuggestion['certifications'][number]); else w('a certification needs a name; skipped.'); break; }
      case 'language': { const name = g('name', 60); if (name) s.languages.push({ name, proficiency: g('proficiency', 40) }); else w('a language needs a name; skipped.'); break; }
      case 'link': { const url = httpUrl(g('url', 500)); if (url) s.links.push({ label: g('label', 60) ?? 'Link', url }); else w('a link needs a valid web address; skipped.'); break; }
      default: w('unknown type; skipped.');
    }
  });
  return finish(s);
}

function finish(s: ImportSuggestion): ImportSuggestion {
  const found: string[] = [];
  if (SCALARS.some((f) => (s as any)[f])) found.push('profile');
  for (const [k, n] of [['links', s.links], ['experience', s.experiences], ['skills', s.skills], ['education', s.educations], ['projects', s.projects], ['certifications', s.certifications], ['languages', s.languages]] as const) if (n.length) found.push(k);
  s.sectionsFound = found;
  if (!found.length) throw new BadRequestException('Nothing importable was found in that file.');
  return s;
}

/* ------------------------------------------------------------------ suggestion -> staged fields */
export function toFields(s: ImportSuggestion, sourceKind: SourceKind, now: string): StagedField[] {
  const out: StagedField[] = []; let n = 0;
  const add = (section: Section, value: Record<string, any>, confidence: Confidence, ref: string) => {
    out.push({ id: `f${++n}`, section, label: labelFor(section, value), value, confidence, sourceKind, sourceRef: ref, parserVersion: PARSER_VERSION, importedAt: now, status: 'pending' });
  };
  const conf = sourceKind === 'json' || sourceKind === 'csv' ? 'high' : 'medium';
  for (const f of SCALARS) { const v = (s as any)[f]; if (v) add('profile', { field: f, value: String(v).slice(0, SCALAR_MAX[f]) }, conf, `Profile › ${f}`); }
  s.links.forEach((l, i) => add('link', { label: l.label, url: l.url }, conf, `Links #${i + 1}`));
  s.experiences.forEach((e, i) => add('experience', {
    employerName: e.employerName, jobTitle: e.jobTitle, startDate: e.startDate, ...(e.endDate ? { endDate: e.endDate } : {}), isCurrent: !!e.isCurrent,
    ...(e.location ? { location: e.location } : {}), bullets: e.bullets.map((b) => ({ content: b.content })),
  }, e.confidence, `Experience #${i + 1}`));
  s.skills.forEach((k, i) => add('skill', { name: k.name, ...(k.category ? { category: k.category } : {}) }, conf, `Skills #${i + 1}`));
  s.educations.forEach((e, i) => add('education', { institution: e.institution, degree: e.degree, ...(e.field ? { field: e.field } : {}), ...(e.startDate ? { startDate: e.startDate } : {}), ...(e.endDate ? { endDate: e.endDate } : {}) }, e.confidence, `Education #${i + 1}`));
  s.projects.forEach((p, i) => add('project', { name: p.name, ...(p.description ? { description: p.description } : {}), ...(p.url ? { url: p.url } : {}) }, p.confidence, `Projects #${i + 1}`));
  s.certifications.forEach((c: any, i) => add('certification', { name: c.name, ...(c.issuer ? { issuer: c.issuer } : {}) }, c.confidence, `Certifications #${i + 1}`));
  s.languages.forEach((l, i) => add('language', { name: l.name, ...(l.proficiency ? { proficiency: l.proficiency } : {}) }, conf, `Languages #${i + 1}`));
  return out;
}

/* ------------------------------------------------------------------ classification against the current profile */
interface Match { kind: Classification; index?: number; differences: Difference[] }
const d = (field: string, a: unknown, b: unknown): Difference => ({ field, existing: String(a ?? '') || '(empty)', imported: String(b ?? '') || '(empty)' });
const sameOrMissing = (a: unknown, b: unknown) => !a || !b || norm(a) === norm(b);

function endText(e: { endDate?: string | null; isCurrent?: boolean | null }) { return e.isCurrent ? 'present' : e.endDate ?? ''; }

export function matchField(f: StagedField, p: ProfileDto): Match {
  const v = f.value;
  switch (f.section) {
    case 'profile': {
      const cur = (p as any)[v.field] as string | undefined;
      if (!cur || !cur.trim()) return { kind: 'new', differences: [] };
      return norm(cur) === norm(v.value) ? { kind: 'duplicate', differences: [] } : { kind: 'conflict', differences: [d(v.field, cur, v.value)] };
    }
    case 'link': return p.links.some((l) => urlKey(l.url) === urlKey(v.url)) ? { kind: 'duplicate', differences: [] } : { kind: 'new', differences: [] };
    case 'skill': return p.skills.some((k) => norm(k.name) === norm(v.name)) ? { kind: 'duplicate', differences: [] } : { kind: 'new', differences: [] };
    case 'experience': {
      const idx = p.experiences.findIndex((e) => norm(e.employerName) === norm(v.employerName) && (norm(e.jobTitle) === norm(v.jobTitle) || e.startDate === v.startDate));
      if (idx < 0) return { kind: 'new', differences: [] };
      const e = p.experiences[idx]; const diffs: Difference[] = [];
      if (norm(e.jobTitle) !== norm(v.jobTitle)) diffs.push(d('jobTitle', e.jobTitle, v.jobTitle));
      if (e.startDate !== v.startDate) diffs.push(d('startDate', e.startDate, v.startDate));
      if (v.endDate || v.isCurrent) { if (endText(e) !== endText(v)) diffs.push(d('endDate', endText(e), endText(v))); }
      return diffs.length ? { kind: 'conflict', index: idx, differences: diffs } : { kind: 'duplicate', index: idx, differences: [] };
    }
    case 'education': {
      const idx = p.educations.findIndex((e) => norm(e.institution) === norm(v.institution) && norm(e.degree) === norm(v.degree));
      if (idx < 0) return { kind: 'new', differences: [] };
      const e = p.educations[idx]; const diffs: Difference[] = [];
      if (e.startDate && v.startDate && e.startDate !== v.startDate) diffs.push(d('startDate', e.startDate, v.startDate));
      if (e.endDate && v.endDate && e.endDate !== v.endDate) diffs.push(d('endDate', e.endDate, v.endDate));
      if (!sameOrMissing(e.field, v.field)) diffs.push(d('field', e.field, v.field));
      return diffs.length ? { kind: 'conflict', index: idx, differences: diffs } : { kind: 'duplicate', index: idx, differences: [] };
    }
    case 'project': {
      const idx = p.projects.findIndex((x) => norm(x.name) === norm(v.name));
      if (idx < 0) return { kind: 'new', differences: [] };
      const e = p.projects[idx];
      return !e.url || !v.url || urlKey(e.url) === urlKey(v.url) ? { kind: 'duplicate', index: idx, differences: [] } : { kind: 'conflict', index: idx, differences: [d('url', e.url, v.url)] };
    }
    case 'certification': {
      const idx = p.certifications.findIndex((x) => norm(x.name) === norm(v.name));
      if (idx < 0) return { kind: 'new', differences: [] };
      return sameOrMissing(p.certifications[idx].issuer, v.issuer) ? { kind: 'duplicate', index: idx, differences: [] } : { kind: 'conflict', index: idx, differences: [d('issuer', p.certifications[idx].issuer, v.issuer)] };
    }
    case 'language': {
      const idx = p.languages.findIndex((x) => norm(x.name) === norm(v.name));
      if (idx < 0) return { kind: 'new', differences: [] };
      return sameOrMissing(p.languages[idx].proficiency, v.proficiency) ? { kind: 'duplicate', index: idx, differences: [] } : { kind: 'conflict', index: idx, differences: [d('proficiency', p.languages[idx].proficiency, v.proficiency)] };
    }
  }
}

function describeExisting(f: StagedField, p: ProfileDto, m: Match): string {
  if (f.section === 'profile') return String((p as any)[f.value.field] ?? '');
  if (m.index == null) return '';
  const key = SECTION_KEY[f.section as Exclude<Section, 'profile'>];
  return labelFor(f.section, (p as any)[key][m.index]);
}

export function classify(fields: StagedField[], profile: ProfileDto | null): { fields: Classified[]; conflicts: Conflict[] } {
  const p = profile ?? emptyProfileDto(); const conflicts: Conflict[] = [];
  const out = fields.map((f): Classified => {
    const m = matchField(f, p);
    if (m.kind !== 'conflict') return { ...f, classification: m.kind };
    const c: Conflict = {
      id: `c-${f.id}`, fieldId: f.id, section: f.section, existing: describeExisting(f, p, m), imported: f.label, differences: m.differences,
      choices: f.section === 'profile' ? ['keep_existing', 'use_imported'] : CHOICES,
    };
    conflicts.push(c);
    return { ...f, classification: 'conflict', conflictId: c.id };
  });
  return { fields: out, conflicts };
}

/* ------------------------------------------------------------------ merge planning */
export interface Change { fieldId: string; section: Section; label: string; action: 'add' | 'replace' | 'skip'; reason?: string }
export interface MergePlan { profile: ProfileDto; changes: Change[]; unresolved: string[]; error?: string }

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const confirmedBullets = (b: Array<{ content: string }>) => b.map((x) => ({ kind: 'RESPONSIBILITY', content: x.content, isUserConfirmed: true }));

export function planMerge(current: ProfileDto | null, fields: StagedField[], decisions: Record<string, Choice>): MergePlan {
  const p = clone(current ?? emptyProfileDto()); const changes: Change[] = []; const unresolved: string[] = [];
  const base = clone(p); // classification is always computed against the profile as it was before this merge
  for (const f of fields.filter((x) => x.status === 'accepted')) {
    const m = matchField(f, base);
    const push = (action: Change['action'], reason?: string) => changes.push({ fieldId: f.id, section: f.section, label: f.label, action, ...(reason ? { reason } : {}) });
    if (m.kind === 'duplicate') { push('skip', 'Already in your profile'); continue; }
    let choice: Choice | undefined;
    if (m.kind === 'conflict') {
      choice = decisions[`c-${f.id}`];
      if (!choice) { unresolved.push(`c-${f.id}`); continue; }
      if (choice === 'keep_existing') { push('skip', 'You kept the existing value'); continue; }
    }
    if (f.section === 'profile') { (p as any)[f.value.field] = f.value.value; push(m.kind === 'conflict' ? 'replace' : 'add'); continue; }
    const key = SECTION_KEY[f.section];
    const list = (p as any)[key] as any[];
    if (choice === 'use_imported' && m.index != null) {
      const cur = list[m.index];
      if (f.section === 'experience') {
        Object.assign(cur, { jobTitle: f.value.jobTitle, startDate: f.value.startDate, location: f.value.location ?? cur.location });
        if (f.value.endDate || f.value.isCurrent) { cur.endDate = f.value.isCurrent ? undefined : f.value.endDate; cur.isCurrent = !!f.value.isCurrent; }
        const have = new Set((cur.bullets ?? []).map((b: any) => norm(b.content)));
        cur.bullets = [...(cur.bullets ?? []), ...confirmedBullets(f.value.bullets ?? []).filter((b) => !have.has(norm(b.content)))].slice(0, 30);
      } else Object.assign(cur, clone(f.value));
      push('replace'); continue;
    }
    if (list.length >= CAPS[f.section]) { push('skip', `Your profile already has the maximum number of ${key}`); continue; }
    list.push(f.section === 'experience' ? { ...clone(f.value), bullets: confirmedBullets(f.value.bullets ?? []) } : clone(f.value));
    push('add');
  }
  if (!unresolved.length && !p.fullName?.trim() && changes.length) return { profile: p, changes, unresolved, error: 'Your profile needs a full name. Accept the imported name or add one in your profile first.' };
  return { profile: p, changes, unresolved };
}

export const countBy = <T extends { classification?: string; status?: string }>(xs: T[], k: 'classification' | 'status') => xs.reduce<Record<string, number>>((a, x) => { const v = String((x as any)[k]); a[v] = (a[v] ?? 0) + 1; return a; }, {});
