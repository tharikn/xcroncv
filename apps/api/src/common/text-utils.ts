/** Shared, dependency-free text helpers for the deterministic review/match engines. */
import { RenderItem, RenderModel, RenderSection } from '../render-model/render-model.types';

export const STOPWORDS = new Set(
  ('a an the and or of to in for on with at by from as is are was were be been being this that these those it its you your we our they their ' +
    'will can may must should would could have has had do does did not no if then than so such via per into over under across within including include etc ' +
    'able ability strong experience work working team teams role candidate position job responsible responsibilities required requirements preferred plus').split(' '),
);

/** Very light stemmer: enough to align "building/builds" without a language model. */
export function stem(w: string): string {
  let s = w.toLowerCase();
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith('es')) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  return s;
}

export function contentWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9+#.]*[a-z0-9+#]|[a-z]/g) ?? [])
    .map((w) => w.replace(/\.+$/, ''))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map(stem);
}

export function wordCount(text: string): number { return (text.trim().match(/\S+/g) ?? []).length; }

export function truncate(s: string, n = 160): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

/** A located piece of resume text. `demonstrated` = describes work (experience/project), not just a list entry. */
export interface TextUnit {
  section: RenderSection['type'] | 'header';
  itemIndex: number;
  itemTitle?: string;
  field: 'text' | 'bullets' | 'tags' | 'title' | 'subtitle' | 'headline' | 'meta';
  bulletIndex?: number;
  text: string;
  demonstrated: boolean;
}

export function textUnits(model: RenderModel): TextUnit[] {
  const out: TextUnit[] = [];
  if (model.header.headline) out.push({ section: 'header', itemIndex: 0, field: 'headline', text: model.header.headline, demonstrated: false });
  for (const s of model.sections) {
    if (s.type === 'summary' && s.text) out.push({ section: 'summary', itemIndex: 0, field: 'text', text: s.text, demonstrated: false });
    (s.items ?? []).forEach((it: RenderItem, i: number) => {
      const demo = s.type === 'experience' || s.type === 'projects' || s.type === 'certifications';
      const base = { section: s.type, itemIndex: i, itemTitle: it.title } as const;
      if (it.title) out.push({ ...base, field: 'title', text: it.title, demonstrated: demo });
      if (it.subtitle) out.push({ ...base, field: 'subtitle', text: it.subtitle, demonstrated: false });
      if (it.text) out.push({ ...base, field: 'text', text: it.text, demonstrated: demo });
      (it.bullets ?? []).forEach((b, bi) => out.push({ ...base, field: 'bullets', bulletIndex: bi, text: b, demonstrated: demo }));
      (it.tags ?? []).forEach((t) => out.push({ ...base, field: 'tags', text: t, demonstrated: s.type === 'projects' }));
    });
  }
  return out;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Date tokens found in a meta string, as months since year 0 ("Present" = now). Empty when no explicit date. */
export function rangeTokens(meta: string | undefined, now: Date): number[] {
  const tokens: number[] = [];
  if (!meta) return tokens;
  const re = /(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4}))|(?:(\d{4})-(\d{2}))|(present|current|now)|(\b(?:19|20)\d{2}\b)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(meta))) {
    if (m[1]) tokens.push(+m[2] * 12 + MONTHS[m[1].toLowerCase()]);
    else if (m[3]) tokens.push(+m[3] * 12 + +m[4]);
    else if (m[5]) tokens.push(now.getFullYear() * 12 + now.getMonth() + 1);
    else if (m[6]) tokens.push(+m[6] * 12 + 1);
  }
  return tokens;
}

/** Parses explicit date ranges ("Jan 2020 – Present", "2020-01 - 2021-06"). Null if not explicit or end precedes start. */
export function parseRange(meta: string | undefined, now: Date): { start: number; end: number } | null {
  const tokens = rangeTokens(meta, now);
  if (!tokens.length) return null;
  const start = tokens[0]; const end = tokens[1] ?? tokens[0];
  return end >= start ? { start, end } : null;
}

export function unionMonths(ranges: Array<{ start: number; end: number }>): number {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let total = 0; let cur: { start: number; end: number } | null = null;
  for (const r of sorted) {
    if (!cur) cur = { ...r };
    else if (r.start <= cur.end + 1) cur.end = Math.max(cur.end, r.end);
    else { total += cur.end - cur.start + 1; cur = { ...r }; }
  }
  if (cur) total += cur.end - cur.start + 1;
  return total;
}
