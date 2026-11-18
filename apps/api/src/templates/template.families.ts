import { CareerLevel, SectionType, TemplateStyle, TemplateTheme, TemplateVersionPackage } from './template.types';

/**
 * Data-driven predefined catalogue (doc 19 section 2): one row per template, each family supplies defaults.
 * Generates the templates that follow the 3 hand-written seed packages in template.catalog.ts.
 * Published versions are immutable - to change a template's look, ship `version: 2`, never edit a row's v1 output.
 */
const ORDER_STD: SectionType[] = ['summary', 'experience', 'skills', 'education', 'projects', 'certifications', 'languages'];
const ORDER_TECH: SectionType[] = ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'languages'];
const ORDER_GRAD: SectionType[] = ['summary', 'education', 'projects', 'skills', 'experience', 'certifications', 'languages'];
const ORDER_SKILLS: SectionType[] = ['summary', 'skills', 'experience', 'education', 'projects', 'certifications', 'languages'];
const ORDER_ACHIEVE: SectionType[] = ['summary', 'experience', 'skills', 'certifications', 'education', 'projects', 'languages'];
const ORDER_ACAD: SectionType[] = ['summary', 'education', 'experience', 'projects', 'certifications', 'skills', 'languages'];
const ORDER_PROJ: SectionType[] = ['summary', 'projects', 'skills', 'experience', 'education', 'certifications', 'languages'];
const ORDER_EXEC: SectionType[] = ['summary', 'experience', 'education', 'certifications', 'skills', 'languages', 'projects'];
const ORDER_INTL: SectionType[] = ['summary', 'experience', 'education', 'languages', 'skills', 'certifications', 'projects'];
const SIDE: SectionType[] = ['skills', 'languages', 'certifications'];

export interface Spec {
  fontFamily: TemplateTheme['fontFamily']; baseSizePt: number; accent: string; upper: boolean; center: boolean; right: boolean; rule: boolean;
  density: 'compact' | 'normal' | 'relaxed'; band: boolean;
  layout: 'single-column' | 'two-column' | 'timeline'; ats: 'ATS_FIRST' | 'BALANCED' | 'VISUAL';
  hs: NonNullable<TemplateTheme['headingStyle']>; nameScale: number;
  order: SectionType[]; side?: SectionType[]; levels: CareerLevel[]; style: TemplateStyle; tags: string[];
}
export type Row = [id: string, name: string, description: string, over?: Partial<Spec>];
export interface Family { category: string; base: Spec; rows: Row[] }

export const LV: Record<'early' | 'all' | 'mid' | 'exec', CareerLevel[]> = {
  early: ['student', 'entry'], all: ['entry', 'mid', 'senior'], mid: ['mid', 'senior'], exec: ['senior', 'executive'],
};
const spec = (o: Partial<Spec>): Spec => ({
  fontFamily: 'Helvetica', baseSizePt: 11, accent: '#1f2937', upper: true, center: false, right: false, rule: true, hs: 'tint', nameScale: 2.0,
  density: 'normal', band: false, layout: 'single-column', ats: 'ATS_FIRST', order: ORDER_STD,
  levels: LV.all, style: 'classic', tags: [], ...o,
});

