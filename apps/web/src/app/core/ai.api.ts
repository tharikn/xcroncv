import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';

export type AiTask = 'REWRITE_BULLET' | 'SUMMARY_DRAFT' | 'KEYWORD_GAPS' | 'POLISH_TEXT' | 'COACH_ANSWER';
export interface AiStatus {
  enabled: boolean; consentAt: string | null;
  provider: { id: string; model: string; available: boolean; external: boolean };
  quota: { limit: number; used: number; windowHours: number };
  tasks: AiTask[]; guarantees: string[];
}
export interface AiSuggestion {
  id: string; feature: AiTask; provider: string; status: 'PENDING' | 'ACCEPTED' | 'REJECTED'; inputPreview: string;
  output: { text: string; notes: string[]; questions: string[] };
  provenance: { redacted: boolean; injectionFlagged: boolean; sourceFields: string[] };
  createdAt: string; decidedAt: string | null; requiresApproval: boolean;
}
export interface AiUsage {
  windowDays: number; totalCalls: number; failures: number;
  byFeature: Record<string, { calls: number; ok: number; inputTokens: number; outputTokens: number; costMicros: number }>;
  suggestions: { accepted: number; rejected: number; pending: number }; note: string;
}

/** Typed client for docs 06/38 (AI gateway). Replace with the generated SDK when packages/sdk is published. */
@Injectable({ providedIn: 'root' })
export class AiApi {
  constructor(private http: HttpClient, private settings: SettingsService) {}
  private url(p: string) { return `${this.settings.apiBase}${p}`; }
  status() { return this.http.get<AiStatus>(this.url('/ai/status')); }
  setEnabled(enabled: boolean) { return this.http.put<AiStatus>(this.url('/ai/settings'), { enabled }); }
  usage() { return this.http.get<AiUsage>(this.url('/ai/usage')); }
  suggest(b: { task: AiTask; text: string; context?: { title?: string; years?: number; skills?: string[] } }) { return this.http.post<AiSuggestion>(this.url('/ai/suggestions'), b); }
  suggestions() { return this.http.get<AiSuggestion[]>(this.url('/ai/suggestions')); }
  decide(id: string, b: { decision: 'ACCEPT' | 'REJECT'; confirm?: boolean }) { return this.http.post<AiSuggestion & { applied: boolean }>(this.url(`/ai/suggestions/${id}/decision`), b); }
  purge() { return this.http.delete<{ deleted: number }>(this.url('/ai/suggestions')); }
}
