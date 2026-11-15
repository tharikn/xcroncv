import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';

// ---- portfolio (doc 41) ----------------------------------------------------------------------
export type Visibility = 'public' | 'masked' | 'hidden';
export const HEADER_FIELDS = ['fullName', 'headline', 'summary', 'location', 'email', 'phone', 'links'] as const;
export type HeaderField = (typeof HEADER_FIELDS)[number];
export const SECTION_KEYS = ['experience', 'projects', 'skills', 'education', 'certifications', 'languages'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export interface SectionPick { ids: string[]; includeBullets?: boolean }
export interface PortfolioSelection { header: Partial<Record<HeaderField, Visibility>> & Record<string, Visibility | undefined>; experience?: SectionPick; projects?: SectionPick; skills?: SectionPick; education?: SectionPick; certifications?: SectionPick; languages?: SectionPick }
export interface PortfolioSnapshot { schemaVersion: 1; header: Record<string, unknown>; sections: Partial<Record<SectionKey, Array<Record<string, unknown>>>> }
export interface PortfolioSummary {
  id: string; name: string; roleFamily?: string | null; status: 'DRAFT' | 'PUBLISHED' | 'REVOKED'; currentVersion: number;
  publishedVersion?: number | null; publishedAt?: string | null; expiresAt?: string | null; noIndex: boolean; hasActiveLink: boolean; passwordProtected?: boolean; updatedAt: string;
}
export interface PortfolioVersionInfo { id: string; versionNumber: number; theme: string; changeSummary?: string | null; createdAt: string; selection: PortfolioSelection; disclosedCount: number; published: boolean }
export interface PortfolioDetail extends PortfolioSummary { versions: PortfolioVersionInfo[]; views: number; expired: boolean }
export interface PortfolioView { schemaVersion: 1; theme: string; publishedAt?: string | null; expiresAt?: string | null; snapshot: PortfolioSnapshot }

// ---- autofill (doc 47) -----------------------------------------------------------------------
export interface SiteAdapter { id: string; name: string; version: number; description: string; mode: 'COPY' | 'FILL'; hostPatterns: string[]; verified: boolean; selectors: Record<string, string> }
export interface AutofillSession { id: string; adapterId: string; targetHost?: string | null; status: 'ACTIVE' | 'AUTHORIZED' | 'REVOKED' | 'EXPIRED'; consentedKeys: string[]; sensitiveConsent: boolean; expiresAt: string; createdAt: string }
export interface FieldOption { key: string; label: string; group: string; sensitive: boolean; available: boolean; preview: string | null }
export interface AutofillFill { fieldKey: string; value: string; selector: string | null }
export interface AuthorizeResult { session: AutofillSession; mode: 'COPY' | 'FILL'; fills: AutofillFill[]; skipped: string[]; submit: 'never' }

// ---- evidence wallet (doc 49) ----------------------------------------------------------------
export type CredentialStatus = 'SELF_REPORTED' | 'DOCUMENT_REVIEWED' | 'ISSUER_VERIFIED' | 'EXPIRED' | 'REVOKED' | 'UNABLE_TO_VERIFY';
export interface Credential {
  id: string; kind: string; name: string; issuer: string; issuedOn?: string | null; expiresOn?: string | null; credentialIdMasked?: string | null;
  hasCredentialId: boolean; verificationUrl?: string | null; status: CredentialStatus; effectiveStatus: CredentialStatus; statusSource: string;
  statusAt: string; recheckAfter?: string | null; recheckDue: boolean; updatedAt: string;
}
export interface Evidence { id: string; kind: 'LINK' | 'PROFILE_ITEM' | 'LOCAL_NOTE'; label: string; url?: string | null; profileItemType?: string | null; profileItemId?: string | null; profileLinkValid?: boolean }
export interface CredentialDetail extends Credential { evidence: Evidence[] }
export interface CredentialInput { kind?: string; name: string; issuer: string; issuedOn?: string; expiresOn?: string; credentialId?: string; verificationUrl?: string }
export interface Grant { id: string; purpose: string; recipientLabel?: string | null; fields: string[]; expiresAt: string; revokedAt?: string | null; state: 'ACTIVE' | 'EXPIRED' | 'REVOKED'; projection?: Record<string, unknown> }
export interface VerificationInfo { status: CredentialStatus; effectiveStatus: CredentialStatus; source: string; asOf: string; recheckAfter?: string | null; recheckDue: boolean; history: Array<{ id: string; status: string; source: string; note?: string | null; checkedAt: string }> }

/** Typed client for docs 41, 47 and 49. Replace with the generated SDK when packages/sdk lands. */
@Injectable({ providedIn: 'root' })
export class ProfileToolsApi {
  constructor(private http: HttpClient, private settings: SettingsService) {}
  private url(p: string) { return `${this.settings.apiBase}${p}`; }

  // portfolio
  listPortfolios() { return this.http.get<PortfolioSummary[]>(this.url('/portfolios')); }
  getPortfolio(id: string) { return this.http.get<PortfolioDetail>(this.url(`/portfolios/${id}`)); }
  createPortfolio(b: { name: string; roleFamily?: string; selection: PortfolioSelection; theme?: string }) { return this.http.post<PortfolioSummary>(this.url('/portfolios'), b); }
  deletePortfolio(id: string) { return this.http.delete<void>(this.url(`/portfolios/${id}`)); }
  createPortfolioVersion(id: string, b: { selection: PortfolioSelection; theme?: string; changeSummary?: string }) { return this.http.post<{ versionNumber: number; disclosedCount: number }>(this.url(`/portfolios/${id}/versions`), b); }
  previewPortfolio(id: string, b: { versionNumber?: number; selection?: PortfolioSelection }) { return this.http.post<{ theme: string; snapshot: PortfolioSnapshot; draft: boolean }>(this.url(`/portfolios/${id}/preview`), b); }
  publishPortfolio(id: string, b: { versionNumber: number; confirm: boolean; expiresAt?: string; noIndex?: boolean }) { return this.http.post<PortfolioSummary & { token: string; sharePath: string }>(this.url(`/portfolios/${id}/publish`), b); }
  revokePortfolio(id: string) { return this.http.post<PortfolioSummary>(this.url(`/portfolios/${id}/revoke`), {}); }
  portfolioPolicy(id: string, b: { expiresAt?: string | null; noIndex?: boolean; password?: string | null }) { return this.http.patch<PortfolioSummary>(this.url(`/portfolios/${id}/share-policy`), b); }
  publicPortfolio(token: string, password?: string) {
    return this.http.get<PortfolioView>(this.url(`/public/portfolios/${encodeURIComponent(token)}`), password ? { headers: { 'X-Portfolio-Password': password } } : {});
  }

  // autofill
  siteAdapters() { return this.http.get<SiteAdapter[]>(this.url('/autofill/site-adapters')); }
  listSessions() { return this.http.get<AutofillSession[]>(this.url('/autofill/sessions')); }
  startSession(b: { adapterId: string; targetHost?: string; confirm: boolean }) { return this.http.post<AutofillSession>(this.url('/autofill/sessions'), b); }
  fieldOptions(id: string) { return this.http.get<{ session: AutofillSession; adapter: SiteAdapter; fields: FieldOption[] }>(this.url(`/autofill/sessions/${id}/field-options`)); }
  authorizeFields(id: string, b: { fieldKeys: string[]; sensitiveConsent?: boolean; confirm: boolean }) { return this.http.post<AuthorizeResult>(this.url(`/autofill/sessions/${id}/authorize-fields`), b); }
  revokeSession(id: string) { return this.http.post<AutofillSession>(this.url(`/autofill/sessions/${id}/revoke`), {}); }

  // evidence wallet
  listCredentials() { return this.http.get<Credential[]>(this.url('/credentials')); }
  getCredential(id: string) { return this.http.get<CredentialDetail>(this.url(`/credentials/${id}`)); }
  createCredential(b: CredentialInput) { return this.http.post<Credential>(this.url('/credentials'), b); }
  updateCredential(id: string, b: Partial<CredentialInput>) { return this.http.patch<Credential>(this.url(`/credentials/${id}`), b); }
  deleteCredential(id: string) { return this.http.delete<void>(this.url(`/credentials/${id}`)); }
  addEvidence(id: string, b: { kind: string; label: string; url?: string; profileItemType?: string; profileItemId?: string }) { return this.http.post<Evidence>(this.url(`/credentials/${id}/evidence`), b); }
  removeEvidence(id: string, evidenceId: string) { return this.http.delete<void>(this.url(`/credentials/${id}/evidence/${evidenceId}`)); }
  requestVerification(id: string, b: { consent: boolean; method: 'SELF_DOCUMENT_REVIEW' | 'PROVIDER'; provider?: string; note?: string }) { return this.http.post<{ verification: { status: string; note?: string | null }; applied: boolean }>(this.url(`/credentials/${id}/verification-requests`), b); }
  verification(id: string) { return this.http.get<VerificationInfo>(this.url(`/credentials/${id}/verification`)); }
  listGrants(id: string) { return this.http.get<Grant[]>(this.url(`/credentials/${id}/disclosure-grants`)); }
  createGrant(id: string, b: { purpose: string; recipientLabel?: string; fields: string[]; expiresInDays?: number; confirm: boolean }) { return this.http.post<Grant>(this.url(`/credentials/${id}/disclosure-grants`), b); }
  revokeGrant(id: string) { return this.http.post<Grant>(this.url(`/credential-disclosures/${id}/revoke`), {}); }
}
