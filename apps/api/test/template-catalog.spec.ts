import { Writable } from 'stream';
import { buildRenderModel, ProfileInput } from '../src/render-model/render-model.builder';
import { renderHtml } from '../src/export/html.renderer';
import { renderPdf } from '../src/export/pdf.renderer';
import { renderDocx } from '../src/import-export/docx.renderer';
import { SEED_META, TEMPLATE_CATALOG } from '../src/templates/template.catalog';
import { TemplatesService } from '../src/templates/templates.service';

const FAMILY_COUNTS: Record<string, number> = {
  'ATS classic': 10, 'Modern professional': 8, Technology: 8, 'Business / corporate': 6, 'Leadership / executive': 5,
  'Graduate / early career': 5, 'Creative / portfolio': 5, 'Sales / customer / HR': 4,
  'Healthcare / education / public service': 4, 'International / regional': 5,
  'Bold & colorful': 10, 'Elegant & editorial': 10, 'Minimal & airy': 14, 'Structured & sidebar': 10,
  'Professional services': 10, 'Legal & compliance': 10, 'Finance & accounting': 10, 'Academia & research': 10,
  'Nonprofit & social impact': 10, 'Military & veterans': 10, 'Startup & founders': 10, 'Product & growth': 10,
  'Data & AI': 10, 'Marketing & communications': 10, 'Hospitality & events': 10, 'Retail & operations': 10,
  'Logistics & supply chain': 10, 'Real estate & property': 10, 'Freelance & independent': 10, 'Career change': 10,
  'Returnship & re-entry': 10, 'Staff & principal IC': 10, 'Design studio': 10, 'Media & entertainment': 10,
  'Wellness & fitness': 10,
};
const TOTAL_TEMPLATES = Object.values(FAMILY_COUNTS).reduce((a, b) => a + b, 0);

const profile: ProfileInput = {
  fullName: 'Ada Lovelace', email: 'ada@example.com', phone: '+44 20 7946 0000', location: 'London',
  headline: 'Analytical Engine Programmer', summary: 'Pioneer of computing with a decade of results.',
  links: [{ label: 'Site', url: 'https://ada.dev' }],
  experiences: Array.from({ length: 3 }, (_, n) => ({
    employerName: `Babbage & Co ${n}`, jobTitle: 'Programmer', location: 'London', startDate: `20${10 + n}-01`,
    endDate: n ? `20${11 + n}-01` : null, isCurrent: n === 0,
    bullets: Array.from({ length: 5 }, (_, b) => ({ content: `Delivered measurable outcome number ${b} across the engine programme with a long descriptive sentence.` })),
  })),
  skills: [{ name: 'Algorithms', category: 'Core' }, { name: 'Mathematics', category: 'Core' }, { name: 'Notation' }],
  educations: [{ institution: 'Self-taught', degree: 'Mathematics', startDate: '2005-01', endDate: '2009-01' }],
  projects: [{ name: 'Notes on the Engine', description: 'Translation and notes.', technologies: ['Math'], url: 'https://ada.dev/notes' }],
  certifications: [{ name: 'Royal Society Fellow', issuer: 'RS', issuedDate: '2015-05' }],
  languages: [{ name: 'English', proficiency: 'Native' }, { name: 'French', proficiency: 'Fluent' }],
};

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastOnWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

const toBuffer = (m: ReturnType<typeof buildRenderModel>) => new Promise<Buffer>((resolve, reject) => {
  const chunks: Buffer[] = [];
  const w = new Writable({ write(c, _e, cb) { chunks.push(Buffer.from(c)); cb(); } });
  w.on('finish', () => resolve(Buffer.concat(chunks))).on('error', reject);
  renderPdf(m, w);
});

