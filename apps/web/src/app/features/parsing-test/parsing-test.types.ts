export type Indicator = 'ok' | 'warning' | 'problem' | 'unknown';
export interface Finding {
  id: string; category: string; severity: 'error' | 'warning' | 'info'; adapter?: string; message: string; suggestion?: string; expected?: string; extracted?: string;
}
export interface AdapterSummary {
  id: string; name: string; version: string; capabilities: string[]; lineCount: number; wordCount: number; sectionsFound: string[];
  fields: { name: boolean; email: boolean; phone: boolean; experienceEntries: number; educationEntries: number; skills: number };
  score: number | null; breakdown: Record<string, { score: number; weight: number }> | null; error?: string;
}
export interface ParsingReport {
  suiteVersion: string; scoreVersion: string; source: 'GENERATED' | 'UPLOAD'; format: 'pdf' | 'docx'; generatedAt: string; score: number | null; scoreNote: string;
  indicators: { textExtracted: Indicator; fieldsDetected: Indicator; readingOrder: Indicator; layout: Indicator };
  adapters: AdapterSummary[]; findings: Finding[]; limitations: string[];
}
/** `preview` is only present on the response of the run itself; it is never stored by the server. */
export interface RunResponse { id: string; createdAt: string; resumeId: string | null; report: ParsingReport; preview?: Array<{ adapter: string; lines: string[] }> }
export interface ReportMeta { id: string; createdAt: string; source: string; format: string; score: number | null; suiteVersion: string; errors: number; warnings: number }
