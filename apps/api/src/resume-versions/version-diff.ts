import { createHash } from 'crypto';
import { RenderItem, RenderModel } from '../render-model/render-model.types';

export const stable = (v: unknown): string => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
/** Integrity hash over a canonical (key-sorted) JSON form so formatting or key order can never change it. */
export const contentHash = (snapshot: unknown): string => createHash('sha256').update(stable(snapshot)).digest('hex');

export interface FieldChange { field: string; before?: string; after?: string }
export interface SectionChange { type: string; title: string; change: 'added' | 'removed' | 'moved' | 'unchanged'; from?: number; to?: number }
export interface ItemChange {
  section: string; label: string; change: 'added' | 'removed' | 'changed';
  fields: FieldChange[]; bulletsAdded: string[]; bulletsRemoved: string[]; datesChanged?: { before?: string; after?: string };
}
export interface VersionDiff {
  identical: boolean;
  counts: { sections: number; items: number; bullets: number; skills: number; dates: number; header: number; design: number };
  header: FieldChange[]; sections: SectionChange[]; items: ItemChange[];
  skills: { added: string[]; removed: string[] }; design: FieldChange[];
}

const norm = (s?: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const itemKey = (sectionType: string, it: RenderItem) => (sectionType === 'experience' ? `${norm(it.subtitle)}|${norm(it.title)}` : norm(it.title ?? it.subtitle ?? it.text));
const itemLabel = (it: RenderItem) => [it.title, it.subtitle].filter(Boolean).join(' - ') || it.text?.slice(0, 40) || '(untitled)';
const ch = (field: string, before?: string, after?: string): FieldChange[] => ((before ?? '') === (after ?? '') ? [] : [{ field, before, after }]);

/** Compare two render-model snapshots at section, item, bullet, skill, date, header and design level. Pure. */
export function diffModels(a: RenderModel, b: RenderModel): VersionDiff {
  const header = [
    ...ch('name', a.header.name, b.header.name), ...ch('headline', a.header.headline, b.header.headline),
    ...ch('contacts', a.header.contacts.join(' | '), b.header.contacts.join(' | ')),
    ...ch('links', a.header.links.map((l) => `${l.label}: ${l.url}`).join(' | '), b.header.links.map((l) => `${l.label}: ${l.url}`).join(' | ')),
  ];
  const design = [
    ...ch('template', `${a.template.id} v${a.template.version}`, `${b.template.id} v${b.template.version}`), ...ch('pageSize', a.page.size, b.page.size), ...ch('margin', String(a.page.marginPt), String(b.page.marginPt)),
    ...(['fontFamily', 'baseSizePt', 'accent', 'headingTransform', 'headerAlign', 'sectionRule'] as const).flatMap((k) => ch(k, String(a.theme[k]), String(b.theme[k]))),
  ];
  const sections: SectionChange[] = []; const items: ItemChange[] = [];
  const skills = { added: [] as string[], removed: [] as string[] };
  const ai = new Map(a.sections.map((s, i) => [s.type, i])); const bi = new Map(b.sections.map((s, i) => [s.type, i]));
  for (const s of a.sections) if (!bi.has(s.type)) sections.push({ type: s.type, title: s.title, change: 'removed', from: ai.get(s.type) });
  for (const s of b.sections) {
    if (!ai.has(s.type)) sections.push({ type: s.type, title: s.title, change: 'added', to: bi.get(s.type) });
    else sections.push({ type: s.type, title: s.title, change: ai.get(s.type) === bi.get(s.type) ? 'unchanged' : 'moved', from: ai.get(s.type), to: bi.get(s.type) });
  }
  let dates = 0;
  const types = new Set([...a.sections.map((s) => s.type), ...b.sections.map((s) => s.type)]);
  for (const type of types) {
    const sa = a.sections.find((s) => s.type === type); const sb = b.sections.find((s) => s.type === type);
    if (type === 'skills') {
      const ta = new Set((sa?.items ?? []).flatMap((i) => i.tags ?? [])); const tb = new Set((sb?.items ?? []).flatMap((i) => i.tags ?? []));
      skills.added = [...tb].filter((x) => !ta.has(x)); skills.removed = [...ta].filter((x) => !tb.has(x)); continue;
    }
    const title = (sb ?? sa)!.title;
    if (sa?.text !== sb?.text && (sa?.text || sb?.text)) items.push({ section: title, label: 'Summary text', change: sa?.text && sb?.text ? 'changed' : sb?.text ? 'added' : 'removed', fields: ch('text', sa?.text, sb?.text), bulletsAdded: [], bulletsRemoved: [] });
    const ma = new Map((sa?.items ?? []).map((it) => [itemKey(type, it), it])); const mb = new Map((sb?.items ?? []).map((it) => [itemKey(type, it), it]));
    for (const [k, it] of ma) if (!mb.has(k)) items.push({ section: title, label: itemLabel(it), change: 'removed', fields: [], bulletsAdded: [], bulletsRemoved: it.bullets ?? [] });
    for (const [k, it] of mb) {
      const old = ma.get(k);
      if (!old) { items.push({ section: title, label: itemLabel(it), change: 'added', fields: [], bulletsAdded: it.bullets ?? [], bulletsRemoved: [] }); continue; }
      const fields = [...ch('title', old.title, it.title), ...ch('subtitle', old.subtitle, it.subtitle), ...ch('dates', old.meta, it.meta), ...ch('text', old.text, it.text), ...ch('url', old.url, it.url), ...ch('tags', (old.tags ?? []).join(', '), (it.tags ?? []).join(', '))];
      const oa = new Set(old.bullets ?? []); const nb = new Set(it.bullets ?? []);
      const bulletsAdded = (it.bullets ?? []).filter((x) => !oa.has(x)); const bulletsRemoved = (old.bullets ?? []).filter((x) => !nb.has(x));
      const datesChanged = old.meta !== it.meta ? { before: old.meta, after: it.meta } : undefined;
      if (datesChanged) dates++;
      if (fields.length || bulletsAdded.length || bulletsRemoved.length) items.push({ section: title, label: itemLabel(it), change: 'changed', fields, bulletsAdded, bulletsRemoved, datesChanged });
    }
  }
  const bullets = items.reduce((n, i) => n + i.bulletsAdded.length + i.bulletsRemoved.length, 0);
  const counts = { sections: sections.filter((s) => s.change !== 'unchanged').length, items: items.length, bullets, skills: skills.added.length + skills.removed.length, dates, header: header.length, design: design.length };
  return { identical: Object.values(counts).every((n) => n === 0), counts, header, sections, items, skills, design };
}

/** Layout configuration that can be re-applied to the working resume from a snapshot (content always comes from the profile). */
export function layoutFrom(m: RenderModel, allTypes: string[]) {
  const present = m.sections.map((s) => s.type as string);
  const hidden = allTypes.filter((t) => !present.includes(t));
  return {
    templateId: m.template.id, templateVersion: m.template.version,
    sections: [...present.map((type) => ({ type, visible: true })), ...hidden.map((type) => ({ type, visible: false }))],
    overrides: { accent: m.theme.accent, baseSizePt: m.theme.baseSizePt, pageSize: m.page.size },
  };
}
