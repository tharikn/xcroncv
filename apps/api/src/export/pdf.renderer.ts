import PDFDocument from 'pdfkit';
import { Writable } from 'stream';
import { RenderModel, RenderSection } from '../render-model/render-model.types';
import { DocImage, ElementStyle, resolveColor } from '../render-model/resume-doc';

const GAP = { compact: 0.6, normal: 1, relaxed: 1.5 } as const;
const LINE_GAP = { compact: 0, normal: 0, relaxed: 2 } as const;

type Family = 'Helvetica' | 'Times-Roman' | 'Courier';
/** Standard PDF font face for a family + weight/slant (selectable text, no embedding). */
export function face(family: Family, bold: boolean, italic: boolean): string {
  if (family === 'Times-Roman') return bold && italic ? 'Times-BoldItalic' : bold ? 'Times-Bold' : italic ? 'Times-Italic' : 'Times-Roman';
  const fam = family === 'Courier' ? 'Courier' : 'Helvetica';
  return bold && italic ? `${fam}-BoldOblique` : bold ? `${fam}-Bold` : italic ? `${fam}-Oblique` : fam;
}
const dataBuf = (i: DocImage) => Buffer.from(i.src.slice(i.src.indexOf(',') + 1), 'base64');

/** Streams a PDF built from the shared render model into `out`. Nothing is written to disk. */
export function renderPdf(m: RenderModel, out: Writable): void {
  const t = m.theme;
  const bold = t.fontFamily === 'Times-Roman' ? 'Times-Bold' : `${t.fontFamily}-Bold`;
  const italic = t.fontFamily === 'Times-Roman' ? 'Times-Italic' : t.fontFamily === 'Helvetica' ? 'Helvetica-Oblique' : 'Courier-Oblique';
  const density = t.density ?? 'normal';
  const g = GAP[density];
  const lineGap = LINE_GAP[density];
  const doc = new PDFDocument({ size: m.page.size, margin: m.page.marginPt, info: { Title: `${m.header.name} - Resume` } });
  let pages = 1;
  doc.on('pageAdded', () => { pages += 1; });
  doc.pipe(out);
  const margin = m.page.marginPt;
  const w = doc.page.width - margin * 2;
  const align = t.headerAlign;
  const band = !!t.headerBand;
  const ink = band ? '#ffffff' : '#111';

  // --- visual-editor element formatting (allowlisted style per element key; absent = template default) ---
  const F = (key: string | undefined, b: { bold?: boolean; italic?: boolean; size: number; color: string; font?: string }) => {
    const st: ElementStyle | undefined = key ? m.styles?.[key] : undefined;
    const fam = st?.font ?? t.fontFamily;
    const custom = !!st && (st.font !== undefined || st.bold !== undefined || st.italic !== undefined);
    return {
      font: custom || !b.font ? face(fam, st?.bold ?? !!b.bold, st?.italic ?? !!b.italic) : b.font,
      size: st?.sizePt ?? b.size, color: resolveColor(st?.color, t.accent, b.color), align: st?.align, gap: st?.spaceAfterPt,
    };
  };
  const afterGap = (gap?: number) => { if (gap !== undefined) doc.y += gap; };
  const photo = m.header.photo;

  // --- header (optionally on an accent band; band text is white on a dark accent) ---
  const contact = [...m.header.contacts, ...m.header.links.map((l) => `${l.label}: ${l.url}`)].join('  |  ');
  const nameSz = t.baseSizePt * (t.nameScale ?? 1.8); const hlSz = t.baseSizePt * 1.1; const ctSz = t.baseSizePt * 0.95;
  const top = band ? Math.min(28, margin) : margin;
  const hw = photo ? w - photo.sizePt - 10 : w;
  const fName = F('header.name', { bold: true, size: nameSz, color: band ? '#ffffff' : t.accent, font: bold });
  const fHl = F('header.headline', { size: hlSz, color: ink, font: t.fontFamily });
  const fCt = F('header.contacts', { size: ctSz, color: ink, font: t.fontFamily });
  if (band) {
    doc.font(fName.font).fontSize(fName.size);
    let h = doc.heightOfString(m.header.name, { width: hw, align: fName.align ?? align });
    if (m.header.headline) { doc.font(fHl.font).fontSize(fHl.size); h += doc.heightOfString(m.header.headline, { width: hw, align: fHl.align ?? align }); }
    if (contact) { doc.font(fCt.font).fontSize(fCt.size); h += doc.heightOfString(contact, { width: hw, align: fCt.align ?? align }); }
    if (photo) h = Math.max(h, photo.sizePt);
    doc.save().rect(0, 0, doc.page.width, top + h + 14).fill(t.accent).restore();
    doc.x = margin; doc.y = top + 4;
  }
  const headTop = doc.y;
  if (photo) { // round crop; image bytes come from the document data URI and are never stored
    const r = photo.sizePt / 2; const px = margin + w - photo.sizePt;
    try { doc.save().circle(px + r, headTop + r, r).clip().image(dataBuf(photo), px, headTop, { width: photo.sizePt, height: photo.sizePt }).restore(); } catch { doc.restore(); }
  }
  doc.font(fName.font).fontSize(fName.size).fillColor(fName.color).text(m.header.name, { width: hw, align: fName.align ?? align }); afterGap(fName.gap);
  if (m.header.headline) { doc.font(fHl.font).fontSize(fHl.size).fillColor(fHl.color).text(m.header.headline, { width: hw, align: fHl.align ?? align }); afterGap(fHl.gap); }
  if (contact) { doc.font(fCt.font).fontSize(fCt.size).fillColor(fCt.color).text(contact, { width: hw, align: fCt.align ?? align }); afterGap(fCt.gap); }
  if (photo) doc.y = Math.max(doc.y, headTop + photo.sizePt);
  doc.x = margin;
  doc.fillColor('#111');
  doc.moveDown(band ? 1.6 : 0.8);

  // --- sections ---
  const base = t.baseSizePt;
  const timeline = m.layout === 'timeline';
  const sectionAt = (s: RenderSection, x: number, width: number) => {
    const txt = (str: string, font: string, size: number, extra: Record<string, unknown> = {}) => {
      doc.x = x; doc.font(font).fontSize(size).text(str, { width, lineGap, ...extra } as never);
    };
    const hs = t.headingStyle ?? 'plain';
    const title = t.headingTransform === 'upper' ? s.title.toUpperCase() : s.title;
    const fT = F(s.id ? `s.${s.id}.title` : undefined, { bold: true, size: base * 1.05, color: t.accent, font: bold });
    const hSz = fT.size; const hFont = fT.font; const hAlign = fT.align;
    if (hs === 'tint') {
      doc.font(hFont).fontSize(hSz);
      const hh = doc.heightOfString(title, { width: width - 12 });
      doc.save().fillOpacity(0.1).rect(x, doc.y - 1, width, hh + 3).fill(t.accent).restore();
      doc.x = x + 6; doc.y += 1;
      doc.fillColor(fT.color).font(hFont).fontSize(hSz).text(title, { width: width - 12, lineGap, align: hAlign, keepTogether: true } as never);
    } else if (hs === 'bar') {
      doc.font(hFont).fontSize(hSz);
      const hh = doc.heightOfString(title, { width: width - 10 });
      doc.save().rect(x, doc.y, 3, hh).fill(t.accent).restore();
      doc.fillColor(fT.color);
      doc.x = x + 8; doc.font(hFont).fontSize(hSz).text(title, { width: width - 10, lineGap, align: hAlign, keepTogether: true } as never);
    } else {
      doc.fillColor(fT.color);
      txt(title, hFont, hSz, { keepTogether: true, align: hAlign });
      if (hs === 'short') {
        const y = doc.y + 1;
        doc.moveTo(x, y).lineTo(x + Math.min(40, width), y).lineWidth(2).strokeColor(t.accent).stroke();
      }
    }
    doc.x = x;
    if (t.sectionRule) {
      const y = doc.y + 1;
      doc.moveTo(x, y).lineTo(x + width, y).lineWidth(0.5).strokeColor(t.accent).stroke();
    }
    doc.moveDown(0.3 * g).fillColor('#111');
    const startPages = pages; const startY = doc.y;
    const ix = timeline ? x + 10 : x; const iw = timeline ? width - 10 : width;
    afterGap(fT.gap);
    let curW = iw;
    const item = (str: string, font: string, extra: Record<string, unknown> = {}, f?: ReturnType<typeof F>) => {
      doc.x = ix; doc.font(f?.font ?? font).fontSize(f?.size ?? base).fillColor(f?.color ?? '#111')
        .text(str, { width: curW, lineGap, ...(f?.align ? { align: f.align } : {}), ...extra } as never);
      doc.fillColor('#111'); if (f) afterGap(f.gap);
    };
    const plain = { size: base, color: '#111' };
    if (s.text) item(s.text, t.fontFamily, {}, s.id ? F(`s.${s.id}.text`, { ...plain, font: t.fontFamily }) : undefined);
    for (const i of s.items ?? []) {
      const k = (f: string) => (i.id ? `i.${i.id}.${f}` : undefined);
      const fTitle = F(k('title'), { ...plain, bold: true, font: bold });
      const fMeta = F(k('meta'), { ...plain, font: t.fontFamily });
      const fSub = F(k('subtitle'), { ...plain, italic: true, font: italic });
      const fText = F(k('text'), { ...plain, font: t.fontFamily });
      const fBul = F(k('bullets'), { ...plain, font: t.fontFamily });
      const fTag = F(k('tags'), { ...plain, font: t.fontFamily });
      const fUrl = F(k('url'), { ...plain, font: t.fontFamily });
      const imgTop = doc.y; const im = i.image;
      if (im) {
        if (imgTop + im.sizePt > doc.page.height - margin) doc.addPage();
        const top0 = doc.y;
        try { doc.image(dataBuf(im), ix + iw - im.sizePt, top0, { fit: [im.sizePt, im.sizePt] }); } catch { /* unreadable image: skip, never fail the export */ }
        curW = iw - im.sizePt - 6; doc.y = top0;
      } else curW = iw;
      const itemTop = doc.y;
      const styledMeta = !!(i.id && m.styles?.[`i.${i.id}.meta`]);
      if (i.title && i.meta && styledMeta) {
        item(i.title, bold, { keepTogether: true, continued: true }, fTitle);
        item(`    ${i.meta}`, t.fontFamily, { continued: false }, fMeta);
      } else if (i.title) item(i.title + (i.meta ? `    ${i.meta}` : ''), bold, { keepTogether: true }, fTitle);
      else if (i.meta) item(i.meta, t.fontFamily, {}, fMeta);
      if (i.subtitle) item(i.subtitle, italic, {}, fSub);
      if (i.text) item(i.text, t.fontFamily, {}, fText);
      if (i.bullets?.length) {
        doc.x = ix; doc.font(fBul.font).fontSize(fBul.size).fillColor(fBul.color).list(i.bullets, { width: curW, bulletRadius: 1.5, textIndent: 10, lineGap } as never);
        doc.fillColor('#111'); afterGap(fBul.gap);
      }
      if (i.tags?.length) item(i.tags.join(', '), t.fontFamily, {}, fTag);
      if (i.url) item(i.url, t.fontFamily, { link: i.url }, fUrl);
      if (im && pages === startPages && doc.y < itemTop + im.sizePt) doc.y = itemTop + im.sizePt;
      curW = iw;
      doc.moveDown(0.4 * g);
    }
    if (timeline && pages === startPages && doc.y > startY) {
      doc.moveTo(x + 2, startY).lineTo(x + 2, doc.y - 4).lineWidth(1.5).strokeColor(t.accent).stroke();
    }
    doc.moveDown(0.3 * g);
    doc.x = margin;
  };

  if (m.layout === 'two-column') {
    const sideSet = new Set<string>(m.sideSections);
    const gutter = 18; const sideW = Math.round(w * 0.3); const mainW = w - sideW - gutter;
    const startY = doc.y; const startPages = pages;
    for (const s of m.sections.filter((x) => sideSet.has(x.type))) sectionAt(s, margin + mainW + gutter, sideW);
    if (pages === startPages) doc.y = startY; // side rail fits beside the first page of the main column
    for (const s of m.sections.filter((x) => !sideSet.has(x.type))) sectionAt(s, margin, mainW);
  } else {
    for (const s of m.sections) sectionAt(s, margin, w);
  }
  doc.end();
}
