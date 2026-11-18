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
export const THEME_COLOR_TOKENS = ['accent', 'ink', 'muted'] as const;
export const RESUME_PALETTE: ReadonlyArray<string> = ['#111111', '#555555', '#1f4e79', '#0b6b4f', '#8a1c1c', '#6d4ff0', '#b45309', '#0e7490'];

export const SIZE_RANGE = { min: 6, max: 36 } as const;
export const SPACE_RANGE = { min: 0, max: 36 } as const;
export const PHOTO_RANGE = { min: 32, max: 120, def: 64 } as const;
export const LOGO_RANGE = { min: 16, max: 56, def: 28 } as const;
