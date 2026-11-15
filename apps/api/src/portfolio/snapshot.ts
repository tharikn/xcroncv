import { FullProfile } from '../career-profile/career-profile.service';

export type Visibility = 'public' | 'masked' | 'hidden';
export const HEADER_FIELDS = ['fullName', 'headline', 'summary', 'location', 'email', 'phone', 'links'] as const;
export type HeaderField = (typeof HEADER_FIELDS)[number];
export const MASKABLE: HeaderField[] = ['email', 'phone'];
export const SECTION_KEYS = ['experience', 'projects', 'skills', 'education', 'certifications', 'languages'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export interface SectionPick { ids: string[]; includeBullets?: boolean }
export interface Selection {
  header: Partial<Record<HeaderField, Visibility>>;
  experience?: SectionPick; projects?: SectionPick; skills?: SectionPick;
  education?: SectionPick; certifications?: SectionPick; languages?: SectionPick;
}

export interface Snapshot {
  schemaVersion: 1;
  header: Partial<Record<HeaderField, unknown>>;
  sections: Partial<Record<SectionKey, Array<Record<string, unknown>>>>;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}
export function maskPhone(phone: string): string {
  const d = phone.replace(/\s+/g, '');
  return d.length <= 2 ? '***' : `${'*'.repeat(Math.min(d.length - 2, 8))}${d.slice(-2)}`;
}

/** Only http(s) links are exposed; anything else (javascript:, data:) is dropped. */
const safeUrl = (u?: string | null) => (u && /^https?:\/\/[^\s]+$/i.test(u) ? u : undefined);

/** Returns the first problem with a selection, or null. */
export function selectionProblem(sel: Selection): string | null {
  for (const [field, vis] of Object.entries(sel.header ?? {})) {
    if (vis === 'masked' && !MASKABLE.includes(field as HeaderField)) return `"${field}" cannot be masked; make it public or hidden`;
  }
  return null;
}

/**
 * Positive-allowlist projection. Nothing is copied unless the selection names it, and each item exposes a fixed set of
 * fields (no ids, grades, employment descriptions or internal flags). Hidden fields never enter the snapshot, so they
 * cannot leak through the page, JSON, structured data or logs.
 */
export function buildSnapshot(p: FullProfile, sel: Selection): Snapshot {
  const header: Snapshot['header'] = {};
  const sections: Snapshot['sections'] = {};
  const vis = (f: HeaderField) => sel.header?.[f] ?? 'hidden';
  const text = (f: HeaderField, value?: string | null, mask?: (s: string) => string) => {
    const v = vis(f);
    if (!value || v === 'hidden') return;
    if (v === 'masked') { if (mask) header[f] = mask(value); return; }
    header[f] = value;
  };
  text('fullName', p.fullName); text('headline', p.headline); text('summary', p.summary); text('location', p.location);
  text('email', p.email, maskEmail); text('phone', p.phone, maskPhone);
  if (vis('links') === 'public') {
    const links = (Array.isArray(p.links) ? (p.links as Array<{ label?: string; url?: string }>) : [])
      .map((l) => ({ label: String(l.label ?? '').slice(0, 80), url: safeUrl(l.url) }))
      .filter((l) => l.url);
    if (links.length) header.links = links;
  }

  const pick = <T extends { id: string }>(key: SectionKey, rows: T[], map: (r: T) => Record<string, unknown>) => {
    const ids = new Set(sel[key]?.ids ?? []);
    const out = rows.filter((r) => ids.has(r.id)).map(map);
    if (out.length) sections[key] = out;
  };
  const bullets = sel.experience?.includeBullets === true;
  pick('experience', p.experiences, (e) => ({
    employerName: e.employerName, jobTitle: e.jobTitle, location: e.location ?? undefined, startDate: e.startDate,
    endDate: e.isCurrent ? undefined : e.endDate ?? undefined, isCurrent: e.isCurrent,
    bullets: bullets ? e.bullets.filter((b) => b.isUserConfirmed).map((b) => b.content) : [],
  }));
  pick('projects', p.projects, (x) => ({ name: x.name, url: safeUrl(x.url), description: x.description ?? undefined, technologies: x.technologies }));
  pick('skills', p.skills, (s) => ({ name: s.name, category: s.category ?? undefined }));
  pick('education', p.educations, (e) => ({ institution: e.institution, degree: e.degree, field: e.field ?? undefined, startDate: e.startDate ?? undefined, endDate: e.endDate ?? undefined }));
  pick('certifications', p.certifications, (c) => ({ name: c.name, issuer: c.issuer ?? undefined, issuedDate: c.issuedDate ?? undefined, expiryDate: c.expiryDate ?? undefined }));
  pick('languages', p.languages, (l) => ({ name: l.name, proficiency: l.proficiency ?? undefined }));
  return { schemaVersion: 1, header, sections };
}

/** Number of disclosed facts: used to block publishing an empty portfolio. */
export function disclosedCount(s: Snapshot): number {
  return Object.keys(s.header).length + Object.values(s.sections).reduce((n, a) => n + (a?.length ?? 0), 0);
}
