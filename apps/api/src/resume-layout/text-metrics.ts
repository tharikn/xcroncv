import PDFDocument from 'pdfkit';

export interface TextMeasurer {
  /** Height in points of `text` at the given face/size/width. Mirrors PDFKit's own layout math. */
  height(text: string, font: string, size: number, width: number, lineGap: number): number;
  dispose(): void;
}

const CACHE_LIMIT = 60_000;

/**
 * PDFKit-backed measurer. The PDF is the deliverable, so PDFKit is the single source of geometry
 * truth: measurement and painting can never disagree about wrapping.
 *
 * The document is never piped anywhere; it only answers heightOfString queries.
 */
export function createTextMeasurer(pageSize: 'A4' | 'LETTER', marginPt: number): TextMeasurer {
  const doc = new PDFDocument({ size: pageSize, margin: marginPt });
  const cache = new Map<string, number>();

  return {
    height(text: string, font: string, size: number, width: number, lineGap: number): number {
      if (!text) return 0;
      const key = `${font}|${size}|${lineGap}|${width.toFixed(2)}|${text}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      doc.font(font).fontSize(size);
      const h = doc.heightOfString(text, { width: Math.max(1, width), lineGap });
      if (cache.size >= CACHE_LIMIT) cache.clear();
      cache.set(key, h);
      return h;
    },
    dispose(): void {
      cache.clear();
      try {
        doc.end();
      } catch {
        /* nothing was piped; ending is best-effort cleanup */
      }
    },
  };
}
