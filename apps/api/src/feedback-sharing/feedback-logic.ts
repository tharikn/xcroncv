import { RenderModel } from '../render-model/render-model.types';

/**
 * Consent-based sharing and feedback (doc 36). A share is one resume VERSION, one recipient label, an explicit permission
 * set and an expiry; the recipient only ever gets a read-only projection, never the profile or other versions.
 * Nothing is public: there is no anonymous route in this release, so the owner uses the preview to see exactly what a
 * recipient would receive and records feedback they got back.
 */
export const SECTION_KEYS = ['summary', 'experience', 'skills', 'education', 'projects', 'certifications', 'languages'] as const;
export const DIMENSIONS = ['clarity', 'relevance', 'evidence', 'presentation'] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export type Visibility = 'visible' | 'hidden';
export interface Permissions { sections: string[]; contacts: { email: Visibility; phone: Visibility; location: Visibility }; links: Visibility }

export type ShareStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export function shareStatus(s: { revokedAt: Date | null; expiresAt: Date }, now = new Date()): ShareStatus {
  if (s.revokedAt) return 'REVOKED';
  return s.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : 'ACTIVE';
}

export function contactKind(c: string): 'email' | 'phone' | 'location' {
  if (c.includes('@')) return 'email';
  if ((c.match(/\d/g) ?? []).length >= 7) return 'phone';
  return 'location';
}

/** Allowlist projection: only granted sections, only visible contact kinds, and no profile id or other version data. */
export function projectShare(model: RenderModel, p: Permissions) {
  const allowed = new Set(p.sections);
  return {
    header: {
      name: model.header.name, headline: model.header.headline,
      contacts: (model.header.contacts ?? []).filter((c) => p.contacts[contactKind(c)] === 'visible'),
      links: p.links === 'visible' ? model.header.links ?? [] : [],
    },
    sections: (model.sections ?? []).filter((s) => allowed.has(s.type)),
  };
}

export function summariseFeedback(rows: Array<Partial<Record<Dimension, number | null>> & { status: string }>) {
  const per = Object.fromEntries(DIMENSIONS.map((d) => {
    const vals = rows.map((r) => r[d]).filter((v): v is number => typeof v === 'number');
    return [d, { count: vals.length, average: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null }];
  })) as Record<Dimension, { count: number; average: number | null }>;
  return {
    entries: rows.length, accepted: rows.filter((r) => r.status === 'ACCEPTED').length, declined: rows.filter((r) => r.status === 'DECLINED').length,
    pending: rows.filter((r) => r.status === 'NEW').length, dimensions: per,
    note: rows.length < 3 ? 'Based on very little feedback; treat it as one or two opinions, not a verdict.' : 'Averages of recipient ratings, 1 (low) to 5 (high). You decide what to act on.',
  };
}
