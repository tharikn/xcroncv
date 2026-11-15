import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';

// ---- application resume vault (doc 33) -----------------------------------------------------
export const STAGES = ['APPLIED', 'SCREENING', 'INTERVIEWING', 'OFFER', 'REJECTED', 'WITHDRAWN'] as const;
export interface VaultEntry {
  id: string; employerLabel: string; jobTitle: string | null; externalJobId: string | null; appliedOn: string;
  resume: { id: string; versionId: string; versionNumber: number; contentHash: string; versionAvailable: boolean; newerVersionExists: boolean };
  coverLetterVersionRef: string | null; stage: string; notes: string | null; followUpOn: string | null; followUpDone: boolean; followUpOverdue: boolean;
  createdAt: string; updatedAt: string;
}
export interface VaultInput {
  employerLabel: string; jobTitle?: string; externalJobId?: string; appliedOn: string; resumeId: string; resumeVersionId?: string;
  coverLetterVersionRef?: string; stage?: string; notes?: string; followUpOn?: string;
}

// ---- career readiness (doc 34) --------------------------------------------------------------
export type EvidenceLevel = 'DEMONSTRATED' | 'PROJECT' | 'CERTIFICATION' | 'SELF_REPORTED' | 'NONE';
export interface EvidenceSource { type: string; id: string; label: string }
export interface SkillAnalysis {
  skill: string; importance: 'required' | 'preferred'; level: EvidenceLevel; sources: EvidenceSource[];
  transferableFrom: Array<{ skill: string; level: EvidenceLevel; sources: EvidenceSource[] }>; statement: string;
}
export interface Milestone { id: string; title: string; skill?: string; status: 'OPEN' | 'DONE' | 'DISMISSED'; note?: string; origin: 'RECOMMENDATION' | 'USER' }
export interface PlanSummary { total: number; counts: Record<EvidenceLevel, number>; requiredWithoutEvidence: string[]; note: string }
export interface PlanListItem { id: string; targetRole: string; summary: PlanSummary; openMilestones: number; updatedAt: string }
export interface Plan { id: string; targetRole: string; analysis: SkillAnalysis[]; summary: PlanSummary; milestones: Milestone[]; analysisVersion: string; updatedAt: string }

// ---- interview preparation (doc 35) ---------------------------------------------------------
export type Rating = 'strong' | 'ok' | 'improve';
export interface FeedbackDimension { rating: Rating; tip: string }
export interface AnswerFeedback {
  relevance: FeedbackDimension; structure: FeedbackDimension; clarity: FeedbackDimension; specificity: FeedbackDimension; evidenceAlignment: FeedbackDimension;
  starCoverage: Record<'situation' | 'task' | 'action' | 'result', boolean>; unsupportedTerms: string[]; wordCount: number; note: string;
}
export interface PrepQuestion {
  id: string; category: string; grounding: 'RESUME' | 'GENERAL'; text: string; hint: string; evidence?: { ref: string; excerpt: string }; notOnResume?: boolean;
  answer?: string | null; feedback?: AnswerFeedback | null; practiced: boolean;
}
export interface PrepListItem { id: string; title: string; roleTitle?: string | null; company?: string | null; progress: { total: number; practiced: number }; updatedAt: string }
export interface PrepSession extends PrepListItem { resumeId: string; resumeVersionId: string | null; generator: string; questions: PrepQuestion[] }

// ---- feedback sharing (doc 36) --------------------------------------------------------------
export type Vis = 'visible' | 'hidden';
export interface SharePermissions { sections: string[]; contacts: { email: Vis; phone: Vis; location: Vis }; links: Vis }
export interface FeedbackShare {
  id: string; resumeId: string; versionNumber: number; recipientLabel: string; purpose: string; permissions: SharePermissions;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED'; expiresAt: string; revokedAt: string | null; feedbackCount: number; createdAt: string;
}
export interface ShareInput { resumeId: string; resumeVersionId?: string; recipientLabel: string; sections: string[]; contacts: SharePermissions['contacts']; links?: Vis; expiresInDays: number; consent: boolean }
export interface FeedbackEntry {
  id: string; shareId: string; clarity: number | null; relevance: number | null; evidence: number | null; presentation: number | null; comment: string | null;
  status: 'NEW' | 'ACCEPTED' | 'DECLINED'; decisionNote: string | null; appliedVersionNumber: number | null; decidedAt: string | null; createdAt: string;
}
export interface FeedbackSummary { entries: number; accepted: number; declined: number; pending: number; dimensions: Record<string, { count: number; average: number | null }>; note: string }
export interface SharePreview {
  shareId: string; versionNumber: number; recipientLabel: string; readOnly: true; expiresAt: string;
  resume: { header: { name: string; headline?: string; contacts: string[]; links: Array<{ label: string; url: string }> }; sections: Array<{ type: string; title: string; text?: string; items?: Array<{ title?: string; subtitle?: string; bullets?: string[]; tags?: string[] }> }> };
}

/** Typed client for modules 33-36. Replace with the generated SDK when packages/sdk lands. */
@Injectable({ providedIn: 'root' })
export class ReadinessToolsApi {
  constructor(private http: HttpClient, private settings: SettingsService) {}
  private url(p: string) { return `${this.settings.apiBase}${p}`; }

