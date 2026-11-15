import { RenderModel } from '../render-model/render-model.types';

export const EXPORT_CHECK_VERSION = 'export-check-1';

export interface ExportCheckFinding { id: string; severity: 'warning' | 'info'; title: string; explanation: string; recommendation: string }
export interface ExtractionCheck {
  format: 'pdf' | 'docx'; ok: boolean; pages: number | null; wordCoverage: number; missingSample: string[]; readingOrderOk: boolean | null;
  replacementChars: number; findings: ExportCheckFinding[];
}

const words = (s: string) => (s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9][a-z0-9+#.]{2,}/g) ?? []);

/** All visible text of the render model: the same content preview and export are built from. */
export function modelText(m: RenderModel): { all: string; name: string; headings: string[] } {
  const parts: string[] = [m.header.name, m.header.headline ?? '', ...m.header.contacts];
  const headings: string[] = [];
  for (const s of m.sections) {
    headings.push(s.title);
    parts.push(s.title, s.text ?? '');
    for (const it of s.items ?? []) parts.push(it.title ?? '', it.subtitle ?? '', it.meta ?? '', it.text ?? '', ...(it.bullets ?? []), ...(it.tags ?? []));
  }
  return { all: parts.join(' '), name: m.header.name, headings };
}

/**
 * Compares the text that a real extractor (pdf.js / DOCX XML) pulls out of a freshly generated export with the text the render model
 * put in. Pure; the generated file and the extracted text are never stored. This is an extraction sanity check, not an employer ATS result.
 */
export function checkExtraction(m: RenderModel, format: 'pdf' | 'docx', lines: string[], pages: number | null): ExtractionCheck {
  const src = modelText(m);
  const expected = [...new Set(words(src.all))];
  const gotText = lines.join(' ');
  const got = new Set(words(gotText));
  const missing = expected.filter((w) => !got.has(w));
  const coverage = expected.length ? 1 - missing.length / expected.length : 1;
  const replacementChars = (gotText.match(/�/g) ?? []).length;
  const findings: ExportCheckFinding[] = [];

  let readingOrderOk: boolean | null = null;
  const lower = gotText.toLowerCase();
  const first = m.sections[0]?.title.toLowerCase();
  const nameAt = lower.indexOf(src.name.toLowerCase());
  const firstAt = first ? lower.indexOf(first) : -1;
  if (nameAt >= 0 && firstAt >= 0) readingOrderOk = nameAt < firstAt;
  else if (src.name && nameAt < 0) readingOrderOk = false;

  if (coverage < 0.98) {
    findings.push({
      id: `EXTRACT.${format.toUpperCase()}.COVERAGE`, severity: coverage < 0.9 ? 'warning' : 'info',
      title: `${Math.round((1 - coverage) * 100)}% of words were not found when the ${format.toUpperCase()} was read back`,
      explanation: 'A text extractor could not recover every word the resume contains. Automated systems may miss that text.',
      recommendation: 'Preview the file, avoid unusual fonts and special symbols, and export again.',
    });
  }
  if (readingOrderOk === false) {
    findings.push({
      id: `EXTRACT.${format.toUpperCase()}.READING_ORDER`, severity: 'warning', title: 'Reading order looks scrambled',
      explanation: 'The name or the first section did not come out in the expected order.', recommendation: 'Try a single-column template.',
    });
  }
  if (replacementChars > 0) {
    findings.push({
      id: `EXTRACT.${format.toUpperCase()}.ENCODING`, severity: 'warning', title: `${replacementChars} unreadable character(s) after extraction`,
      explanation: 'Some characters were not mapped back to text (font encoding).', recommendation: 'Replace unusual characters or use a standard-font template.',
    });
  }
  if (format === 'pdf' && src.headings.length) {
    const lostHeadings = src.headings.filter((h) => !lower.includes(h.toLowerCase()));
    if (lostHeadings.length) {
      findings.push({
        id: 'EXTRACT.PDF.HEADINGS', severity: 'info', title: 'Some section headings were not recovered',
        explanation: `Not found: ${lostHeadings.slice(0, 4).join(', ')}.`, recommendation: 'Systems that look for standard headings may not segment the resume.',
      });
    }
  }
  return {
    format, ok: findings.every((f) => f.severity !== 'warning'), pages, wordCoverage: Math.round(coverage * 1000) / 1000,
    missingSample: missing.slice(0, 8), readingOrderOk, replacementChars, findings,
  };
}
