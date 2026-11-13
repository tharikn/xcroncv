import { TemplateVersionPackage } from './template.types';

const ORDER_STD = ['summary', 'experience', 'skills', 'education', 'projects', 'certifications', 'languages'] as const;
const ORDER_TECH = ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'languages'] as const;
const ORDER_GRAD = ['summary', 'education', 'projects', 'skills', 'experience', 'certifications', 'languages'] as const;

/**
 * Seed catalogue (3 of the 60 planned in doc 19). Add new packages here (or move to
 * a generated JSON catalogue) - published versions are immutable; ship a new `version` instead of editing.
 */
export const TEMPLATE_CATALOG: TemplateVersionPackage[] = [
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
