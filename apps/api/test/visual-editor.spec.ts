import { Writable } from 'stream';
import { renderHtml } from '../src/export/html.renderer';
import { face, renderPdf } from '../src/export/pdf.renderer';
import { buildRenderModel, mergeOverridesOnWrite, ProfileInput, sanitizeOverrides } from '../src/render-model/render-model.builder';
import { resolveColor, ResumeDoc, sanitizeDoc } from '../src/render-model/resume-doc';
import { TEMPLATE_CATALOG } from '../src/templates/template.catalog';

// 1x1 transparent PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const profile: ProfileInput = {
  fullName: 'Ada Lovelace', email: 'ada@example.com', links: [{ label: 'Site', url: 'https://ada.dev' }],
  summary: 'Engineer.', headline: 'Backend',
  experiences: [{ employerName: 'Acme', jobTitle: 'Dev', startDate: '2020-01', isCurrent: true, bullets: [{ content: 'Built x' }] }],
  skills: [], educations: [], projects: [], certifications: [], languages: [],
};

const doc = (over: Partial<ResumeDoc> = {}): ResumeDoc => ({
  v: 1,
  header: { name: 'Ada L.', headline: 'Lead', contacts: ['ada@example.com'], photo: { src: PNG, sizePt: 60 } },
  sections: [
    { id: 'sx', type: 'custom', title: 'Awards', items: [{ id: 'ia', title: 'Gold <b>medal</b>', meta: '2021', bullets: ['One'], image: { src: PNG, sizePt: 24 } }] },
    { id: 'sh', type: 'summary', title: 'Summary', text: 'Edited summary', hidden: true },
    { id: 'se', type: 'experience', title: 'Experience', items: [{ id: 'ib', title: 'Dev', subtitle: 'Acme' }] },
  ],
  styles: { 'header.name': { color: '#336699', bold: false, sizePt: 30, align: 'center' }, 's.sx.title': { color: 'accent', italic: true }, 'i.ia.title': { font: 'Courier', spaceAfterPt: 4 } },
  ...over,
});

describe('sanitizeDoc', () => {
  it('rejects anything that is not a v1 document', () => {
    expect(sanitizeDoc(undefined)).toBeUndefined();
    expect(sanitizeDoc({ v: 2, sections: [] })).toBeUndefined();
    expect(sanitizeDoc({ v: 1 })).toBeUndefined();
  });
  it('keeps a valid document intact', () => {
    const d = sanitizeDoc(doc())!;
    expect(d.sections.map((s) => s.id)).toEqual(['sx', 'sh', 'se']);
    expect(d.header.photo?.sizePt).toBe(60);
    expect(d.styles['header.name']).toEqual({ color: '#336699', bold: false, sizePt: 30, align: 'center' });
  });
  it('drops unsafe images, urls, unknown keys, bad colours and clamps numbers', () => {
    const d = sanitizeDoc({
      v: 1, header: { name: 'x', contacts: [1, 'a'], photo: { src: 'https://evil/x.png', sizePt: 50 } },
      sections: [{ id: 'bad id!', type: 'nope', title: 't', items: [{ id: 'bad id!', url: 'javascript:alert(1)', image: { src: 'data:image/svg+xml;base64,AAAA', sizePt: 20 }, extra: 1 }], evil: true }],
      styles: { 'header.name': { color: 'url(x)', sizePt: 500, font: 'Comic' }, '__proto__': { bold: true }, 'i.a.title': { color: 'accent', sizePt: 2, spaceAfterPt: 99 }, 'weird.key': { bold: true } },
    })!;
    expect(d.header.photo).toBeUndefined();
    expect(d.header.contacts).toEqual(['a']);
    expect(d.sections[0].type).toBe('custom');
    expect(d.sections[0].id).toBe('s0');
    expect(d.sections[0].items![0].url).toBeUndefined();
    expect(d.sections[0].items![0].image).toBeUndefined();
    expect((d.sections[0] as unknown as Record<string, unknown>).evil).toBeUndefined();
    expect(d.styles['header.name']).toEqual({ sizePt: 36 });
    expect(d.styles['i.a.title']).toEqual({ color: 'accent', sizePt: 6, spaceAfterPt: 36 });
    expect(Object.keys(d.styles)).toEqual(['header.name', 'i.a.title']);
  });
  it('de-duplicates ids and enforces size caps', () => {
    const items = Array.from({ length: 80 }, () => ({ id: 'same', title: 'x'.repeat(500), bullets: Array(50).fill('b') }));
    const d = sanitizeDoc({ v: 1, header: {}, sections: [{ id: 'same', type: 'projects', title: 'P', items }, { id: 'same', type: 'skills', title: 'S' }] })!;
    expect(new Set([...d.sections.map((s) => s.id), ...d.sections[0].items!.map((i) => i.id)]).size).toBe(d.sections.length + d.sections[0].items!.length);
    expect(d.sections[0].items).toHaveLength(60);
    expect(d.sections[0].items![0].title).toHaveLength(200);
    expect(d.sections[0].items![0].bullets).toHaveLength(30);
  });
  it('rejects oversized images', () => {
    const big = `data:image/png;base64,${'A'.repeat(300_001)}`;
    expect(sanitizeDoc({ v: 1, header: { photo: { src: big, sizePt: 50 } }, sections: [] })!.header.photo).toBeUndefined();
  });
  it('is applied through overrides', () => {
    expect(sanitizeOverrides({ doc: doc(), evil: 1 }).doc?.sections).toHaveLength(3);
    expect(sanitizeOverrides({ doc: { v: 9 } })).toEqual({});
  });
});

