import { Claim, LetterSection } from './career-tools.api';

/** "66.7% (2 of 3)" or "n/a (no applications)". Never shows a rate without its numerator and denominator. */
export function formatRate(r: { numerator: number; denominator: number; rate: number | null } | null | undefined, noun = 'applications'): string {
  if (!r) return 'Not enough data';
  if (r.rate === null) return `n/a (no ${noun})`;
  return `${(r.rate * 100).toFixed(1).replace(/\.0$/, '')}% (${r.numerator} of ${r.denominator})`;
}

export function windowLabel(w: { from: string | null; to: string | null }): string {
  const d = (s: string) => s.slice(0, 10);
  if (!w.from && !w.to) return 'All time';
  if (w.from && w.to) return `${d(w.from)} to ${d(w.to)}`;
  return w.from ? `Since ${d(w.from)}` : `Until ${d(w.to!)}`;
}

/** Bar width in percent for a funnel stage relative to the first stage (min 2% so a non-zero bar stays visible). */
export function barWidth(count: number, max: number): number {
  if (max <= 0 || count <= 0) return 0;
  return Math.max(2, Math.round((count / max) * 100));
}

export const EVENT_LABELS: Record<string, string> = {
  SAVED: 'Saved', APPLIED: 'Applied', RESPONSE: 'Response', INTERVIEW: 'Interview', OFFER: 'Offer', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn',
};

export const ACTIVITY_LABELS: Record<string, string> = {
  OUTREACH: 'Outreach', REFERRAL_REQUEST: 'Referral request', RECRUITER_CALL: 'Recruiter call',
  INTERVIEW_FOLLOW_UP: 'Interview follow-up', THANK_YOU: 'Thank-you note', MEETING: 'Meeting', NOTE: 'Note',
};

export function unsupportedClaims(claims: Claim[], sectionId?: string): Claim[] {
  return claims.filter((c) => c.status === 'UNSUPPORTED' && (!sectionId || c.sectionId === sectionId));
}

/** True when saving would be blocked by the "no silent unsupported claims" rule; the UI asks the user to confirm instead. */
export function hasUnsupported(claims: Claim[]): boolean { return unsupportedClaims(claims).length > 0; }

export function wordCount(sections: LetterSection[]): number {
  return sections.reduce((n, s) => n + (s.text.trim() ? s.text.trim().split(/\s+/).length : 0), 0);
}

/** Task urgency label from a due date. */
export function dueLabel(dueAt: string, now = new Date()): 'overdue' | 'today' | 'upcoming' {
  const due = new Date(dueAt);
  if (due.getTime() < now.getTime() && due.toDateString() !== now.toDateString()) return 'overdue';
  return due.toDateString() === now.toDateString() ? 'today' : 'upcoming';
}

export function splitTags(s: string): string[] {
  return [...new Set(s.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 20);
}