  // vault
  listVault(f: { employer?: string; stage?: string } = {}) {
    let params = new HttpParams();
    if (f.employer) params = params.set('employer', f.employer);
    if (f.stage) params = params.set('stage', f.stage);
    return this.http.get<VaultEntry[]>(this.url('/application-vault'), { params });
  }
  createVaultEntry(b: VaultInput) { return this.http.post<VaultEntry>(this.url('/application-vault'), b); }
  updateVaultEntry(id: string, b: Partial<Pick<VaultEntry, 'stage' | 'notes' | 'followUpDone'>> & { followUpOn?: string | null }) { return this.http.patch<VaultEntry>(this.url(`/application-vault/${id}`), b); }
  vaultReminders() { return this.http.get<VaultReminders>(this.url('/application-vault/reminders')); }
  snoozeVaultEntry(id: string, days: number) { return this.http.post<VaultEntry>(this.url(`/application-vault/${id}/snooze`), { days }); }
  deleteVaultEntry(id: string) { return this.http.delete<void>(this.url(`/application-vault/${id}`)); }

  // readiness
  listPlans() { return this.http.get<PlanListItem[]>(this.url('/readiness-plans')); }
  getPlan(id: string) { return this.http.get<Plan>(this.url(`/readiness-plans/${id}`)); }
  createPlan(b: { targetRole: string; skills: Array<{ name: string; importance: 'required' | 'preferred' }> }) { return this.http.post<Plan>(this.url('/readiness-plans'), b); }
  refreshPlan(id: string) { return this.http.post<Plan>(this.url(`/readiness-plans/${id}/refresh`), {}); }
  addMilestone(id: string, b: { title: string; skill?: string }) { return this.http.post<Plan>(this.url(`/readiness-plans/${id}/milestones`), b); }
  updateMilestone(id: string, mid: string, b: { status?: Milestone['status']; title?: string; note?: string }) { return this.http.patch<Plan>(this.url(`/readiness-plans/${id}/milestones/${mid}`), b); }
  planImportSources() { return this.http.get<PlanImportSources>(this.url('/readiness-plans/import-sources')); }
  planImportPreview(source: 'JOB_DESCRIPTION' | 'CAREER_PATH_ROLE', id: string) { return this.http.post<PlanImport>(this.url('/readiness-plans/import-preview'), { source, id }); }
  deletePlan(id: string) { return this.http.delete<void>(this.url(`/readiness-plans/${id}`)); }

  // interview prep
  listPreps() { return this.http.get<PrepListItem[]>(this.url('/interview-preps')); }
  getPrep(id: string) { return this.http.get<PrepSession>(this.url(`/interview-preps/${id}`)); }
  createPrep(b: { resumeId: string; resumeVersionId?: string; title?: string; roleTitle?: string; company?: string; focusSkills?: string[] }) { return this.http.post<PrepSession>(this.url('/interview-preps'), b); }
  updateQuestion(id: string, qid: string, b: { answer?: string; practiced?: boolean }) { return this.http.patch<PrepSession>(this.url(`/interview-preps/${id}/questions/${qid}`), b); }
  answerFeedback(id: string, qid: string, answer: string) { return this.http.post<PrepSession>(this.url(`/interview-preps/${id}/questions/${qid}/feedback`), { answer }); }
  deletePrep(id: string) { return this.http.delete<void>(this.url(`/interview-preps/${id}`)); }

  // feedback shares
  listShares() { return this.http.get<FeedbackShare[]>(this.url('/feedback-shares')); }
  getShare(id: string) { return this.http.get<FeedbackShare>(this.url(`/feedback-shares/${id}`)); }
  createShare(b: ShareInput) { return this.http.post<FeedbackShare>(this.url('/feedback-shares'), b); }
  revokeShare(id: string) { return this.http.post<FeedbackShare>(this.url(`/feedback-shares/${id}/revoke`), {}); }
  previewShare(id: string) { return this.http.get<SharePreview>(this.url(`/feedback-shares/${id}/preview`)); }
  deleteShare(id: string) { return this.http.delete<void>(this.url(`/feedback-shares/${id}`)); }
  listFeedback(id: string) { return this.http.get<FeedbackEntry[]>(this.url(`/feedback-shares/${id}/feedback`)); }
  logFeedback(id: string, b: Partial<Record<'clarity' | 'relevance' | 'evidence' | 'presentation', number>> & { comment?: string }) { return this.http.post<FeedbackEntry>(this.url(`/feedback-shares/${id}/feedback`), b); }
  decideFeedback(id: string, fid: string, b: { decision: 'ACCEPTED' | 'DECLINED'; note?: string; appliedVersionNumber?: number }) { return this.http.patch<FeedbackEntry>(this.url(`/feedback-shares/${id}/feedback/${fid}`), b); }
  feedbackSummary(id: string) { return this.http.get<FeedbackSummary>(this.url(`/feedback-shares/${id}/summary`)); }
}

export interface VaultReminder { entryId: string; employerLabel: string; jobTitle: string | null; stage: string; kind: 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | 'SUGGESTED'; dueOn: string | null; daysFromToday: number; label: string }
export interface VaultReminders { today: string; counts: { overdue: number; dueToday: number; upcoming: number; suggested: number }; items: VaultReminder[] }

export interface PlanImportSources { jobDescriptions: Array<{ id: string; title: string; company?: string | null }>; roles: Array<{ id: string; title: string; family: string }> }
export interface PlanImport { source: string; sourceId: string; targetRole: string; skills: Array<{ name: string; importance: 'required' | 'preferred' }>; note: string }
