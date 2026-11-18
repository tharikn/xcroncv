import { RenderModel } from '../render-model/render-model.types';
import { DocImage, ElementStyle, resolveColor } from '../render-model/resume-doc';

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Escape text and turn embedded newlines into <br> so line breaks survive into the exported HTML. */
const escBr = (s: string) => esc(s).replace(/\r\n?|\n/g, '<br>');

const safeUrl = (u?: string) => (u && /^https?:\/\//i.test(u) ? esc(u) : undefined);
const FONT = { Helvetica: 'Arial, Helvetica, sans-serif', 'Times-Roman': '"Times New Roman", Times, serif', Courier: '"Courier New", monospace' };
const H2: Record<NonNullable<RenderModel['theme']['headingStyle']>, (a: string) => string> = {
  plain: () => '',
  bar: (a) => `border-left:4px solid ${a};padding-left:6pt;`,
  tint: (a) => `background:${a}1a;padding:2pt 6pt;`,
  short: (a) => `display:inline-block;border-bottom:3px solid ${a};padding-bottom:1pt;`,
};
const LINE = { compact: 1.25, normal: 1.4, relaxed: 1.6 } as const;

/** Inline CSS for one visual-editor element style. Values come from the sanitised allowlist, never raw client CSS. */
export function styleAttr(st: ElementStyle | undefined, accent: string): string {
  if (!st) return '';
  const c: string[] = [];
  if (st.font) c.push(`font-family:${FONT[st.font].replace(/"/g, "'")}`); // single quotes keep the style attribute intact
  if (st.sizePt !== undefined) c.push(`font-size:${st.sizePt}pt`);
  if (st.bold !== undefined) c.push(`font-weight:${st.bold ? 700 : 400}`);
  if (st.italic !== undefined) c.push(`font-style:${st.italic ? 'italic' : 'normal'}`);
  if (st.color) c.push(`color:${resolveColor(st.color, accent, '#111111')}`);
  if (st.align) c.push(`text-align:${st.align}`);
  if (st.spaceAfterPt !== undefined) c.push(`margin-bottom:${st.spaceAfterPt}pt`);
  return c.length ? ` style="${c.join(';')}"` : '';
}

const img = (i: DocImage | undefined, cls: string, round: boolean) =>
  i ? `<img class="${cls}" alt="" src="${i.src}" style="width:${i.sizePt}pt;height:${i.sizePt}pt${round ? ';border-radius:50%' : ''}">` : '';

/** Self-contained HTML: no scripts, no remote assets (images are inline data URIs), all user text escaped. */
export function renderHtml(m: RenderModel): string {
  const t = m.theme;
  const sa = (key?: string) => (key ? styleAttr(m.styles?.[key], t.accent) : '');
  const h = (s: string) => escBr(t.headingTransform === 'upper' ? s.toUpperCase() : s);
  const head = `<header${t.headerBand ? ' class="band"' : ''}>${img(m.header.photo, 'photo', true)}<h1${sa('header.name')}>${escBr(m.header.name)}</h1>${m.header.headline ? `<p class="hl"${sa('header.headline')}>${escBr(m.header.headline)}</p>` : ''}
<p class="contact"${sa('header.contacts')}>${[...m.header.contacts.map(escBr),
    ...m.header.links.map((l) => `<a href="${safeUrl(l.url)}" rel="noopener noreferrer">${escBr(l.label)}</a>`)].join(' · ')}</p></header>`;

  const renderSection = (s: RenderModel['sections'][number]) => {
    const sk = (f: string) => (s.id ? sa(`s.${s.id}.${f}`) : '');
    const inner = (s.text ? `<p${sk('text')}>${escBr(s.text)}</p>` : '') + (s.items ?? []).map((i) => {
      const ik = (f: string) => (i.id ? sa(`i.${i.id}.${f}`) : '');
      return `<div class="item">${img(i.image, 'logo', false)}
${i.title || i.meta ? `<div class="row"><strong${ik('title')}>${escBr(i.title ?? '')}</strong><span${ik('meta')}>${escBr(i.meta ?? '')}</span></div>` : ''}
${i.subtitle ? `<div class="sub"${ik('subtitle')}>${escBr(i.subtitle)}</div>` : ''}${i.text ? `<p${ik('text')}>${escBr(i.text)}</p>` : ''}
${i.bullets?.length ? `<ul${ik('bullets')}>${i.bullets.map((b) => `<li>${escBr(b)}</li>`).join('')}</ul>` : ''}
${i.tags?.length ? `<p class="tags"${ik('tags')}>${i.tags.map(escBr).join(', ')}</p>` : ''}
${safeUrl(i.url) ? `<p${ik('url')}><a href="${safeUrl(i.url)}" rel="noopener noreferrer">${escBr(i.url!)}</a></p>` : ''}</div>`;
    }).join('');
    return `<section${s.pageBreakBefore ? ' class="page-break"' : ''}><h2${sk('title')}>${h(s.title)}</h2>${inner}</section>`;
  };
  const side = new Set<string>(m.sideSections);
  const isSide = (s: typeof m.sections[number]) => s.column ? s.column === 'side' : side.has(s.type);
  const body = m.layout === 'two-column'
    ? `<div class="cols"><main>${m.sections.filter((s) => !isSide(s)).map(renderSection).join('\n')}</main>`
      + `<aside>${m.sections.filter((s) => isSide(s)).map(renderSection).join('\n')}</aside></div>`
    : m.sections.map(renderSection).join('\n');

  const pageW = m.page.size === 'A4' ? '210mm' : '8.5in';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.header.name)} - Resume</title><style>
body{font-family:${FONT[t.fontFamily]};font-size:${t.baseSizePt}pt;color:#111;max-width:${pageW};margin:0 auto;padding:18mm;line-height:${LINE[t.density ?? 'normal']}}
header{text-align:${t.headerAlign};margin-bottom:12pt}h1{margin:0;font-size:${t.nameScale ?? 1.8}em;color:${t.accent}}
header.band{background:${t.accent};color:#fff;padding:12pt 14pt;margin:-18mm -18mm 12pt}header.band h1{color:#fff}
.hl{margin:2pt 0;font-size:1.1em}.contact{margin:2pt 0;font-size:.95em}a{color:inherit}
img.photo{float:right;object-fit:cover;margin:0 0 6pt 12pt}img.logo{float:right;object-fit:contain;margin:0 0 4pt 8pt}
h2{font-size:1.05em;color:${t.accent};margin:14pt 0 4pt;${H2[t.headingStyle ?? 'plain'](t.accent)}${t.sectionRule ? `border-bottom:1px solid ${t.accent};` : ''}}
.row{display:flex;justify-content:space-between;gap:12pt}.sub{font-style:italic}ul{margin:3pt 0 3pt 16pt;padding:0}p{margin:3pt 0}
.cols{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:18pt}
section.page-break{break-before:page;page-break-before:always}
${m.layout === 'timeline' ? `section{border-left:2px solid ${t.accent};padding-left:10pt}` : ''}
@media print{body{padding:0}header.band{margin:0 0 12pt}@page{size:${m.page.size === 'A4' ? 'A4' : 'letter'};margin:${m.page.marginPt}pt}}
</style></head><body>${head}${body}</body></html>`;
}
