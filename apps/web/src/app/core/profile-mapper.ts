import { CareerProfile, Education } from './models';

const nn = <T>(v: T | null | undefined): T | undefined => (v === null || v === '' ? undefined : v);

/** An education row the user has not filled in at all (e.g. an accidentally added blank row). */
export function isBlankEducation(e: Education): boolean {
  return !(e.institution ?? '').trim() && !(e.degree ?? '').trim() && !(e.field ?? '').trim()
    && !(e.startDate ?? '').trim() && !(e.endDate ?? '').trim() && !(e.grade ?? '').trim();
}

export const YM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const URL_PATTERN = /^https?:\/\/\S+$/i;
export const PHONE_PATTERN = /^[+\d\s().-]{7,40}$/;

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
    educations: (p.educations ?? []).filter((e) => !isBlankEducation(e)).map((e) => ({
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
  else if (p.fullName.trim().length > 150) errs.push('Full name must be 150 characters or fewer.');
  if (p.headline && p.headline.trim().length > 150) errs.push('Headline must be 150 characters or fewer.');
  if (p.email && !EMAIL_PATTERN.test(p.email.trim())) errs.push('Email address looks invalid.');
  if (p.phone && !PHONE_PATTERN.test(p.phone.trim())) errs.push('Phone number looks invalid.');
  if (p.location && p.location.trim().length > 120) errs.push('Location must be 120 characters or fewer.');
  if (p.summary && p.summary.trim().length > 2000) errs.push('Summary must be 2000 characters or fewer.');
  (p.links ?? []).forEach((l, i) => {
    const n = `Link ${i + 1}`;
    if (l.label && l.label.trim().length > 60) errs.push(`${n}: label must be 60 characters or fewer.`);
    if (l.url && !URL_PATTERN.test(l.url.trim())) errs.push(`${n}: URL must start with http:// or https://.`);
    if ((l.label || l.url) && !l.label?.trim()) errs.push(`${n}: label is required.`);
    if ((l.label || l.url) && !l.url?.trim()) errs.push(`${n}: URL is required.`);
  });
  (p.experiences ?? []).forEach((e, i) => {
    const n = `Experience ${i + 1}`;
    if (!e.employerName?.trim() || !e.jobTitle?.trim()) errs.push(`${n}: employer and job title are required.`);
    if (e.employerName && e.employerName.trim().length > 150) errs.push(`${n}: employer must be 150 characters or fewer.`);
    if (e.jobTitle && e.jobTitle.trim().length > 150) errs.push(`${n}: job title must be 150 characters or fewer.`);
    if (e.location && e.location.trim().length > 120) errs.push(`${n}: location must be 120 characters or fewer.`);
    if (e.description && e.description.trim().length > 1500) errs.push(`${n}: description must be 1500 characters or fewer.`);
    if (e.employmentType && e.employmentType.trim().length > 50) errs.push(`${n}: employment type must be 50 characters or fewer.`);
    if (!e.startDate || !YM_PATTERN.test(e.startDate)) errs.push(`${n}: start date must be YYYY-MM.`);
    if (!e.isCurrent && e.endDate && !YM_PATTERN.test(e.endDate)) errs.push(`${n}: end date must be YYYY-MM.`);
    if (!e.isCurrent && e.endDate && e.startDate && YM_PATTERN.test(e.startDate) && YM_PATTERN.test(e.endDate) && e.endDate < e.startDate) errs.push(`${n}: end date is before start date.`);
    (e.bullets ?? []).forEach((b, bi) => {
      if (b.content && b.content.trim().length > 600) errs.push(`${n}: bullet ${bi + 1} must be 600 characters or fewer.`);
    });
  });
  (p.educations ?? []).forEach((e, i) => {
    const n = `Education ${i + 1}`;
    if (!e.institution?.trim() || !e.degree?.trim()) errs.push(`${n}: institution and degree are required.`);
    if (e.institution && e.institution.trim().length > 150) errs.push(`${n}: institution must be 150 characters or fewer.`);
    if (e.degree && e.degree.trim().length > 150) errs.push(`${n}: degree must be 150 characters or fewer.`);
    if (e.field && e.field.trim().length > 150) errs.push(`${n}: field must be 150 characters or fewer.`);
    if (e.grade && e.grade.trim().length > 40) errs.push(`${n}: grade must be 40 characters or fewer.`);
    if (!isYearMonth(e.startDate) || !isYearMonth(e.endDate)) errs.push(`${n}: dates must be YYYY-MM.`);
    if (e.startDate && e.endDate && isYearMonth(e.startDate) && isYearMonth(e.endDate) && e.endDate < e.startDate) errs.push(`${n}: end date is before start date.`);
  });
  (p.projects ?? []).forEach((x, i) => {
    const n = `Project ${i + 1}`;
    if (!x.name?.trim()) errs.push(`${n}: name is required.`);
    if (x.name && x.name.trim().length > 150) errs.push(`${n}: name must be 150 characters or fewer.`);
    if (x.url && !URL_PATTERN.test(x.url.trim())) errs.push(`${n}: URL must start with http:// or https://.`);
    if (x.description && x.description.trim().length > 1000) errs.push(`${n}: description must be 1000 characters or fewer.`);
    (x.technologies ?? []).forEach((t) => {
      if (t && t.trim().length > 60) errs.push(`${n}: technology must be 60 characters or fewer.`);
    });
  });
  (p.certifications ?? []).forEach((c, i) => {
    const n = `Certification ${i + 1}`;
    if (!c.name?.trim()) errs.push(`${n}: name is required.`);
    if (c.name && c.name.trim().length > 150) errs.push(`${n}: name must be 150 characters or fewer.`);
    if (c.issuer && c.issuer.trim().length > 150) errs.push(`${n}: issuer must be 150 characters or fewer.`);
    if (!isYearMonth(c.issuedDate) || !isYearMonth(c.expiryDate)) errs.push(`${n}: dates must be YYYY-MM.`);
    if (c.issuedDate && c.expiryDate && isYearMonth(c.issuedDate) && isYearMonth(c.expiryDate) && c.expiryDate < c.issuedDate) errs.push(`${n}: expiry date is before issued date.`);
  });
  (p.skills ?? []).forEach((s, i) => {
    const n = `Skill ${i + 1}`;
    if (!s.name?.trim()) errs.push(`${n}: name is required.`);
    if (s.name && s.name.trim().length > 80) errs.push(`${n}: name must be 80 characters or fewer.`);
    if (s.category && s.category.trim().length > 60) errs.push(`${n}: category must be 60 characters or fewer.`);
    if (s.proficiency && s.proficiency.trim().length > 40) errs.push(`${n}: proficiency must be 40 characters or fewer.`);
    if (s.yearsUsed != null && (s.yearsUsed < 0 || !Number.isInteger(s.yearsUsed))) errs.push(`${n}: years used must be a non-negative integer.`);
  });
  (p.languages ?? []).forEach((l, i) => {
    const n = `Language ${i + 1}`;
    if (!l.name?.trim()) errs.push(`${n}: name is required.`);
    if (l.name && l.name.trim().length > 60) errs.push(`${n}: name must be 60 characters or fewer.`);
    if (l.proficiency && l.proficiency.trim().length > 40) errs.push(`${n}: proficiency must be 40 characters or fewer.`);
  });
  return errs;
}

/**
 * Strict validation used by the /profile form, where every visible field is mandatory.
 * Every sub-field the user can see must be filled in and within its min/max length; empty
 * education rows are ignored so a stray blank row can never block saving.
 *
 * Kept separate from `validateProfile` because the import/AI review screens legitimately build
 * partial profiles from a document and must still be able to save what the user ticked.
 */
export function validateProfileFull(p: CareerProfile): string[] {
  const errs: string[] = [];
  const text = (value: string | null | undefined, name: string, min: number, max: number) => {
    const v = (value ?? '').trim();
    if (!v) { errs.push(`${name} is required.`); return; }
    if (v.length < min) errs.push(`${name} must be at least ${min} characters.`);
    else if (v.length > max) errs.push(`${name} must be ${max} characters or fewer.`);
  };

  text(p.fullName, 'Full name', 2, 150);
  text(p.headline, 'Headline', 3, 150);
  if (!p.email?.trim()) errs.push('Email is required.');
  else if (!EMAIL_PATTERN.test(p.email.trim())) errs.push('Email address looks invalid.');
  else if (p.email.trim().length > 254) errs.push('Email must be 254 characters or fewer.');
  if (!p.phone?.trim()) errs.push('Phone is required.');
  else if (!PHONE_PATTERN.test(p.phone.trim())) errs.push('Phone number looks invalid.');
  text(p.location, 'Location', 2, 120);
  text(p.summary, 'Summary', 10, 2000);

  (p.links ?? []).forEach((l, i) => {
    const n = `Link ${i + 1}`;
    text(l.label, `${n}: label`, 2, 60);
    if (!l.url?.trim()) errs.push(`${n}: URL is required.`);
    else if (!URL_PATTERN.test(l.url.trim())) errs.push(`${n}: URL must start with http:// or https://.`);
    else if (l.url.trim().length > 500) errs.push(`${n}: URL must be 500 characters or fewer.`);
  });

  (p.experiences ?? []).forEach((e, i) => {
    const n = `Experience ${i + 1}`;
    text(e.employerName, `${n}: employer`, 2, 150);
    text(e.jobTitle, `${n}: job title`, 2, 150);
    text(e.location, `${n}: location`, 2, 120);
    if (!e.startDate) errs.push(`${n}: start date is required.`);
    else if (!YM_PATTERN.test(e.startDate)) errs.push(`${n}: start date must be YYYY-MM.`);
    if (!e.isCurrent) {
      if (!e.endDate) errs.push(`${n}: end date is required (or mark the role as current).`);
      else if (!YM_PATTERN.test(e.endDate)) errs.push(`${n}: end date must be YYYY-MM.`);
      else if (e.startDate && YM_PATTERN.test(e.startDate) && e.endDate < e.startDate) errs.push(`${n}: end date is before start date.`);
    }
    (e.bullets ?? []).forEach((b, bi) => text(b.content, `${n}: bullet ${bi + 1}`, 3, 600));
  });

  (p.skills ?? []).forEach((s, i) => {
    const n = `Skill ${i + 1}`;
    text(s.name, `${n}: name`, 1, 80);
    text(s.category, `${n}: category`, 2, 60);
    if (s.proficiency && s.proficiency.trim().length > 40) errs.push(`${n}: proficiency must be 40 characters or fewer.`);
    if (s.yearsUsed != null && (s.yearsUsed < 0 || !Number.isInteger(s.yearsUsed))) errs.push(`${n}: years used must be a non-negative integer.`);
  });

  (p.educations ?? []).forEach((e, i) => {
    if (isBlankEducation(e)) return;
    const n = `Education ${i + 1}`;
    text(e.institution, `${n}: institution`, 2, 150);
    text(e.degree, `${n}: course`, 2, 150);
    text(e.field, `${n}: branch`, 2, 150);
    if (!e.startDate) errs.push(`${n}: start date is required.`);
    else if (!YM_PATTERN.test(e.startDate)) errs.push(`${n}: start date must be YYYY-MM.`);
    if (!e.endDate) errs.push(`${n}: end date is required.`);
    else if (!YM_PATTERN.test(e.endDate)) errs.push(`${n}: end date must be YYYY-MM.`);
    else if (e.startDate && YM_PATTERN.test(e.startDate) && e.endDate < e.startDate) errs.push(`${n}: end date is before start date.`);
    if (e.grade && e.grade.trim().length > 40) errs.push(`${n}: grade must be 40 characters or fewer.`);
  });

  (p.projects ?? []).forEach((x, i) => {
    const n = `Project ${i + 1}`;
    text(x.name, `${n}: name`, 2, 150);
    if (!x.url?.trim()) errs.push(`${n}: URL is required.`);
    else if (!URL_PATTERN.test(x.url.trim())) errs.push(`${n}: URL must start with http:// or https://.`);
    else if (x.url.trim().length > 500) errs.push(`${n}: URL must be 500 characters or fewer.`);
    text(x.description, `${n}: description`, 10, 1000);
    const techs = (x.technologies ?? []).map((t) => (t ?? '').trim()).filter(Boolean);
    if (techs.length === 0) errs.push(`${n}: add at least one technology.`);
    techs.forEach((t) => { if (t.length > 60) errs.push(`${n}: technology must be 60 characters or fewer.`); });
  });

  (p.certifications ?? []).forEach((c, i) => {
    const n = `Certification ${i + 1}`;
    text(c.name, `${n}: name`, 2, 150);
    text(c.issuer, `${n}: issuer`, 2, 150);
    if (c.issuedDate && !YM_PATTERN.test(c.issuedDate)) errs.push(`${n}: issued date must be YYYY-MM.`);
    if (c.expiryDate && !YM_PATTERN.test(c.expiryDate)) errs.push(`${n}: expiry date must be YYYY-MM.`);
    if (c.issuedDate && c.expiryDate && YM_PATTERN.test(c.issuedDate) && YM_PATTERN.test(c.expiryDate) && c.expiryDate < c.issuedDate) errs.push(`${n}: expiry date is before issued date.`);
  });

  (p.languages ?? []).forEach((l, i) => {
    const n = `Language ${i + 1}`;
    text(l.name, `${n}: name`, 2, 60);
    text(l.proficiency, `${n}: proficiency`, 2, 40);
  });

  return errs;
}

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