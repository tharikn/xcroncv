import { EXPANSION_TEMPLATES } from './template.expansion';
import { GENERATED_TEMPLATES } from './template.families';
import { CareerLevel, TemplateStyle, TemplateVersionPackage } from './template.types';

const ORDER_STD = ['summary', 'experience', 'skills', 'education', 'projects', 'certifications', 'languages'] as const;
const ORDER_TECH = ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'languages'] as const;
const ORDER_GRAD = ['summary', 'education', 'projects', 'skills', 'experience', 'certifications', 'languages'] as const;

/** The 3 hand-written seed packages (v1, immutable). The rest are generated in template.families.ts (101) and template.expansion.ts (210). */
const SEED_TEMPLATES: TemplateVersionPackage[] = [
  {
    id: 'ats-classic', slug: 'ats-classic', name: 'Classic Chronological', category: 'ATS classic',
    description: 'Conventional single-column chronological layout for maximum parser compatibility.',
    tags: ['ats', 'classic', 'single-column'], version: 1, schemaVersion: 1,
    pageSizes: ['A4', 'LETTER'], atsProfile: 'ATS_FIRST', layout: 'single-column',
    sectionOrder: [...ORDER_STD],
    theme: { fontFamily: 'Times-Roman', baseSizePt: 10.5, accent: '#000000', headingTransform: 'upper', headerAlign: 'center', sectionRule: true },
  },
  {
    id: 'tech-compact', slug: 'tech-compact', name: 'Software Engineer Compact', category: 'Technology',
    description: 'Skills-forward layout for engineering roles with projects after experience.',
    tags: ['technology', 'compact', 'skills-forward'], version: 1, schemaVersion: 1,
    pageSizes: ['A4', 'LETTER'], atsProfile: 'ATS_FIRST', layout: 'single-column',
    sectionOrder: [...ORDER_TECH],
    theme: { fontFamily: 'Helvetica', baseSizePt: 10, accent: '#1f3a5f', headingTransform: 'upper', headerAlign: 'left', sectionRule: true },
  },
  {
    id: 'graduate-clean', slug: 'graduate-clean', name: 'Graduate Clean', category: 'Graduate / early career',
    description: 'Education and projects first, for students and early-career candidates.',
    tags: ['graduate', 'entry', 'projects'], version: 1, schemaVersion: 1,
    pageSizes: ['A4', 'LETTER'], atsProfile: 'BALANCED', layout: 'single-column',
    sectionOrder: [...ORDER_GRAD],
    theme: { fontFamily: 'Helvetica', baseSizePt: 10.5, accent: '#2f6f4f', headingTransform: 'none', headerAlign: 'left', sectionRule: false },
  },
];

/** Display metadata for the seed packages, which predate careerLevels/style (not render-relevant, so no new version). */
export const SEED_META: Record<string, { careerLevels: CareerLevel[]; style: TemplateStyle }> = {
  'ats-classic': { careerLevels: ['entry', 'mid', 'senior'], style: 'classic' },
  'tech-compact': { careerLevels: ['entry', 'mid', 'senior'], style: 'modern' },
  'graduate-clean': { careerLevels: ['student', 'entry'], style: 'minimal' },
};

export const TEMPLATE_CATALOG: TemplateVersionPackage[] = [...SEED_TEMPLATES, ...GENERATED_TEMPLATES, ...EXPANSION_TEMPLATES];
