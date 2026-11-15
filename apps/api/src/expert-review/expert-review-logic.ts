import { Permissions, SECTION_KEYS, ShareStatus, shareStatus } from '../feedback-sharing/feedback-logic';

/**
 * Expert review (doc 50). A request is one saved resume VERSION, one reviewer from a code-managed directory, an explicit scope,
 * a consent record and an expiry. The reviewer-side projection is the allowlisted one shared with doc 36; nothing is public.
 * There is no identity or payment provider in this release: payment goes through an adapter whose default is "not configured".
 */
export { SECTION_KEYS };
export type Scope = Permissions;
export type ReviewStatus = ShareStatus;
export const reviewStatus = shareStatus;

export interface Reviewer { id: string; displayName: string; expertise: string[]; vetting: 'VETTED' | 'UNVERIFIED'; serviceLevelDays: number; conflictPolicy: string }
export interface ReviewPackage { id: string; label: string; description: string; maxSections: number }

/** Seeded, admin-managed by shipping a new catalogue. Illustrative entries only: no real people, no identity verification. */
export const REVIEWERS: Reviewer[] = [
  { id: 'rv-sample-tech', displayName: 'Sample reviewer: technology resumes', expertise: ['Software engineering', 'Data'], vetting: 'UNVERIFIED', serviceLevelDays: 5, conflictPolicy: 'Declines reviews where they know the candidate or their employer.' },
  { id: 'rv-sample-career-change', displayName: 'Sample reviewer: career changers', expertise: ['Career change', 'Transferable skills'], vetting: 'UNVERIFIED', serviceLevelDays: 7, conflictPolicy: 'Declines reviews where they know the candidate or their employer.' },
];
export const PACKAGES: ReviewPackage[] = [
  { id: 'pk-focused', label: 'Focused review', description: 'Comments on up to three sections.', maxSections: 3 },
  { id: 'pk-full', label: 'Full resume review', description: 'Comments across every section you choose to share.', maxSections: SECTION_KEYS.length },
];
export const reviewerById = (id: string) => REVIEWERS.find((r) => r.id === id);
export const packageById = (id: string) => PACKAGES.find((p) => p.id === id);

// ---------------------------------------------------------------- payment adapter
export interface PaymentStatus { configured: boolean; status: 'NOT_CONFIGURED' | 'PAID' | 'PENDING'; reference: string | null; note: string }
/** Only an opaque transaction reference is ever kept. A real provider (charge, refund, dispute) would implement this. */
export interface PaymentProvider { readonly id: string; checkout(input: { packageId: string }): Promise<PaymentStatus> }
export const PAYMENT_PROVIDER = Symbol('EXPERT_REVIEW_PAYMENT_PROVIDER');
export const PAYMENT_NOT_CONFIGURED_NOTE = 'No payment provider is configured. Reviews are not charged and no card details are taken. Payment, refunds and disputes are not available yet.';
export class NotConfiguredPaymentProvider implements PaymentProvider {
  readonly id = 'none';
  async checkout(): Promise<PaymentStatus> { return { configured: false, status: 'NOT_CONFIGURED', reference: null, note: PAYMENT_NOT_CONFIGURED_NOTE }; }
}
