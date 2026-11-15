import { createHash } from 'crypto';
import { ROLES } from '../career-path/role-taxonomy';
import { mentions } from '../career-path/analysis';

export const MAX_DESCRIPTION = 20_000;
export const SESSION_MINUTES = 30;
export const MAX_SESSIONS = 5;

/** Plain text only: strips tags, scripts, entities and control characters. Captured pages are untrusted. */
export function sanitizeText(raw: string, max = MAX_DESCRIPTION): string {
  return raw
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

/** http(s) only, no credentials, no fragment/tracking noise. The server never fetches this URL. Returns null when unacceptable. */
export function normalizeUrl(raw: string): { url: string; hostname: string } | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|trk)/i.test(k)) u.searchParams.delete(k);
  const url = u.toString();
  return url.length > 500 ? null : { url, hostname: u.hostname.toLowerCase() };
}

export const contentHash = (title: string, company: string, description: string) =>
  createHash('sha256').update(`${title.toLowerCase()}|${company.toLowerCase()}|${description.toLowerCase().replace(/\s+/g, ' ')}`).digest('hex');

/** Deterministic term extraction: known skill terms from the role taxonomy that the posting mentions, compared with confirmed profile skills. No score. */
export function analyzePosting(description: string, profileSkills: string[]) {
  const have = profileSkills.map((s) => s.toLowerCase());
  const seen = new Map<string, { label: string; alias: string }>();
  for (const role of ROLES) for (const req of role.required) {
    const alias = req.aliases.find((a) => a.length > 1 && mentions(description, a));
    if (alias && !seen.has(req.label)) seen.set(req.label, { label: req.label, alias });
  }
  const terms = [...seen.values()].map((t) => ({
    label: t.label, matchedText: t.alias,
    inProfile: have.some((h) => req_aliases(t.label).some((a) => mentions(h, a))),
  }));
  return {
    terms,
    inProfile: terms.filter((t) => t.inProfile).length, notRecorded: terms.filter((t) => !t.inProfile).length,
    notes: ['Terms are matched from a fixed vocabulary. "Not recorded" means your profile does not mention it, not that you lack it.', 'This is not a match score. Use Job match for a full, evidence-based report.'],
  };
}
function req_aliases(label: string): string[] {
  for (const r of ROLES) for (const q of r.required) if (q.label === label) return q.aliases;
  return [label.toLowerCase()];
}
