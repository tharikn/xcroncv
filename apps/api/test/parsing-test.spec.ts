import { PassThrough } from 'stream';
import { strToU8, zipSync } from 'fflate';
import { renderPdf } from '../src/export/pdf.renderer';
import { renderDocx } from '../src/import-export/docx.renderer';
import { buildRenderModel, ProfileInput } from '../src/render-model/render-model.builder';
import { TEMPLATE_CATALOG } from '../src/templates/template.catalog';
import { ADAPTERS, adaptersFor, docxXml, pdfGeometric, pdfStream } from '../src/parsing-test/adapters';
import { agreement, expectedFrom, runParsingTest } from '../src/parsing-test/engine';

const profile: ProfileInput = {
  fullName: 'Zoë Müller', email: 'zoe@example.com', phone: '+49 30 1234 5678', location: 'Berlin, Germany', headline: 'Backend Engineer',
  links: [{ label: 'GitHub', url: 'https://github.com/zoe' }], summary: 'Engineer building reliable payment systems with TypeScript and Go.',
  experiences: [
    { employerName: 'Acme GmbH', jobTitle: 'Senior Engineer', startDate: '2020-03', isCurrent: true, bullets: [{ content: 'Cut p99 latency by 40%.' }] },
    { employerName: 'Beta AG', jobTitle: 'Engineer', startDate: '2016-01', endDate: '2020-02', isCurrent: false, bullets: [{ content: 'Built the billing service.' }] },
  ],
  skills: [{ name: 'TypeScript', category: 'Languages' }, { name: 'Go', category: 'Languages' }, { name: 'PostgreSQL', category: 'Data' }],
  educations: [{ institution: 'TU Berlin', degree: 'MSc Computer Science', startDate: '2012-10', endDate: '2015-09' }],
  projects: [], certifications: [], languages: [],
};
const model = buildRenderModel(profile, TEMPLATE_CATALOG[0], undefined, {});

const pdfOf = (m = model) => new Promise<Buffer>((res, rej) => {
  const s = new PassThrough(); const c: Buffer[] = [];
  s.on('data', (d) => c.push(d)); s.on('end', () => res(Buffer.concat(c))); s.on('error', rej);
  renderPdf(m, s as never);
});

describe('parsing test: known generated source', () => {
  it('PDF: both readers recover the resume and produce a scored, separate report', async () => {
    const { report, preview } = await runParsingTest(await pdfOf(), 'pdf', adaptersFor('pdf'), expectedFrom(model));
    expect(report.source).toBe('GENERATED');
    expect(report.score).toBeGreaterThanOrEqual(85);
    expect(report.adapters.map((a) => a.id)).toEqual(['pdf-geometric-v1', 'pdf-stream-v1']);
    expect(report.adapters.every((a) => a.score !== null && a.breakdown)).toBe(true);
    expect(report.suiteVersion).toBe('parsing-suite-1');
    expect(report.scoreNote).toMatch(/separate from the quality and job match/);
    expect(report.limitations.join(' ')).toMatch(/do not emulate any employer ATS/);
    expect(preview[0].lines.join(' ')).toContain('Zoë');
    expect(report.indicators.textExtracted).toBe('ok');
  }, 60_000);

  it('DOCX: round trip scores high with no errors', async () => {
    const { report } = await runParsingTest(renderDocx(model), 'docx', adaptersFor('docx'), expectedFrom(model));
    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(report.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(report.adapters[0].fields).toMatchObject({ name: true, email: true, phone: true });
    expect(report.adapters[0].fields.experienceEntries).toBe(2);
  });

  it('detects dates, unicode and link preservation as measured dimensions', async () => {
    const { report } = await runParsingTest(renderDocx(model), 'docx', adaptersFor('docx'), expectedFrom(model));
    const b = report.adapters[0].breakdown!;
    expect(Object.keys(b).sort()).toEqual(['dates', 'fieldRecognition', 'layout', 'linksUnicode', 'readingOrder', 'sectionRecognition', 'textCoverage']);
    expect(Object.values(b).reduce((t, x) => t + x.weight, 0)).toBeCloseTo(1, 5);
    expect(b['dates'].score).toBe(100);
    expect(b['linksUnicode'].score).toBe(100);
  });

  it('a damaged export lowers the score and explains exactly what was missed', async () => {
    const broken = JSON.parse(JSON.stringify(model));
    const docx = renderDocx(model);
    // Parse a different resume than expected: emulates an export that lost content
    const other = buildRenderModel({ ...profile, experiences: [profile.experiences[0]], skills: [], educations: [] }, TEMPLATE_CATALOG[0], undefined, {});
    const { report } = await runParsingTest(renderDocx(other), 'docx', adaptersFor('docx'), expectedFrom(model));
    expect(broken).toBeTruthy(); expect(docx.length).toBeGreaterThan(0);
    expect(report.score!).toBeLessThan(80);
    const ids = report.findings.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['PT-TEXT-001', 'PT-SEC-001', 'PT-FLD-004']));
    const sec = report.findings.find((f) => f.id === 'PT-SEC-001')!;
    expect(sec.message).toMatch(/This parser did not detect your "(Skills|Education)" heading/);
    expect(sec.expected).toBeTruthy(); // comparison is authorised for a generated source
  });
});

