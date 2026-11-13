import { SectionType, TemplateTheme } from '../templates/template.types';

export interface RenderItem {
  title?: string;
  subtitle?: string;
  meta?: string;          // dates / location
  text?: string;
  bullets?: string[];
  tags?: string[];
  url?: string;
}

export interface RenderSection {
  type: SectionType;
  title: string;
  text?: string;          // summary only
  items?: RenderItem[];
}

export interface RenderModel {
  schemaVersion: 1;
  template: { id: string; version: number };
  page: { size: 'A4' | 'LETTER'; marginPt: number };
  theme: TemplateTheme;
  header: { name: string; headline?: string; contacts: string[]; links: Array<{ label: string; url: string }> };
  sections: RenderSection[];
}
