/**
 * Deterministic, rule-based resume text -> structured SUGGESTIONS. Nothing here is persisted or auto-confirmed:
 * the client shows every suggestion for review and only confirmed items enter the career profile (docs 05, 18 s.7).
 */
export type Confidence = 'high' | 'medium' | 'low';

export interface SuggestedBullet { content: string }
export interface SuggestedExperience { employerName: string; jobTitle: string; startDate: string; endDate?: string; isCurrent: boolean; location?: string; bullets: SuggestedBullet[]; confidence: Confidence }
export interface SuggestedEducation { institution: string; degree: string; field?: string; startDate?: string; endDate?: string; confidence: Confidence }
export interface SuggestedProject { name: string; description?: string; url?: string; confidence: Confidence }
export interface SuggestedCertification { name: string; confidence: Confidence }

export interface ImportSuggestion {
  fullName?: string; email?: string; phone?: string; location?: string; headline?: string; summary?: string;
  links: Array<{ label: string; url: string }>;
  experiences: SuggestedExperience[];
  skills: Array<{ name: string; category?: string }>;
  educations: SuggestedEducation[];
  projects: SuggestedProject[];
  certifications: SuggestedCertification[];
  languages: Array<{ name: string; proficiency?: string }>;
  sectionsFound: string[];
  warnings: string[];
}

const HEADINGS: Record<string, string> = {
  summary: 'summary', profile: 'summary', 'professional summary': 'summary', objective: 'summary', about: 'summary', 'about me': 'summary', 'career summary': 'summary',
  experience: 'experience', 'work experience': 'experience', 'professional experience': 'experience', employment: 'experience', 'employment history': 'experience', 'work history': 'experience',
  skills: 'skills', 'technical skills': 'skills', 'core skills': 'skills', 'key skills': 'skills', 'core competencies': 'skills', technologies: 'skills',
  education: 'education', 'education and training': 'education', academics: 'education', qualifications: 'education',
  projects: 'projects', 'personal projects': 'projects', 'selected projects': 'projects',
  certifications: 'certifications', certificates: 'certifications', licenses: 'certifications', 'licenses and certifications': 'certifications',
  languages: 'languages',
};
const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const MONTH_LIST = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const D = `(?:(?:${MONTHS})[a-z]*\\.?,?\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4}-\\d{2}|\\d{4})`;
const RANGE = new RegExp(`(${D})\\s*(?:-|–|—|to)\\s*(${D}|present|current|now|ongoing)`, 'i');
const BULLET = /^\s*[•▪◦●·*\-–]\s+/;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s,;|)]+|\b(?:linkedin\.com|github\.com)\/[^\s,;|)]+/gi;
const DEGREE = /\b(bachelor|master|b\.?\s?sc|m\.?\s?sc|b\.?\s?tech|m\.?\s?tech|b\.?\s?e\b|b\.?\s?a\b|m\.?\s?a\b|mba|ph\.?d|doctorate|diploma|associate|b\.?\s?s\b|m\.?\s?s\b)/i;
const SCHOOL = /\b(university|college|institute|school|academy|polytechnic)\b/i;

export function toYearMonth(raw: string): string | undefined {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m && +m[2] >= 1 && +m[2] <= 12) return s;
  m = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = new RegExp(`^(${MONTHS})[a-z]*\\.?,?\\s+(\\d{4})$`, 'i').exec(s);
  if (m) { const mi = MONTH_LIST.indexOf(m[1].toLowerCase().slice(0, 3)); return `${m[2]}-${String(mi + 1).padStart(2, '0')}`; }

  m = /^(\d{4})$/.exec(s);
  if (m) return `${m[1]}-01`;
  return undefined;
}
const isPresent = (s: string) => /present|current|now|ongoing/i.test(s);
const clip = (s: string | undefined, n: number) => (s ? s.slice(0, n) : s);
const clean = (s: string) => s.replace(BULLET, '').replace(/\s+/g, ' ').trim();

function headingOf(line: string): string | undefined {
  const k = line.toLowerCase().replace(/[:–\-_|]+$/g, '').replace(/[^a-z& ]/g, '').replace(/&/g, 'and').replace(/\s+/g, ' ').trim();
  return line.length <= 40 ? HEADINGS[k] : undefined;
}

function addWarn(o: ImportSuggestion, w: string) { if (!o.warnings.includes(w)) o.warnings.push(w); }

/** "Title - Employer", "Title at Employer", "Title, Employer", "Title | Employer" -> parts. */
function splitTitle(s: string): { a: string; b?: string } {
  const t = clean(s.replace(RANGE, '')).replace(/[|,–—\-\s]+$/g, '').trim();
  const m = /^(.+?)\s+(?:at|@)\s+(.+)$/i.exec(t) ?? /^(.+?)\s*(?:\s[-–—|]\s|\|)\s*(.+)$/.exec(t) ?? /^(.+?),\s+(.+)$/.exec(t);
  return m ? { a: m[1].trim(), b: m[2].trim() } : { a: t };
}