export const FAMILIES: Family[] = [
  { category: 'ATS classic', base: spec({ tags: ['ats'] }), rows: [
    ['ats-clean-professional', 'Clean Professional', 'Plain left-aligned headings and generous whitespace; the safest everyday choice.', { accent: '#111827', style: 'modern' }],
    ['ats-compact', 'Compact ATS', 'Tight margins and 10pt text to fit long histories onto fewer pages.', { density: 'compact', baseSizePt: 10, accent: '#1f3a5f', tags: ['compact'] }],
    ['ats-minimal-serif', 'Minimal Serif', 'Understated serif type with no rules, for traditional industries.', { fontFamily: 'Times-Roman', rule: false, center: true, accent: '#262626', style: 'minimal' }],
    ['ats-modern', 'Modern ATS', 'Contemporary sans-serif with a single muted accent, still fully parser friendly.', { accent: '#0f4c81', upper: false, style: 'modern' }],
    ['ats-skills-forward', 'Skills-Forward ATS', 'Skills directly after the summary so keyword matches appear first.', { order: ORDER_SKILLS, accent: '#14532d', tags: ['skills-forward'] }],
    ['ats-achievement-led', 'Achievement-Led ATS', 'Experience and certifications up front to showcase measurable results.', { order: ORDER_ACHIEVE, accent: '#7c2d12', center: true }],
    ['ats-academic', 'Academic ATS', 'Education-first ordering for academic and research CVs.', { fontFamily: 'Times-Roman', order: ORDER_ACAD, accent: '#1e1b4b', center: true, levels: LV.mid, tags: ['academic'] }],
    ['ats-entry-level', 'Entry-Level ATS', 'Education and projects ahead of experience for first applications.', { order: ORDER_GRAD, accent: '#0b5563', levels: LV.early, tags: ['entry'] }],
    ['ats-senior', 'Senior ATS', 'Relaxed spacing and a summary-first structure for long, senior careers.', { fontFamily: 'Times-Roman', density: 'relaxed', accent: '#3b0764', levels: LV.exec, tags: ['senior'] }],
  ] },
  { category: 'Modern professional', base: spec({ ats: 'BALANCED', style: 'modern', upper: false, rule: false, tags: ['modern'] }), rows: [
    ['modern-split-header', 'Modern Split Header', 'Bold accent header band with a clean single-column body.', { band: true, accent: '#1d4ed8' }],
    ['modern-elegant-minimal', 'Elegant Minimal', 'Light, airy layout with centered header and quiet headings.', { center: true, density: 'relaxed', accent: '#374151', style: 'minimal', ats: 'ATS_FIRST' }],
    ['modern-bold-headers', 'Bold Section Headers', 'Uppercase accent headings with strong rules for easy scanning.', { upper: true, rule: true, accent: '#9f1239', baseSizePt: 11, density: 'relaxed' }],
    ['modern-editorial', 'Editorial', 'Serif headings in a magazine-like rhythm with generous spacing.', { fontFamily: 'Times-Roman', density: 'relaxed', center: true, accent: '#78350f', style: 'formal' }],
    ['modern-refined-serif', 'Refined Serif', 'Classic serif text with a restrained accent and subtle rules.', { fontFamily: 'Times-Roman', rule: true, accent: '#1e3a8a', style: 'formal' }],
    ['modern-clean-geometric', 'Clean Geometric', 'Sans-serif, left aligned, with a side rail for skills and languages.', { layout: 'two-column', side: SIDE, accent: '#0e7490', tags: ['two-column'] }],
    ['modern-contemporary-mono', 'Contemporary Mono', 'Monospaced type for a technical, contemporary feel.', { fontFamily: 'Courier', baseSizePt: 9.5, upper: true, accent: '#166534', style: 'creative' }],
    ['modern-structured-timeline', 'Structured Timeline', 'A vertical timeline rail connecting roles and education.', { layout: 'timeline', accent: '#6d28d9', tags: ['timeline'] }],
  ] },
  { category: 'Technology', base: spec({ order: ORDER_TECH, tags: ['technology'], style: 'modern', accent: '#1f3a5f' }), rows: [
    ['tech-fullstack', 'Full-Stack Developer', 'Projects and skills grouped by stack for generalist engineers.', { order: ORDER_PROJ, accent: '#0f766e', tags: ['full-stack'] }],
    ['tech-frontend', 'Frontend Engineer', 'Projects and skills up front with a restrained accent for UI roles.', { order: ORDER_PROJ, accent: '#7e22ce', ats: 'BALANCED', upper: false, tags: ['frontend'] }],
    ['tech-backend', 'Backend Engineer', 'Skills then experience, monospaced type for systems-focused roles.', { fontFamily: 'Courier', baseSizePt: 9.5, accent: '#1e293b', tags: ['backend'] }],
    ['tech-devops-sre', 'DevOps / SRE', 'Certifications and tooling surfaced early for infrastructure roles.', { order: ORDER_ACHIEVE, accent: '#9a3412', density: 'compact', tags: ['devops', 'sre'] }],
    ['tech-data-engineer', 'Data Engineer', 'Skills-forward with a side rail for tools and languages.', { layout: 'two-column', side: SIDE, ats: 'BALANCED', accent: '#075985', tags: ['data', 'two-column'] }],
    ['tech-cybersecurity', 'Cybersecurity', 'Certifications placed prominently for security practitioners.', { order: ['summary', 'certifications', 'skills', 'experience', 'projects', 'education', 'languages'], accent: '#111827', tags: ['security'] }],
    ['tech-qa-automation', 'QA / Automation', 'Compact, scannable layout highlighting tools, frameworks and impact.', { density: 'compact', accent: '#166534', tags: ['qa', 'automation'] }],
  ] },
  { category: 'Business / corporate', base: spec({ style: 'formal', accent: '#1e3a8a', tags: ['business'] }), rows: [
    ['biz-business-analyst', 'Business Analyst', 'Achievement-led structure with a skills block for tools and methods.', { order: ORDER_ACHIEVE, accent: '#0f4c81', tags: ['analyst'] }],
    ['biz-project-manager', 'Project Manager', 'Experience and certifications (PMP, Agile) on a clean timeline.', { layout: 'timeline', ats: 'BALANCED', order: ORDER_ACHIEVE, accent: '#115e59', tags: ['project', 'timeline'] }],
    ['biz-operations-manager', 'Operations Manager', 'Serif, summary-first layout focused on scope and results.', { fontFamily: 'Times-Roman', accent: '#3f3f46', tags: ['operations'] }],
    ['biz-product-manager', 'Product Manager', 'Modern single column leading with outcomes, then projects.', { order: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'languages'], upper: false, style: 'modern', accent: '#4338ca', tags: ['product'] }],
    ['biz-consultant', 'Consultant', 'Formal, relaxed spacing with strong rules for client-facing profiles.', { density: 'relaxed', center: true, accent: '#1f2937', tags: ['consulting'] }],
    ['biz-finance-professional', 'Finance Professional', 'Conservative serif layout with certifications (CFA, CPA) highlighted.', { fontFamily: 'Times-Roman', order: ORDER_ACHIEVE, accent: '#14532d', tags: ['finance'] }],
  ] },
  { category: 'Leadership / executive', base: spec({ levels: LV.exec, order: ORDER_EXEC, style: 'formal', density: 'relaxed', accent: '#1f2937', tags: ['leadership'] }), rows: [
    ['exec-concise', 'Executive Concise', 'One-to-two page executive summary with experience immediately after.', { fontFamily: 'Times-Roman', center: true, tags: ['executive'] }],
    ['exec-director-profile', 'Director Profile', 'Director-level layout with an accent header band.', { band: true, ats: 'BALANCED', accent: '#1e3a5f', tags: ['director'] }],
    ['exec-senior-leadership', 'Senior Leadership', 'Sans-serif, relaxed, scope-and-impact oriented single column.', { accent: '#7f1d1d', tags: ['senior-leadership'] }],
    ['exec-strategy-leader', 'Strategy Leader', 'Timeline of roles to show progression across large remits.', { layout: 'timeline', ats: 'BALANCED', accent: '#312e81', tags: ['strategy', 'timeline'] }],
    ['exec-board-advisor', 'Board / Advisor Profile', 'Concise serif profile for board and advisory appointments.', { fontFamily: 'Times-Roman', density: 'normal', center: true, order: ['summary', 'experience', 'certifications', 'education', 'languages', 'skills', 'projects'], accent: '#0f172a', tags: ['board', 'advisor'] }],
  ] },
  { category: 'Graduate / early career', base: spec({ order: ORDER_GRAD, levels: LV.early, ats: 'BALANCED', style: 'minimal', accent: '#2f6f4f', upper: false, rule: false, tags: ['entry'] }), rows: [
    ['grad-internship', 'Internship', 'One-page layout with education and projects for internship applications.', { accent: '#0369a1', density: 'compact', tags: ['internship'] }],
    ['grad-student-projects', 'Student Project-Led', 'Projects first, then skills, for portfolio-style student CVs.', { order: ORDER_PROJ, accent: '#6d28d9', tags: ['projects', 'student'] }],
    ['grad-career-starter', 'Career Starter', 'Friendly, centered header with education then experience.', { center: true, order: ORDER_ACAD, accent: '#b45309', tags: ['starter'] }],
    ['grad-academic-to-industry', 'Academic-to-Industry', 'Translates research into industry language: skills before education.', { order: ['summary', 'skills', 'projects', 'experience', 'education', 'certifications', 'languages'], levels: ['entry', 'mid'], ats: 'ATS_FIRST', rule: true, accent: '#1e3a8a', tags: ['academic', 'transition'] }],
  ] },
  { category: 'Creative / portfolio', base: spec({ ats: 'VISUAL', style: 'creative', upper: false, rule: false, accent: '#be185d', order: ORDER_PROJ, tags: ['creative', 'portfolio'] }), rows: [
    ['creative-graphic-designer', 'Graphic Designer', 'Bold accent band and a side rail for tools; projects lead.', { band: true, layout: 'two-column', side: SIDE, accent: '#9d174d' }],
    ['creative-ux-ui-designer', 'UX/UI Designer', 'Case-study oriented projects first, with a clean side rail.', { layout: 'two-column', side: SIDE, accent: '#6d28d9' }],
    ['creative-director', 'Creative Director', 'Leadership-flavoured creative layout with a header band and timeline.', { band: true, layout: 'timeline', order: ORDER_ACHIEVE, accent: '#7c2d12', levels: LV.mid }],
    ['creative-content-brand', 'Content / Brand Specialist', 'Editorial serif headings for writers and brand specialists.', { fontFamily: 'Times-Roman', center: true, ats: 'BALANCED', order: ORDER_STD, accent: '#0f766e' }],
    ['creative-portfolio-led', 'Portfolio-Led', 'Projects and links foregrounded with a bold header band.', { band: true, accent: '#1d4ed8', density: 'relaxed' }],
  ] },
  { category: 'Sales / customer / HR', base: spec({ ats: 'BALANCED', style: 'modern', upper: false, accent: '#0e7490', order: ORDER_ACHIEVE, tags: ['commercial'] }), rows: [
    ['sales-leader', 'Sales Leader', 'Quota-and-results focused, relaxed spacing, experience first.', { levels: LV.mid, accent: '#9a3412', rule: true, upper: true, ats: 'ATS_FIRST', density: 'relaxed', tags: ['sales', 'leader'] }],
    ['sales-account-executive', 'Account Executive', 'Metrics-driven layout with certifications and tools in a side rail.', { layout: 'two-column', side: SIDE, accent: '#0369a1', tags: ['sales', 'two-column'] }],
    ['sales-customer-success', 'Customer Success', 'Friendly sans-serif that highlights retention and satisfaction outcomes.', { rule: false, accent: '#047857', tags: ['customer'] }],
    ['sales-hr-recruitment', 'HR / Recruitment', 'Clean, centered layout with certifications for people-function roles.', { center: true, rule: true, ats: 'ATS_FIRST', accent: '#6b21a8', tags: ['hr', 'recruitment'] }],
  ] },
  { category: 'Healthcare / education / public service', base: spec({ fontFamily: 'Times-Roman', style: 'formal', accent: '#0f4c5c', order: ORDER_ACHIEVE, tags: ['public'] }), rows: [
    ['health-professional', 'Healthcare Professional', 'Licences and certifications right after the summary, conservative layout.', { order: ['summary', 'certifications', 'experience', 'education', 'skills', 'languages', 'projects'], accent: '#0f766e', tags: ['healthcare'] }],
    ['edu-educator', 'Educator', 'Education and teaching experience with relaxed, readable spacing.', { order: ORDER_ACAD, density: 'relaxed', accent: '#7c2d12', tags: ['education', 'teaching'] }],
    ['edu-researcher', 'Researcher', 'Academic ordering, centered serif header, projects as research outputs.', { order: ['summary', 'education', 'projects', 'experience', 'certifications', 'skills', 'languages'], center: true, accent: '#1e1b4b', levels: LV.mid, tags: ['research'] }],
    ['public-service-profile', 'Public-Service Profile', 'Structured, formal profile suited to public-sector applications.', { fontFamily: 'Helvetica', rule: true, upper: false, order: ['summary', 'experience', 'education', 'certifications', 'skills', 'languages', 'projects'], accent: '#1f2937', tags: ['public-service'] }],
  ] },
  { category: 'International / regional', base: spec({ order: ORDER_INTL, style: 'formal', accent: '#1e3a8a', tags: ['international'] }), rows: [
    ['intl-international-cv', 'International CV', 'Languages prominent and neutral styling for cross-border applications.', { tags: ['international', 'cv'] }],
    ['intl-europass-inspired', 'Europass-Inspired', 'Structured, label-first sections in the spirit of the Europass CV.', { layout: 'timeline', ats: 'BALANCED', accent: '#003399', tags: ['europass', 'timeline'] }],
    ['intl-bilingual-ready', 'Bilingual-Ready', 'Neutral, roomy layout that leaves space for bilingual content and long headings.', { upper: false, density: 'relaxed', accent: '#0f766e', tags: ['bilingual'] }],
    ['intl-india-professional', 'India Professional CV', 'Education-forward professional CV common in the Indian market.', { order: ORDER_ACAD, fontFamily: 'Times-Roman', accent: '#9a3412', tags: ['india'] }],
    ['intl-compact-global', 'Compact Global', 'Compact, single-column layout that travels well across regions.', { density: 'compact', baseSizePt: 10, accent: '#334155', tags: ['global', 'compact'] }],
  ] },
];

