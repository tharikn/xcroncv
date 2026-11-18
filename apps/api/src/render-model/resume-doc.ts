import { SectionType } from '../templates/template.types';

/**
 * Visual-editor document layer (doc 16/17). Stored inside `Resume.overrides.doc` (no new column) and applied by
 * `buildRenderModel`, so preview, PDF, HTML and DOCX all keep reading ONE render model. Declarative data only:
 * allowlisted fonts / colours / sizes, bounded text, and small data-URI images (already cropped by the client).
 */
export type DocSectionType = SectionType | 'custom';
export type DocFont = 'Helvetica' | 'Times-Roman' | 'Courier';

export interface ElementStyle {
  font?: DocFont;
  sizePt?: number;            // absolute size, 6-36
  bold?: boolean;
  italic?: boolean;
  color?: string;             // 'accent' | 'ink' | 'muted' (theme tokens) or #RRGGBB
  align?: 'left' | 'center' | 'right';
  spaceAfterPt?: number;      // 0-36
}
export interface DocImage { src: string; sizePt: number }
export interface DocItem {
  id: string; title?: string; subtitle?: string; meta?: string; text?: string;
  bullets?: string[]; tags?: string[]; url?: string; image?: DocImage;
}
export interface DocSection { id: string; type: DocSectionType; title: string; text?: string; items?: DocItem[]; hidden?: boolean; pageBreakBefore?: boolean; column?: 'main' | 'side' }
export interface ResumeDoc {
  v: 1;
  header: { name: string; headline?: string; contacts: string[]; photo?: DocImage };
  sections: DocSection[];
  styles: Record<string, ElementStyle>;
}

export const DOC_LIMITS = {
  sections: 20, items: 60, bullets: 30, tags: 60, contacts: 8, styles: 400, images: 24,
  imageChars: 300_000, title: 200, text: 4000, bullet: 600, tag: 100,
} as const;

const SECTION_TYPES: ReadonlyArray<string> = ['summary', 'experience', 'skills', 'education', 'projects', 'certifications', 'languages', 'custom'];
const FONTS: ReadonlyArray<string> = ['Helvetica', 'Times-Roman', 'Courier'];
const THEME_COLORS: ReadonlyArray<string> = ['accent', 'ink', 'muted'];
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const KEY_RE = /^(header\.(name|headline|contacts)|s\.[A-Za-z0-9_-]{1,40}\.(title|text)|i\.[A-Za-z0-9_-]{1,40}\.(title|subtitle|meta|text|bullets|tags|url))$/;
const IMG_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? v.slice(0, max) : undefined);
const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
const httpUrl = (v: unknown) => { const s = str(v, 500); return s && /^https?:\/\//i.test(s) ? s : undefined; };

export function sanitizeElementStyle(raw: unknown): ElementStyle | undefined {
  const s = obj(raw); const o: ElementStyle = {};
  if (typeof s.font === 'string' && FONTS.includes(s.font)) o.font = s.font as DocFont;
  const size = num(s.sizePt, 6, 36); if (size !== undefined) o.sizePt = size;
  if (typeof s.bold === 'boolean') o.bold = s.bold;
  if (typeof s.italic === 'boolean') o.italic = s.italic;
  if (typeof s.color === 'string' && (THEME_COLORS.includes(s.color) || /^#[0-9a-fA-F]{6}$/.test(s.color))) o.color = s.color;
  if (s.align === 'left' || s.align === 'center' || s.align === 'right') o.align = s.align;
  const gap = num(s.spaceAfterPt, 0, 36); if (gap !== undefined) o.spaceAfterPt = gap;
  return Object.keys(o).length ? o : undefined;
}

function image(raw: unknown, budget: { n: number }): DocImage | undefined {
  const i = obj(raw);
  if (typeof i.src !== 'string' || i.src.length > DOC_LIMITS.imageChars || !IMG_RE.test(i.src) || budget.n >= DOC_LIMITS.images) return undefined;
  budget.n += 1;
  return { src: i.src, sizePt: num(i.sizePt, 16, 160) ?? 56 };
}

const list = (v: unknown, max: number, each: number): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max).map((x) => x.slice(0, each)) : undefined;

/** Strict allowlist: anything unknown is dropped, nothing is trusted from the client. Returns undefined when unusable. */
export function sanitizeDoc(raw: unknown): ResumeDoc | undefined {
  const d = obj(raw);
  if (d.v !== 1 || !Array.isArray(d.sections)) return undefined;
  const budget = { n: 0 };
  const used = new Set<string>();
  const uid = (cand: unknown, fallback: string) => {
    let id = typeof cand === 'string' && ID_RE.test(cand) ? cand : fallback;
    while (used.has(id)) id = `${id}x`;
    used.add(id); return id;
  };
  const h = obj(d.header);
  const header: ResumeDoc['header'] = {
    name: str(h.name, DOC_LIMITS.title) ?? '', headline: str(h.headline, DOC_LIMITS.title),
    contacts: list(h.contacts, DOC_LIMITS.contacts, DOC_LIMITS.title) ?? [],
  };
  const photo = image(h.photo, budget); if (photo) header.photo = photo;

  const sections: DocSection[] = d.sections.slice(0, DOC_LIMITS.sections).map((rs, si) => {
    const s = obj(rs);
    const type = typeof s.type === 'string' && SECTION_TYPES.includes(s.type) ? (s.type as DocSectionType) : 'custom';
    const out: DocSection = { id: uid(s.id, `s${si}`), type, title: str(s.title, DOC_LIMITS.title) ?? '' };
    const text = str(s.text, DOC_LIMITS.text); if (text !== undefined) out.text = text;
    if (s.hidden === true) out.hidden = true;
    if (s.pageBreakBefore === true) out.pageBreakBefore = true;
    if (s.column === 'main' || s.column === 'side') out.column = s.column;
    if (Array.isArray(s.items)) {
      out.items = s.items.slice(0, DOC_LIMITS.items).map((ri, ii) => {
        const i = obj(ri);
        const it: DocItem = { id: uid(i.id, `i${si}_${ii}`) };
        for (const k of ['title', 'subtitle', 'meta'] as const) { const v = str(i[k], DOC_LIMITS.title); if (v !== undefined) it[k] = v; }
        const t = str(i.text, DOC_LIMITS.text); if (t !== undefined) it.text = t;
        const b = list(i.bullets, DOC_LIMITS.bullets, DOC_LIMITS.bullet); if (b) it.bullets = b;
        const tg = list(i.tags, DOC_LIMITS.tags, DOC_LIMITS.tag); if (tg) it.tags = tg;
        const u = httpUrl(i.url); if (u) it.url = u;
        const im = image(i.image, budget); if (im) it.image = im;
        return it;
      });
    }
    return out;
  });

  const styles: Record<string, ElementStyle> = {};
  let n = 0;
  for (const [k, v] of Object.entries(obj(d.styles))) {
    if (n >= DOC_LIMITS.styles) break;
    const st = KEY_RE.test(k) ? sanitizeElementStyle(v) : undefined;
    if (st) { styles[k] = st; n += 1; }
  }
  return { v: 1, header, sections, styles };
}

/** Resolves a theme token or hex to a concrete #RRGGBB for renderers. */
export function resolveColor(c: string | undefined, accent: string, fallback: string): string {
  if (!c) return fallback;
  if (c === 'accent') return accent;
  if (c === 'ink') return '#111111';
  if (c === 'muted') return '#555555';
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback;
}
