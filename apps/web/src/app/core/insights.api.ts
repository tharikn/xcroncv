import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SettingsService } from './settings.service';

// ---- resume match (docs 23, 29) -----------------------------------------------------------
export type RequirementType = 'required_skill' | 'preferred_skill' | 'responsibility' | 'experience' | 'qualification';
export type MatchStatus = 'exact' | 'related' | 'partial' | 'missing' | 'not_evaluated';

export interface Requirement {
  id: string; type: RequirementType; label: string; normalized?: string; minYears?: number; degreeLevel?: number; alternatives?: string[];
  sourceText: string; confidence: number; included: boolean; explicit?: boolean; origin: 'EXTRACTED' | 'USER';
}
export interface JobDescription {
  id: string; title: string; company?: string | null; location?: string | null; sourceType: 'PASTE' | 'URL'; sourceDomain?: string | null;
  requirements: Requirement[]; extractionVersion: string; revision: number; confirmationStatus: 'UNCONFIRMED' | 'CONFIRMED';
  hasRawText: boolean; createdAt: string; updatedAt: string; warnings?: string[]; requirementCount?: number;
}
export type ImportStatus = 'imported' | 'manual_paste_required' | 'unsupported_source' | 'retrieval_failed';
export interface ImportResult { status: ImportStatus; reason: string; sourceDomain: string | null; jobDescription: JobDescription | null }

export interface EvidenceRef { section: string; itemIndex: number; itemTitle?: string; field: string; bulletIndex?: number; excerpt: string }
export interface MatchItem {
  requirementId: string; label: string; type: RequirementType | 'derived'; dimension: string; status: MatchStatus; method: string; confidence: number;
  points: number; evidence: EvidenceRef[]; sourceText?: string; explanation: string; action?: string;
}
export interface MatchDimension { id: string; label: string; weight: number; applicable: boolean; effectiveWeight: number; score: number | null; itemCount: number; explanation: string }
export interface MatchCoverage {
  applicableWeight: number; dimensionsApplicable: number; dimensionsTotal: number; requirementsIncluded: number; requirementsEvaluated: number;
  confidence: 'high' | 'medium' | 'low'; limitations: string[];
}
export interface MatchReport {
  id: string; resumeId: string; resumeName: string | null; resumeVersionId: string | null; resumeVersionNumber: number | null; jobDescriptionId: string; jdRevision: number; stale: boolean;
  job: { title: string; company?: string | null; location?: string | null; sourceType: string; sourceDomain?: string | null; confirmationStatus: string };
  scoringVersion: string; totalScore: number; dimensions: MatchDimension[]; coverage: MatchCoverage; items: MatchItem[];
  summary: { counts: Record<MatchStatus, number>; strong: string[]; partial: string[]; related: string[]; missing: string[]; notEvaluated: string[]; nextActions: string[]; disclaimer: string };
  createdAt: string;
}
export interface MatchReportRow {
  id: string; resumeId: string; resumeVersionId: string | null; resumeVersionNumber: number | null; jobDescriptionId: string; jdRevision: number; scoringVersion: string;
  totalScore: number; createdAt: string; jdTitle: string; jdCompany?: string | null; stale: boolean; confidence: string | null;
}

// ---- quality review (docs 20, 31) ---------------------------------------------------------
export type Severity = 'critical' | 'warning' | 'suggestion' | 'info';
export interface Finding {
  id: string; ruleId: string; ruleVersion: string; category: string; severity: Severity; title: string; explanation: string;
  evidence: { section: string; itemIndex?: number; itemTitle?: string; field?: string; bulletIndex?: number; text?: string };
  recommendation: string; confidence: number; source: string; requiresUserConfirmation: boolean;
}
export interface QualityDimension { id: string; label: string; weight: number; applicable: boolean; effectiveWeight: number; score: number | null; findings: number; note: string }
export interface QualityComparison {
  previousId: string; previousScore: number; scoreDelta: number | null; scoringVersionChanged: boolean;
  newFindings: Array<{ id: string; ruleId: string; severity: Severity; title: string }>; resolvedFindings: Array<{ id: string; ruleId: string; severity: Severity; title: string }>; message: string;
}
export interface QualityReview {
  id: string; resumeId: string; resumeName: string | null; resumeVersionId: string | null; resumeVersionNumber: number | null; scoringVersion: string; score: number;
  readiness: 'ready' | 'review_recommended' | 'needs_attention'; dimensions: QualityDimension[];
  coverage: { applicableWeight: number; dimensionsApplicable: number; dimensionsTotal: number; limitations: string[] }; counts: Record<Severity, number>;
  findings: Finding[]; disclaimer: string; createdAt: string; comparison?: QualityComparison | null;
}
export interface QualityRow { id: string; resumeId: string; resumeVersionId: string | null; resumeVersionNumber: number | null; scoringVersion: string; score: number; readiness: string; createdAt: string }

