import { CareerProfile } from './models';

const nn = <T>(v: T | null | undefined): T | undefined => (v === null || v === '' ? undefined : v);

/**
 * The API stores server fields (id, profileId, displayOrder, ...) and rejects unknown properties on PUT
 * (forbidNonWhitelisted). Convert any profile shape into the exact DTO the API accepts.
 */
export function toProfileInput(p: CareerProfile): CareerProfile {
  return {
    fullName: p.fullName.trim(),
    email: nn(p.email), phone: nn(p.phone), location: nn(p.location), headline: nn(p.headline), summary: nn(p.summary),
    links: (p.links ?? []).filter((l) => l.label && l.url).map((l) => ({ label: l.label, url: l.url })),
    experiences: (p.experiences ?? []).map((e) => ({
      employerName: e.employerName, jobTitle: e.jobTitle, employmentType: nn(e.employmentType), location: nn(e.location),
      startDate: e.startDate, endDate: e.isCurrent ? undefined : nn(e.endDate), isCurrent: !!e.isCurrent, description: nn(e.description),
      bullets: (e.bullets ?? []).filter((b) => b.content.trim()).map((b) => ({
        kind: b.kind ?? 'RESPONSIBILITY', content: b.content.trim(), isUserConfirmed: b.isUserConfirmed ?? true,
      })),
    })),
    skills: (p.skills ?? []).filter((s) => s.name.trim()).map((s) => ({
      name: s.name.trim(), category: nn(s.category), proficiency: nn(s.proficiency), yearsUsed: nn(s.yearsUsed),
    })),
    educations: (p.educations ?? []).map((e) => ({
      institution: e.institution, degree: e.degree, field: nn(e.field), startDate: nn(e.startDate), endDate: nn(e.endDate), grade: nn(e.grade),
    })),
    projects: (p.projects ?? []).map((x) => ({
      name: x.name, url: nn(x.url), description: nn(x.description), technologies: (x.technologies ?? []).filter(Boolean),
    })),
    certifications: (p.certifications ?? []).map((c) => ({
      name: c.name, issuer: nn(c.issuer), issuedDate: nn(c.issuedDate), expiryDate: nn(c.expiryDate),
    })),
    languages: (p.languages ?? []).map((l) => ({ name: l.name, proficiency: nn(l.proficiency) })),
  };
}

/** Client-side validation for usability; the API remains authoritative. Returns human-readable errors. */
export function validateProfile(p: CareerProfile): string[] {
  const errs: string[] = [];
  if (!p.fullName?.trim()) errs.push('Full name is required.');
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) errs.push('Email address looks invalid.');
  (p.links ?? []).forEach((l, i) => {
    if ((l.label || l.url) && !/^https?:\/\/\S+$/i.test(l.url ?? '')) errs.push(`Link ${i + 1}: URL must start with http:// or https://.`);
  });
  (p.experiences ?? []).forEach((e, i) => {
    const n = `Experience ${i + 1}`;
    if (!e.employerName?.trim() || !e.jobTitle?.trim()) errs.push(`${n}: employer and job title are required.`);
    if (!e.startDate || !YM_PATTERN.test(e.startDate)) errs.push(`${n}: start date must be YYYY-MM.`);
    if (!e.isCurrent && e.endDate && !YM_PATTERN.test(e.endDate)) errs.push(`${n}: end date must be YYYY-MM.`);
    if (!e.isCurrent && e.endDate && e.startDate && e.endDate < e.startDate) errs.push(`${n}: end date is before start date.`);
  });
  (p.educations ?? []).forEach((e, i) => {
    if (!e.institution?.trim() || !e.degree?.trim()) errs.push(`Education ${i + 1}: institution and degree are required.`);
    if (!isYearMonth(e.startDate) || !isYearMonth(e.endDate)) errs.push(`Education ${i + 1}: dates must be YYYY-MM.`);
  });
  (p.projects ?? []).forEach((x, i) => {
    if (!x.name?.trim()) errs.push(`Project ${i + 1}: name is required.`);
    if (x.url && !/^https?:\/\/\S+$/i.test(x.url)) errs.push(`Project ${i + 1}: URL must start with http:// or https://.`);
  });
  (p.certifications ?? []).forEach((c, i) => {
    if (!c.name?.trim()) errs.push(`Certification ${i + 1}: name is required.`);
    if (!isYearMonth(c.issuedDate) || !isYearMonth(c.expiryDate)) errs.push(`Certification ${i + 1}: dates must be YYYY-MM.`);
  });
  (p.languages ?? []).forEach((l, i) => { if (!l.name?.trim()) errs.push(`Language ${i + 1}: name is required.`); });
  return errs;
}

export const YM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export function isYearMonth(v: string | null | undefined): boolean { return !v || YM_PATTERN.test(v); }

export function emptyProfile(): CareerProfile {
  return { fullName: '', links: [], experiences: [], skills: [], educations: [], projects: [], certifications: [], languages: [] };
}

/** Move an item within an array (accessible alternative to drag-and-drop). Returns a new array. */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length || from === to) return arr;
  const copy = [...arr];
  const [x] = copy.splice(from, 1);
  copy.splice(to, 0, x);
  return copy;
}
