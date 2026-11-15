import { BadRequestException } from '@nestjs/common';
import { unzipSync, strFromU8 } from 'fflate';
import { assertSafeDocx, MAX_PDF_PAGES } from './file-validate';

export interface Extracted { lines: string[]; pages?: number; truncated?: boolean }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 31 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
  return ENT[e.toLowerCase()] ?? '';
});

/** Plain text lines from a DOCX. Only word/document.xml is decompressed, and XML is read with regexes (no entity expansion, no XXE). */
export function extractDocx(buf: Buffer): Extracted {
  assertSafeDocx(buf);
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name === 'word/document.xml' });
  const doc = files['word/document.xml'];
  if (!doc) throw new BadRequestException('This is not a Word document.');
  const xml = strFromU8(doc);
  const lines: string[] = [];
  for (const p of xml.split('</w:p>')) {
    const isList = /<w:numPr>/.test(p);
    let text = '';
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(p))) text += m[1] !== undefined ? decode(m[1]) : m[0].startsWith('<w:tab') ? '\t' : '\n';
    for (const part of text.split('\n')) {
      const t = part.replace(/\s+$/g, '').replace(/^\s+/g, '');
      if (t) lines.push(isList && !/^[•▪\-*·]/.test(t) ? `• ${t}` : t);
    }
  }
  return { lines };
}

/** Plain text lines from a PDF (selectable text only; scanned PDFs need OCR, which is out of scope). */
export async function extractPdf(buf: Buffer, timeoutMs = 15_000): Promise<Extracted> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const work = (async () => {
    const task = pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
    const pdf = await task.promise;
    try {
      const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
      const lines: string[] = [];
      for (let n = 1; n <= pages; n++) {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        const rows = new Map<number, Array<{ x: number; s: string }>>();
        for (const it of content.items as Array<{ str: string; transform: number[] }>) {
          if (!it.str) continue;
          const y = Math.round(it.transform[5] / 3); // group items within ~3pt into the same line
          const r = rows.get(y) ?? []; r.push({ x: it.transform[4], s: it.str }); rows.set(y, r);
        }
        for (const y of [...rows.keys()].sort((a, b) => b - a)) {
          const t = rows.get(y)!.sort((a, b) => a.x - b.x).map((c) => c.s).join(' ').replace(/\s+/g, ' ').trim();
          if (t) lines.push(t);
        }
      }
      return { lines, pages: pdf.numPages, truncated: pdf.numPages > MAX_PDF_PAGES } as Extracted;
    } finally { await pdf.destroy(); }
  })();
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new BadRequestException('Reading this PDF took too long.')), timeoutMs).unref());
  try { return await Promise.race([work, timeout]); }
  catch (e) {
    if (e instanceof BadRequestException) throw e;
    throw new BadRequestException('This PDF could not be read. It may be damaged or password protected.');
  }
}
