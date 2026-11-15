import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';

export interface Dimension { key: string; label: string; status: 'STRONG' | 'COULD_IMPROVE'; observation: string }
export interface CopilotQuestion { id: string; text: string; why: string; kind: 'EXPERIENCE' | 'GAP' | 'GENERAL' }
export interface CopilotAnswerView { id: string; questionId: string; text?: string | null; wordCount: number; feedback: Dimension[] }
export interface CopilotSession { id: string; jobTitle: string; resumeId: string; versionNumber: number; retainAnswers: boolean; status: string; mode: string; notice: string; questions: CopilotQuestion[]; answers: CopilotAnswerView[] }
export interface CopilotListItem { id: string; jobTitle: string; versionNumber: number; status: string; answered: number; total: number; createdAt: string }
export interface CopilotSummary { answered: number; total: number; dimensions: Record<string, { strong: number; couldImprove: number }>; note: string }

/** Typed client for doc 51 (interview copilot, text practice). */
@Injectable({ providedIn: 'root' })
export class CopilotApi {
  constructor(private http: HttpClient, private settings: SettingsService) {}
  private url(p: string) { return `${this.settings.apiBase}/interview-copilot/sessions${p}`; }
  list() { return this.http.get<CopilotListItem[]>(this.url('')); }
  get(id: string) { return this.http.get<CopilotSession>(this.url(`/${id}`)); }
  create(b: { resumeId: string; versionNumber: number; jobTitle: string; jobDescription?: string; retainAnswers: boolean; confirmPracticeOnly: boolean }) { return this.http.post<CopilotSession>(this.url(''), b); }
  answer(id: string, questionId: string, text: string) { return this.http.post<{ questionId: string; wordCount: number; feedback: Dimension[]; retained: boolean }>(this.url(`/${id}/answers`), { questionId, text }); }
  summary(id: string) { return this.http.post<CopilotSummary>(this.url(`/${id}/feedback`), {}); }
  consent(id: string, retainAnswers: boolean) { return this.http.post<CopilotSession>(this.url(`/${id}/consent`), { retainAnswers }); }
  remove(id: string) { return this.http.delete<void>(this.url(`/${id}`)); }
}
