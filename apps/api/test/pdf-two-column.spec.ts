import { Writable } from 'stream';
import { buildRenderModel, ProfileInput } from '../src/render-model/render-model.builder';
import { renderPdf } from '../src/export/pdf.renderer';
import { TEMPLATE_CATALOG } from '../src/templates/template.catalog';

const pdfjs = require('pdfjs-dist/legacy/build/pdf.js') as {
  getDocument: (opts: unknown) => { promise: Promise<PdfDoc> };
};

interface TextItem { str: string; transform: number[]; width: number }
interface PdfPage { view: number[]; getTextContent(): Promise<{ items: TextItem[] }> }
interface PdfDoc { numPages: number; getPage(pageNumber: number): Promise<PdfPage>; destroy(): Promise<void> }

const toBuffer = (m: ReturnType<typeof buildRenderModel>) => new Promise<Buffer>((resolve, reject) => {
  const chunks: Buffer[] = [];
  const w = new Writable({ write(c, _e, cb) { chunks.push(Buffer.from(c)); cb(); } });
  w.on('finish', () => resolve(Buffer.concat(chunks))).on('error', reject);
  renderPdf(m, w);
});

const readPages = async (pdf: Buffer) => {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0,
  }).promise;
  const pages: Array<{ number: number; page: PdfPage; items: TextItem[] }> = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    pages.push({ number: n, page, items: (await page.getTextContent()).items.filter((i) => !!i.str?.trim()) });
  }
  await doc.destroy();
  return pages;
};

const findMarker = (pages: Awaited<ReturnType<typeof readPages>>, marker: string) => {
  for (const p of pages) {
    const index = p.items.findIndex((i) => i.str.includes(marker));
    if (index >= 0) return { pageNumber: p.number, page: p.page, item: p.items[index] };
  }
  return undefined;
};

describe('two-column PDF export', () => {
  it('keeps main-column content on page 1 and wraps a long side rail inside the page bounds', async () => {
    const template = TEMPLATE_CATALOG.find((t) => t.id === 'modern-clean-geometric')!;
    const profile: ProfileInput = {
      fullName: 'Ada Lovelace', email: 'ada@example.com', phone: '+44 20 7946 0000', location: 'London',
      headline: 'Analytical Engine Programmer', summary: 'Pioneer of computing with a decade of results.',
      links: [],
      // Long main column: the first bullet is a stable page-1 marker.
      experiences: Array.from({ length: 12 }, (_, n) => ({
        employerName: `Babbage & Co ${n}`, jobTitle: `Programmer ${n}`, location: 'London',
        startDate: `20${10 + n}-01`, endDate: null, isCurrent: n === 0,
        bullets: [{ content: n === 0
          ? 'MAIN_PAGE_ONE_MARKER delivered measurable outcomes across the engine programme.'
          : `Delivered measurable outcome number ${n} across the engine programme with a long descriptive sentence.` }],
      })),
      skills: Array.from({ length: 40 }, (_, i) => ({ name: `Skill ${i}`, category: 'Core' })),
      educations: [{ institution: 'Self-taught', degree: 'Mathematics', startDate: '2005-01', endDate: '2009-01' }],
      projects: [{ name: 'Notes on the Engine', description: 'Translation and notes.', technologies: ['Math'] }],
      // Long side rail so it must wrap onto the pages already created by the main column.
      certifications: Array.from({ length: 25 }, (_, i) => ({
        name: i === 20 ? 'SIDE_WRAP_MARKER' : `Royal Society Fellow ${i}`, issuer: 'RS', issuedDate: '2015-05',
      })),
      languages: Array.from({ length: 15 }, (_, i) => ({ name: `Language ${i}`, proficiency: 'Fluent' })),
    };
    const model = buildRenderModel(profile, template, undefined, {});
    expect(model.layout).toBe('two-column');
    expect(model.sideSections).toContain('certifications');

    const pages = await readPages(await toBuffer(model));
    const first = pages[0];

    // Regression: the old implementation rendered the side rail first, so its page breaks pushed this
    // main-column bullet onto page 2 and left page 1's left half blank.
    const main = findMarker(pages, 'MAIN_PAGE_ONE_MARKER');
    expect(main).toBeDefined();
    expect(main!.pageNumber).toBe(1);
    expect(main!.item.transform[4]).toBeLessThan(first.page.view[2] * 0.6);

    // The side rail must flow through the same pages without escaping its column or the printable area.
    const side = findMarker(pages, 'SIDE_WRAP_MARKER');
    expect(side).toBeDefined();
    const sideX = side!.item.transform[4];
    expect(sideX).toBeGreaterThan(side!.page.view[2] * 0.6);
    expect(sideX + side!.item.width).toBeLessThanOrEqual(side!.page.view[2] - model.page.marginPt + 2);

    for (const p of pages) {
      for (const item of p.items.filter((i) => i.transform[4] > p.page.view[2] * 0.6)) {
        expect(item.transform[4]).toBeGreaterThanOrEqual(0);
        expect(item.transform[4] + item.width).toBeLessThanOrEqual(p.page.view[2] - model.page.marginPt + 2);
        expect(item.transform[5]).toBeGreaterThanOrEqual(model.page.marginPt - 2);
        expect(item.transform[5]).toBeLessThanOrEqual(p.page.view[3] - model.page.marginPt + 2);
      }
    }
  });
});
