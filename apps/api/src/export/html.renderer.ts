import { RenderModel } from '../render-model/render-model.types';

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const safeUrl = (u?: string) => (u && /^https?:\/\//i.test(u) ? esc(u) : undefined);
const FONT = { Helvetica: 'Arial, Helvetica, sans-serif', 'Times-Roman': '"Times New Roman", Times, serif', Courier: '"Courier New", monospace' };

/** Self-contained HTML: no scripts, no remote assets, all user text escaped. */
export function renderHtml(m: RenderModel): string {
  const t = m.theme;
  const h = (s: string) => esc(t.headingTransform === 'upper' ? s.toUpperCase() : s);
  const head = `<header><h1>${esc(m.header.name)}</h1>${m.header.headline ? `<p class="hl">${esc(m.header.headline)}</p>` : ''}
<p class="contact">${[...m.header.contacts.map(esc),
    ...m.header.links.map((l) => `<a href="${safeUrl(l.url)}" rel="noopener noreferrer">${esc(l.label)}</a>`)].join(' · ')}</p></header>`;

  const body = m.sections.map((s) => {
    const inner = s.text ? `<p>${esc(s.text)}</p>` : (s.items ?? []).map((i) => `<div class="item">
${i.title || i.meta ? `<div class="row"><strong>${esc(i.title ?? '')}</strong><span>${esc(i.meta ?? '')}</span></div>` : ''}
${i.subtitle ? `<div class="sub">${esc(i.subtitle)}</div>` : ''}${i.text ? `<p>${esc(i.text)}</p>` : ''}
${i.bullets?.length ? `<ul>${i.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
${i.tags?.length ? `<p class="tags">${i.tags.map(esc).join(', ')}</p>` : ''}
${safeUrl(i.url) ? `<p><a href="${safeUrl(i.url)}" rel="noopener noreferrer">${esc(i.url!)}</a></p>` : ''}</div>`).join('');
    return `<section><h2>${h(s.title)}</h2>${inner}</section>`;
  }).join('\n');

  const pageW = m.page.size === 'A4' ? '210mm' : '8.5in';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.header.name)} - Resume</title><style>
body{font-family:${FONT[t.fontFamily]};font-size:${t.baseSizePt}pt;color:#111;max-width:${pageW};margin:0 auto;padding:18mm;line-height:1.4}
header{text-align:${t.headerAlign};margin-bottom:12pt}h1{margin:0;font-size:1.8em;color:${t.accent}}
.hl{margin:2pt 0;font-size:1.1em}.contact{margin:2pt 0;font-size:.95em}a{color:inherit}
h2{font-size:1.05em;color:${t.accent};margin:14pt 0 4pt;${t.sectionRule ? `border-bottom:1px solid ${t.accent};` : ''}}
.row{display:flex;justify-content:space-between;gap:12pt}.sub{font-style:italic}ul{margin:3pt 0 3pt 16pt;padding:0}p{margin:3pt 0}
@media print{body{padding:0}@page{size:${m.page.size === 'A4' ? 'A4' : 'letter'};margin:${m.page.marginPt}pt}}
</style></head><body>${head}${body}</body></html>`;
}
