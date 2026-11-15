import { AiStructuredOutput } from './ai.types';

export const MAX_INPUT_CHARS = 4000;
export const MAX_OUTPUT_CHARS = 2000;

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const PHONE = /(?<!\d)(\+?\d[\d\s().-]{7,}\d)(?!\d)/g;
const INJECTION = /(ignore|disregard|forget)\s+(all\s+|any\s+|the\s+)?(previous|prior|above)\s+(instructions|prompts?)|system prompt|reveal .{0,30}(secret|key|token|password)|you are now/i;

/** Contact details are never sent to a provider (doc 06 section 7). */
export function redact(text: string): { text: string; redacted: boolean } {
  const out = text.replace(EMAIL, '[email]').replace(PHONE, '[phone]');
  return { text: out, redacted: out !== text };
}

/** Source documents are data. Text that tries to instruct the model is flagged and still treated purely as data. */
export function looksLikeInjection(text: string): boolean { return INJECTION.test(text); }

const numbersIn = (s: string) => new Set((s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.')));

/** Numbers in the output that appear nowhere in the supplied input are treated as invented (doc 06 section 6). */
export function unsupportedNumbers(output: AiStructuredOutput, sourceText: string): string[] {
  const allowed = numbersIn(sourceText);
  return [...numbersIn(`${output.text} ${output.notes.join(' ')}`)].filter((n) => !allowed.has(n));
}

/** Strict structural validation of untrusted provider output. Returns null when invalid. */
export function parseOutput(raw: unknown): AiStructuredOutput | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const strs = (v: unknown) => Array.isArray(v) && v.length <= 10 && v.every((x) => typeof x === 'string' && x.length <= 400);
  if (typeof o['text'] !== 'string' || o['text'].length > MAX_OUTPUT_CHARS) return null;
  if (!strs(o['notes']) || !strs(o['questions'])) return null;
  if (/<\s*(script|style|iframe)|javascript:|\bselect\b.+\bfrom\b/i.test(o['text'])) return null; // never render raw markup or SQL
  return { text: o['text'], notes: o['notes'] as string[], questions: o['questions'] as string[] };
}

export const estimateTokens = (s: string) => Math.ceil(s.length / 4);
