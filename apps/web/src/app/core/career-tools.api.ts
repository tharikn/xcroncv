import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SettingsService } from './settings.service';

// ---- cover letters (doc 42) ---------------------------------------------------------------
export type ClaimStatus = 'SUPPORTED' | 'USER_AUTHORED' | 'UNSUPPORTED';
export interface LetterSection { id: string; heading: string; text: string; origin: 'GENERATED' | 'USER' }
export interface Claim { sectionId: string; text: string; kind: string; status: ClaimStatus; evidence?: string }
export interface LetterTemplate { id: string; version: number; name: string; description: string }
export interface CoverLetterSummary {
  id: string; title: string; company?: string | null; jobTitle?: string | null; kind: string; tone: string; length: string;
  currentVersion: number; updatedAt: string;
}
export interface LetterVersionRef { id: string; versionNumber: number; changeSummary?: string | null; createdAt: string }
export interface CoverLetterDetail extends CoverLetterSummary {
  version: (LetterVersionRef & { sections: LetterSection[]; claims: Claim[] }) | null;
  versions: LetterVersionRef[];
}
export interface DraftRequest {
  title: string; company?: string; jobTitle?: string; kind?: string; tone?: string; length?: string;
  resumeId?: string; referrerName?: string; jdText?: string;
}
export interface Binding { id: string; coverLetterId: string; versionNumber: number; applicationRef: string; createdAt: string }

// ---- CRM (doc 46) -------------------------------------------------------------------------
export interface Channel { type: 'email' | 'phone' | 'linkedin' | 'other'; value: string }
export interface Contact {
  id: string; name: string; organization?: string | null; role?: string | null; relationship: string;
  channels: Channel[]; tags: string[]; notes?: string | null; updatedAt?: string;
}
export interface ContactLink { id: string; kind: 'JOB' | 'APPLICATION'; externalRef: string; label?: string | null }
export interface Activity { id: string; contactId?: string | null; type: string; occurredAt: string; summary: string; externalRef?: string | null }
export interface FollowUpTask { id: string; contactId?: string | null; title: string; dueAt: string; status: 'OPEN' | 'DONE' | 'CANCELLED' }
export interface ContactDetail extends Contact { links: ContactLink[]; activities: Activity[]; tasks: FollowUpTask[] }
export type ContactInput = Partial<Omit<Contact, 'id' | 'updatedAt'>> & { name: string };

// ---- job search analytics (doc 48) --------------------------------------------------------
export interface Rate { numerator: number; denominator: number; rate: number | null; sampleSize: number }
export interface AnalyticsFilters { from?: string; to?: string; roleFamily?: string; geography?: string; seniority?: string; sourceName?: string }
export interface Overview {
  window: { from: string | null; to: string | null };
  totals: { saved: number; applied: number; responses: number; interviews: number; offers: number; rejections: number };
  followUps: { open: number; overdue: number; done: number };
  timeToResponseDays: { median: number | null; sampleSize: number; note: string };
  coverage: { manualEvents: number; hostEvents: number; totalEvents: number; incomplete: boolean; note: string };
  freshness: { lastEventAt: string | null };
}
export interface FunnelStage extends Rate { stage: string; count: number; label: string }
export interface Funnel { window: Overview['window']; stages: FunnelStage[]; quality: { missingAppliedEvent: number; notes: string[] } }
export interface VersionInsight { resumeVersionId: string; applications: number; sufficientSample: boolean; responseRate: Rate | null; interviewRate: Rate | null; note?: string }
export interface VersionInsights { minCohort: number; versions: VersionInsight[]; caveat: string }
export interface ActivityWeeks { bucket: 'week'; weeks: Array<{ weekStart: string; counts: Record<string, number>; total: number }> }
export interface JobEventInput {
  type: string; occurredAt: string; applicationRef: string; source?: 'MANUAL' | 'HOST'; roleFamily?: string; geography?: string;
  seniority?: string; sourceName?: string; resumeVersionId?: string; idempotencyKey?: string;
}

/** Typed client for the optional career-tool modules (docs 42, 46, 48). Replace with the generated SDK when packages/sdk lands. */
@Injectable({ providedIn: 'root' })
export class CareerToolsApi {
  constructor(private http: HttpClient, private settings: SettingsService) {}
  private url(p: string) { return `${this.settings.apiBase}${p}`; }
  private params(f: object = {}) {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    return p;
  }

