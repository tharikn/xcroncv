import { Writable } from 'stream';
import { buildRenderModel, ProfileInput } from '../src/render-model/render-model.builder';
import { RenderModel } from '../src/render-model/render-model.types';
import { renderPdf } from '../src/export/pdf.renderer';
import { TEMPLATE_CATALOG } from '../src/templates/template.catalog';
import { buildAdaptiveLayout, validatePlan } from '../src/resume-layout';

const pdfjs = require('pdfjs-dist/legacy/build/pdf.js') as {
  getDocument: (opts: unknown) => { promise: Promise<{ numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: Array<{ str: string }> }> }>; destroy(): Promise<void> }> };
};

const toBuffer = (m: RenderModel) => new Promise<Buffer>((resolve, reject) => {
  const chunks: Buffer[] = [];
  const w = new Writable({ write(c, _e, cb) { chunks.push(Buffer.from(c)); cb(); } });
  w.on('finish', () => resolve(Buffer.concat(chunks))).on('error', reject);
  renderPdf(m, w);
});

const pdfText = async (pdf: Buffer) => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(content.items.map((i) => i.str).join(' '));
  }
  await doc.destroy();
  return { numPages: doc.numPages, pages };
};

const profile = (overrides: Partial<ProfileInput> = {}): ProfileInput => ({
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '+44 20 7946 0000',
  location: 'London',
  headline: 'Senior Frontend Engineer',
  summary: 'Frontend engineer with a decade of shipping accessible, fast product surfaces for large teams.',
  links: [],
  experiences: Array.from({ length: 12 }, (_, n) => ({
    employerName: `Analytical Engines ${n}`,
    jobTitle: n === 0 ? 'Senior React Engineer' : `Frontend Engineer ${n}`,
    location: 'London',
    startDate: `20${10 + n}-01`,
    endDate: null,
    isCurrent: n === 0,
    description: undefined,
    bullets: Array.from({ length: 5 }, (_, b) => ({
      content: `Delivered measurable outcome ${b} on the dashboard programme, cutting load time by ${(b + 1) * 7}% for ${b + 2} million users.`,
    })),
  })),
  skills: Array.from({ length: 30 }, (_, i) => ({ name: i % 3 === 0 ? `React ${i}` : `Skill ${i}`, category: i % 2 === 0 ? 'Core' : 'Tools' })),
  educations: [{ institution: 'Self-taught', degree: 'BSc', field: 'Mathematics', startDate: '2005-01', endDate: '2009-01' }],
  projects: Array.from({ length: 6 }, (_, i) => ({ name: `Engine ${i}`, description: 'Translation and notes for the analytical engine.', technologies: ['React', 'TypeScript'] })),
  certifications: Array.from({ length: 25 }, (_, i) => ({ name: `Certification ${i}`, issuer: 'Royal Society', issuedDate: '2019-05' })),
  languages: Array.from({ length: 8 }, (_, i) => ({ name: `Language ${i}`, proficiency: 'Fluent' })),
  ...overrides,
});

const twoColumn = () => TEMPLATE_CATALOG.find((t) => t.id === 'modern-clean-geometric')!;
const ats = () => TEMPLATE_CATALOG.find((t) => t.id === 'ats-classic')!;

