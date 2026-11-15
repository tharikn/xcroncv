import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';

export type EvidenceStatus = 'RECORDED_SKILL' | 'RECORDED_IN_EXPERIENCE' | 'NO_RECORDED_EVIDENCE';
export interface SkillAssessment { label: string; status: EvidenceStatus; evidence: Array<{ type: string; id: string; label: string }> }
export interface PathOption {
  roleId: string; title: string; family: string; summary: string; coverage: { covered: number; total: number };
  skills: SkillAssessment[]; transferable: string[]; noRecordedEvidence: string[]; why: string[]; adjacentToCurrent: boolean; isTarget: boolean;
}
export interface Analysis { taxonomyVersion: string; currentRole: { id: string; title: string } | null; options: PathOption[]; notes: string[] }
export interface RoleInfo { id: string; title: string; family: string; summary: string }
export interface Milestone { id: string; title: string; targetDate?: string | null; status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE'; notes?: string | null; position: number }
export interface Plan {
  id: string; title: string; targetRoleId: string; targetRoleTitle: string; status: 'ACTIVE' | 'PAUSED' | 'DONE'; notes?: string | null;
  progress: { done: number; total: number }; milestones: Milestone[]; basis: { why?: string[] };
}
export interface CompObservation { role: string; geography: string; currency: string; period: string; p25?: number; median: number; p75?: number; sampleSize?: number; source: string; observedAt: string }
export interface CompInsights { available: boolean; observations: CompObservation[]; reason?: string | null; note?: string }

/** Typed client for doc 44 (career path and compensation). */
@Injectable({ providedIn: 'root' })
export class CareerPathApi {
  constructor(private http: HttpClient, private settings: SettingsService) {}
  private url(p: string) { return `${this.settings.apiBase}${p}`; }
  roles() { return this.http.get<{ taxonomyVersion: string; roles: RoleInfo[] }>(this.url('/career-paths/roles')); }
  analyze(targetRoleId?: string) { return this.http.post<Analysis>(this.url('/career-paths/analyze'), targetRoleId ? { targetRoleId } : {}); }
  listPlans() { return this.http.get<Plan[]>(this.url('/career-paths')); }
  createPlan(roleId: string, title?: string) { return this.http.post<Plan>(this.url('/career-paths'), { roleId, title }); }
  updatePlan(id: string, b: { title?: string; status?: string; notes?: string }) { return this.http.patch<Plan>(this.url(`/career-paths/${id}`), b); }
  deletePlan(id: string) { return this.http.delete<void>(this.url(`/career-paths/${id}`)); }
  addMilestone(id: string, b: { title: string; targetDate?: string }) { return this.http.post<Plan>(this.url(`/career-paths/${id}/milestones`), b); }
  updateMilestone(id: string, mid: string, b: { title?: string; targetDate?: string | null; status?: string; notes?: string }) { return this.http.patch<Plan>(this.url(`/career-paths/${id}/milestones/${mid}`), b); }
  removeMilestone(id: string, mid: string) { return this.http.delete<Plan>(this.url(`/career-paths/${id}/milestones/${mid}`)); }
  compensation(role: string, location?: string, currency?: string) {
    const q = new URLSearchParams({ role, ...(location ? { location } : {}), ...(currency ? { currency } : {}) });
    return this.http.get<CompInsights>(this.url(`/compensation-insights?${q.toString()}`));
  }
}
