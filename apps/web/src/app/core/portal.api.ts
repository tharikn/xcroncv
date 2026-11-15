import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';

export interface PortalJob { id: string; hostId: string; externalId: string; title: string; company: string; location?: string | null; applyUrl?: string | null; requirements: string[]; description?: string; updatedAt: string }
export interface ProposalItem { id: string; type: 'EMPHASISE_SKILL' | 'LEAD_WITH_EXPERIENCE' | 'NO_RECORDED_EVIDENCE'; requirement: string; refs: Array<{ type: string; id: string; label: string }>; note: string; decision: 'PENDING' | 'ACCEPT' | 'REJECT' }
export interface Proposal { id: string; jobContextId: string; resumeId: string; items: ProposalItem[]; notice: string }
export interface PortalApplication { id: string; jobContextId: string; resumeId: string; versionNumber: number; hostStatus?: string | null; createdAt: string }
export interface JobInput { hostId: string; externalId: string; title: string; company: string; location?: string; applyUrl?: string; description: string; requirements?: string[]; consent: boolean }

/** Typed client for doc 32 (job portal integration). */
@Injectable({ providedIn: 'root' })
export class PortalApi {
  constructor(private http: HttpClient, private settings: SettingsService) {}
  private url(p: string) { return `${this.settings.apiBase}${p}`; }
  jobs() { return this.http.get<PortalJob[]>(this.url('/portal/job-contexts')); }
  job(id: string) { return this.http.get<PortalJob>(this.url(`/portal/job-contexts/${id}`)); }
  upsert(b: JobInput) { return this.http.put<PortalJob>(this.url('/portal/job-contexts'), b); }
  remove(id: string) { return this.http.delete<void>(this.url(`/portal/job-contexts/${id}`)); }
  propose(id: string, resumeId: string) { return this.http.post<Proposal>(this.url(`/portal/job-contexts/${id}/proposals`), { resumeId }); }
  decide(proposalId: string, itemId: string, decision: 'ACCEPT' | 'REJECT') { return this.http.post<Proposal>(this.url(`/portal/proposals/${proposalId}/decisions`), { itemId, decision }); }
  applications() { return this.http.get<PortalApplication[]>(this.url('/portal/applications')); }
  record(b: { jobContextId: string; resumeId: string; versionNumber: number; proposalId?: string; confirm: boolean }) { return this.http.post<PortalApplication>(this.url('/portal/applications'), b); }
  setStatus(id: string, hostStatus: string) { return this.http.patch<PortalApplication>(this.url(`/portal/applications/${id}`), { hostStatus }); }
  removeApplication(id: string) { return this.http.delete<void>(this.url(`/portal/applications/${id}`)); }
}
