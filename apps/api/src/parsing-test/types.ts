import { ImportSuggestion } from '../import-export/resume-parser';

export const SUITE_VERSION = 'parsing-suite-1';
export const SCORE_VERSION = 'parsing-score-1';

export type Severity = 'error' | 'warning' | 'info';
export type Category = 'text' | 'sections' | 'fields' | 'reading-order' | 'dates' | 'links-unicode' | 'layout' | 'pages' | 'agreement';
export type FileKind = 'pdf' | 'docx';

export interface LayoutFacts {
  columns: number; tables: number; textBoxes: number; images: number;
  headerFooterText: boolean; headerFooterHasContact: boolean;
  blankPages: number; imageOnlyPages: number; pages?: number;
}

/** Normalised output every parser adapter must produce (doc 30). */
export interface AdapterOutput {
  lines: string[];
  links: string[];          // hyperlink targets found in the file structure (annotations / relationships)
  layout: LayoutFacts;
  replacementChars: number; // U+FFFD count: a sign of broken font encodings
}

export interface ParserAdapter {
  id: string;
  name: string;
  version: string;
  formats: FileKind[];
  /** What this adapter can and cannot see; shown in the report so limits are never hidden. */
  capabilities: string[];
  parse(buf: Buffer): Promise<AdapterOutput>;
}

export interface Finding {
  id: string;              // stable rule id, e.g. PT-SEC-001
  category: Category;
  severity: Severity;
  adapter?: string;
  page?: number;
  section?: string;
  message: string;
  suggestion?: string;
  expected?: string;       // only when the source is a known generated resume (comparison authorised)
  extracted?: string;
}

export interface AdapterSummary {
  id: string; name: string; version: string; capabilities: string[];
  lineCount: number; wordCount: number;
  sectionsFound: string[];
  fields: { name: boolean; email: boolean; phone: boolean; experienceEntries: number; educationEntries: number; skills: number };
  layout: LayoutFacts;
  score: number | null;
  breakdown: Record<string, { score: number; weight: number }> | null;
  error?: string;
}

export type Indicator = 'ok' | 'warning' | 'problem' | 'unknown';

export interface ParsingReport {
  suiteVersion: string;
  scoreVersion: string;
  source: 'GENERATED' | 'UPLOAD';
  format: FileKind;
  generatedAt: string;
  /** Present only when a known source was compared. Never blended with quality or match scores. */
  score: number | null;
  scoreNote: string;
  indicators: { textExtracted: Indicator; fieldsDetected: Indicator; readingOrder: Indicator; layout: Indicator };
  adapters: AdapterSummary[];
  findings: Finding[];
  limitations: string[];
}

export interface RunResult { report: ParsingReport; /** Ephemeral: returned to the caller once, never stored. */ preview: Array<{ adapter: string; lines: string[] }> }

export type { ImportSuggestion };
