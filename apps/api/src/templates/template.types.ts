export type SectionType =
  | 'summary' | 'experience' | 'skills' | 'education'
  | 'projects' | 'certifications' | 'languages';

export type AtsProfile = 'ATS_FIRST' | 'BALANCED' | 'VISUAL';

export interface TemplateTheme {
  fontFamily: 'Helvetica' | 'Times-Roman' | 'Courier';  // PDF standard fonts: selectable text
  baseSizePt: number;
  accent: string;           // #RRGGBB
  headingTransform: 'upper' | 'none';
  headerAlign: 'left' | 'center' | 'right';
  sectionRule: boolean;
  /** Optional design tokens (added with the style-studio catalogue; absent on the first 3 = defaults). */
  density?: 'compact' | 'normal' | 'relaxed';
  headerBand?: boolean;      // accent-filled header band with white text
  /** Section-heading treatment (100-template catalogue; absent = 'plain', i.e. text + optional rule). */
  headingStyle?: 'plain' | 'bar' | 'tint' | 'short';
  nameScale?: number;        // header name size multiplier on base size (default 1.8, range 1.4-2.8)
}

export type TemplateLayout = 'single-column' | 'two-column' | 'timeline';
export type CareerLevel = 'student' | 'entry' | 'mid' | 'senior' | 'executive';
export type TemplateStyle = 'classic' | 'modern' | 'minimal' | 'formal' | 'creative';

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
  layout: TemplateLayout;
  sectionOrder: SectionType[];
  /** two-column only: sections placed in the narrow side column (the rest stay in the main column). */
  sideSections?: SectionType[];
  careerLevels?: CareerLevel[];
  style?: TemplateStyle;
  theme: TemplateTheme;
  /**
   * Optional placement rules for the adaptive layout engine. Absent = layout defaults
   * (see resume-layout/section-policy.ts). Declaring them never changes a published version:
   * add a new version instead.
   */
  sectionPolicies?: Partial<Record<SectionType, Partial<SectionPolicyOverride>>>;
}

/** Declarative subset a template may set; the engine fills the rest from layout defaults. */
export interface SectionPolicyOverride {
  preferred: 'main' | 'side' | 'either';
  weight: number;
  canMove: boolean;
  canReorder: boolean;
  canCompress: boolean;
  canInline: boolean;
  canShorten: boolean;
  canSplit: boolean;
  canDrop: boolean;
  minItems: number;
  keepWithNext: boolean;
}
