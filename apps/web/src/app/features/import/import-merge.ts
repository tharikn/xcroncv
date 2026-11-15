import { CareerProfile, Certification, Education, Experience, LanguageItem, Link, Project, Skill } from '../../core/models';
import { emptyProfile, toProfileInput } from '../../core/profile-mapper';

export type Confidence = 'high' | 'medium' | 'low';

/** Shape returned by POST /resume-imports/parse (suggestions only; nothing has been saved). */
export interface ImportSuggestion {
  fullName?: string; email?: string; phone?: string; location?: string; headline?: string; summary?: string;
  links: Link[];
  experiences: Array<{ employerName: string; jobTitle: string; startDate: string; endDate?: string; isCurrent: boolean; bullets: Array<{ content: string }>; confidence: Confidence }>;
  skills: Array<{ name: string; category?: string }>;
  educations: Array<{ institution: string; degree: string; startDate?: string; endDate?: string; confidence: Confidence }>;
  projects: Array<{ name: string; description?: string; url?: string; confidence: Confidence }>;
  certifications: Array<{ name: string; confidence: Confidence }>;
  languages: Array<{ name: string; proficiency?: string }>;
  sectionsFound: string[]; warnings: string[];
}
export interface ParseResponse { kind: 'pdf' | 'docx'; pages: number | null; suggestion: ImportSuggestion }

export const SCALARS = ['fullName', 'email', 'phone', 'location', 'headline', 'summary'] as const;
export type Scalar = (typeof SCALARS)[number];

/** What the user explicitly confirmed on the review screen. Only these facts can reach the profile. */
export interface Picked {
  scalars: Partial<Record<Scalar, string>>;
  links: Link[]; experiences: Experience[]; skills: Skill[]; educations: Education[];
  projects: Project[]; certifications: Certification[]; languages: LanguageItem[];
}

const k = (...p: Array<string | null | undefined>) => p.map((x) => (x ?? '').trim().toLowerCase()).join('|');

function addUnique<T>(into: T[], items: T[], key: (t: T) => string): number {
  const seen = new Set(into.map(key)); let n = 0;
  for (const i of items) { if (!seen.has(key(i))) { into.push(i); seen.add(key(i)); n++; } }
  return n;
}

export interface MergeResult { profile: CareerProfile; added: number }

/** Merge confirmed items into the existing profile (or a new one). Existing data is never removed; duplicates are skipped. */
export function mergeIntoProfile(existing: CareerProfile | null, picked: Picked): MergeResult {
  const base = existing ? toProfileInput(existing) : emptyProfile();
  const p: CareerProfile = {
    ...base, links: [...(base.links ?? [])], experiences: [...(base.experiences ?? [])], skills: [...(base.skills ?? [])],
    educations: [...(base.educations ?? [])], projects: [...(base.projects ?? [])], certifications: [...(base.certifications ?? [])], languages: [...(base.languages ?? [])],
  };
  let added = 0;
  for (const f of SCALARS) { const v = picked.scalars[f]?.trim(); if (v) { (p as unknown as Record<string, unknown>)[f] = v; added++; } }
  added += addUnique(p.links!, picked.links, (l) => k(l.url));
  added += addUnique(p.experiences!, picked.experiences.map(confirmExp), (e) => k(e.employerName, e.jobTitle, e.startDate));
  added += addUnique(p.skills!, picked.skills, (s) => k(s.name));
  added += addUnique(p.educations!, picked.educations, (e) => k(e.institution, e.degree, e.startDate));
  added += addUnique(p.projects!, picked.projects, (e) => k(e.name));
  added += addUnique(p.certifications!, picked.certifications, (e) => k(e.name));
  added += addUnique(p.languages!, picked.languages, (e) => k(e.name));
  return { profile: toProfileInput(p), added };
}

/** Imported bullets become confirmed only because the user ticked them on the review screen. */
function confirmExp(e: Experience): Experience {
  return { ...e, endDate: e.isCurrent ? null : e.endDate ?? null, bullets: (e.bullets ?? []).filter((b) => b.content.trim()).map((b) => ({ kind: 'RESPONSIBILITY', content: b.content.trim(), isUserConfirmed: true })) };
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Client-side pre-check (the server re-validates by content). Returns an error message or ''. */
export function checkUpload(f: { name: string; size: number }): string {
  if (!/\.(pdf|docx)$/i.test(f.name)) return 'Choose a PDF or DOCX file. Older .doc files must be saved as DOCX first.';
  if (f.size === 0) return 'That file is empty.';
  if (f.size > MAX_UPLOAD_BYTES) return 'That file is larger than 5 MB.';
  return '';
}
