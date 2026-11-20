import { ElementStyle, resolveColor } from '../render-model/resume-doc';
import { RenderModel } from '../render-model/render-model.types';
import { pack, xml, XML_DECL } from './ooxml';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const PAGE = { A4: { w: 11906, h: 16838 }, LETTER: { w: 12240, h: 15840 } } as const;
const FONT: Record<string, string> = { 'Times-Roman': 'Times New Roman', Helvetica: 'Arial', Courier: 'Courier New' };

interface RunOpts {
  b?: boolean;
  i?: boolean;
  color?: string;
  font?: string;
  size?: number;
}

interface ParaOpts {
  style?: string;
  align?: string;
  num?: boolean;
  tabRight?: number;
  fill?: string;
  pageBreak?: boolean;
  keepNext?: boolean;
  spaceAfter?: number;
}

/** One run, with visual-editor font/size overrides applied at the run level. */
const run = (text: string, o: RunOpts = {}) => {
  const rpr = `<w:rPr>${o.font ? `<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}" w:cs="${o.font}"/>` : ''}${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.size ? `<w:sz w:val="${o.size}"/>` : ''}</w:rPr>`;
  // Split on newlines so line breaks become real Word <w:br/> elements instead of literal text.
  const parts = text.replace(/\r\n?/g, '\n').split('\n');
  return parts.map((part, i) =>
    `${i ? '<w:br/>' : ''}<w:r>${rpr}<w:t xml:space="preserve">${xml(part)}</w:t></w:r>`
  ).join('');
};

/** `keepLines` keeps a single logical item together; `keepNext` keeps a heading with its first item. */
const para = (inner: string, o: ParaOpts = {}) =>
  `<w:p><w:pPr>${o.pageBreak ? '<w:pageBreakBefore/>' : ''}${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.num ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ''}${o.tabRight ? `<w:tabs><w:tab w:val="right" w:pos="${o.tabRight}"/></w:tabs>` : ''}${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}${o.align ? `<w:jc w:val="${o.align}"/>` : ''}${o.spaceAfter !== undefined ? `<w:spacing w:after="${o.spaceAfter}"/>` : ''}<w:keepLines/>${o.keepNext ? '<w:keepNext/>' : ''}</w:pPr>${inner}</w:p>`;

const SPACING = { compact: { after: 30, line: 240 }, normal: { after: 60, line: 259 }, relaxed: { after: 100, line: 290 } } as const;
const hex = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c.slice(1).toUpperCase() : '000000');

