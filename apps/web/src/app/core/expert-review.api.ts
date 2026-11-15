import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';

type Vis = 'visible' | 'hidden';
export interface Reviewer { id: string; displayName: string; expertise: string[]; vetting: 'VETTED' | 'UNVERIFIED'; serviceLevelDays: number; conflictPolicy: string }
export interface ReviewPackage { id: string; label: string; description: string; maxSections: number }
export interface PackagesInfo { payment: { configured: boolean; provider: string; note: string }; packages: ReviewPackage[] }
export interface ReviewScope { sections: string[]; contacts: { email: Vis; phone: Vis; location: Vis }; links: Vis }
export interface ExpertReview {
  id: string; resumeId: string; versionNumber: number; reviewer: { id: string; displayName: string }; packageId: string; scope: ReviewScope;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED'; consentAt: string; expiresAt: string; revokedAt: string | null;
  payment: { status: string; reference: string | null }; feedbackCount: number; createdAt: string;
}
export interface ReviewInput {
  resumeId: string; resumeVersionId?: string; reviewerId: string; packageId: string; sections: string[]; contacts: ReviewScope['contacts']; links?: Vis; expiresInDays: number; consent: boolean;
}
export interface ReviewFeedback {
  id: string; requestId: string; section: string | null; clarity: number | null; relevance: number | null; evidence: number | null; presentation: number | null; comment: string | null;
  status: 'NEW' | 'ACCEPTED' | 'DECLINED'; decisionNote: string | null; decidedAt: string | null; createdAt: string;
}
export interface FeedbackInput { section?: string; clarity?: number; relevance?: number; evidence?: number; presentation?: number; comment?: string }
export interface ReviewPreview {
  requestId: string; versionNumber: number; reviewer: string; readOnly: true; expiresAt: string;
  resume: { header: { name: string; headline?: string; contacts: string[] }; sections: Array<{ type: string; title: string }> };
}
export interface ReviewEvent { id: string; kind: string; ref: string | null; createdAt: string }

/** Typed client for doc 50 (expert review). */
@Injectable({ providedIn: 'root' })
export class ExpertReviewApi {
  constructor(private http: HttpClient, private settings: SettingsService) {}
  private url(p: string) { return `${this.settings.apiBase}${p}`; }
  reviewers() { return this.http.get<Reviewer[]>(this.url('/reviewers')); }
  packages() { return this.http.get<PackagesInfo>(this.url('/review-packages')); }
  list() { return this.http.get<ExpertReview[]>(this.url('/expert-reviews')); }
  get(id: string) { return this.http.get<ExpertReview>(this.url(`/expert-reviews/${id}`)); }
  create(b: ReviewInput) { return this.http.post<ExpertReview>(this.url('/expert-reviews'), b); }
  grant(id: string, b: { expiresInDays: number; consent: boolean }) { return this.http.post<ExpertReview>(this.url(`/expert-reviews/${id}/grant`), b); }
  revoke(id: string) { return this.http.post<ExpertReview>(this.url(`/expert-reviews/${id}/revoke`), {}); }
  preview(id: string) { return this.http.get<ReviewPreview>(this.url(`/expert-reviews/${id}/preview`)); }
  feedback(id: string) { return this.http.get<ReviewFeedback[]>(this.url(`/expert-reviews/${id}/feedback`)); }
  record(id: string, b: FeedbackInput) { return this.http.post<ReviewFeedback>(this.url(`/expert-reviews/${id}/feedback`), b); }
  decide(id: string, fid: string, b: { decision: 'ACCEPTED' | 'DECLINED'; note?: string }) { return this.http.patch<ReviewFeedback>(this.url(`/expert-reviews/${id}/feedback/${fid}`), b); }
  audit(id: string) { return this.http.get<ReviewEvent[]>(this.url(`/expert-reviews/${id}/audit`)); }
  remove(id: string) { return this.http.delete<void>(this.url(`/expert-reviews/${id}`)); }
}
