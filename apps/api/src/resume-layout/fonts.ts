import { TemplateTheme } from '../templates/template.types';

export type Family = NonNullable<TemplateTheme['fontFamily']>;

/** Standard PDF font face for a family + weight/slant (selectable text, no embedding). */
export function face(family: string, bold: boolean, italic: boolean): string {
  if (family === 'Times-Roman') return bold && italic ? 'Times-BoldItalic' : bold ? 'Times-Bold' : italic ? 'Times-Italic' : 'Times-Roman';
  const fam = family === 'Courier' ? 'Courier' : 'Helvetica';
  return bold && italic ? `${fam}-BoldOblique` : bold ? `${fam}-Bold` : italic ? `${fam}-Oblique` : fam;
}

export const boldFace = (family: string) => face(family, true, false);
export const italicFace = (family: string) => face(family, false, true);
export const regularFace = (family: string) => face(family, false, false);