describe('parsing test: external files (no ground truth)', () => {
  it('never fabricates a score and omits expected/extracted values', async () => {
    const { report } = await runParsingTest(renderDocx(model), 'docx', adaptersFor('docx'));
    expect(report.source).toBe('UPLOAD');
    expect(report.score).toBeNull();
    expect(report.adapters.every((a) => a.score === null && a.breakdown === null)).toBe(true);
    expect(report.scoreNote).toMatch(/No score is shown/);
    expect(report.findings.every((f) => f.expected === undefined && f.extracted === undefined)).toBe(true);
  });

  it('flags a file with almost no text (scan-like)', async () => {
    const { report } = await runParsingTest(Buffer.from(zipSync({ 'word/document.xml': strToU8('<w:document><w:body><w:p><w:r><w:t>hi</w:t></w:r></w:p></w:body></w:document>') })), 'docx', adaptersFor('docx'));
    expect(report.findings.map((f) => f.id)).toContain('PT-TEXT-002');
    expect(report.indicators.textExtracted).not.toBe('ok');
  });

  it('records adapter failures as findings instead of throwing', async () => {
    const { report } = await runParsingTest(Buffer.from('%PDF-1.4 definitely not a pdf'), 'pdf', adaptersFor('pdf'));
    expect(report.adapters.every((a) => !!a.error)).toBe(true);
    expect(report.findings.some((f) => f.id === 'PT-RUN-001')).toBe(true);
    expect(report.indicators.textExtracted).toBe('problem');
  });
});

/* ------------------------------ layout fixtures (DOCX built by hand) ------------------------------ */
const body = (inner: string, extra: Record<string, string> = {}) => Buffer.from(zipSync({
  'word/document.xml': strToU8(`<w:document xmlns:w="w"><w:body>${inner}</w:body></w:document>`), ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, strToU8(v)])),
}));
const p = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
const LONG = Array.from({ length: 12 }, (_, i) => p(`Built and shipped service number ${i} for payments and reporting teams`)).join('');

