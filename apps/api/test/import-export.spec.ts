import { PassThrough } from 'stream';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { buildRenderModel, ProfileInput } from '../src/render-model/render-model.builder';
import { renderPdf } from '../src/export/pdf.renderer';
import { TEMPLATE_CATALOG } from '../src/templates/template.catalog';
import { renderDocx } from '../src/import-export/docx.renderer';
import { renderXlsx, safeCell, sheetName } from '../src/import-export/xlsx.renderer';
import { assertSafeDocx, sniff } from '../src/import-export/file-validate';
import { extractDocx, extractPdf } from '../src/import-export/text-extract';
import { parseResumeText, toYearMonth } from '../src/import-export/resume-parser';

const profile: ProfileInput = {
  fullName: 'Grace Hopper', email: 'grace@example.com', phone: '+1 555 010 2030', location: 'New York, USA', headline: 'Compiler Pioneer',
  links: [{ label: 'GitHub', url: 'https://github.com/grace' }], summary: 'Invented the first compiler and championed machine independent languages.',
  experiences: [
    { employerName: 'US Navy', jobTitle: 'Rear Admiral', startDate: '2010-03', endDate: '2015-06', isCurrent: false, bullets: [{ content: 'Led programming language standardisation.' }, { content: 'Mentored 40 engineers.' }] },
    { employerName: 'Remington Rand', jobTitle: 'Senior Mathematician', startDate: '2016-01', isCurrent: true, bullets: [{ content: 'Built the A-0 system.' }] },
  ],
  skills: [{ name: 'COBOL', category: 'Languages' }, { name: 'FLOW-MATIC', category: 'Languages' }],
  educations: [{ institution: 'Yale University', degree: 'PhD Mathematics', startDate: '1930-09', endDate: '1934-06' }],
  projects: [], certifications: [], languages: [],
};
const model = buildRenderModel(profile, TEMPLATE_CATALOG[0], undefined, {});

async function pdfBytes(): Promise<Buffer> {
  const sink = new PassThrough(); const chunks: Buffer[] = [];
  sink.on('data', (c) => chunks.push(c));
  const done = new Promise<void>((r) => sink.on('end', () => r()));
  renderPdf(model, sink as never);
  await done;
  return Buffer.concat(chunks);
}

describe('file validation', () => {
  it('sniffs by content, not by name', () => {
    expect(sniff(Buffer.from('%PDF-1.7 rest of file'))).toBe('pdf');
    expect(sniff(Buffer.from([0x50, 0x4b, 3, 4, 0, 0, 0, 0]))).toBe('docx');
    expect(() => sniff(Buffer.from('MZ\x90\x00 an executable'))).toThrow(/Only PDF and DOCX/);
    expect(() => sniff(Buffer.from('abc'))).toThrow(/empty or too small/);
  });
  it('rejects zip bombs, macro documents and non-Word zips', () => {
    const bomb = Buffer.from(zipSync({ 'word/document.xml': new Uint8Array(30 * 1024 * 1024) }));
    expect(bomb.length).toBeLessThan(200_000);
    expect(() => assertSafeDocx(bomb)).toThrow(/too large or complex/);
    expect(() => assertSafeDocx(Buffer.from(zipSync({ 'a.txt': strToU8('hi hi hi') })))).toThrow(/not a Word document/);
    expect(() => assertSafeDocx(Buffer.from(zipSync({ 'word/document.xml': strToU8('<w:document/>'), 'word/vbaProject.bin': strToU8('x') })))).toThrow(/macros/);
    expect(() => assertSafeDocx(Buffer.from([0x50, 0x4b, 3, 4, 1, 2, 3, 4, 5, 6]))).toThrow(/not a valid DOCX/);
  });
});