/** Editable DOCX from the shared render model: real Title/Heading styles and list numbering (no tables/images; parser friendly). */
export function renderDocx(m: RenderModel): Buffer {
  const accent = hex(m.theme.accent);
  const page = PAGE[m.page.size] ?? PAGE.A4;
  const margin = Math.round(m.page.marginPt * 20);
  const textW = page.w - margin * 2;
  const align = m.theme.headerAlign === 'center' ? 'center' : m.theme.headerAlign === 'right' ? 'right' : 'left';
  const sz = Math.round(m.theme.baseSizePt * 2);
  const body: string[] = [];
  const elStyles = m.styles ?? {};

  /** Visual-editor overrides win over template defaults; theme tokens resolve against the live accent. */
  const runOpts = (key: string | undefined, base: RunOpts = {}): RunOpts => {
    const s: ElementStyle | undefined = key ? elStyles[key] : undefined;
    if (!s) return base;
    return {
      ...base,
      b: s.bold ?? base.b,
      i: s.italic ?? base.i,
      color: s.color ? hex(resolveColor(s.color, m.theme.accent, `#${base.color ?? '000000'}`)) : base.color,
      font: s.font ? (FONT[s.font] ?? s.font) : base.font,
      size: s.sizePt ? Math.round(s.sizePt * 2) : base.size,
    };
  };
  const paraOpts = (key: string | undefined, base: ParaOpts = {}): ParaOpts => {
    const s: ElementStyle | undefined = key ? elStyles[key] : undefined;
    if (!s) return base;
    return {
      ...base,
      align: s.align ?? base.align,
      spaceAfter: s.spaceAfterPt !== undefined ? Math.round(s.spaceAfterPt * 20) : base.spaceAfter,
    };
  };

  // Header band: shaded paragraphs with white text on the (dark) accent. Still plain text paragraphs for parsers.
  const band = m.theme.headerBand ? { fill: accent } : {};
  const hc = m.theme.headerBand ? { color: 'FFFFFF' } : {};
  const nameOpts = runOpts('header.name', m.theme.headerBand ? hc : { color: accent });
  body.push(para(run(m.header.name, nameOpts), { style: 'Title', align, ...band, ...paraOpts('header.name', { align }) }));
  if (m.header.headline) {
    const headlineOpts = runOpts('header.headline', hc);
    body.push(para(run(m.header.headline, headlineOpts), { align, ...band, ...paraOpts('header.headline', { align }) }));
  }
  if (m.header.contacts.length) {
    const contactOpts = runOpts('header.contacts', hc);
    body.push(para(run(m.header.contacts.join(' | '), contactOpts), { align, ...band, ...paraOpts('header.contacts', { align }) }));
  }
  if (m.header.links.length) {
    const linkOpts = runOpts('header.contacts', hc);
    body.push(para(run(m.header.links.map((l) => `${l.label}: ${l.url}`).join(' | '), linkOpts), { align, ...band, ...paraOpts('header.contacts', { align }) }));
  }

  for (const s of m.sections) {
    const title = m.theme.headingTransform === 'upper' ? s.title.toUpperCase() : s.title;
    const titleKey = s.id ? `s.${s.id}.title` : undefined;
    const titleOpts = runOpts(titleKey, { b: true, color: accent, size: sz + 4 });
    body.push(para(run(title, titleOpts), {
      style: 'Heading1', pageBreak: s.pageBreakBefore, keepNext: true, ...paraOpts(titleKey, {}),
    }));
    if (s.text) {
      const textKey = s.id ? `s.${s.id}.text` : undefined;
      body.push(para(run(s.text, runOpts(textKey)), paraOpts(textKey, {})));
    }
    for (const it of s.items ?? []) {
      const key = (field: 'title' | 'subtitle' | 'meta' | 'text' | 'bullets' | 'tags' | 'url') =>
        it.id ? `i.${it.id}.${field}` : undefined;
      const titleKeyIt = key('title');
      const tagsKey = key('tags');
      const metaKey = key('meta');
      if (it.title && it.tags?.length && !it.subtitle && !it.text && !it.meta && !it.bullets?.length) {
        body.push(para(run(`${it.title}: `, runOpts(titleKeyIt, { b: true })) + run(it.tags.join(', '), runOpts(tagsKey)), paraOpts(titleKeyIt, {})));
        continue;
      }
      if (it.title || it.meta) {
        const content = run(it.title ?? '', runOpts(titleKeyIt, { b: true }))
          + (it.meta ? `<w:r><w:tab/></w:r>${run(it.meta, runOpts(metaKey))}` : '');
        body.push(para(content, { tabRight: textW, keepNext: !!(it.subtitle || it.text || it.bullets?.length || it.tags?.length || it.url), ...paraOpts(titleKeyIt, {}) }));
      }
      if (it.subtitle) {
        const k = key('subtitle');
        body.push(para(run(it.subtitle, runOpts(k, { i: true })), paraOpts(k, {})));
      }
      if (it.text) {
        const k = key('text');
        body.push(para(run(it.text, runOpts(k)), paraOpts(k, {})));
      }
      for (const b of it.bullets ?? []) {
        const k = key('bullets');
        body.push(para(run(b, runOpts(k)), { num: true, ...paraOpts(k, {}) }));
      }
      if (it.tags?.length) {
        body.push(para(run(it.tags.join(', '), runOpts(tagsKey)), paraOpts(tagsKey, {})));
      }
      if (it.url) {
        const k = key('url');
        body.push(para(run(it.url, runOpts(k)), paraOpts(k, {})));
      }
    }
  }

  const sect = `<w:sectPr><w:pgSz w:w="${page.w}" w:h="${page.h}"/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
  const font = FONT[m.theme.fontFamily] ?? 'Arial';
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
