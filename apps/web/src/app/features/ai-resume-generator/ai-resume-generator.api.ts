import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SettingsService } from '../../core/settings.service';
import { Requirement } from '../../core/insights.api';

export type Seniority = 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'principal';

export interface SuggestedSection {
  key: string;
  label: string;
  priority: number;
}

export interface JdAnalysisPayload {
  requirements: Requirement[];
  seniority?: Seniority;
  detectedTitle?: string;
  workMode?: 'remote' | 'hybrid' | 'onsite';
  warnings: string[];
}

export interface JdResumeGeneratorResult {
  templateId: string;
  templateName: string;
  templateCategory: string;
  suggestedSections: SuggestedSection[];
  summary: string;
  summarySource: 'ai' | 'rule-based';
  matchedSkills: string[];
  jdAnalysis: JdAnalysisPayload;
  /** Sanitized JD text, echoed back so the same input can seed the cover-letter draft. */
  jdText: string;
}

export interface GenerateFromJdDto {
  jdText: string;
}

/** Typed client for the stateless JD analysis endpoint (paste or upload). */
@Injectable({ providedIn: 'root' })
export class AiResumeGeneratorApi {
  constructor(private http: HttpClient, private settings: SettingsService) {}

  private url(p: string) { return `${this.settings.apiBase}${p}`; }

  analyze(dto: GenerateFromJdDto) {
    return this.http.post<JdResumeGeneratorResult>(this.url('/jd-resume-generator/analyze'), dto);
  }

  analyzeUpload(file: File) {
    const fd = new FormData();
    fd.append('file', file, file.name);
    return this.http.post<JdResumeGeneratorResult>(this.url('/jd-resume-generator/analyze/upload'), fd);
  }
}