describe('resolveColor', () => {
  it('maps theme tokens and validates hex', () => {
    expect(resolveColor('accent', '#123456', '#000000')).toBe('#123456');
    expect(resolveColor('#aabbcc', '#123456', '#000000')).toBe('#aabbcc');
    expect(resolveColor('red', '#123456', '#000000')).toBe('#000000');
    expect(resolveColor(undefined, '#123456', '#abcdef')).toBe('#abcdef');
  });
});

describe('render model with a visual-editor doc', () => {
  const tpl = TEMPLATE_CATALOG[0];
  it('replaces header text and sections, hides hidden ones, keeps links and theme', () => {
    const m = buildRenderModel(profile, tpl, undefined, { doc: doc(), accent: '#112233' });
    expect(m.header.name).toBe('Ada L.');
    expect(m.header.links).toHaveLength(1);
    expect(m.header.photo?.sizePt).toBe(60);
    expect(m.sections.map((s) => s.id)).toEqual(['sx', 'se']);
    expect(m.sections[0].type).toBe('custom');
    expect(m.theme.accent).toBe('#112233');
    expect(m.styles?.['header.name']?.sizePt).toBe(30);
  });
  it('is unchanged without a doc', () => {
    const m = buildRenderModel(profile, tpl, undefined, {});
    expect(m.styles).toBeUndefined();
    expect(m.sections[0].id).toBeUndefined();
  });
});

describe('exports of a doc share the render model', () => {
  const m = buildRenderModel(profile, TEMPLATE_CATALOG[0], undefined, { doc: doc() });
  it('HTML applies element styles, escapes text and embeds images inline', () => {
    const html = renderHtml(m);
    expect(html).toContain('<h1 style="font-size:30pt;font-weight:400;color:#336699;text-align:center">Ada L.</h1>');
    expect(html).toContain('Gold &lt;b&gt;medal&lt;/b&gt;');
    expect(html).not.toContain('<b>medal');
    expect(html).toContain('class="photo"');
    expect(html).toContain('class="logo"');
    expect(html).toContain("font-family:'Courier New', monospace;margin-bottom:4pt");
    expect(html).toContain('AWARDS');
    expect(html).not.toContain('Edited summary'); // hidden section stays out of every export
    expect(html).not.toContain('<script');
  });
  it('PDF renders with photo, logo and styles', async () => {
    const chunks: Buffer[] = [];
    const out = new Writable({ write(c, _e, cb) { chunks.push(Buffer.from(c)); cb(); } });
    const done = new Promise<void>((r) => out.on('finish', () => r()));
    renderPdf(m, out);
    await done;
    const buf = Buffer.concat(chunks);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1500);
  });
  it('PDF survives a corrupt image without failing the export', async () => {
    const bad = buildRenderModel(profile, TEMPLATE_CATALOG[0], undefined, { doc: doc({ header: { name: 'A', contacts: [], photo: { src: 'data:image/png;base64,AAAA', sizePt: 40 } } }) });
    const chunks: Buffer[] = [];
    const out = new Writable({ write(c, _e, cb) { chunks.push(Buffer.from(c)); cb(); } });
    const done = new Promise<void>((r) => out.on('finish', () => r()));
    renderPdf(bad, out);
    await done;
    expect(Buffer.concat(chunks).subarray(0, 5).toString()).toBe('%PDF-');
  });
  it('maps family + weight + slant to standard faces', () => {
    expect(face('Helvetica', true, true)).toBe('Helvetica-BoldOblique');
    expect(face('Times-Roman', false, true)).toBe('Times-Italic');
    expect(face('Courier', true, false)).toBe('Courier-Bold');
    expect(face('Courier', false, false)).toBe('Courier');
  });
});

describe('mergeOverridesOnWrite', () => {
  const stored = { accent: '#112233', doc: doc() };
  it('keeps the visual-editor doc when the incoming overrides do not mention it (classic editor save)', () => {
    const out = mergeOverridesOnWrite({ accent: '#445566', baseSizePt: 11 }, stored);
    expect(out.accent).toBe('#445566');
    expect(out.doc?.sections).toHaveLength(3);
  });
  it('replaces the doc when one is sent and drops it when explicitly null', () => {
    const next = doc({ sections: [] });
    expect(mergeOverridesOnWrite({ doc: next }, stored).doc?.sections).toHaveLength(0);
    expect(mergeOverridesOnWrite({ accent: '#445566', doc: null }, stored).doc).toBeUndefined();
  });
  it('never trusts the stored value blindly and ignores junk', () => {
    expect(mergeOverridesOnWrite({ evil: 1 }, { doc: { v: 7 } })).toEqual({});
    expect(mergeOverridesOnWrite(undefined, undefined)).toEqual({});
  });
});