/**
 * Style-studio families (40 more templates, v1): richer design tokens - heading treatment (bar / tint / short underline),
 * name size and right alignment - on top of the original density/band/rule/font tokens.
 */
const ORDER_LANG: SectionType[] = ['summary', 'experience', 'skills', 'languages', 'education', 'certifications', 'projects'];
export const STYLE_FAMILIES: Family[] = [
  { category: 'Bold & colorful', base: spec({ ats: 'VISUAL', style: 'creative', upper: true, rule: false, hs: 'tint', tags: ['bold', 'colorful'] }), rows: [
    ['bold-crimson-band', 'Crimson Band', 'Deep crimson header band with tinted section bars for confident, high-contrast pages.', { band: true, accent: '#9f1239', nameScale: 2.2 }],
    ['bold-ocean-tint', 'Ocean Tint', 'Ocean-blue tinted headings and an oversized name on a clean white page.', { accent: '#0c4a6e', nameScale: 2.4, hs: 'tint' }],
    ['bold-emerald-bar', 'Emerald Bar', 'Emerald side-bar headings with a left-aligned, large name.', { accent: '#065f46', hs: 'bar', nameScale: 2.2, upper: false }],
    ['bold-violet-right', 'Violet Right-Aligned', 'Right-aligned header and violet bars for an asymmetric, modern look.', { accent: '#5b21b6', right: true, hs: 'bar', nameScale: 2.0 }],
    ['bold-sunset-band', 'Sunset Band', 'Burnt-orange header band with short underlined headings.', { band: true, accent: '#9a3412', hs: 'short', nameScale: 2.0, upper: false }],
    ['bold-magenta-centered', 'Magenta Centered', 'Centered magenta masthead with tinted headings and relaxed spacing.', { center: true, accent: '#9d174d', nameScale: 2.6, density: 'relaxed' }],
    ['bold-teal-timeline', 'Teal Timeline', 'Teal timeline rail with tinted headings for career progression.', { layout: 'timeline', accent: '#0f766e', nameScale: 2.0 }],
    ['bold-indigo-sidebar', 'Indigo Sidebar', 'Indigo band, bold bars and a side rail for skills and languages.', { band: true, layout: 'two-column', side: SIDE, accent: '#3730a3', hs: 'bar', nameScale: 2.2 }],
    ['bold-rust-compact', 'Rust Compact', 'Dense rust-accent page with short underlines to fit more content.', { accent: '#b91c1c', density: 'compact', baseSizePt: 10, hs: 'short', nameScale: 2.0, upper: false }],
    ['bold-midnight-mono', 'Midnight Mono', 'Midnight-navy monospaced type with tinted headings.', { fontFamily: 'Courier', baseSizePt: 9.5, accent: '#1e1b4b', nameScale: 2.2 }],
  ] },
  { category: 'Elegant & editorial', base: spec({ ats: 'BALANCED', style: 'formal', fontFamily: 'Times-Roman', upper: false, rule: false, hs: 'short', order: ORDER_STD, tags: ['elegant', 'editorial'] }), rows: [
    ['elegant-ivory-serif', 'Ivory Serif', 'Centered serif masthead with short accent underlines and generous spacing.', { center: true, accent: '#44403c', density: 'relaxed', nameScale: 2.4 }],
    ['elegant-burgundy-rule', 'Burgundy Rule', 'Burgundy serif headings with a hairline rule beneath each section.', { accent: '#7f1d1d', rule: true, hs: 'plain', nameScale: 2.0, upper: true }],
    ['elegant-navy-right', 'Navy Right Masthead', 'Right-aligned navy masthead with a quiet, left-ruled body.', { right: true, accent: '#1e3a8a', hs: 'bar', nameScale: 2.2 }],
    ['elegant-forest-classic', 'Forest Classic', 'Forest-green serif with uppercase headings and thin rules.', { accent: '#14532d', rule: true, hs: 'plain', upper: true, nameScale: 1.9, center: true }],
    ['elegant-plum-tint', 'Plum Tint', 'Soft plum-tinted section headings over a refined serif body.', { accent: '#581c87', hs: 'tint', nameScale: 2.0 }],
    ['elegant-charcoal-academic', 'Charcoal Academic', 'Education-first charcoal serif with short underlines for scholarly CVs.', { accent: '#27272a', order: ORDER_ACAD, nameScale: 2.2, center: true, levels: LV.mid }],
    ['elegant-bronze-timeline', 'Bronze Timeline', 'Bronze timeline with a large editorial name and short-rule headings.', { layout: 'timeline', accent: '#78350f', nameScale: 2.4 }],
    ['elegant-slate-band', 'Slate Band', 'Slate header band with understated serif headings.', { band: true, accent: '#334155', hs: 'plain', nameScale: 2.0, rule: true }],
    ['elegant-rose-centered', 'Rosewood Centered', 'Centered rosewood masthead and airy spacing for creative-leaning profiles.', { center: true, accent: '#9f1239', density: 'relaxed', hs: 'short', nameScale: 2.6, style: 'creative' }],
    ['elegant-ink-compact', 'Ink Compact', 'Ink-black compact serif that keeps long careers on two pages.', { accent: '#111827', density: 'compact', baseSizePt: 10, hs: 'bar', nameScale: 1.8, ats: 'ATS_FIRST' }],
  ] },
  { category: 'Minimal & airy', base: spec({ ats: 'ATS_FIRST', style: 'minimal', upper: false, rule: false, hs: 'plain', density: 'relaxed', tags: ['minimal', 'airy'] }), rows: [
    ['minimal-whisper', 'Whisper', 'Almost no ornament: quiet accent headings and a large, light name.', { accent: '#374151', nameScale: 2.4 }],
    ['minimal-mist-right', 'Mist Right', 'Right-aligned header with quiet headings and wide margins.', { accent: '#475569', right: true, nameScale: 2.2 }],
    ['minimal-sage-short', 'Sage Short Rule', 'Sage headings with a short accent underline and open spacing.', { accent: '#3f6212', hs: 'short', nameScale: 2.0, ats: 'BALANCED' }],
    ['minimal-sky-centered', 'Sky Centered', 'Centered sky-blue header over uncluttered single-column content.', { accent: '#075985', center: true, nameScale: 2.2 }],
    ['minimal-stone-small', 'Stone Small Type', 'Small 10pt type with generous line spacing and stone-gray accents.', { accent: '#57534e', baseSizePt: 10, nameScale: 1.6 }],
    ['minimal-ash-upper', 'Ash Uppercase', 'Uppercase ash headings with a hairline rule and a modest name.', { accent: '#3f3f46', upper: true, rule: true, nameScale: 1.6 }],
    ['minimal-pine-skills', 'Pine Skills-First', 'Skills ahead of experience in quiet pine green.', { accent: '#166534', order: ORDER_SKILLS, hs: 'short', nameScale: 1.9 }],
    ['minimal-dusk-bar', 'Dusk Bar', 'Dusk-indigo left bar headings that stay readable by ATS parsers.', { accent: '#3730a3', hs: 'bar', nameScale: 2.0 }],
    ['minimal-clay-serif', 'Clay Serif', 'Clay-brown serif, centered, with a short rule and open spacing.', { fontFamily: 'Times-Roman', accent: '#7c2d12', center: true, hs: 'short', nameScale: 2.2 }],
    ['minimal-graphite-mono', 'Graphite Mono', 'Graphite monospaced single column for engineers who like it plain.', { fontFamily: 'Courier', baseSizePt: 9.5, accent: '#1f2937', nameScale: 1.8, density: 'normal', order: ORDER_TECH }],
    // Additional customization options for better visual variety
    ['minimal-linen', 'Linen Texture', 'Subtle linen texture effect with calm accent and relaxed scaling.', { accent: '#636e72', nameScale: 2.1, hs: 'bar' }],
    ['minimal-slate-center', 'Slate Centered', 'Centered slate header with balanced scaling for entry-level profiles.', { accent: '#2d3748', center: true, nameScale: 1.9 }],
    // New: expanded minimal options with varied heading styles
    ['minimal-clean', 'Clean Minimal', 'Ultra-clean layout with minimal ornament and generous spacing.', { accent: '#636e72', hs: 'plain', nameScale: 2.1 }],
    ['minimal-soft', 'Soft Minimal', 'Gentle rounded corners and soft accent for a friendly feel.', { accent: '#4a5568', hs: 'tint', nameScale: 2.3 }],
  ] },
  { category: 'Structured & sidebar', base: spec({ ats: 'BALANCED', style: 'modern', upper: false, rule: false, hs: 'bar', layout: 'two-column', side: SIDE, tags: ['structured', 'sidebar'] }), rows: [
    ['struct-cobalt-sidebar', 'Cobalt Sidebar', 'Cobalt bars and a side rail for skills, languages and certifications.', { accent: '#1d4ed8', nameScale: 2.2 }],
    ['struct-jade-right', 'Jade Right Header', 'Right-aligned jade header over a two-column body.', { accent: '#047857', right: true, nameScale: 2.0 }],
    ['struct-amber-band', 'Amber Band Columns', 'Dark-amber band header and tinted headings in two columns.', { accent: '#92400e', band: true, hs: 'tint', nameScale: 2.2 }],
    ['struct-plum-centered', 'Plum Centered Columns', 'Centered plum masthead, short underlines and a skills side rail.', { accent: '#6b21a8', center: true, hs: 'short', nameScale: 2.4 }],
    ['struct-steel-compact', 'Steel Compact Columns', 'Compact steel-blue two-column layout for dense, skills-heavy profiles.', { accent: '#075985', density: 'compact', baseSizePt: 10, nameScale: 1.8, order: ORDER_TECH }],
    ['struct-garnet-serif', 'Garnet Serif Columns', 'Garnet serif two-column CV with ruled, uppercase headings.', { accent: '#881337', fontFamily: 'Times-Roman', hs: 'plain', rule: true, nameScale: 2.0, upper: true }],
    ['struct-lagoon-relaxed', 'Lagoon Relaxed', 'Relaxed lagoon-teal two-column page with generous column spacing.', { accent: '#0e7490', density: 'relaxed', nameScale: 2.0, order: ORDER_ACHIEVE }],
    ['struct-onyx-mono', 'Onyx Mono Columns', 'Monospaced onyx two-column layout with a tinted heading style.', { accent: '#0f172a', fontFamily: 'Courier', baseSizePt: 9.5, hs: 'tint', nameScale: 2.0, style: 'creative' }],
    ['struct-olive-timeline', 'Olive Timeline', 'Olive timeline with bar headings and a prominent language block.', { layout: 'timeline', side: undefined, accent: '#3f6212', order: ORDER_LANG, nameScale: 2.0 }],
    ['struct-copper-exec', 'Copper Executive', 'Copper-accent executive page with a band header and side rail.', { accent: '#7c2d12', band: true, levels: LV.exec, order: ORDER_EXEC, style: 'formal', nameScale: 2.4, hs: 'short' }],
  ] },
];

