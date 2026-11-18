import { RenderModel, SectionConfig } from '../../core/models';
import {
  DOC_FONTS, DOC_LIMITS, DocImage, DocItem, DocSection, DocSectionType, ElementStyle, ResumeDoc, SIZE_RANGE, SPACE_RANGE,
} from '../../core/resume-doc';

/** Pure, immutable operations on the visual-editor document. The component only calls these; they are unit tested. */

let counter = 0;
/** Short unique id matching the server's `^[A-Za-z0-9_-]{1,40}$`. */
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`.slice(0, 40);
}

export type Translate = (key: string) => string;

/* ---------- element keys (shared with the server's per-element style allowlist) ---------- */
export const K = {
  hName: 'header.name', hHeadline: 'header.headline', hContacts: 'header.contacts',
  sec: (id: string, f: 'title' | 'text') => `s.${id}.${f}`,
  item: (id: string, f: 'title' | 'subtitle' | 'meta' | 'text' | 'bullets' | 'tags' | 'url' | 'image') => `i.${id}.${f}`,
};

/* ---------- document <-> render model ---------- */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Starting document for a resume that has never been visually edited: the render model the server already built. */
export function docFromModel(m: RenderModel): ResumeDoc {
  const used = new Set<string>();
  const uid = (cand: string | undefined, prefix: string) => {
    let id = cand && /^[A-Za-z0-9_-]{1,40}$/.test(cand) && !used.has(cand) ? cand : newId(prefix);
    while (used.has(id)) id = newId(prefix);
    used.add(id); return id;
  };
  return {
    v: 1,
    header: { name: m.header.name, headline: m.header.headline, contacts: [...m.header.contacts], photo: m.header.photo ? { ...m.header.photo } : undefined },
    sections: m.sections.map((s) => ({
      id: uid(s.id, 's'), type: s.type, title: s.title, ...(s.text !== undefined ? { text: s.text } : {}),
      ...(s.items ? { items: s.items.map((i) => ({ ...clone(i), id: uid(i.id, 'i') })) } : {}),
    })),
    styles: clone(m.styles ?? {}),
  };
}

/** Same substitution the server performs in `applyDoc` so the live preview equals what the exports render. */
export function applyDoc(base: RenderModel, doc: ResumeDoc): RenderModel {
  return {
    ...base,
    header: { ...base.header, name: doc.header.name, headline: doc.header.headline || undefined, contacts: doc.header.contacts, photo: doc.header.photo },
    sections: doc.sections.filter((s) => !s.hidden).map(({ hidden: _h, ...s }) => s),
    styles: doc.styles,
  };
}

/* ---------- generic list helpers ---------- */
export function moveTo<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return [...list];
  const out = [...list];
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x);
  return out;
}

/** Index to drop at given the vertical midpoints of sibling blocks and the pointer Y (before the first mid it goes first). */
export function dropIndex(mids: readonly number[], y: number): number {
  let i = 0;
  while (i < mids.length && y > mids[i]) i += 1;
  return i;
}

/** Insertion index → final index after removing `from` (so dragging below yourself is a no-op). */
export function finalIndex(from: number, insertAt: number): number { return insertAt > from ? insertAt - 1 : insertAt; }

/* ---------- header ---------- */
export function setHeaderText(doc: ResumeDoc, f: 'name' | 'headline', text: string): ResumeDoc {
  return { ...doc, header: { ...doc.header, [f]: f === 'name' ? text : text || undefined } };
}
/** Contacts are edited as one line; split on the same separators people type (· | newline). */
export function parseContacts(text: string): string[] {
  return text.split(/[·|\n]/).map((s) => s.trim()).filter(Boolean).slice(0, DOC_LIMITS.contacts);
}
export function setContacts(doc: ResumeDoc, text: string): ResumeDoc { return { ...doc, header: { ...doc.header, contacts: parseContacts(text) } }; }
export function setPhoto(doc: ResumeDoc, photo: DocImage | undefined): ResumeDoc { return { ...doc, header: { ...doc.header, photo } }; }

/* ---------- sections ---------- */
const mapSection = (doc: ResumeDoc, id: string, fn: (s: DocSection) => DocSection): ResumeDoc =>
  ({ ...doc, sections: doc.sections.map((s) => (s.id === id ? fn(s) : s)) });
const mapItem = (doc: ResumeDoc, secId: string, itemId: string, fn: (i: DocItem) => DocItem): ResumeDoc =>
  mapSection(doc, secId, (s) => ({ ...s, items: (s.items ?? []).map((i) => (i.id === itemId ? fn(i) : i)) }));

export const findSection = (doc: ResumeDoc, id: string) => doc.sections.find((s) => s.id === id);
export const findItem = (doc: ResumeDoc, secId: string, itemId: string) => findSection(doc, secId)?.items?.find((i) => i.id === itemId);

export function setSectionTitle(doc: ResumeDoc, id: string, title: string): ResumeDoc { return mapSection(doc, id, (s) => ({ ...s, title })); }
export function setSectionText(doc: ResumeDoc, id: string, text: string): ResumeDoc { return mapSection(doc, id, (s) => ({ ...s, text })); }
export function toggleSectionHidden(doc: ResumeDoc, id: string): ResumeDoc { return mapSection(doc, id, (s) => ({ ...s, hidden: s.hidden ? undefined : true })); }
/** Toggle whether a section starts on a new page (kept as a doc flag; propagated to render model + exports). */
export function togglePageBreak(doc: ResumeDoc, id: string): ResumeDoc { return mapSection(doc, id, (s) => ({ ...s, pageBreakBefore: s.pageBreakBefore ? undefined : true })); }
export function removeSection(doc: ResumeDoc, id: string): ResumeDoc { return { ...doc, sections: doc.sections.filter((s) => s.id !== id) }; }

/** Neighbour index in the same column group (two-column templates keep side sections in their own rail). */
export function neighbourIndex(doc: ResumeDoc, id: string, delta: -1 | 1, side: ReadonlySet<string>): number {
  const from = doc.sections.findIndex((s) => s.id === id);
  if (from < 0) return -1;
  const group = (t: string) => side.has(t);
  const mine = group(doc.sections[from].type);
  for (let i = from + delta; i >= 0 && i < doc.sections.length; i += delta) {
    if (doc.sections[i].hidden) continue;
    if (group(doc.sections[i].type) === mine) return i;
  }
  return -1;
}
export function moveSection(doc: ResumeDoc, id: string, delta: -1 | 1, side: ReadonlySet<string> = new Set()): ResumeDoc {
  const from = doc.sections.findIndex((s) => s.id === id);
  const to = neighbourIndex(doc, id, delta, side);
  if (from < 0 || to < 0) return doc;
  return { ...doc, sections: moveTo(doc.sections, from, to) };
}
/** Drag-drop: put section `id` before section `beforeId` (null = after the last of its column). */
export function moveSectionBefore(doc: ResumeDoc, id: string, beforeId: string | null): ResumeDoc {
  const from = doc.sections.findIndex((s) => s.id === id);
  if (from < 0 || id === beforeId) return doc;
  const without = doc.sections.filter((s) => s.id !== id);
  const at = beforeId === null ? without.length : without.findIndex((s) => s.id === beforeId);
  if (at < 0) return doc;
  const out = [...without]; out.splice(at, 0, doc.sections[from]);
  return { ...doc, sections: out };
}
/** Reorder popup: apply a full section order (a permutation of the current ids). Unknown or missing ids are ignored. */
export function reorderSections(doc: ResumeDoc, ids: readonly string[]): ResumeDoc {
  if (ids.length !== doc.sections.length) return doc;
  const byId = new Map(doc.sections.map((s) => [s.id, s]));
  const next = ids.map((id) => byId.get(id));
  if (next.some((s) => !s)) return doc;
  if (next.every((s, i) => s === doc.sections[i])) return doc;
  return { ...doc, sections: next as DocSection[] };
}

export function addSection(doc: ResumeDoc, type: DocSectionType, title: string, t: Translate, afterId?: string): ResumeDoc {
  if (doc.sections.length >= DOC_LIMITS.sections) return doc;
  const sec: DocSection = type === 'summary'
    ? { id: newId('s'), type, title, text: t('ve.new.summaryText') }
    : { id: newId('s'), type, title, items: [blankItem(type, t)] };
  const at = afterId ? doc.sections.findIndex((s) => s.id === afterId) + 1 : doc.sections.length;
  const out = [...doc.sections]; out.splice(at < 0 ? out.length : at, 0, sec);
  return { ...doc, sections: out };
}
export function duplicateSection(doc: ResumeDoc, id: string): ResumeDoc {
  const i = doc.sections.findIndex((s) => s.id === id);
  if (i < 0 || doc.sections.length >= DOC_LIMITS.sections) return doc;
  const src = doc.sections[i];
  const copy: DocSection = { ...clone(src), id: newId('s'), items: src.items?.map((it) => ({ ...clone(it), id: newId('i') })) };
  if (!copy.items) delete copy.items;
  const out = [...doc.sections]; out.splice(i + 1, 0, copy);
  return { ...doc, sections: out, styles: copyStyles(doc.styles, src, copy) };
}

/* ---------- items ---------- */
export function blankItem(type: DocSectionType, t: Translate): DocItem {
  const id = newId('i');
  switch (type) {
    case 'experience': return { id, title: t('ve.new.jobTitle'), subtitle: t('ve.new.company'), meta: t('ve.new.dates'), bullets: [t('ve.new.bullet')] };
    case 'education': return { id, title: t('ve.new.degree'), subtitle: t('ve.new.school'), meta: t('ve.new.dates') };
    case 'skills': return { id, title: t('ve.new.skillGroup'), tags: [t('ve.new.skill')] };
    case 'projects': return { id, title: t('ve.new.project'), text: t('ve.new.projectText') };
    case 'certifications': return { id, title: t('ve.new.certification'), subtitle: t('ve.new.issuer'), meta: t('ve.new.year') };
    case 'languages': return { id, title: t('ve.new.language'), meta: t('ve.new.level') };
    default: return { id, title: t('ve.new.itemTitle'), text: t('ve.new.itemText') };
  }
}
export function addItem(doc: ResumeDoc, secId: string, t: Translate, afterItemId?: string): { doc: ResumeDoc; id?: string } {
  const sec = findSection(doc, secId);
  if (!sec || (sec.items?.length ?? 0) >= DOC_LIMITS.items) return { doc };
  const item = blankItem(sec.type, t);
  const items = [...(sec.items ?? [])];
  const at = afterItemId ? items.findIndex((i) => i.id === afterItemId) + 1 : items.length;
  items.splice(at <= 0 && afterItemId ? items.length : at, 0, item);
  return { doc: mapSection(doc, secId, (s) => ({ ...s, items })), id: item.id };
}
export function removeItem(doc: ResumeDoc, secId: string, itemId: string): ResumeDoc {
  return mapSection(doc, secId, (s) => ({ ...s, items: (s.items ?? []).filter((i) => i.id !== itemId) }));
}
export function duplicateItem(doc: ResumeDoc, secId: string, itemId: string): { doc: ResumeDoc; id?: string } {
  const sec = findSection(doc, secId); const idx = sec?.items?.findIndex((i) => i.id === itemId) ?? -1;
  if (!sec || idx < 0) return { doc };
  const src = sec.items![idx]; const copy: DocItem = { ...clone(src), id: newId('i') };
  const items = [...sec.items!]; items.splice(idx + 1, 0, copy);
  const styles = { ...doc.styles };
  for (const [k, v] of Object.entries(doc.styles)) if (k.startsWith(`i.${src.id}.`)) styles[`i.${copy.id}.${k.split('.')[2]}`] = { ...v };
  return { doc: { ...mapSection(doc, secId, (s) => ({ ...s, items })), styles }, id: copy.id };
}
export function moveItem(doc: ResumeDoc, secId: string, itemId: string, delta: -1 | 1): ResumeDoc {
  return mapSection(doc, secId, (s) => {
    const items = s.items ?? []; const from = items.findIndex((i) => i.id === itemId); const to = from + delta;
    return from < 0 || to < 0 || to >= items.length ? s : { ...s, items: moveTo(items, from, to) };
  });
}
export function moveItemBefore(doc: ResumeDoc, secId: string, itemId: string, beforeId: string | null): ResumeDoc {
  return mapSection(doc, secId, (s) => {
    const items = s.items ?? []; const from = items.findIndex((i) => i.id === itemId);
    if (from < 0 || itemId === beforeId) return s;
    const without = items.filter((i) => i.id !== itemId);
    const at = beforeId === null ? without.length : without.findIndex((i) => i.id === beforeId);
    if (at < 0) return s;
    const out = [...without]; out.splice(at, 0, items[from]);
    return { ...s, items: out };
  });
}

export type ItemTextField = 'title' | 'subtitle' | 'meta' | 'text' | 'url';
export function setItemText(doc: ResumeDoc, secId: string, itemId: string, f: ItemTextField, text: string): ResumeDoc {
  return mapItem(doc, secId, itemId, (i) => ({ ...i, [f]: f === 'title' ? text : text || undefined }));
}
export function setBullet(doc: ResumeDoc, secId: string, itemId: string, idx: number, text: string): ResumeDoc {
  return mapItem(doc, secId, itemId, (i) => ({ ...i, bullets: (i.bullets ?? []).map((b, n) => (n === idx ? text : b)) }));
}
export function insertBullet(doc: ResumeDoc, secId: string, itemId: string, afterIdx: number, text = ''): ResumeDoc {
  return mapItem(doc, secId, itemId, (i) => {
    const b = [...(i.bullets ?? [])];
    if (b.length >= DOC_LIMITS.bullets) return i;
    b.splice(afterIdx + 1, 0, text); return { ...i, bullets: b };
  });
}
export function removeBullet(doc: ResumeDoc, secId: string, itemId: string, idx: number): ResumeDoc {
  return mapItem(doc, secId, itemId, (i) => { const b = (i.bullets ?? []).filter((_, n) => n !== idx); return { ...i, bullets: b.length ? b : undefined }; });
}
export function parseTags(text: string): string[] { return text.split(',').map((s) => s.trim()).filter(Boolean).slice(0, DOC_LIMITS.tags); }
export function setTags(doc: ResumeDoc, secId: string, itemId: string, text: string): ResumeDoc {
  const tags = parseTags(text);
  return mapItem(doc, secId, itemId, (i) => ({ ...i, tags: tags.length ? tags : undefined }));
}
export function setItemImage(doc: ResumeDoc, secId: string, itemId: string, image: DocImage | undefined): ResumeDoc {
  return mapItem(doc, secId, itemId, (i) => ({ ...i, image }));
}
export function countImages(doc: ResumeDoc): number {
  return (doc.header.photo ? 1 : 0) + doc.sections.reduce((n, s) => n + (s.items ?? []).filter((i) => i.image).length, 0);
}

/* ---------- element styles ---------- */
export type StylePatch = { [K in keyof ElementStyle]?: ElementStyle[K] | null };
export const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Merge a patch into one element's style; `null` clears a property; an empty style removes the key. */
export function setStyle(doc: ResumeDoc, key: string, patch: StylePatch): ResumeDoc {
  const next: Record<string, unknown> = { ...(doc.styles[key] ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete next[k];
    else if (k === 'sizePt') next[k] = clampNum(v as number, SIZE_RANGE.min, SIZE_RANGE.max);
    else if (k === 'spaceAfterPt') next[k] = clampNum(v as number, SPACE_RANGE.min, SPACE_RANGE.max);
    else next[k] = v;
  }
  const styles = { ...doc.styles };
  if (Object.keys(next).length) styles[key] = next as ElementStyle; else delete styles[key];
  return { ...doc, styles };
}
export function resetStyle(doc: ResumeDoc, key: string): ResumeDoc { return setStyle(doc, key, { font: null, sizePt: null, bold: null, italic: null, color: null, align: null, spaceAfterPt: null }); }

/** Drop styles whose element no longer exists (after delete) so the document never accumulates dead keys. */
export function pruneStyles(doc: ResumeDoc): ResumeDoc {
  const secs = new Set(doc.sections.map((s) => s.id));
  const items = new Set(doc.sections.flatMap((s) => (s.items ?? []).map((i) => i.id)));
  const styles: Record<string, ElementStyle> = {};
  for (const [k, v] of Object.entries(doc.styles)) {
    const [kind, id] = k.split('.');
    if (kind === 'header' || (kind === 's' && secs.has(id)) || (kind === 'i' && items.has(id))) styles[k] = v;
  }
  return Object.keys(styles).length === Object.keys(doc.styles).length ? doc : { ...doc, styles };
}

function copyStyles(styles: Record<string, ElementStyle>, src: DocSection, copy: DocSection): Record<string, ElementStyle> {
  const out = { ...styles };
  for (const [k, v] of Object.entries(styles)) {
    const [kind, id, f] = k.split('.');
    if (kind === 's' && id === src.id) out[`s.${copy.id}.${f}`] = { ...v };
  }
  src.items?.forEach((si, n) => {
    const ci = copy.items?.[n]; if (!ci) return;
    for (const [k, v] of Object.entries(styles)) {
      const [kind, id, f] = k.split('.');
      if (kind === 'i' && id === si.id) out[`i.${ci.id}.${f}`] = { ...v };
    }
  });
  return out;
}

/* ---------- style -> CSS (preview). Mirrors the HTML/PDF renderers' resolution of tokens ---------- */
export function resolveColor(c: string | undefined, accent: string): string | undefined {
  if (!c) return undefined;
  if (c === 'accent') return accent;
  if (c === 'ink') return '#111111';
  if (c === 'muted') return '#555555';
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : undefined;
}
export function cssFor(st: ElementStyle | undefined, accent: string): Record<string, string | null> {
  if (!st) return {};
  const font = st.font ? DOC_FONTS.find((f) => f.id === st.font)?.css : undefined;
  return {
    'font-family': font ?? null,
    'font-size': st.sizePt !== undefined ? `${st.sizePt}pt` : null,
    'font-weight': st.bold === undefined ? null : st.bold ? '700' : '400',
    'font-style': st.italic === undefined ? null : st.italic ? 'italic' : 'normal',
    color: resolveColor(st.color, accent) ?? null,
    'text-align': st.align ?? null,
    'margin-bottom': st.spaceAfterPt !== undefined ? `${st.spaceAfterPt}pt` : null,
  };
}

/* ---------- template defaults per element (what "unset" means; shown in the format toolbar) ---------- */
export interface ThemeLike { fontFamily: string; baseSizePt: number; headerAlign: 'left' | 'center' | 'right'; nameScale?: number }
export interface ElementDefaults { sizePt: number; bold: boolean; italic: boolean; align: 'left' | 'center' | 'right'; color: 'accent' | 'ink' | 'muted'; font: string }

/** Last path segment: header.name -> name, i.<id>.title -> title, s.<id>.title -> sectionTitle. */
export function elementKind(key: string): string {
  const [scope, , field] = key.split('.');
  if (scope === 'header') return key.split('.')[1];
  return scope === 's' ? `section${field[0].toUpperCase()}${field.slice(1)}` : field;
}
/** Improved default styling for element visibility and visual hierarchy. */
export function defaultsFor(key: string, th: ThemeLike, bandHeader = false): ElementDefaults {
  const b = th.baseSizePt; const kind = elementKind(key);
  // Determine if this key is from a section (scope 's') or item (scope 'i')
  const isSectionKey = key.startsWith('s.');
  const isItemKey = key.startsWith('i.');
  // Size scale: name largest, then section titles, then body text, then meta/caption elements
  const size: Record<string, number> = { name: b * (th.nameScale ?? 2.0), headline: b * 1.15, contacts: b * 0.95, sectionTitle: b * 1.05, meta: b * 0.9, tags: b * 0.9, url: b * 0.9 };
  return {
    sizePt: Math.round((size[kind] ?? b) * 2) / 2,
    // Bold: name is bold; section titles are bold for hierarchy; item titles are normal weight; subtitles are italic; body text is normal weight
    bold: kind === 'name' || (isSectionKey && kind === 'sectionTitle'),
    italic: kind === 'subtitle',
    // Color hierarchy: name uses accent, section titles use accent, body text uses ink, meta uses muted
    color: kind === 'name' || (isSectionKey && kind === 'sectionTitle') ? (bandHeader && kind === 'name' ? 'ink' : 'accent') : kind === 'meta' || kind === 'url' ? 'muted' : 'ink',
    // Alignment: section titles left-aligned by default; header elements follow theme alignment
    align: key.startsWith('header.') ? th.headerAlign : 'left',
    font: th.fontFamily,
  };
}
/** Is this element key one that carries text formatting (excludes the photo and logos)? */
export const isTextKey = (key?: string): key is string => !!key && !key.endsWith('.photo') && !key.endsWith('.image');

/* ---------- section config (the host's Sections panel) <-> document ---------- */
/** Standard-section order/visibility derived from the document, so the host's Sections panel mirrors the canvas. */
export function cfgFromDoc(doc: ResumeDoc, prev: readonly SectionConfig[]): SectionConfig[] {
  const order: SectionConfig['type'][] = [];
  const visible = new Map<string, boolean>();
  for (const s of doc.sections) {
    if (s.type === 'custom') continue;
    if (!order.includes(s.type)) order.push(s.type);
    visible.set(s.type, (visible.get(s.type) ?? false) || !s.hidden);
  }
  const rest = prev.filter((c) => !order.includes(c.type)).map((c) => ({ type: c.type, visible: false }));
  return [...order.map((type) => ({ type, visible: visible.get(type) ?? false })), ...rest];
}
/** Apply the host's order/visibility to the document's standard sections (custom sections keep their slots). */
export function reconcileDoc(doc: ResumeDoc, cfg: readonly SectionConfig[]): ResumeDoc {
  const rank = new Map(cfg.map((c, i) => [c.type as string, i]));
  const vis = new Map(cfg.map((c) => [c.type as string, c.visible]));
  const slots = doc.sections.map((s, i) => (s.type === 'custom' ? -1 : i)).filter((i) => i >= 0);
  const sorted = slots.map((i) => doc.sections[i]).sort((a, b) => (rank.get(a.type) ?? 99) - (rank.get(b.type) ?? 99));
  const out = [...doc.sections];
  slots.forEach((slot, n) => {
    const sec = sorted[n]; const v = vis.get(sec.type);
    out[slot] = v === undefined || v === !sec.hidden ? sec : { ...sec, hidden: v ? undefined : true };
  });
  const same = out.every((s, i) => s === doc.sections[i]);
  return same ? doc : { ...doc, sections: out };
}
