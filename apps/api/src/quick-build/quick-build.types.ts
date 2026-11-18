import { RenderModel } from '../render-model/render-model.types';
import { Decision, LayoutPlan, LayoutViolation } from '../resume-layout';
import { JdAnalysis } from '../resume-match/jd-analyzer';
import { ContentPlan } from './content-selector';

export interface BuildReport {
  version: string;
  engineVersion: string;
  createdAt: string;
  durationMs: number;
  maxPages: number;
  pageCount: number;
  fills: { main: number; side: number; lastPage: number; imbalance: number };
  repairs: number;
  decisions: Decision[];
  violations: LayoutViolation[];
  warnings: string[];
  usedAi: boolean;
  summarySource: 'ai' | 'rule-based';
  content: { sections: number; items: number; bullets: number; words: number; dropped: string[] };
  template: { id: string; version: number; name: string; layout: string; atsProfile: string };
}

export interface QuickBuildTemplate {
  id: string;
  version: number;
  name: string;
  category: string;
  layout: string;
  atsProfile: string;
}

export interface QuickBuildPayload {
  jd: JdAnalysis;
  template: QuickBuildTemplate;
  content: ContentPlan;
  plan: LayoutPlan;
  report: BuildReport;
  model: RenderModel;
}