export const buildTemplates = (families: Family[]): TemplateVersionPackage[] => families.flatMap((f) => f.rows.map(([id, name, description, over]) => {
  const s: Spec = { ...f.base, ...over };
  const pkg: TemplateVersionPackage = {
    id, slug: id, name, category: f.category, description,
    tags: [...new Set([...s.tags, s.style, s.layout])], version: 1, schemaVersion: 1,
    pageSizes: ['A4', 'LETTER'], atsProfile: s.ats, layout: s.layout,
    sectionOrder: s.order, careerLevels: s.levels, style: s.style,
    theme: {
      fontFamily: s.fontFamily, baseSizePt: s.baseSizePt, accent: s.accent,
      headingTransform: s.upper ? 'upper' : 'none', headerAlign: s.right ? 'right' : s.center ? 'center' : 'left',
      sectionRule: s.rule, density: s.density, headerBand: s.band,
      ...(s.hs !== 'plain' ? { headingStyle: s.hs } : {}),
      ...(s.nameScale !== 1.8 ? { nameScale: s.nameScale } : {}),
    },
  };
  if (s.layout === 'two-column') pkg.sideSections = s.side ?? SIDE;
  return pkg;
}));

export const GENERATED_TEMPLATES: TemplateVersionPackage[] = buildTemplates([...FAMILIES, ...STYLE_FAMILIES]);
