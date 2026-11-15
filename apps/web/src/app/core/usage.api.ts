import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';

/** Doc 16: allowlisted usage events only. No resume content, names, paths or free text is ever sent. */
export type UsageEventName = 'DASHBOARD_OPENED' | 'DESIGNER_OPENED' | 'DESIGNER_ACTIVITY' | 'TEMPLATE_SELECTED' | 'PREVIEW_RENDERED'
  | 'EXPORT_REQUESTED' | 'EXPORT_SUCCEEDED' | 'EXPORT_FAILED' | 'LOCAL_SAVE_SUCCEEDED' | 'DOWNLOAD_INITIATED' | 'ATS_REPORT_GENERATED' | 'RESUME_CREATED' | 'GOOGLE_DOC_CREATED';
export interface UsageEventInput {
  name: UsageEventName; templateId?: string; templateVersion?: number; exportFormat?: 'PDF' | 'HTML' | 'DOCX' | 'XLSX';
  status?: 'OK' | 'FAILED'; failureCategory?: 'VALIDATION' | 'RENDER' | 'PERMISSION' | 'STORAGE' | 'NETWORK' | 'OTHER'; durationMs?: number;
}
export interface UsageReport {
  filters: Record<string, string | null>;
  kpis: Record<string, number>;
  daily: { date: string; resumesCreated: number; exportRequests: number; exportsSucceeded: number; localSaves: number; previews: number }[];
  funnel: { stage: string; users: number }[];
  platforms: Record<string, number>; exportFormats: Record<string, number>; failureCategories: Record<string, number>;
  templates: { templateId: string; templateVersion: number | null; events: number; users: number | null }[];
  ai: { requests: number; failed: number; estimatedCostMicros: number; byFeature: { feature: string; requests: number; failed: number; costMicros: number }[] };
  notes: string[];
}

@Injectable({ providedIn: 'root' })
export class UsageApi {
  constructor(private http: HttpClient, private settings: SettingsService) {}
  private url(p: string) { return `${this.settings.apiBase}${p}`; }
  report(q: { from?: string; to?: string; platform?: string }) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(q)) if (v) params = params.set(k, v);
    return this.http.get<UsageReport>(this.url('/admin/analytics/usage'), { params });
  }
  /** Fire-and-forget: telemetry must never block or break a user action. */
  emit(e: UsageEventInput, platform: 'WEB' | 'ANDROID' = 'WEB') {
    const body = { events: [{ ...e, eventId: crypto.randomUUID(), occurredAt: new Date().toISOString(), platform }] };
    this.http.post(this.url('/analytics/usage/events'), body).subscribe({ error: () => undefined });
  }
}
