import { BadRequestException } from '@nestjs/common';
import { strFromU8, unzipSync } from 'fflate';
import { assertSafeDocx, MAX_PDF_PAGES } from '../import-export/file-validate';
import { AdapterOutput, LayoutFacts, ParserAdapter } from './types';

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /\+?\d[\d\s().-]{7,}\d/;
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 31 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
  return ENT[e.toLowerCase()] ?? '';
});
const countRepl = (lines: string[]) => lines.reduce((n, l) => n + (l.match(/�/g)?.length ?? 0), 0);

/* ------------------------------ PDF (pdfjs-dist) ------------------------------ */

interface PdfItem { str: string; x: number; y: number; w: number }
interface PdfPageData { items: PdfItem[]; links: string[]; hasImages: boolean }

/** Shared loader so both PDF adapters read the same file once each, within the page and time limits. */
async function loadPdf(buf: Buffer, timeoutMs = 20_000): Promise<{ pages: PdfPageData[]; numPages: number }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const work = (async () => {
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
    try {
      const pages: PdfPageData[] = [];
      for (let n = 1; n <= Math.min(pdf.numPages, MAX_PDF_PAGES); n++) {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        const items: PdfItem[] = (content.items as Array<{ str: string; transform: number[]; width: number }>)
          .filter((i) => i.str && i.str.trim()).map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width }));
        const annots = await page.getAnnotations().catch(() => []);
        const links = (annots as Array<{ url?: string; unsafeUrl?: string }>).map((a) => a.url ?? a.unsafeUrl).filter((u): u is string => !!u);
        const ops = await page.getOperatorList().catch(() => ({ fnArray: [] as number[] }));
        const IMG = [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject].filter((x: number | undefined) => x !== undefined);
        pages.push({ items, links, hasImages: ops.fnArray.some((f: number) => IMG.includes(f)) });
      }
      return { pages, numPages: pdf.numPages as number };
    } finally { await pdf.destroy(); }
  })();
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new BadRequestException('Reading this PDF took too long.')), timeoutMs).unref());
  try { return await Promise.race([work, timeout]); }
  catch (e) {
    if (e instanceof BadRequestException) throw e;
    throw new BadRequestException('This PDF could not be read. It may be damaged or password protected.');
  }
}

/** Heuristic column detection: text items cluster into two x-bands that both hold substantial text on the same rows. */
function detectColumns(items: PdfItem[]): number {
  if (items.length < 30) return 1;
  const xs = items.map((i) => i.x); const min = Math.min(...xs); const max = Math.max(...xs);
  if (max - min < 200) return 1;
  const mid = (min + max) / 2; const gap = 40;
  const left = items.filter((i) => i.x + i.w < mid - gap / 2 + 60 && i.x < mid - gap);
  const right = items.filter((i) => i.x > mid + gap / 2 - 60 && i.x > mid);
  const rowsL = new Set(left.map((i) => Math.round(i.y / 4))); const rowsR = new Set(right.map((i) => Math.round(i.y / 4)));
  const shared = [...rowsL].filter((r) => rowsR.has(r)).length;
  return left.length > 12 && right.length > 12 && shared >= 6 ? 2 : 1;
}

function pdfLayout(pages: PdfPageData[], numPages: number): LayoutFacts {
  const text = pages.map((p) => p.items.map((i) => i.str).join(' '));
  const header = pages.flatMap((p) => p.items.filter((i) => i.y > 780)).map((i) => i.str).join(' ');
  return {
    columns: Math.max(1, ...pages.map((p) => detectColumns(p.items))), tables: 0, textBoxes: 0,
    images: pages.filter((p) => p.hasImages).length, headerFooterText: !!header.trim(), headerFooterHasContact: EMAIL.test(header) || PHONE.test(header),
    blankPages: text.filter((t) => t.replace(/\s/g, '').length === 0 && !pages[text.indexOf(t)]?.hasImages).length,
    imageOnlyPages: pages.filter((p, i) => p.hasImages && text[i].replace(/\s/g, '').length < 20).length, pages: numPages,
  };
}

/** Reading strategy A: sort by position (top-to-bottom, then left-to-right), like a layout-aware extractor. */
export const pdfGeometric: ParserAdapter = {
  id: 'pdf-geometric-v1', name: 'PDF layout-aware text extractor', version: '1.0 (pdfjs-dist 3.11)', formats: ['pdf'],
  capabilities: ['Selectable text', 'Position-based reading order', 'Link annotations', 'Image-only page detection', 'No OCR'],
  async parse(buf): Promise<AdapterOutput> {
    const { pages, numPages } = await loadPdf(buf);
    const lines: string[] = [];
    for (const p of pages) {
      const rows = new Map<number, PdfItem[]>();
      for (const it of p.items) { const y = Math.round(it.y / 3); (rows.get(y) ?? rows.set(y, []).get(y)!).push(it); }
      for (const y of [...rows.keys()].sort((a, b) => b - a)) {
        const t = rows.get(y)!.sort((a, b) => a.x - b.x).map((c) => c.str).join(' ').replace(/\s+/g, ' ').trim();
        if (t) lines.push(t);
      }
    }
    return { lines, links: pages.flatMap((p) => p.links), layout: pdfLayout(pages, numPages), replacementChars: countRepl(lines) };
  },
};

