/** Types and pure presentation helpers for the ATS score page (doc 07). */
export type Band = 'good' | 'fair' | 'low';
export interface Evidence { section: string; itemTitle?: string; excerpt: string }
export interface Item { key: string; label: string; dimension: string; status: string; points: number; explanation: string; evidence: Evidence[]; action?: string }
export interface Dimension {
  id: string; label: string; weight: number; effectiveWeight: number; applicable: boolean; score: number | null; maxScore: number; itemCount: number; explanation: string;
}
export interface Report {
  id: string; resumeId: string; resumeVersionNumber: number | null; atsVersion: string; taxonomyVersion: string; score: number; createdAt: string;
  job: { id: string; title: string; company: string | null; confirmed: boolean };
  dimensions: Dimension[]; items: Item[];
  coverage: { applicableWeight: number; confidence: 'high' | 'medium' | 'low'; limitations: string[] };
  strongMatches: string[]; weakOrMissing: string[]; improvements: string[]; disclaimer: string;
}
export interface HistoryRow { id: string; jdTitle: string; score: number; atsVersion: string; createdAt: string }
export interface JobRow { id: string; title: string; company: string | null; confirmationStatus: string }
export interface ModelInfo { atsVersion: string; dimensions: Array<{ id: string; label: string; weight: number; what: string }> }

/** Bands are always shown with words as well as a bar (never colour alone). */
export const band = (score: number): Band => (score >= 75 ? 'good' : score >= 45 ? 'fair' : 'low');
export const bandText = (score: number) => ({ good: 'Strong', fair: 'Partly supported', low: 'Needs attention' } as const)[band(score)];

const STATUS: Record<string, string> = {
  exact: 'Found', related: 'Related', partial: 'Weak', missing: 'Not found', pass: 'Good', warn: 'Check', fail: 'Problem', not_evaluated: 'Not evaluated',
};
export const statusText = (s: string) => STATUS[s] ?? s;

/** Weakest items first so the things to fix are on top. */
export const sortItems = (items: Item[]) => [...items].sort((a, b) => a.points - b.points || a.label.localeCompare(b.label));
