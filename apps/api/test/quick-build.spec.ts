import { FullProfile } from '../src/career-profile/career-profile.service';
import { buildRenderModel } from '../src/render-model/render-model.builder';
import { buildAdaptiveLayout, validatePlan } from '../src/resume-layout';
import { analyzeJd, detectJdTitle, sanitizeJdText } from '../src/resume-match/jd-analyzer';
import { TEMPLATE_CATALOG } from '../src/templates/template.catalog';
import { SectionType } from '../src/templates/template.types';
import { applyContentPlan, limitToPlan } from '../src/quick-build/apply-content-plan';
import { orderedSectionKeys, selectContent } from '../src/quick-build/content-selector';
import { buildJdSignal, scoreProfile } from '../src/quick-build/relevance-scorer';

const JD = sanitizeJdText(`
Senior Frontend Engineer

We are hiring a senior frontend engineer to own our customer-facing web platform.

Requirements:
- 5+ years building production React applications
- Strong TypeScript and modern JavaScript
- Experience shipping to AWS with Docker
- Comfortable with accessibility and performance budgets

Preferred:
- Kubernetes
- GraphQL

Responsibilities:
- Build accessible UI components used by millions of customers
- Improve web performance and Core Web Vitals
- Partner with design and product on the roadmap

Certifications such as AWS Certified Developer are a plus.
We are a remote-first team.
`);

const bullet = (content: string) => ({
  id: `b-${content.slice(0, 8)}`, experienceId: 'e', content, kind: 'RESPONSIBILITY', displayOrder: 0, createdAt: new Date(), updatedAt: new Date(),
});

const experience = (over: Record<string, unknown>) => ({
  id: `e-${String(over.jobTitle)}`,
  profileId: 'p',
  employerName: 'Acme',
  jobTitle: 'Engineer',
  location: 'Remote',
  startDate: '2019-01',
  endDate: null,
  isCurrent: false,
  description: null,
  displayOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  bullets: [],
  ...over,
});

/** Deliberately oversized profile: ranking has to discard most of it. */
const profile = (): FullProfile => ({
  id: 'p',
  userId: 'u',
  tenantId: 't',
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: null,
  location: 'London',
  links: [],
  headline: 'Senior Frontend Engineer',
  summary: 'Frontend engineer focused on fast, accessible product surfaces and measurable outcomes.',
  createdAt: new Date(),
  updatedAt: new Date(),
  experiences: [
    experience({
      id: 'e-react', jobTitle: 'Senior React Engineer', isCurrent: true, displayOrder: 0,
      bullets: [1, 2, 3, 4, 5].map((n) => bullet(`Built React and TypeScript surfaces on AWS, cutting load time by ${n * 9}% for ${n} million users.`)),
    }),
    experience({
      id: 'e-mainframe', jobTitle: 'Mainframe Operator', employerName: 'Batch Co', endDate: '2015-06', displayOrder: 1,
      bullets: [bullet('Ran nightly COBOL batch jobs and printed paper reports for the finance team.')],
    }),
    experience({
      id: 'e-old', jobTitle: 'Junior Developer', employerName: 'Agency', endDate: '2014-01', displayOrder: 2,
      bullets: [bullet('Maintained a legacy jQuery site.')],
    }),
  ],
  skills: [
    { id: 's1', profileId: 'p', name: 'React', category: 'Core', level: null, displayOrder: 0, createdAt: new Date(), updatedAt: new Date() },
    { id: 's2', profileId: 'p', name: 'TypeScript', category: 'Core', level: null, displayOrder: 1, createdAt: new Date(), updatedAt: new Date() },
    { id: 's3', profileId: 'p', name: 'AWS', category: 'Tools', level: null, displayOrder: 2, createdAt: new Date(), updatedAt: new Date() },
    { id: 's4', profileId: 'p', name: 'JQuery', category: 'Tools', level: null, displayOrder: 3, createdAt: new Date(), updatedAt: new Date() },
  ],
  educations: [
    { id: 'ed1', profileId: 'p', institution: 'University', degree: 'BSc', field: 'Mathematics', startDate: '2005-01', endDate: '2009-01', displayOrder: 0, createdAt: new Date(), updatedAt: new Date() },
  ],
  projects: [
    { id: 'pr1', profileId: 'p', name: 'Analytical Engine', description: 'A React dashboard for translation notes.', technologies: ['React', 'TypeScript'], url: null, displayOrder: 0, createdAt: new Date(), updatedAt: new Date() },
  ],
  certifications: Array.from({ length: 25 }, (_, i) => ({
    id: `c${i}`, profileId: 'p', name: i === 0 ? 'AWS Certified Developer' : `Certification ${i}`, issuer: 'Royal Society',
    issuedDate: '2019-05', expiresDate: null, credentialUrl: null, displayOrder: i, createdAt: new Date(), updatedAt: new Date(),
  })),
  languages: [
    { id: 'l1', profileId: 'p', name: 'English', proficiency: 'Native', displayOrder: 0, createdAt: new Date(), updatedAt: new Date() },
  ],
}) as unknown as FullProfile;

