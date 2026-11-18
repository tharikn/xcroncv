import { SectionType, TemplateVersionPackage } from '../templates/template.types';
import { SectionPolicy } from './layout.types';

const ALL_SECTIONS: SectionType[] = [
  'summary', 'experience', 'skills', 'education', 'projects', 'certifications', 'languages',
];

/** Sections that carry the hire/no-hire signal. Never dropped by the repair ladder. */
const CORE: SectionType[] = ['summary', 'experience', 'skills', 'education'];

const SIDE_PREFERRED: SectionType[] = ['skills', 'certifications', 'languages'];

/**
 * Resolve a template's placement rules.
 *
 * Resolution order (never mutates the immutable template package):
 *   1. explicit `template.sectionPolicies[key]`
 *   2. layout defaults (single-column / two-column / timeline)
 *   3. ATS override: ATS_FIRST templates are locked to one linear column so parsers read them correctly
 */
export function resolveSectionPolicies(t: TemplateVersionPackage): Record<SectionType, SectionPolicy> {
  const twoColumn = t.layout === 'two-column';
  const atsLocked = t.atsProfile === 'ATS_FIRST';
  const order = t.sectionOrder.length ? t.sectionOrder : ALL_SECTIONS;
  const n = Math.max(1, order.length);
  const out = {} as Record<SectionType, SectionPolicy>;

  for (const key of ALL_SECTIONS) {
    const index = order.indexOf(key);
    // Editorial weight: earlier in the template's order = stronger. Missing = weakest.
    const weight = index >= 0 ? Math.round((10 - (index * 10) / n) * 10) / 10 : 1;
    const core = CORE.includes(key);
    const preferred: SectionPolicy['preferred'] =
      atsLocked ? 'main' : twoColumn && SIDE_PREFERRED.includes(key) ? 'side' : 'main';

    const base: SectionPolicy = {
      key,
      preferred,
      weight,
      canMove: twoColumn && !atsLocked,
      canReorder: true,
      canCompress: true,
      canInline: key === 'skills' || key === 'certifications' || key === 'languages',
      canShorten: key !== 'summary' && key !== 'languages',
      canSplit: key !== 'summary' && key !== 'skills',
      canDrop: !core && (key === 'certifications' || key === 'languages'),
      minItems: key === 'certifications' ? 2 : 1,
      keepWithNext: true,
    };

    const override = t.sectionPolicies?.[key];
    out[key] = override ? { ...base, ...override, key } : base;
  }

  return out;
}

/** Weight of one section, used by every ordering decision (deterministic). */
export function policyWeight(policies: Record<SectionType, SectionPolicy>, key: SectionType): number {
  return policies[key]?.weight ?? 1;
}
