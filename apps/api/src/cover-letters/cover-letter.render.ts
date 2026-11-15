import PDFDocument from 'pdfkit';
import { Writable } from 'stream';
import { LetterSection } from './cover-letter.types';

const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENT[c]);

export const lettersToText = (sections: LetterSection[]) => sections.map((s) => s.text).join('\n\n');

/** Escaped, script-free HTML. Streamed to the client and never stored. */
export function renderLetterHtml(title: string, sections: LetterSection[]): string {
  const body = sections.map((s) => `<section>${esc(s.text).replace(/\n/g, '<br>')}</section>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:11pt/1.5 Helvetica,Arial,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem}section{margin:0 0 1rem}</style></head><body>${body}</body></html>`;
}

export function renderLetterPdf(title: string, sections: LetterSection[], out: Writable): void {
  const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: title } });
  doc.pipe(out);
  doc.font('Helvetica').fontSize(11);
  sections.forEach((s, i) => { doc.text(s.text, { lineGap: 3 }); if (i < sections.length - 1) doc.moveDown(); });
  doc.end();
}