describe('DOCX export', () => {
  const docx = renderDocx(model);
  const parts = unzipSync(new Uint8Array(docx));
  it('is a complete OOXML package with styles and numbering', () => {
    for (const p of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/_rels/document.xml.rels']) expect(parts[p]).toBeDefined();
    expect(strFromU8(parts['word/document.xml'])).toContain('w:pStyle w:val="Heading1"');
  });
  it('escapes XML special characters and strips control characters', () => {
    const evil = renderDocx(buildRenderModel({ ...profile, fullName: 'A <b>&"x"</b>\u0001', summary: 'x' }, TEMPLATE_CATALOG[0], undefined, {}));
    const x = strFromU8(unzipSync(new Uint8Array(evil))['word/document.xml']);
    expect(x).toContain('A &lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;');
    expect(x).not.toContain('\u0001');
  });
  it('turns newlines into real Word <w:br/> line breaks', () => {
    const m = buildRenderModel(profile, TEMPLATE_CATALOG[0], undefined, {});
    m.sections[0].text = 'line one\nline two';
    const x = strFromU8(unzipSync(new Uint8Array(renderDocx(m)))['word/document.xml']);
    expect(x).toContain('line one</w:t></w:r><w:br/><w:r>');
    expect(x).toContain('<w:t xml:space="preserve">line two</w:t>');
  });
  it('emits <w:pageBreakBefore/> only on sections that request a page break', () => {
    const m = buildRenderModel(profile, TEMPLATE_CATALOG[0], undefined, {});
    m.sections[1].pageBreakBefore = true;
    const x = strFromU8(unzipSync(new Uint8Array(renderDocx(m)))['word/document.xml']);
    expect(x.match(/<w:pageBreakBefore\/>/g)).toHaveLength(1);
  });
  it('round-trips through the importer (export -> import recovers the facts)', () => {
    const s = parseResumeText(extractDocx(docx).lines);
    expect(s.fullName).toBe('Grace Hopper');
    expect(s.email).toBe('grace@example.com');
    expect(s.experiences.map((e) => e.employerName)).toEqual(expect.arrayContaining(['US Navy', 'Remington Rand']));
    const navy = s.experiences.find((e) => e.employerName === 'US Navy')!;
    expect(navy).toMatchObject({ jobTitle: 'Rear Admiral', startDate: '2010-03', endDate: '2015-06', isCurrent: false });
    expect(navy.bullets.map((b) => b.content)).toContain('Mentored 40 engineers.');
    expect(s.experiences.find((e) => e.employerName === 'Remington Rand')!.isCurrent).toBe(true);
    expect(s.skills.map((k) => k.name)).toEqual(expect.arrayContaining(['COBOL', 'FLOW-MATIC']));
    expect(s.educations[0].institution).toContain('Yale');
  });
});

describe('XLSX export', () => {
  it('escapes formula-like values and labels empty ones', () => {
    expect(safeCell('=HYPERLINK("http://x")')).toBe('\'=HYPERLINK("http://x")');
    expect(safeCell('+1 555')).toBe("'+1 555");
    expect(safeCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(safeCell('-2+3')).toBe("'-2+3");
    expect(safeCell('\t=1')).toBe("'=1".replace("'=1", "'=1")); // trimmed first, then checked
    expect(safeCell('')).toBe('(not provided)');
    expect(safeCell(undefined)).toBe('(not provided)');
    expect(safeCell('x'.repeat(40000)).length).toBe(32767);
  });
  it('produces valid sheet names', () => {
    const used = new Set<string>();
    expect(sheetName('Work/Experience: [2020]?', used)).toBe('Work Experience 2020');
    expect(sheetName('Work/Experience: [2020]?', used)).not.toBe('Work Experience 2020');
    expect(sheetName('x'.repeat(50), new Set()).length).toBeLessThanOrEqual(31);
  });
  it('writes one sheet per section, never as formulas', () => {
    const m = buildRenderModel({ ...profile, headline: '=cmd|\' /C calc\'!A1' }, TEMPLATE_CATALOG[0], undefined, {});
    const parts = unzipSync(new Uint8Array(renderXlsx(m)));
    const wb = strFromU8(parts['xl/workbook.xml']);
    expect(wb).toContain('name="Profile"');
    expect(wb).toContain('name="Experience"');
    const all = Object.entries(parts).filter(([k]) => k.startsWith('xl/worksheets/')).map(([, v]) => strFromU8(v)).join('');
    expect(all).not.toMatch(/<f>/);
    expect(all).toContain("'=cmd");
  });
});

describe('PDF text extraction + parser (round trip with our own PDF export)', () => {
  it('extracts selectable text and recovers the structure', async () => {
    const ex = await extractPdf(await pdfBytes());
    expect(ex.lines.join('\n')).toContain('Grace Hopper');
    const s = parseResumeText(ex.lines);
    expect(s.fullName).toBe('Grace Hopper');
    expect(s.email).toBe('grace@example.com');
    expect(s.experiences.length).toBeGreaterThanOrEqual(2);
    expect(s.skills.map((k) => k.name)).toContain('COBOL');
  }, 30_000);
  it('fails cleanly on garbage that looks like a PDF', async () => {
    await expect(extractPdf(Buffer.from('%PDF-1.4 this is not really a pdf'))).rejects.toThrow(/could not be read/);
  });
});

describe('PDF page breaks', () => {
  async function pageCount(m: ReturnType<typeof buildRenderModel>): Promise<number> {
    const sink = new PassThrough(); const chunks: Buffer[] = [];
    sink.on('data', (c) => chunks.push(c));
    const done = new Promise<void>((r) => sink.on('end', () => r()));
    renderPdf(m, sink as never);
    await done;
    return (Buffer.concat(chunks).toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
  }
  it('adds a page for a section that requests a page break', async () => {
    const plain = buildRenderModel(profile, TEMPLATE_CATALOG[0], undefined, {});
    const broken = buildRenderModel(profile, TEMPLATE_CATALOG[0], undefined, {});
    broken.sections[1].pageBreakBefore = true;
    expect(await pageCount(broken)).toBe((await pageCount(plain)) + 1);
  }, 30_000);
});

describe('parser', () => {
  it('handles employer-first layouts, month names and year-only dates', () => {
    const s = parseResumeText([
      'Ada Lovelace', 'ada@example.com | +44 20 7946 0000 | linkedin.com/in/ada', 'Analytical Engine Programmer',
      'EXPERIENCE', 'Babbage & Co', 'Programmer   Jan 2018 - Present', '• Wrote the first published algorithm.',
      'Difference Engines Ltd', 'Analyst   2015 - 2017', '• Checked tables.',
      'SKILLS', 'Languages: Analytical, Maths | Tools: Punch cards',
      'EDUCATION', 'University of London', 'BSc Mathematics 2010 - 2013',
      'LANGUAGES', 'English (native), French - basic',
    ]);
    expect(s.links[0]).toEqual({ label: 'LinkedIn', url: 'https://linkedin.com/in/ada' });
    expect(s.experiences[0]).toMatchObject({ employerName: 'Babbage & Co', jobTitle: 'Programmer', startDate: '2018-01', isCurrent: true });
    expect(s.experiences[1]).toMatchObject({ employerName: 'Difference Engines Ltd', startDate: '2015-01', endDate: '2017-01' });
    expect(s.warnings.join(' ')).toContain('only had a year');
    expect(s.skills).toEqual(expect.arrayContaining([{ name: 'Analytical', category: 'Languages' }, { name: 'Punch cards', category: 'Tools' }]));
    expect(s.educations[0].institution).toContain('University of London');
    expect(s.languages).toEqual([{ name: 'English', proficiency: 'native' }, { name: 'French', proficiency: 'basic' }]);
  });
  it('warns instead of inventing data when text is thin or sections are missing', () => {
    const s = parseResumeText(['hello']);
    expect(s.warnings.join(' ')).toMatch(/Very little text/);
    expect(s.experiences).toEqual([]);
    expect(s.fullName).toBe('hello');
  });
  it('never exceeds DTO limits', () => {
    const s = parseResumeText(['Name Here', 'EXPERIENCE', `${'T'.repeat(400)} at ${'E'.repeat(400)}  Jan 2020 - Present`, `• ${'b'.repeat(2000)}`]);
    expect(s.experiences[0].jobTitle.length).toBeLessThanOrEqual(150);
    expect(s.experiences[0].employerName.length).toBeLessThanOrEqual(150);
    expect(s.experiences[0].bullets[0].content.length).toBeLessThanOrEqual(600);
  });
  it('converts date formats to YYYY-MM and rejects nonsense', () => {
    expect(toYearMonth('Sept 2019')).toBe('2019-09');
    expect(toYearMonth('03/2021')).toBe('2021-03');
    expect(toYearMonth('2020-13')).toBeUndefined();
    expect(toYearMonth('Someday')).toBeUndefined();
  });
});
