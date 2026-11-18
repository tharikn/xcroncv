import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SettingsService } from '../../core/settings.service';

export interface QuickBuildPlanMetrics {
  pageCount: number;
  mainFill: number;
  sideFill: number;
  imbalance: number;
  lastPageFill: number;
  repairs: number;
  unplaced: number;
}

export interface QuickBuildDecision {
  stage: 'content' | 'balance' | 'paginate' | 'repair';
  action: string;
  reason: string;
  sectionKey?: string;
  from?: string;
  to?: string;
  page?: number;
}

export interface QuickBuildContentSection {
  key: string;
  included: boolean;
  relevance: number;
  items: Array<{ sourceIndex: number; score: number; bullets: number }>;
  excluded: Array<{ sourceIndex: number; reason: string }>;
}

export interface QuickBuildTemplateInfo {
  id: string;
  version: number;
  name: string;
  category: string;
  layout: string;
  atsProfile: string;
}

export interface QuickBuildReport {
  pageCount: number;
  maxPages: number;
  repairs: number;
  decisions: QuickBuildDecision[];
  violations: Array<{ code: string; severity: 'hard' | 'soft'; message: string }>;
  warnings: string[];
  usedAi: boolean;
  summarySource: 'ai' | 'rule-based';
  content: { sections: number; items: number; bullets: number; words: number; dropped: string[] };
  template: QuickBuildTemplateInfo;
}

export interface QuickBuildPreview {
  jd: { detectedTitle?: string; seniority?: string; requirements: Array<{ label: string; type: string }> };
  template: QuickBuildTemplateInfo;
  content: { sections: QuickBuildContentSection[]; warnings: string[]; usedAi: boolean };
  plan: {
    metrics: QuickBuildPlanMetrics;
    decisions: QuickBuildDecision[];
    warnings: string[];
    columns: Array<{ id: 'main' | 'side' }>;
  };
  report: QuickBuildReport;
}

export interface QuickBuildCreated {
  resume: { id: string; name: string; templateId: string; templateVersion: number };
  report: QuickBuildReport;
  plan: QuickBuildPreview['plan'];
}

export interface QuickBuildRequest {
  jdText: string;
  jobTitle?: string;
  templateId?: string;
  name?: string;
  maxPages?: number;
  useAi?: boolean;
}

/**
 * Typed client for the Smart Quick Build endpoints.
 *
 * Preview runs the whole pipeline (JD analysis, content selection, deterministic layout, repair)
 * without writing anything. Create persists the resume plus its frozen snapshot and layout plan.
 */
@Injectable({ providedIn: 'root' })
export class QuickBuildApi {
  constructor(private http: HttpClient, private settings: SettingsService) {}

  private url(p: string) { return `${this.settings.apiBase}${p}`; }

  preview(dto: QuickBuildRequest) {
    return this.http.post<QuickBuildPreview>(this.url('/quick-build/preview'), dto);
  }

  create(dto: QuickBuildRequest) {
    return this.http.post<QuickBuildCreated>(this.url('/quick-build'), dto);
  }

  report(id: string) {
    return this.http.get<{ report: QuickBuildReport | null; plan: QuickBuildPreview['plan'] | null }>(
      this.url(`/quick-build/resumes/${id}/report`),
    );
  }
}
