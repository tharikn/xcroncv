import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';

export interface DocTypeInfo { id: string; label: string; inputs: string[]; disclaimer: string | null }
export interface DocSection { id: string; heading: string; text: string; origin: 'PROFILE' | 'USER' }
export interface DocClaim { sectionId: string; text: string; label: 'EVIDENCED' | 'USER_AUTHORED'; evidence: { type: string; id: string; label: string } | null }
export interface DocListItem { id: string; type: string; typeLabel: string; title: string; currentVersion: number; updatedAt: string }
export interface DocDetail {
  id: string; type: string; typeLabel: string; title: string; currentVersion: number; disclaimer: string | null;
  versions: Array<{ versionNumber: number; changeSummary?: string | null; createdAt: string }>;
  version: { versionNumber: number; sections: DocSection[]; claims: DocClaim[] } | null;
}
export interface DocValidation { ok: boolean; evidenced: number; userAuthored: number; stale: Array<{ sectionId: string; text: string }>; placeholders: Array<{ sectionId: string; placeholder: string }> }
export interface DocDiff { from: number; to: number; sections: Array<{ id: string; heading: string; status: 'ADDED' | 'REMOVED' | 'CHANGED' | 'UNCHANGED'; before: string | null; after: string | null }> }

/** Typed client for doc 52 (career document suite). */
@Injectable({ providedIn: 'root' })
export class DocumentsApi {
  constructor(private http: HttpClient, private settings: SettingsService) {}
  private url(p: string) { return `${this.settings.apiBase}/career-documents${p}`; }
  types() { return this.http.get<DocTypeInfo[]>(this.url('/types')); }
  list() { return this.http.get<DocListItem[]>(this.url('')); }
  get(id: string, version?: number) { return this.http.get<DocDetail>(this.url(`/${id}${version ? `?version=${version}` : ''}`)); }
  create(b: { type: string; title?: string; tone?: string; inputs?: Record<string, string> }) { return this.http.post<DocDetail>(this.url(''), b); }
  version(id: string, sections: Array<{ id: string; text: string }>, changeSummary?: string) { return this.http.post<DocDetail>(this.url(`/${id}/versions`), { sections, changeSummary }); }
  validate(id: string) { return this.http.post<DocValidation>(this.url(`/${id}/claims/validate`), {}); }
  diff(id: string, from: number, to: number) { return this.http.get<DocDiff>(this.url(`/${id}/diff?from=${from}&to=${to}`)); }
  /** Streamed bytes, never stored by the server. */
  export(id: string, format: 'txt' | 'md' | 'docx' | 'pdf') { return this.http.post(this.url(`/${id}/export/${format}`), {}, { responseType: 'blob' }); }
  remove(id: string) { return this.http.delete<void>(this.url(`/${id}`)); }
}
