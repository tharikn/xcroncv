import { RenderModel } from '../render-model/render-model.types';
import { pack, xml, XML_DECL } from './ooxml';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const PAGE = { A4: { w: 11906, h: 16838 }, LETTER: { w: 12240, h: 15840 } } as const;
const FONT: Record<string, string> = { 'Times-Roman': 'Times New Roman', Helvetica: 'Arial', Courier: 'Courier New' };

const run = (text: string, o: { b?: boolean; i?: boolean; color?: string } = {}) =>
  `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}</w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
const para = (inner: string, o: { style?: string; align?: string; num?: boolean; tabRight?: number; fill?: string } = {}) =>
  `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.num ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ''}${o.tabRight ? `<w:tabs><w:tab w:val="right" w:pos="${o.tabRight}"/></w:tabs>` : ''}${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}${o.align ? `<w:jc w:val="${o.align}"/>` : ''}</w:pPr>${inner}</w:p>`;

const SPACING = { compact: { after: 30, line: 240 }, normal: { after: 60, line: 259 }, relaxed: { after: 100, line: 290 } } as const;
const hex = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c.slice(1).toUpperCase() : '000000');

/** Editable DOCX from the shared render model: real Title/Heading styles and list numbering (no tables/images; parser friendly). */
export function renderDocx(m: RenderModel): Buffer {
  const accent = hex(m.theme.accent);
  const page = PAGE[m.page.size] ?? PAGE.A4;
  const margin = Math.round(m.page.marginPt * 20);
  const textW = page.w - margin * 2;
  const align = m.theme.headerAlign === 'center' ? 'center' : m.theme.headerAlign === 'right' ? 'right' : 'left';
  const body: string[] = [];

  // Header band: shaded paragraphs with white text on the (dark) accent. Still plain text paragraphs for parsers.
  const band = m.theme.headerBand ? { fill: accent } : {};
  const hc = m.theme.headerBand ? { color: 'FFFFFF' } : {};
  body.push(para(run(m.header.name, hc), { style: 'Title', align, ...band }));
  if (m.header.headline) body.push(para(run(m.header.headline, hc), { align, ...band }));
  if (m.header.contacts.length) body.push(para(run(m.header.contacts.join(' | '), hc), { align, ...band }));
  if (m.header.links.length) body.push(para(run(m.header.links.map((l) => `${l.label}: ${l.url}`).join(' | '), hc), { align, ...band }));

  for (const s of m.sections) {
    const title = m.theme.headingTransform === 'upper' ? s.title.toUpperCase() : s.title;
    body.push(para(run(title), { style: 'Heading1' }));
    if (s.text) body.push(para(run(s.text)));
    for (const it of s.items ?? []) {
      if (it.title && it.tags?.length && !it.subtitle && !it.text && !it.meta && !it.bullets?.length) { body.push(para(run(`${it.title}: `, { b: true }) + run(it.tags.join(', ')))); continue; }
      if (it.title || it.meta) body.push(para(run(it.title ?? '', { b: true }) + (it.meta ? `<w:r><w:tab/></w:r>${run(it.meta)}` : ''), { tabRight: textW }));
      if (it.subtitle) body.push(para(run(it.subtitle, { i: true })));
      if (it.text) body.push(para(run(it.text)));
      for (const b of it.bullets ?? []) body.push(para(run(b), { num: true }));
      if (it.tags?.length) body.push(para(run(it.tags.join(', '))));
      if (it.url) body.push(para(run(it.url)));
    }
  }

  const sect = `<w:sectPr><w:pgSz w:w="${page.w}" w:h="${page.h}"/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
  const font = FONT[m.theme.fontFamily] ?? 'Arial';
  const sz = Math.round(m.theme.baseSizePt * 2);
  const hs = m.theme.headingStyle ?? 'plain';
  const tint = accent.replace(/../g, (c) => Math.round(255 - (255 - parseInt(c, 16)) * 0.12).toString(16).padStart(2, '0'));
  const rule = hs === 'bar' ? `<w:pBdr><w:left w:val="single" w:sz="24" w:space="6" w:color="${accent}"/></w:pBdr>`
    : hs === 'tint' ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${accent}"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="${tint}"/>`
    : hs === 'short' || m.theme.sectionRule ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${accent}"/></w:pBdr>` : '';
  const styles = `${XML_DECL}<w:styles ${W}>`
    + `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/><w:sz w:val="${sz}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="${SPACING[m.theme.density ?? 'normal'].after}" w:line="${SPACING[m.theme.density ?? 'normal'].line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
    + `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="${accent}"/><w:sz w:val="${Math.round(sz * (m.theme.nameScale ?? 1.8))}"/></w:rPr></w:style>`
    + `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/>${rule}<w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="${accent}"/><w:sz w:val="${sz + 4}"/></w:rPr></w:style>`
    + '</w:styles>';
  const numbering = `${XML_DECL}<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="260"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const ct = 'application/vnd.openxmlformats-officedocument.wordprocessingml';

  return pack({
    '[Content_Types].xml': `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${ct}.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="${ct}.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="${ct}.numbering+xml"/></Types>`,
    '_rels/.rels': `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/_rels/document.xml.rels': `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${rel}/numbering" Target="numbering.xml"/></Relationships>`,
    'word/document.xml': `${XML_DECL}<w:document ${W}><w:body>${body.join('')}${sect}</w:body></w:document>`,
    'word/styles.xml': styles,
    'word/numbering.xml': numbering,
  });
}