describe('template catalogue (doc 19)', () => {
  it('has exactly 314 templates with the documented family composition', () => {
    expect(TEMPLATE_CATALOG).toHaveLength(TOTAL_TEMPLATES);
    const counts: Record<string, number> = {};
    for (const t of TEMPLATE_CATALOG) counts[t.category] = (counts[t.category] ?? 0) + 1;
    expect(counts).toEqual(FAMILY_COUNTS);
  });

  it('keeps the 3 seed v1 packages stable', () => {
    for (const id of ['ats-classic', 'tech-compact', 'graduate-clean']) {
      const t = TEMPLATE_CATALOG.find((x) => x.id === id)!;
      expect(t.version).toBe(1);
      expect(t.theme.density).toBeUndefined();
      expect(t.layout).toBe('single-column');
      expect(SEED_META[id]).toBeDefined();
    }
  });

  it('has unique ids/slugs, valid manifests and (id, version) uniqueness', () => {
    expect(new Set(TEMPLATE_CATALOG.map((t) => t.id)).size).toBe(TOTAL_TEMPLATES);
    expect(new Set(TEMPLATE_CATALOG.map((t) => t.slug)).size).toBe(TOTAL_TEMPLATES);
    expect(new Set(TEMPLATE_CATALOG.map((t) => `${t.id}@${t.version}`)).size).toBe(TOTAL_TEMPLATES);
    for (const t of TEMPLATE_CATALOG) {
      expect(t.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(t.name.length).toBeGreaterThan(2);
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.schemaVersion).toBe(1);
      expect(t.pageSizes).toEqual(['A4', 'LETTER']);
      expect(t.theme.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t.theme.baseSizePt).toBeGreaterThanOrEqual(9);
      expect(t.theme.baseSizePt).toBeLessThanOrEqual(12);
      // every section type exactly once, so no content can be silently dropped
      expect([...t.sectionOrder].sort()).toEqual(['certifications', 'education', 'experience', 'languages', 'projects', 'skills', 'summary']);
    }
  });

  it('applies ATS rules: ATS-first is single-column, plain and band-free; two-column declares a side rail', () => {
    for (const t of TEMPLATE_CATALOG) {
      if (t.atsProfile === 'ATS_FIRST') {
        expect(t.layout).toBe('single-column');
        expect(t.theme.headerBand).toBeFalsy();
      }
      if (t.layout === 'two-column') {
        expect(t.atsProfile).not.toBe('ATS_FIRST');
        expect(t.sideSections?.length).toBeGreaterThan(0);
      } else {
        expect(t.sideSections).toBeUndefined();
      }
      if (t.theme.headerBand) expect(t.atsProfile).not.toBe('ATS_FIRST');
    }
    expect(TEMPLATE_CATALOG.some((t) => t.atsProfile === 'VISUAL')).toBe(true);
    expect(TEMPLATE_CATALOG.some((t) => t.atsProfile === 'BALANCED')).toBe(true);
  });

  it('uses readable contrast for every accent (>= 4.5:1 on white, also the band background)', () => {
    for (const t of TEMPLATE_CATALOG) expect(contrastOnWhite(t.theme.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('gives every template a distinct layout identity (not recolours)', () => {
    const sig = (t: (typeof TEMPLATE_CATALOG)[number]) => JSON.stringify([
      t.layout, t.sideSections, t.sectionOrder, t.theme.fontFamily, t.theme.baseSizePt, t.theme.headingTransform,
      t.theme.headerAlign, t.theme.sectionRule, t.theme.density ?? 'normal', !!t.theme.headerBand,
      t.theme.headingStyle ?? 'plain', t.theme.nameScale ?? 1.8]);
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const t of TEMPLATE_CATALOG) {
      const k = sig(t);
      if (seen.has(k)) dupes.push(`${t.id} == ${seen.get(k)}`);
      seen.set(k, t.id);
    }
    expect(dupes).toEqual([]);
  });

  it('lists latest versions with gallery metadata and filters', () => {
    const svc = new TemplatesService();
    const all = svc.list();
    expect(all).toHaveLength(TOTAL_TEMPLATES);
    for (const t of all) {
      expect(t.careerLevels.length).toBeGreaterThan(0);
      expect(['classic', 'modern', 'minimal', 'formal', 'creative']).toContain(t.style);
    }
    expect(svc.list({ category: 'Technology' })).toHaveLength(8);
    expect(svc.list({ atsProfile: 'VISUAL' }).every((t) => t.atsProfile === 'VISUAL')).toBe(true);
    expect(svc.getLatest('exec-concise').id).toBe('exec-concise');
    expect(() => svc.getLatest('nope')).toThrow();
  });
});

describe('every template renders through preview model, HTML, DOCX and PDF', () => {
  for (const t of TEMPLATE_CATALOG) {
    for (const size of ['A4', 'LETTER'] as const) {
      it(`${t.id} (${size})`, async () => {
        const m = buildRenderModel(profile, t, undefined, { pageSize: size });
        expect(m.template).toEqual({ id: t.id, version: t.version });
        expect(m.layout).toBe(t.layout);
        expect(m.page.size).toBe(size);
        expect(m.sections.map((s) => s.type)).toEqual(t.sectionOrder); // all sections present, template order
        if (t.layout === 'two-column') expect(m.sections.some((s) => m.sideSections.includes(s.type))).toBe(true);
        else expect(m.sideSections).toEqual([]);

        const html = renderHtml(m);
        expect(html).not.toContain('<script');
        expect(html).toContain('Ada Lovelace');
        expect(html.match(/<h2>/g)).toHaveLength(m.sections.length);
        if (t.layout === 'two-column') expect(html).toContain('class="cols"');
        if (t.theme.headerBand) expect(html).toContain('class="band"');

        const docx = renderDocx(m);
        expect(docx.subarray(0, 2).toString()).toBe('PK');
        expect(docx.length).toBeGreaterThan(1000);

        const pdf = await toBuffer(m);
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
        expect(pdf.subarray(-8).toString()).toContain('%%EOF');
        expect(pdf.length).toBeGreaterThan(1500);
      });
    }
  }
});