  // cover letters
  letterTemplates() { return this.http.get<LetterTemplate[]>(this.url('/cover-letters/templates')); }
  listLetters() { return this.http.get<CoverLetterSummary[]>(this.url('/cover-letters')); }
  getLetter(id: string) { return this.http.get<CoverLetterDetail>(this.url(`/cover-letters/${id}`)); }
  createDraft(b: DraftRequest) { return this.http.post<CoverLetterSummary & { version: LetterVersionRef & { sections: LetterSection[]; claims: Claim[] }; unsupportedClaims: number }>(this.url('/cover-letters/drafts'), b); }
  saveLetterVersion(id: string, b: { sections: LetterSection[]; changeSummary?: string; userAuthored?: string[] }) {
    return this.http.post<LetterVersionRef & { claims: Claim[]; unsupportedClaims: number }>(this.url(`/cover-letters/${id}/versions`), b);
  }
  validateClaims(id: string, b: { sections: LetterSection[]; userAuthored?: string[] }) {
    return this.http.post<{ claims: Claim[]; unsupportedClaims: number }>(this.url(`/cover-letters/${id}/claims/validate`), b);
  }
  deleteLetter(id: string) { return this.http.delete<void>(this.url(`/cover-letters/${id}`)); }
  exportLetter(id: string, format: 'pdf' | 'html' | 'txt'): Observable<Blob> { return this.http.post(this.url(`/cover-letters/${id}/export/${format}`), {}, { responseType: 'blob' }); }
  bindLetter(applicationRef: string, b: { coverLetterId: string; versionNumber: number; confirm: boolean }) {
    return this.http.post<Binding>(this.url(`/applications/${encodeURIComponent(applicationRef)}/cover-letter-bindings`), b);
  }

  // CRM
  listContacts(q?: { q?: string; tag?: string }) { return this.http.get<Contact[]>(this.url('/contacts'), { params: this.params(q) }); }
  getContact(id: string) { return this.http.get<ContactDetail>(this.url(`/contacts/${id}`)); }
  createContact(b: ContactInput) { return this.http.post<Contact>(this.url('/contacts'), b); }
  updateContact(id: string, b: Partial<ContactInput>) { return this.http.patch<Contact>(this.url(`/contacts/${id}`), b); }
  deleteContact(id: string) { return this.http.delete<void>(this.url(`/contacts/${id}`)); }
  linkContact(id: string, b: { kind: 'JOB' | 'APPLICATION'; externalRef: string; label?: string }) { return this.http.post<ContactLink>(this.url(`/contacts/${id}/links`), b); }
  previewContactImport(csv: string, consent: boolean) { return this.http.post<ContactImportPreview>(this.url('/contacts/import/preview'), { csv, consent }); }
  commitContactImport(csv: string, consent: boolean) { return this.http.post<{ created: number; skippedDuplicates: number; invalid: number; truncated: boolean }>(this.url('/contacts/import/commit'), { csv, consent }); }
  exportContacts() { return this.http.get(this.url('/contacts/export'), { responseType: 'blob' }); }
  createActivity(b: { contactId?: string; type: string; occurredAt: string; summary: string }) { return this.http.post<Activity>(this.url('/job-activities'), b); }
  deleteActivity(id: string) { return this.http.delete<void>(this.url(`/job-activities/${id}`)); }
  listTasks(status?: string) { return this.http.get<FollowUpTask[]>(this.url('/follow-up-tasks'), { params: this.params({ status }) }); }
  createTask(b: { contactId?: string; title: string; dueAt: string }) { return this.http.post<FollowUpTask>(this.url('/follow-up-tasks'), b); }
  updateTask(id: string, b: { status?: string; title?: string; dueAt?: string }) { return this.http.patch<FollowUpTask>(this.url(`/follow-up-tasks/${id}`), b); }

  // analytics
  overview(f?: AnalyticsFilters) { return this.http.get<Overview>(this.url('/analytics/job-search/overview'), { params: this.params(f) }); }
  funnel(f?: AnalyticsFilters) { return this.http.get<Funnel>(this.url('/analytics/job-search/funnel'), { params: this.params(f) }); }
  versionInsights(f?: AnalyticsFilters) { return this.http.get<VersionInsights>(this.url('/analytics/job-search/resume-versions'), { params: this.params(f) }); }
  activityWeeks(f?: AnalyticsFilters) { return this.http.get<ActivityWeeks>(this.url('/analytics/job-search/activity'), { params: this.params(f) }); }
  recordEvents(events: JobEventInput[]) { return this.http.post<{ created: number; duplicates: number }>(this.url('/analytics/job-search/events'), { events }); }
  ingestFromVault() { return this.http.post<{ applications: number; created: number; duplicates: number }>(this.url('/analytics/job-search/ingest/vault'), { confirm: true }); }
  exportAnalytics() { return this.http.post(this.url('/analytics/exports'), {}, { responseType: 'blob' }); }
  deleteEvents() { return this.http.delete<{ deleted: number }>(this.url('/analytics/events'), { params: this.params({ confirm: 'true' }) }); }
}

export interface ContactImportRow { line: number; status: 'NEW' | 'DUPLICATE' | 'INVALID'; reason?: string; contact?: { name: string; organization?: string; role?: string } }
export interface ContactImportPreview { rows: ContactImportRow[]; truncated: boolean; unmappedColumns: string[]; summary: { new: number; duplicate: number; invalid: number } }
