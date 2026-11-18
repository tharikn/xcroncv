import { SectionType, TemplateLayout, TemplateTheme } from '../templates/template.types';
import type { LayoutPlan } from '../resume-layout/layout.types';
import { DocImage, ElementStyle } from './resume-doc';

export interface RenderItem {
  id?: string;            // visual-editor documents only: stable key for per-element styles
  title?: string;
  subtitle?: string;
  meta?: string;          // dates / location
  text?: string;
  bullets?: string[];
  tags?: string[];
  url?: string;
  image?: DocImage;       // small cropped logo (visual editor)
}

export interface RenderSection {
  id?: string;
  type: SectionType | 'custom';
  title: string;
  text?: string;          // summary only
  items?: RenderItem[];
  pageBreakBefore?: boolean;  // visual-editor documents only: force this section onto a new page
  column?: 'main' | 'side'; // visual-editor placement override (defaults from sideSections types)
}

export interface RenderModel {
  schemaVersion: 1;
  template: { id: string; version: number };
  page: { size: 'A4' | 'LETTER'; marginPt: number };
  theme: TemplateTheme;
  layout: TemplateLayout;
  sideSections: string[];   // section types in the side column (two-column only, else []); custom sections stay in main
  header: { name: string; headline?: string; contacts: string[]; links: Array<{ label: string; url: string }>; photo?: DocImage };
  styles?: Record<string, ElementStyle>;   // per-element formatting from the visual editor
  sections: RenderSection[];
  /**
   * Resolved adaptive layout (Quick Build). When present the PDF/HTML renderers paint exactly this
   * plan; when absent they fall back to the legacy flow renderer. Absent on every pre-existing resume.
   */
  layoutPlan?: LayoutPlan;
}
