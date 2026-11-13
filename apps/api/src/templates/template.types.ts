export type SectionType =
  | 'summary' | 'experience' | 'skills' | 'education'
  | 'projects' | 'certifications' | 'languages';

export type AtsProfile = 'ATS_FIRST' | 'BALANCED' | 'VISUAL';

export interface TemplateTheme {
  fontFamily: 'Helvetica' | 'Times-Roman' | 'Courier';  // PDF standard fonts: selectable text
  baseSizePt: number;
  accent: string;           // #RRGGBB
  headingTransform: 'upper' | 'none';
  headerAlign: 'left' | 'center';
  sectionRule: boolean;
}

/** Declarative, immutable package. Never contains executable code. */
export interface TemplateVersionPackage {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
  version: number;
  schemaVersion: 1;
  pageSizes: Array<'A4' | 'LETTER'>;
  atsProfile: AtsProfile;
  layout: 'single-column';
  sectionOrder: SectionType[];
  theme: TemplateTheme;
}