describe('layout diagnostics (DOCX fixtures)', () => {
  it('flags tables, text boxes, columns, images and header-only contact details', async () => {
    const docx = body(
      `${p('Ada Lovelace')}<w:tbl><w:tr><w:tc>${p('Skills')}</w:tc></w:tr></w:tbl><w:txbxContent>${p('Box')}</w:txbxContent><w:drawing/>${LONG}<w:sectPr><w:cols w:num="2"/></w:sectPr>`,
      { 'word/header1.xml': '<w:hdr><w:p><w:r><w:t>ada@example.com +44 20 7946 0000</w:t></w:r></w:p></w:hdr>' },
    );
    const { report } = await runParsingTest(docx, 'docx', [docxXml]);
    const ids = report.findings.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['PT-LAY-001', 'PT-LAY-002', 'PT-LAY-003', 'PT-LAY-004', 'PT-LAY-006']));
    expect(report.indicators.layout).toBe('warning');
    const header = report.findings.find((f) => f.id === 'PT-LAY-004')!;
    expect(header.message).toMatch(/header or footer/);
    expect(header.suggestion).toBeTruthy();
  });

  it('every finding carries a stable id, category, severity and message', async () => {
    const { report } = await runParsingTest(body(`${p('x')}<w:tbl/>`), 'docx', [docxXml]);
    for (const f of report.findings) {
      expect(f.id).toMatch(/^PT-[A-Z]{3,4}-\d{3}$/);
      expect(['error', 'warning', 'info']).toContain(f.severity);
      expect(f.message.length).toBeGreaterThan(5);
      expect(f.adapter).toBe('docx-xml-v1');
    }
  });
});

describe('reading order', () => {
  it('flags content whose order differs from the source', async () => {
    const m = buildRenderModel(profile, TEMPLATE_CATALOG[0], undefined, {});
    // Document with sections in reverse order relative to the expected source
    const reversed = [...m.sections].reverse().map((s) => p(s.title.toUpperCase()) + (s.items ?? []).map((i) => p(i.title ?? '')).join('') + (s.text ? p(s.text) : '')).join('');
    const { report } = await runParsingTest(body(p(m.header.name) + p(m.header.contacts.join(' | ')) + reversed + LONG), 'docx', [docxXml], expectedFrom(m));
    expect(report.findings.map((f) => f.id)).toContain('PT-ORD-001');
    expect(report.adapters[0].breakdown!['readingOrder'].score).toBeLessThan(100);
  });
  it('agreement ratio: identical = 1, reversed < 0.5', () => {
    const a = Array.from({ length: 10 }, (_, i) => `line number ${i}`);
    expect(agreement(a, a)).toBe(1);
    expect(agreement(a, [...a].reverse())).toBeLessThan(0.5);
    expect(agreement([], a)).toBe(1);
  });
});

describe('adapters', () => {
  it('declare id, version, formats and capabilities (lab contract)', () => {
    for (const a of ADAPTERS) { expect(a.id).toMatch(/-v\d+$/); expect(a.version).toBeTruthy(); expect(a.capabilities.length).toBeGreaterThan(0); expect(a.formats.length).toBeGreaterThan(0); }
    expect(new Set(ADAPTERS.map((a) => a.id)).size).toBe(ADAPTERS.length);
  });
  it('selects by format and validates requested profiles', () => {
    expect(adaptersFor('pdf').map((a) => a.id)).toEqual([pdfGeometric.id, pdfStream.id]);
    expect(adaptersFor('docx', ['docx-xml-v1'])).toEqual([docxXml]);
    expect(() => adaptersFor('docx', ['pdf-stream-v1'])).toThrow(/No matching parser profile/);
  });
  it('geometric and stream readers agree on a simple single-column PDF', async () => {
    const buf = await pdfOf();
    const [a, b] = await Promise.all([pdfGeometric.parse(buf), pdfStream.parse(buf)]);
    expect(agreement(a.lines, b.lines)).toBeGreaterThan(0.8);
    expect(a.layout.pages).toBe(1);
    expect(a.layout.columns).toBe(1);
  }, 60_000);
});

describe('privacy', () => {
  it('reports for uploads contain no document text beyond rule messages', async () => {
    const secret = 'ZXQ-SECRET-TEXT-98765';
    const docx = body(p('Jane Roe') + p(`jane@example.com ${secret}`) + LONG);
    const { report, preview } = await runParsingTest(docx, 'docx', [docxXml]);
    expect(JSON.stringify(report)).not.toContain(secret);
    expect(JSON.stringify(preview)).toContain(secret); // preview is ephemeral: returned to the caller, never persisted
  });
});