const ats = () => TEMPLATE_CATALOG.find((t) => t.id === 'ats-classic')!;
const modern = () => TEMPLATE_CATALOG.find((t) => t.id === 'modern-clean-geometric')!;

const pipeline = (templateId = 'modern-clean-geometric', maxPages = 2, limits?: Partial<Record<SectionType, number>>) => {
  const template = TEMPLATE_CATALOG.find((t) => t.id === templateId)!;
  const jd = analyzeJd(JD, detectJdTitle(JD));
  const p = profile();
  const signal = buildJdSignal(jd, JD, jd.detectedTitle);
  const scores = scoreProfile(p, signal);
  const content = selectContent(p, jd, template, scores, { summaryText: p.summary ?? undefined, limits });
  const keys = orderedSectionKeys(content);
  const base = buildRenderModel(p, template, keys.map((type) => ({ type, visible: true })), {});
  const selected = applyContentPlan(base, content);
  const adaptive = buildAdaptiveLayout(selected, template, { maxPages, minLastPageFill: 0.5, maxImbalance: 0.35 });
  return { template, jd, signal, scores, content, base, selected, adaptive, model: limitToPlan(adaptive.model, adaptive.plan) };
};

describe('quick build content engine', () => {
  it('ranks the JD-relevant experience first and drops the weakest role past the cap', () => {
    const { scores, content } = pipeline('modern-clean-geometric', 2, { experience: 2 });
    const ranked = [...scores.experience].sort((a, b) => b.score - a.score);
    expect(ranked[0].index).toBe(0); // the React role
    expect(ranked[ranked.length - 1].index).toBe(2); // the legacy jQuery role

    const experience = content.sections.find((s) => s.key === 'experience')!;
    expect(experience.included).toBe(true);
    expect(experience.items.map((i) => i.sourceIndex)).toEqual([0, 1]);
    // Lower-ranked roles are the first thing dropped.
    expect(experience.excluded.map((e) => e.sourceIndex)).toContain(2);
  });

  it('marks the JD skills as matched and keeps them in the skills section', () => {
    const { scores, content } = pipeline();
    expect(scores.matchedSkillIds).toEqual(expect.arrayContaining(['react', 'typescript']));
    const skills = content.sections.find((s) => s.key === 'skills')!;
    expect(skills.included).toBe(true);
    expect(skills.items[0].sourceIndex).toBe(0); // React before jQuery
    expect(skills.items.at(-1)!.sourceIndex).toBe(3); // jQuery last
  });

  it('caps certifications instead of dumping all 25 on the page', () => {
    const { content } = pipeline();
    const certs = content.sections.find((s) => s.key === 'certifications')!;
    expect(certs.items).toHaveLength(8); // default ceiling
    expect(certs.excluded.length).toBe(17);
    expect(certs.items[0].sourceIndex).toBe(0); // "AWS Certified Developer" wins (JD names certifications)
    expect(content.warnings.some((w) => w.includes('certifications'))).toBe(true);
  });

  it('never reorders an ATS_FIRST template', () => {
    const { template, content } = pipeline('ats-classic');
    expect(template.atsProfile).toBe('ATS_FIRST');
    const included = orderedSectionKeys(content);
    const expected = template.sectionOrder.filter((k) => included.includes(k));
    expect(included).toEqual(expected);
  });

  it('is deterministic end to end', () => {
    const a = pipeline();
    const b = pipeline();
    expect(JSON.stringify(b.adaptive.plan)).toBe(JSON.stringify(a.adaptive.plan));
    expect(JSON.stringify(b.model)).toBe(JSON.stringify(a.model));
  });

  it('produces a plan that fits the page budget with no hard violations', () => {
    for (const id of ['ats-classic', 'modern-clean-geometric']) {
      const { adaptive, template } = pipeline(id);
      expect(adaptive.violations.filter((v) => v.severity === 'hard')).toEqual([]);
      expect(adaptive.plan.metrics.pageCount).toBeLessThanOrEqual(2);
      expect(adaptive.plan.metrics.unplaced).toBe(0);
      expect(adaptive.plan.columns).toHaveLength(template.atsProfile === 'ATS_FIRST' ? 1 : template.layout === 'two-column' ? 2 : 1);
    }
  });

  it('paints only the selected content: the snapshot matches the plan', () => {
    const { content, model, adaptive } = pipeline();
    const selected = content.sections.filter((s) => s.included).map((s) => s.key).sort();
    expect(model.sections.map((s) => s.type).sort()).toEqual(selected);
    // No section may carry more items than the plan paints.
    for (const section of model.sections) {
      const placed = adaptive.plan.sections.filter((p) => p.key === section.type);
      const painted = Math.max(0, ...placed.map((p) => p.itemTo));
      if (section.items?.length) expect(section.items.length).toBeLessThanOrEqual(painted);
    }
    expect(validatePlan(adaptive.plan, { maxPages: 2 }).every((v) => v.severity === 'soft')).toBe(true);
  });
});