interface Entry { header: string; range: RegExpExecArray; prev?: string; body: string[] }

/**
 * Group lines into entries. An entry starts at a line containing a date range. The text on that line (or, when the
 * line is only dates, the line before it) is the header; a short line directly before a dated line starts the next entry.
 */
function groupEntries(lines: string[]): Entry[] {
  const entries: Entry[] = [];
  let open: Entry | undefined; let pending: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const range = BULLET.test(l) ? null : RANGE.exec(l);
    if (range) {
      const without = clean(l.replace(RANGE, ''));
      open = { header: without || pending || '', range, prev: without ? pending : undefined, body: [] };
      entries.push(open); pending = undefined; continue;
    }
    const nextHasRange = i + 1 < lines.length && !BULLET.test(lines[i + 1]) && RANGE.test(lines[i + 1]);
    if (!BULLET.test(l) && nextHasRange && l.length < 90) { pending = clean(l); continue; }
    if (open) open.body.push(l); else pending = clean(l);
  }
  return entries;
}

export function parseResumeText(lines: string[]): ImportSuggestion {
  const out: ImportSuggestion = { links: [], experiences: [], skills: [], educations: [], projects: [], certifications: [], languages: [], sectionsFound: [], warnings: [] };
  const text = lines.join('\n');
  if (text.replace(/\s/g, '').length < 40) out.warnings.push('Very little text was found. Scanned or image-only documents are not supported; type your details instead.');

  const sections = new Map<string, string[]>();
  const head: string[] = [];
  let cur: string | undefined; let carry: string | undefined;
  for (const [idx, raw] of lines.entries()) {
    const line = raw.trim(); if (!line) continue;
    let h = headingOf(line);
    if (h === 'languages' && cur === 'skills') {
      const next = lines[idx + 1]?.trim();
      if (next && !headingOf(next) && !/[(]| - /.test(next)) { carry = line; continue; } // a skill category called "Languages", not the Languages section
    }
    if (carry) { sections.get(cur!)!.push(`${carry}: ${line}`); carry = undefined; continue; }
    if (h) { cur = h; if (!sections.has(h)) sections.set(h, []); if (!out.sectionsFound.includes(h)) out.sectionsFound.push(h); continue; }
    (cur ? sections.get(cur)! : head).push(line);
  }

  // header: contacts, name, headline
  out.email = clip(EMAIL.exec(text)?.[0], 254);
  const phoneLine = head.find((l) => PHONE.test(l) && !RANGE.test(l));
  out.phone = clip(phoneLine ? PHONE.exec(phoneLine)![0].trim() : undefined, 40);
  const seen = new Set<string>();
  for (const l of head.slice(0, 8)) for (const u of l.match(URL_RE) ?? []) {
    const url = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    if (seen.has(url) || out.links.length >= 10 || url.length > 500) continue;
    seen.add(url);
    out.links.push({ label: /linkedin/i.test(url) ? 'LinkedIn' : /github/i.test(url) ? 'GitHub' : 'Website', url });
  }
  const isContact = (l: string) => EMAIL.test(l) || PHONE.test(l) || /\b(?:https?:\/\/|www\.|linkedin\.com|github\.com)/i.test(l);
  const nameLine = head.find((l) => !isContact(l) && l.split(/\s+/).length <= 5 && !/\d/.test(l));
  out.fullName = clip(nameLine, 150);
  if (!out.fullName) out.warnings.push('Could not detect your name. Please enter it.');
  const rest = head.filter((l) => l !== nameLine && !isContact(l));
  const loc = rest.find((l) => /^[A-Za-z .'-]+,\s*[A-Za-z .'-]+(?:,\s*[A-Za-z .'-]+)?$/.test(l) && l.length <= 60);
  if (loc) out.location = loc;
  out.headline = clip(rest.find((l) => l !== loc && l.length <= 120), 150);
  if (!out.email) out.warnings.push('No email address was found.');

  const sum = sections.get('summary');
  if (sum?.length) out.summary = clip(sum.map(clean).join(' '), 2000);

  for (const l of sections.get('skills') ?? []) {
    for (const seg of clean(l).split('|')) {
      const m = /^([^:,]{2,40}):\s*(.+)$/.exec(seg.trim());
      const cat = m?.[1]; const body = m ? m[2] : seg;
      for (const k of body.split(/[,;•·]/).map((x) => x.trim()).filter((x) => x && x.length <= 80)) {
        if (out.skills.length < 100 && !out.skills.some((e) => e.name.toLowerCase() === k.toLowerCase())) out.skills.push({ name: k, ...(cat ? { category: cat.trim().slice(0, 60) } : {}) });
      }
    }
  }

  // experience
  for (const en of groupEntries(sections.get('experience') ?? [])) {
    const start = toYearMonth(en.range[1]); if (!start) continue;
    const current = isPresent(en.range[2]);
    const end = current ? undefined : toYearMonth(en.range[2]);
    const parts = splitTitle(en.header);
    let employer = parts.b ?? en.prev ?? '';
    const title = parts.a;
    const body = [...en.body];
    // "Title" line followed by a short non-bullet line: treat that line as the employer
    if (!employer && body.length && !BULLET.test(body[0]) && body[0].length < 80 && !/[.!?]$/.test(body[0])) employer = clean(body.shift()!);
    const exp: SuggestedExperience = {
      jobTitle: clip(title, 150) || clip(employer, 150) || '', employerName: clip(employer, 150) || '', startDate: start, ...(end ? { endDate: end } : {}), isCurrent: current,
      bullets: body.map((b) => ({ content: clip(clean(b), 600)! })).filter((b) => b.content).slice(0, 30),
      confidence: parts.b || en.prev ? 'high' : employer ? 'medium' : 'low',
    };
    if (/^\d{4}$/.test(en.range[1].trim())) addWarn(out, 'Some dates only had a year; they were set to January. Please check them.');
    if (exp.jobTitle) out.experiences.push(exp);

  }
  out.experiences = out.experiences.slice(0, 40);

  // education
  const edu = sections.get('education') ?? [];
  for (const en of groupEntries(edu)) {
    const ls = [en.header, en.prev ?? '', ...en.body].map(clean).filter(Boolean);
    const school = ls.find((l) => SCHOOL.test(l)) ?? '';
    const degree = ls.find((l) => DEGREE.test(l)) ?? ls.find((l) => l !== school) ?? '';
    const s = toYearMonth(en.range[1]); const e = toYearMonth(en.range[2]);
    out.educations.push({
      institution: clip(school === degree ? '' : school, 150) ?? '', degree: clip(degree, 150) ?? '',
      ...(s ? { startDate: s } : {}), ...(e && !isPresent(en.range[2]) ? { endDate: e } : {}), confidence: school && degree && school !== degree ? 'medium' : 'low',
    });
  }
  if (!out.educations.length && edu.length) {
    const school = edu.find((l) => SCHOOL.test(l)); const degree = edu.find((l) => DEGREE.test(l));
    if (school || degree) out.educations.push({ institution: clip(clean(school ?? ''), 150) ?? '', degree: clip(clean(degree ?? school ?? ''), 150) ?? '', confidence: 'low' });
  }
  out.educations = out.educations.filter((e) => e.institution || e.degree).slice(0, 20);

  // projects
  let proj: SuggestedProject | undefined;
  for (const l of sections.get('projects') ?? []) {
    if (BULLET.test(l) && proj) { proj.description = clip(`${proj.description ? proj.description + ' ' : ''}${clean(l)}`, 1000); continue; }
    if (proj) out.projects.push(proj);
    const url = (l.match(URL_RE) ?? [])[0];
    proj = { name: clip(clean(l.replace(URL_RE, '').replace(/[-–:|]\s*$/, '')), 150) || clean(l).slice(0, 150), ...(url ? { url: /^https?:/i.test(url) ? url : `https://${url}` } : {}), confidence: 'low' };
  }
  if (proj) out.projects.push(proj);
  out.projects = out.projects.filter((p) => p.name).slice(0, 30);

  out.certifications = (sections.get('certifications') ?? []).map(clean).filter(Boolean).slice(0, 30)
    .map((name) => ({ name: name.slice(0, 150), confidence: 'medium' as Confidence }));
  for (const l of sections.get('languages') ?? []) for (const s of clean(l).split(/[,;|•·]/).map((x) => x.trim()).filter(Boolean)) {
    const m = /^(.+?)\s*[(\-–:]\s*([^)]+)\)?$/.exec(s);
    if (out.languages.length < 20) out.languages.push(m ? { name: m[1].trim().slice(0, 60), proficiency: m[2].trim().slice(0, 40) } : { name: s.slice(0, 60) });
  }

  for (const key of ['experience', 'education', 'skills'] as const) {
    if (!sections.has(key)) out.warnings.push(`No "${key[0].toUpperCase()}${key.slice(1)}" section was recognised.`);
  }
  return out;
}

/** Parse a rendered date range such as "Jan 2020 – Present" into YYYY-MM parts (used to compare exports with their source). */
export function parseRangeText(meta: string): { start?: string; end?: string; current: boolean } | undefined {
  const m = RANGE.exec(meta);
  if (!m) return undefined;
  const current = isPresent(m[2]);
  return { start: toYearMonth(m[1]), ...(current ? {} : { end: toYearMonth(m[2]) }), current };
}