describe('adaptive layout engine', () => {
  it('is deterministic: the same model produces an identical plan', () => {
    const model = buildRenderModel(profile(), twoColumn(), undefined, {});
    const a = buildAdaptiveLayout(model, twoColumn(), { maxPages: 2 }).plan;
    const b = buildAdaptiveLayout(model, twoColumn(), { maxPages: 2 }).plan;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('fits an oversized profile in the page budget with no hard violations', () => {
    const model = buildRenderModel(profile(), ats(), undefined, {});
    const { plan, violations } = buildAdaptiveLayout(model, ats(), { maxPages: 2 });
    expect(violations.filter((v) => v.severity === 'hard')).toEqual([]);
    expect(plan.metrics.pageCount).toBeLessThanOrEqual(2);
    expect(plan.sections.length).toBeGreaterThan(3);
  });

  it('never loses the core sections when compressing', () => {
    const model = buildRenderModel(profile(), ats(), undefined, {});
    const { plan, model: repaired } = buildAdaptiveLayout(model, ats(), { maxPages: 2 });
    const placed = new Set(plan.sections.map((s) => s.key));
    for (const key of ['summary', 'experience', 'skills', 'education'] as const) {
      expect(placed.has(key)).toBe(true);
      expect(repaired.sections.some((s) => s.type === key)).toBe(true);
    }
  });

  it('locks ATS_FIRST templates to a single column', () => {
    const template = ats();
    const model = buildRenderModel(profile(), template, undefined, {});
    const { plan } = buildAdaptiveLayout(model, template, { maxPages: 2 });
    expect(plan.columns).toHaveLength(1);
    expect(plan.sections.every((s) => s.column === 'main')).toBe(true);
    expect(template.atsProfile).toBe('ATS_FIRST');
  });

  it('balances a two-column template instead of overflowing the sidebar', () => {
    const template = twoColumn();
    const model = buildRenderModel(profile(), template, undefined, {});
    expect(model.layout).toBe('two-column');
    const { plan, violations } = buildAdaptiveLayout(model, template, { maxPages: 2 });
    expect(violations.filter((v) => v.code === 'OVERFLOW')).toEqual([]);
    expect(plan.metrics.pageCount).toBeLessThanOrEqual(2);
    expect(plan.pages[0].columns.side.length + plan.pages[0].columns.main.length).toBeGreaterThan(0);
    // The sidebar must be used, not left blank while the main column overflows.
    expect(plan.metrics.sideFill).toBeGreaterThan(0);
    expect(plan.metrics.imbalance).toBeLessThanOrEqual(0.45);
  });

  it('records every automatic fix in the decision log', () => {
    const model = buildRenderModel(profile(), ats(), undefined, {});
    const { plan, actions } = buildAdaptiveLayout(model, ats(), { maxPages: 2 });
    expect(actions.length).toBeGreaterThan(0);
    expect(plan.metrics.repairs).toBe(actions.length);
    expect(plan.decisions.length).toBeGreaterThanOrEqual(actions.length);
    expect(plan.decisions.every((d) => !!d.action && !!d.reason)).toBe(true);
  });

  it('reports soft violations without failing the build', () => {
    const sparse = profile({
      experiences: [{ employerName: 'Acme', jobTitle: 'Engineer', startDate: '2020-01', endDate: null, isCurrent: true, bullets: [{ content: 'Shipped things.' }] }],
      projects: [], certifications: [], languages: [],
      skills: [{ name: 'React', category: 'Core' }],
    });
    const template = ats();
    const model = buildRenderModel(sparse, template, undefined, {});
    const { plan } = buildAdaptiveLayout(model, template, { maxPages: 2 });
    const soft = validatePlan(plan, { maxPages: 2 });
    expect(soft.every((v) => v.severity === 'soft')).toBe(true);
    expect(plan.metrics.pageCount).toBe(1);
  });

  it('renders exactly the planned page count and keeps the last planned section', async () => {
    const template = ats();
    const model = buildRenderModel(profile(), template, undefined, {});
    const { plan } = buildAdaptiveLayout(model, template, { maxPages: 2 });
    const pdf = await toBuffer({ ...model, layoutPlan: plan });
    const text = await pdfText(pdf);
    expect(text.numPages).toBe(plan.metrics.pageCount);
    // Every planned section heading must survive into the PDF text layer.
    for (const key of new Set(plan.sections.map((s) => s.key))) {
      if (key === 'custom') continue;
      const title = key.charAt(0).toUpperCase() + key.slice(1);
      expect(text.pages.join(' ').toUpperCase()).toContain(title.toUpperCase());
    }
  });
});