/** Reading strategy B: follow the order text was written into the file (what simple extractors do). */
export const pdfStream: ParserAdapter = {
  id: 'pdf-stream-v1', name: 'PDF content-stream text extractor', version: '1.0 (pdfjs-dist 3.11)', formats: ['pdf'],
  capabilities: ['Selectable text', 'File (content-stream) reading order', 'Link annotations', 'No OCR'],
  async parse(buf): Promise<AdapterOutput> {
    const { pages, numPages } = await loadPdf(buf);
    const lines: string[] = [];
    for (const p of pages) {
      let cur = ''; let lastY: number | undefined;
      for (const it of p.items) {
        if (lastY !== undefined && Math.abs(it.y - lastY) > 3) { if (cur.trim()) lines.push(cur.replace(/\s+/g, ' ').trim()); cur = ''; }
        cur += (cur ? ' ' : '') + it.str; lastY = it.y;
      }
      if (cur.trim()) lines.push(cur.replace(/\s+/g, ' ').trim());
    }
    return { lines, links: pages.flatMap((p) => p.links), layout: pdfLayout(pages, numPages), replacementChars: countRepl(lines) };
  },
};

/* ------------------------------ DOCX (OOXML) ------------------------------ */

/** Reads word/document.xml only (body text, tables, text boxes, drawings, columns) plus header/footer parts and hyperlink relationships. */
export const docxXml: ParserAdapter = {
  id: 'docx-xml-v1', name: 'DOCX body-text extractor', version: '1.0 (OOXML)', formats: ['docx'],
  capabilities: ['Body paragraphs', 'Tables and text boxes detected', 'Header/footer text detected but not read as body', 'Hyperlinks', 'Multi-column detection'],
  async parse(buf): Promise<AdapterOutput> {
    assertSafeDocx(buf);
    const files = unzipSync(new Uint8Array(buf), { filter: (f) => /^word\/(document|header\d*|footer\d*|_rels\/document\.xml)\.(xml|rels)$/.test(f.name) });
    const doc = files['word/document.xml'];
    if (!doc) throw new BadRequestException('This is not a Word document.');
    const xml = strFromU8(doc);
    const lines: string[] = [];
    for (const p of xml.split('</w:p>')) {
      let text = '';
      const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(p))) text += m[1] !== undefined ? decode(m[1]) : m[0].startsWith('<w:tab') ? '\t' : '\n';
      for (const part of text.split('\n')) { const t = part.trim(); if (t) lines.push(/<w:numPr>/.test(p) && !/^[•▪\-*·]/.test(t) ? `• ${t}` : t); }
    }
    const hf = Object.entries(files).filter(([k]) => /^word\/(header|footer)/.test(k)).map(([, v]) => strFromU8(v));
    const hfText = hf.map((x) => [...x.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => decode(m[1])).join(' ')).join(' ').trim();
    const rels = files['word/_rels/document.xml.rels'] ? strFromU8(files['word/_rels/document.xml.rels']) : '';
    const links = [...rels.matchAll(/Target="([^"]+)"[^>]*TargetMode="External"|TargetMode="External"[^>]*Target="([^"]+)"/g)].map((m) => decode(m[1] ?? m[2]));
    const cols = Math.max(1, ...[...xml.matchAll(/<w:cols\b[^>]*w:num="(\d+)"/g)].map((m) => parseInt(m[1], 10)));
    return {
      lines, links,
      layout: {
        columns: cols, tables: (xml.match(/<w:tbl(?=[\s>/])/g) ?? []).length, textBoxes: (xml.match(/<w:txbxContent>/g) ?? []).length,
        images: (xml.match(/<w:(?:drawing|pict)(?=[\s>/])/g) ?? []).length, headerFooterText: !!hfText, headerFooterHasContact: EMAIL.test(hfText) || PHONE.test(hfText),
        blankPages: 0, imageOnlyPages: 0,
      },
      replacementChars: countRepl(lines),
    };
  },
};

export const ADAPTERS: ParserAdapter[] = [pdfGeometric, pdfStream, docxXml];
export const adaptersFor = (kind: 'pdf' | 'docx', ids?: string[]) => {
  const all = ADAPTERS.filter((a) => a.formats.includes(kind));
  if (!ids?.length) return all;
  const picked = all.filter((a) => ids.includes(a.id));
  if (!picked.length) throw new BadRequestException(`No matching parser profile for ${kind}. Available: ${all.map((a) => a.id).join(', ')}`);
  return picked;
};
