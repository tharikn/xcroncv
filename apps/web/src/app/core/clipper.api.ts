import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';

export interface Clip { id: string; title: string; company: string; url?: string | null; hostname?: string | null; source: 'MANUAL' | 'EXTENSION'; status: 'NEW' | 'REVIEWED' | 'ARCHIVED'; createdAt: string; excerpt?: string; description?: string; descriptionLength: number; duplicate?: boolean }
export interface ClipInput { title: string; company: string; url?: string; description: string; source: 'MANUAL' | 'EXTENSION'; reviewed: boolean; idempotencyKey?: string }
export interface ClipAnalysis { clipId: string; terms: Array<{ label: string; matchedText: string; inProfile: boolean }>; inProfile: number; notRecorded: number; notes: string[] }
export interface ExtSession { id: string; label: string; expiresAt: string; state: 'ACTIVE' | 'EXPIRED' | 'REVOKED' }

/** Typed client for doc 45 (job clipper). */
@Injectable({ providedIn: 'root' })
export class ClipperApi {
  constructor(private http: HttpClient, private settings: SettingsService) {}
  private url(p: string) { return `${this.settings.apiBase}${p}`; }
  list() { return this.http.get<Clip[]>(this.url('/clipped-jobs')); }
  get(id: string) { return this.http.get<Clip>(this.url(`/clipped-jobs/${id}`)); }
  create(b: ClipInput) { return this.http.post<Clip>(this.url('/clipped-jobs'), b); }
  update(id: string, b: Partial<Pick<Clip, 'title' | 'company' | 'status'>> & { url?: string; description?: string }) { return this.http.patch<Clip>(this.url(`/clipped-jobs/${id}`), b); }
  remove(id: string) { return this.http.delete<void>(this.url(`/clipped-jobs/${id}`)); }
  analyze(id: string) { return this.http.post<ClipAnalysis>(this.url(`/clipped-jobs/${id}/analyze`), {}); }
  sessions() { return this.http.get<ExtSession[]>(this.url('/extension/sessions')); }
  createSession(label: string) { return this.http.post<ExtSession>(this.url('/extension/sessions'), { label }); }
  revokeSession(id: string) { return this.http.post<ExtSession>(this.url(`/extension/sessions/${id}/revoke`), {}); }
}
