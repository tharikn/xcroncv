import { DocImage, ElementStyle, ResumeDoc } from './resume-doc';
export type SectionType = 'summary' | 'experience' | 'skills' | 'education' | 'projects' | 'certifications' | 'languages';
export const SECTION_TYPES: SectionType[] = ['summary', 'experience', 'skills', 'education', 'projects', 'certifications', 'languages'];
export const SECTION_LABELS: Record<SectionType, string> = {
  summary: 'Summary', experience: 'Experience', skills: 'Skills', education: 'Education',
  projects: 'Projects', certifications: 'Certifications', languages: 'Languages',
};

export interface Link { label: string; url: string }
export interface Bullet { kind?: 'RESPONSIBILITY' | 'ACHIEVEMENT'; content: string; isUserConfirmed?: boolean }
export interface Experience {
  employerName: string; jobTitle: string; employmentType?: string | null; location?: string | null;
  startDate: string; endDate?: string | null; isCurrent?: boolean; description?: string | null; bullets?: Bullet[];
}
export interface Skill { name: string; category?: string | null; proficiency?: string | null; yearsUsed?: number | null }
export interface Education { institution: string; degree: string; field?: string | null; startDate?: string | null; endDate?: string | null; grade?: string | null }
export interface Project { name: string; url?: string | null; description?: string | null; technologies?: string[] }
export interface Certification { name: string; issuer?: string | null; issuedDate?: string | null; expiryDate?: string | null }
export interface LanguageItem { name: string; proficiency?: string | null }

export interface CareerProfile {
  fullName: string; email?: string | null; phone?: string | null; location?: string | null; headline?: string | null; summary?: string | null;
  links?: Link[]; experiences?: Experience[]; skills?: Skill[]; educations?: Education[]; projects?: Project[];
  certifications?: Certification[]; languages?: LanguageItem[];
}

export interface SectionConfig { type: SectionType; visible: boolean }
export interface Overrides { accent?: string; primaryColor?: string; sectionSpacing?: 'compact' | 'normal' | 'relaxed'; baseSizePt?: number; pageSize?: 'A4' | 'LETTER'; /** visual-editor document (doc 16) */ doc?: ResumeDoc | null }
export type ResumeStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface Resume {
  id: string; name: string; targetRole?: string | null; templateId: string; templateVersion: number;
  status: ResumeStatus; sections: SectionConfig[]; overrides: Overrides; createdAt: string; updatedAt: string;
}
/** GET /resumes returns summaries (no sections/overrides). */
export type ResumeSummary = Pick<Resume, 'id' | 'name' | 'targetRole' | 'templateId' | 'templateVersion' | 'status' | 'updatedAt'>;
export interface ResumeVersion { id: string; versionNumber: number; changeSummary?: string | null; createdAt: string }

export interface TemplateTheme {
  fontFamily: string; baseSizePt: number; accent: string; headingTransform: 'upper' | 'none'; headerAlign: 'left' | 'center' | 'right'; sectionRule: boolean;
  density?: 'compact' | 'normal' | 'relaxed'; headerBand?: boolean; headingStyle?: 'plain' | 'bar' | 'tint' | 'short'; nameScale?: number;
}
export interface TemplateSummary {
  id: string; name: string; category: string; description: string; tags: string[]; version: number;
  atsProfile: string; layout: string; pageSizes: string[]; theme?: TemplateTheme;
  careerLevels?: string[]; style?: string;
}

export interface RenderItem { id?: string; image?: DocImage; title?: string; subtitle?: string; meta?: string; text?: string; bullets?: string[]; tags?: string[]; url?: string }
export interface RenderSection { id?: string; type: SectionType | 'custom'; title: string; text?: string; items?: RenderItem[]; pageBreakBefore?: boolean }
export interface RenderModel {
  schemaVersion: 1; template: { id: string; version: number };
  page: { size: 'A4' | 'LETTER'; marginPt: number }; theme: TemplateTheme;
  layout: 'single-column' | 'two-column' | 'timeline'; sideSections: string[];
  header: { name: string; headline?: string; contacts: string[]; links: Link[]; photo?: DocImage };
  styles?: Record<string, ElementStyle>;
  sections: RenderSection[];
}