// ---- recruiter view (doc 22) --------------------------------------------------------------
export interface RvBullet { index: number; text: string; highlight: boolean; matched: string[] }
export interface RvItem {
  index: number; title?: string; subtitle?: string; meta?: string; text?: string; bullets: RvBullet[]; hiddenBullets: number; tags: string[]; hiddenTags: number;
  url?: string; collapsed: boolean; annotationIds: string[];
}
export interface RvSection { type: string; title: string; text?: string; items: RvItem[]; totalItems: number; hiddenItems: number; annotationIds: string[] }
export interface RvAnnotation { id: string; ruleId: string; severity: string; category: string; title: string; explanation: string; section: string; itemIndex?: number; bulletIndex?: number; text?: string }
export interface RecruiterView {
  mode: 'quick' | 'full'; anonymized: boolean; readOnly: true; identity: { name: string; headline?: string; targetRole?: string };
  contacts: string[]; links: Array<{ label: string; url?: string }>;
  overview: { currentRole?: string; currentEmployer?: string; statedExperienceYears: number | null; roleCount: number; statedLevel?: string; coreSkills: string[]; note: string };
  sections: RvSection[]; navigation: Array<{ type: string; title: string }>;
  collapsedSummary: { hiddenItems: number; hiddenBullets: number; hiddenTags: number; message: string };
  annotations: RvAnnotation[]; resume: { id: string; name: string; versionId: string | null; versionNumber: number | null };
}

/** Typed client for the match / quality / recruiter-view modules. Replace with the generated SDK when packages/sdk lands. */
@Injectable({ providedIn: 'root' })
export class InsightsApi {
  constructor(private http: HttpClient, private settings: SettingsService) {}
  private url(p: string) { return `${this.settings.apiBase}${p}`; }

  // job descriptions
  createJd(b: { title: string; company?: string; location?: string; text: string; retainRawText?: boolean }) { return this.http.post<JobDescription>(this.url('/job-descriptions'), b); }
  importUrl(url: string) { return this.http.post<ImportResult>(this.url('/job-descriptions/import-url'), { url }); }
  getJd(id: string) { return this.http.get<JobDescription>(this.url(`/job-descriptions/${id}`)); }
  listJds() { return this.http.get<JobDescription[]>(this.url('/job-descriptions')); }
  updateJd(id: string, b: { title?: string; company?: string; location?: string; requirements?: Requirement[]; confirm?: boolean }) {
    return this.http.patch<JobDescription>(this.url(`/job-descriptions/${id}`), b);
  }
  deleteJd(id: string) { return this.http.delete<void>(this.url(`/job-descriptions/${id}`)); }

  // match reports
  createReport(resumeId: string, b: { jobDescriptionId: string; resumeVersionId?: string }) { return this.http.post<MatchReport>(this.url(`/resumes/${resumeId}/match-reports`), b); }
  listReports(resumeId: string, jobDescriptionId?: string) {
    let params = new HttpParams(); if (jobDescriptionId) params = params.set('jobDescriptionId', jobDescriptionId);
    return this.http.get<MatchReportRow[]>(this.url(`/resumes/${resumeId}/match-reports`), { params });
  }
  getReport(id: string) { return this.http.get<MatchReport>(this.url(`/resume-match-reports/${id}`)); }
  recalculate(id: string) { return this.http.post<MatchReport>(this.url(`/resume-match-reports/${id}/recalculate`), {}); }
  deleteReport(id: string) { return this.http.delete<void>(this.url(`/resume-match-reports/${id}`)); }

  // quality
  runQuality(resumeId: string, resumeVersionId?: string): Observable<QualityReview> { return this.http.post<QualityReview>(this.url(`/resumes/${resumeId}/quality-reviews`), resumeVersionId ? { resumeVersionId } : {}); }
  exportCheck(resumeId: string, resumeVersionId?: string) { return this.http.post<ExportCheckReport>(this.url(`/resumes/${resumeId}/quality-reviews/export-check`), resumeVersionId ? { resumeVersionId } : {}); }
  listQuality(resumeId: string) { return this.http.get<QualityRow[]>(this.url(`/resumes/${resumeId}/quality-reviews`)); }
  getQuality(id: string) { return this.http.get<QualityReview>(this.url(`/quality-reviews/${id}`)); }

  // recruiter view
  recruiterView(resumeId: string, o: { mode: 'quick' | 'full'; anonymize: boolean; annotations: boolean; versionId?: string }) {
    let params = new HttpParams().set('mode', o.mode).set('anonymize', String(o.anonymize)).set('annotations', String(o.annotations));
    if (o.versionId) params = params.set('versionId', o.versionId);
    return this.http.get<RecruiterView>(this.url(`/resumes/${resumeId}/recruiter-view`), { params });
  }
}

export interface ExportCheckReport {
  checkVersion: string; resumeVersionNumber: number | null; note: string;
  checks: Array<{ format: 'pdf' | 'docx'; ok: boolean; pages: number | null; wordCoverage: number; missingSample: string[]; readingOrderOk: boolean | null; replacementChars: number; findings: Array<{ id: string; severity: 'warning' | 'info'; title: string; explanation: string; recommendation: string }> }>;
}
