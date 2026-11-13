import PDFDocument from 'pdfkit';
import { Writable } from 'stream';
import { RenderModel } from '../render-model/render-model.types';

/** Streams a PDF built from the shared render model into `out`. Nothing is written to disk. */
export function renderPdf(m: RenderModel, out: Writable): void {
  const t = m.theme;
  const bold = t.fontFamily === 'Times-Roman' ? 'Times-Bold' : `${t.fontFamily}-Bold`;
  const italic = t.fontFamily === 'Times-Roman' ? 'Times-Italic' : t.fontFamily === 'Helvetica' ? 'Helvetica-Oblique' : 'Courier-Oblique';
  const doc = new PDFDocument({ size: m.page.size, margin: m.page.marginPt, info: { Title: `${m.header.name} - Resume` } });
  doc.pipe(out);
  const w = doc.page.width - m.page.marginPt * 2;
  const align = t.headerAlign;

  doc.font(bold).fontSize(t.baseSizePt * 1.8).fillColor(t.accent).text(m.header.name, { align });
  if (m.header.headline) doc.font(t.fontFamily).fontSize(t.baseSizePt * 1.1).fillColor('#111').text(m.header.headline, { align });
  const contact = [...m.header.contacts, ...m.header.links.map((l) => `${l.label}: ${l.url}`)].join('  |  ');
  if (contact) doc.font(t.fontFamily).fontSize(t.baseSizePt * 0.95).fillColor('#111').text(contact, { align });
  doc.moveDown(0.8);

  for (const s of m.sections) {
    doc.font(bold).fontSize(t.baseSizePt * 1.05).fillColor(t.accent)
      .text(t.headingTransform === 'upper' ? s.title.toUpperCase() : s.title, { keepTogether: true });
    if (t.sectionRule) {
      const y = doc.y + 1;
      doc.moveTo(m.page.marginPt, y).lineTo(m.page.marginPt + w, y).lineWidth(0.5).strokeColor(t.accent).stroke();
    }
    doc.moveDown(0.3).fillColor('#111');
    if (s.text) doc.font(t.fontFamily).fontSize(t.baseSizePt).text(s.text);
    for (const i of s.items ?? []) {
      if (i.title) doc.font(bold).fontSize(t.baseSizePt).text(i.title + (i.meta ? `    ${i.meta}` : ''), { keepTogether: true });
      else if (i.meta) doc.font(t.fontFamily).fontSize(t.baseSizePt).text(i.meta);
      if (i.subtitle) doc.font(italic).fontSize(t.baseSizePt).text(i.subtitle);
      if (i.text) doc.font(t.fontFamily).fontSize(t.baseSizePt).text(i.text);
      if (i.bullets?.length) doc.font(t.fontFamily).fontSize(t.baseSizePt).list(i.bullets, { bulletRadius: 1.5, textIndent: 10 });
      if (i.tags?.length) doc.font(t.fontFamily).fontSize(t.baseSizePt).text(i.tags.join(', '));
      if (i.url) doc.font(t.fontFamily).fontSize(t.baseSizePt).text(i.url, { link: i.url });
      doc.moveDown(0.4);
    }
    doc.moveDown(0.3);
  }
  doc.end();
}
