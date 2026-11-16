import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SettingsService } from '../../core/settings.service';
import { Requirement } from '../../core/insights.api';
import { TemplateSummary } from '../../core/models';

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
  allTemplates: TemplateSummary[];
}

export interface GenerateFromJdDto {
  jdText: string;
  jobTitle?: string;
  company?: string;
  templateId?: string;
}

@Injectable({ providedIn: 'root' })
export class AiResumeGeneratorApi {
  constructor(private http: HttpClient, private settings: SettingsService) {}

  private url(p: string) { return `${this.settings.apiBase}${p}`; }

  analyze(dto: GenerateFromJdDto) {
    return this.http.post<JdResumeGeneratorResult>(this.url('/jd-resume-generator/analyze'), dto);
  }

  analyzeUpload(file: File, jobTitle?: string, templateId?: string) {
    const fd = new FormData();
    fd.append('file', file, file.name);
    if (jobTitle) fd.append('jobTitle', jobTitle);
    if (templateId) fd.append('templateId', templateId);
    return this.http.post<JdResumeGeneratorResult>(this.url('/jd-resume-generator/analyze/upload'), fd);
  }

  getTemplates() {
    return this.http.get<TemplateSummary[]>(this.url('/jd-resume-generator/templates'));
  }
}
