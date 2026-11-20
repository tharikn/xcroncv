/**
 * Visual-editor document layer (mirror of apps/api/src/render-model/resume-doc.ts). Persisted in `Resume.overrides.doc`;
 * the server applies it inside the shared render model, so preview and every export read the same data.
 */
export type DocSectionType = 'summary' | 'experience' | 'skills' | 'education' | 'projects' | 'certifications' | 'languages' | 'custom';
export type DocFont = 'Helvetica' | 'Times-Roman' | 'Courier';

export interface ElementStyle {
  font?: DocFont;
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
  /** 'accent' | 'ink' | 'muted' (theme tokens, follow the template) or #RRGGBB. */
  color?: string;
  align?: 'left' | 'center' | 'right';
  spaceAfterPt?: number;
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

export const DOC_LIMITS = { sections: 20, items: 60, bullets: 30, tags: 60, contacts: 8, images: 24, imageChars: 300_000 } as const;

export const DOC_FONTS: ReadonlyArray<{ id: DocFont; css: string }> = [
  { id: 'Helvetica', css: "Helvetica, Arial, 'Liberation Sans', sans-serif" },
  { id: 'Times-Roman', css: "'Times New Roman', Times, serif" },
  { id: 'Courier', css: "'Courier New', monospace" },
];

/** Theme-linked colour tokens first (follow the template accent), then a fixed palette of print-safe colours. */
export const THEME_COLOR_TOKENS = ['accent', 'ink', 'muted', 'paper'] as const;
export const RESUME_PALETTE: ReadonlyArray<string> = ['#111111', '#555555', '#1f4e79', '#0b6b4f', '#8a1c1c', '#6d4ff0', '#b45309', '#0e7490'];

export const SIZE_RANGE = { min: 6, max: 36 } as const;
export const SPACE_RANGE = { min: 0, max: 36 } as const;
export const PHOTO_RANGE = { min: 32, max: 120, def: 64 } as const;
export const LOGO_RANGE = { min: 16, max: 56, def: 28 } as const;

/* ---------- shared style resolution (single source of truth for every web render surface) ---------- */

/** Resolves a theme token or a literal #RRGGBB to a concrete colour. */
export function resolveColor(c: string | undefined, accent: string): string | undefined {
  if (!c) return undefined;
  if (c === 'accent') return accent;
  if (c === 'ink') return '#111111';
  if (c === 'muted') return '#555555';
  if (c === 'paper') return '#ffffff';
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : undefined;
}

/** Converts one allowlisted element style into CSS properties. `null` means "leave the template default". */
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
