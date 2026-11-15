import { FullProfile } from '../career-profile/career-profile.service';

export interface FieldDef {
  key: string;
  label: string;
  group: 'Identity' | 'Contact' | 'Work' | 'Education' | 'Links' | 'Credentials';
  /** Sensitive fields are excluded by default and need explicit per-session consent. */
  sensitive: boolean;
}

/**
 * The complete, closed set of fields the assistant can ever offer. Keys the user did not confirm in their profile are
 * never invented, and nothing outside this list (passwords, ids, eligibility or demographic answers) can be requested.
 */
export const STATIC_FIELDS: FieldDef[] = [
  { key: 'fullName', label: 'Full name', group: 'Identity', sensitive: false },
  { key: 'firstName', label: 'First name', group: 'Identity', sensitive: false },
  { key: 'lastName', label: 'Last name', group: 'Identity', sensitive: false },
  { key: 'headline', label: 'Professional headline', group: 'Identity', sensitive: false },
  { key: 'email', label: 'Email address', group: 'Contact', sensitive: false },
  { key: 'phone', label: 'Phone number', group: 'Contact', sensitive: true },
  { key: 'location', label: 'Location', group: 'Contact', sensitive: true },
  { key: 'website', label: 'Website', group: 'Links', sensitive: false },
  { key: 'linkedin', label: 'LinkedIn profile', group: 'Links', sensitive: false },
  { key: 'currentEmployer', label: 'Current or latest employer', group: 'Work', sensitive: false },
  { key: 'currentTitle', label: 'Current or latest job title', group: 'Work', sensitive: false },
  { key: 'highestEducation', label: 'Education (latest entry)', group: 'Education', sensitive: false },
];

export const CERT_PREFIX = 'certification:';

/** Anything matching this is refused outright with a specific message (never auto-answered or stored). */
export const FORBIDDEN_RE =
  /pass(word|code)|secret|token|otp|mfa|2fa|pin\b|ssn|social|national.?id|passport|gender|race|ethnic|disab|veteran|religio|citizen|authori[sz]ation|visa|sponsor|salary|expectation|criminal|birth|dob/i;

export interface FieldOption extends FieldDef { available: boolean; preview: string | null }

const clip = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const maskEmail = (e: string) => { const [l, d] = e.split('@'); return d ? `${l.slice(0, 1)}***@${d}` : '***'; };
export const maskPhone = (p: string) => { const d = p.replace(/\s+/g, ''); return d.length <= 2 ? '***' : `${'*'.repeat(Math.min(d.length - 2, 8))}${d.slice(-2)}`; };

type Links = Array<{ label?: string; url?: string }>;
const linksOf = (p: FullProfile): Links => (Array.isArray(p.links) ? (p.links as Links) : []);
const httpUrl = (u?: string) => (u && /^https?:\/\/[^\s]+$/i.test(u) ? u : undefined);

function splitName(full: string): { first?: string; last?: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { first: parts[0] };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

/** Value for one field key from confirmed profile data, or undefined when the profile has nothing for it. */
export function resolveValue(p: FullProfile, key: string): string | undefined {
  const latest = p.experiences.find((e) => e.isCurrent) ?? p.experiences[0];
  switch (key) {
    case 'fullName': return p.fullName || undefined;
    case 'firstName': return splitName(p.fullName).first;
    case 'lastName': return splitName(p.fullName).last;
    case 'headline': return p.headline ?? undefined;
    case 'email': return p.email ?? undefined;
    case 'phone': return p.phone ?? undefined;
    case 'location': return p.location ?? undefined;
    case 'website': return httpUrl(linksOf(p).find((l) => !/linkedin/i.test(`${l.label} ${l.url}`))?.url);
    case 'linkedin': return httpUrl(linksOf(p).find((l) => /linkedin/i.test(`${l.label} ${l.url}`))?.url);
    case 'currentEmployer': return latest?.employerName;
    case 'currentTitle': return latest?.jobTitle;
    case 'highestEducation': { const e = p.educations[0]; return e ? `${e.degree}, ${e.institution}` : undefined; }
    default:
      if (key.startsWith(CERT_PREFIX)) {
        const c = p.certifications.find((x) => x.id === key.slice(CERT_PREFIX.length));
        return c ? (c.issuer ? `${c.name} (${c.issuer})` : c.name) : undefined; // credential REFERENCE only: name + issuer
      }
      return undefined;
  }
}

/** Field list for review. Values are masked/clipped previews; the real values are released only after authorisation. */
export function fieldOptions(p: FullProfile): FieldOption[] {
  const preview = (key: string, v?: string) => (v === undefined ? null : key === 'email' ? maskEmail(v) : key === 'phone' ? maskPhone(v) : clip(v));
  const statics = STATIC_FIELDS.map((f) => {
    const v = resolveValue(p, f.key);
    return { ...f, available: v !== undefined, preview: preview(f.key, v) };
  });
  const certs: FieldOption[] = p.certifications.map((c) => ({
    key: `${CERT_PREFIX}${c.id}`, label: `Certification: ${clip(c.name, 30)}`, group: 'Credentials', sensitive: false, available: true,
    preview: clip(c.issuer ? `${c.name} (${c.issuer})` : c.name),
  }));
  return [...statics, ...certs];
}

export function isKnownKey(p: FullProfile, key: string): boolean {
  return STATIC_FIELDS.some((f) => f.key === key) || (key.startsWith(CERT_PREFIX) && p.certifications.some((c) => c.id === key.slice(CERT_PREFIX.length)));
}
export function isSensitiveKey(key: string): boolean { return STATIC_FIELDS.find((f) => f.key === key)?.sensitive ?? false; }
