import { TemplateTheme } from '../templates/template.types';
import { RenderItem, RenderModel, RenderSection } from '../render-model/render-model.types';
import { Density, SectionVariant } from './layout.types';
import { boldFace, italicFace, regularFace } from './fonts';
import { TextMeasurer } from './text-metrics';

/**
 * The single geometry model shared by measurement AND painting. Both call buildSectionGeometry
 * on the same width/theme/density, so a planned height is exactly the painted height.
 */
export interface PaintLine {
  kind: 'heading' | 'text' | 'bullet';
  text: string;
  font: string;
  size: number;
  color: string;
  indentPt: number;
  gapAfterPt: number;
  heightPt: number;
  link?: string;
  /** Drawn behind/next to the heading text by the painter. */
  decoration?: 'rule' | 'bar' | 'tint' | 'short';
}

export interface ItemGeometry {
  lines: PaintLine[];
  heightPt: number;
}

export interface SectionGeometry {
  variant: SectionVariant;
  widthPt: number;
  heading: PaintLine[];
  headingHeightPt: number;
  text: PaintLine[];
  textHeightPt: number;
  items: ItemGeometry[];
  itemGapPt: number;
  sectionGapPt: number;
}

export interface Spacing {
  headingGapPt: number;
  itemGapPt: number;
  paragraphGapPt: number;
  sectionGapPt: number;
  bulletGapPt: number;
}

const INK = '#111111';

export function spacingTokens(theme: TemplateTheme, density: Density, variant: SectionVariant): Spacing {
  const base = density.baseSizePt;
  const variantFactor = variant === 'compact' ? 0.7 : variant === 'inline' ? 0.45 : 1;
  const f = density.gapFactor * variantFactor;
  return {
    headingGapPt: base * 0.45 * f,
    itemGapPt: base * 0.5 * f,
    paragraphGapPt: base * 0.3 * f,
    sectionGapPt: base * 0.75 * f,
    bulletGapPt: base * 0.04 * f,
  };
}

export function lineGapFor(theme: TemplateTheme, variant: SectionVariant): number {
  if (variant === 'compact' || variant === 'inline') return 0;
  return theme.density === 'relaxed' ? 2 : 0;
}

const measureLine = (
  measurer: TextMeasurer,
  line: Omit<PaintLine, 'heightPt'>,
  widthPt: number,
  lineGap: number,
): PaintLine => ({
  ...line,
  heightPt: measurer.height(line.text, line.font, line.size, widthPt - line.indentPt, lineGap),
});

const itemLabel = (i: RenderItem): string => {
  if (i.tags?.length) return i.tags.join(', ');
  return [i.title, i.subtitle, i.meta].filter(Boolean).join(' · ');
};

const inlineText = (items: RenderItem[]): string => items.map(itemLabel).filter(Boolean).join(' · ');

/** One item as a list of paint lines. The painter walks these in order and advances by height+gap. */
function buildItemLines(
  item: RenderItem,
  opts: {
    variant: SectionVariant;
    theme: TemplateTheme;
    measurer: TextMeasurer;
    widthPt: number;
    base: number;
    spacing: Spacing;
  },
): PaintLine[] {
  const { variant, theme, measurer, widthPt, base, spacing } = opts;
  const lg = lineGapFor(theme, variant);
  const bold = boldFace(theme.fontFamily);
  const regular = regularFace(theme.fontFamily);
  const italic = italicFace(theme.fontFamily);
  const out: PaintLine[] = [];
  const push = (line: Omit<PaintLine, 'heightPt'>) => out.push(measureLine(measurer, line, widthPt, lg));

  if (variant === 'inline') {
    const text = itemLabel(item);
    if (text) push({ kind: 'text', text, font: regular, size: base, color: INK, indentPt: 0, gapAfterPt: 0 });
    return out;
  }

  if (item.title || item.meta) {
    const text = [item.title, item.meta].filter(Boolean).join('    ');
    push({ kind: 'text', text, font: bold, size: base, color: INK, indentPt: 0, gapAfterPt: base * 0.08 });
  }
  if (item.subtitle) {
    push({ kind: 'text', text: item.subtitle, font: italic, size: base, color: INK, indentPt: 0, gapAfterPt: base * 0.06 });
  }
  if (item.text) {
    push({ kind: 'text', text: item.text, font: regular, size: base, color: INK, indentPt: 0, gapAfterPt: base * 0.08 });
  }
  for (const b of item.bullets ?? []) {
    push({ kind: 'bullet', text: `•  ${b}`, font: regular, size: base, color: INK, indentPt: 10, gapAfterPt: spacing.bulletGapPt });
  }
  if (item.tags?.length) {
    push({ kind: 'text', text: item.tags.join(', '), font: regular, size: base, color: INK, indentPt: 0, gapAfterPt: base * 0.08 });
  }
  if (item.url) {
    push({ kind: 'text', text: item.url, font: regular, size: base, color: INK, indentPt: 0, gapAfterPt: 0, link: item.url });
  }
  if (out.length) out[out.length - 1].gapAfterPt = 0;
  return out;
}

const sumLines = (lines: PaintLine[]) => lines.reduce((n, l) => n + l.heightPt + l.gapAfterPt, 0);

export interface SectionGeometryInput {
  section: RenderSection;
  variant: SectionVariant;
  widthPt: number;
  theme: TemplateTheme;
  density: Density;
  measurer: TextMeasurer;
}

export function buildSectionGeometry(input: SectionGeometryInput): SectionGeometry {
  const { section, variant, widthPt, theme, density, measurer } = input;
  const base = density.baseSizePt;
  const spacing = spacingTokens(theme, density, variant);
  const lg = lineGapFor(theme, variant);
  const bold = boldFace(theme.fontFamily);
  const regular = regularFace(theme.fontFamily);
  const decoration = theme.sectionRule ? 'rule' : theme.headingStyle && theme.headingStyle !== 'plain' ? theme.headingStyle : undefined;

  const headingText = theme.headingTransform === 'upper' ? section.title.toUpperCase() : section.title;
  const heading: PaintLine[] = [measureLine(measurer, {
    kind: 'heading',
    text: headingText,
    font: bold,
    size: base * 1.05,
    color: theme.accent,
    indentPt: theme.headingStyle === 'bar' ? 8 : theme.headingStyle === 'tint' ? 6 : 0,
    gapAfterPt: spacing.headingGapPt + (decoration ? 2 : 0),
    decoration,
  }, widthPt, lg)];

  const text: PaintLine[] = section.text
    ? [measureLine(measurer, {
      kind: 'text', text: section.text, font: regular, size: base, color: INK, indentPt: 0, gapAfterPt: spacing.paragraphGapPt,
    }, widthPt, lg)]
    : [];

  let items: ItemGeometry[];
  if (variant === 'inline') {
    const textLine = inlineText(section.items ?? []);
    const lines = textLine
      ? [measureLine(measurer, { kind: 'text', text: textLine, font: regular, size: base, color: INK, indentPt: 0, gapAfterPt: 0 }, widthPt, lg)]
      : [];
    items = lines.length ? [{ lines, heightPt: sumLines(lines) }] : [];
  } else {
    items = (section.items ?? []).map((item) => {
      const lines = buildItemLines(item, { variant, theme, measurer, widthPt, base, spacing });
      return { lines, heightPt: sumLines(lines) };
    });
  }

  return {
    variant,
    widthPt,
    heading,
    headingHeightPt: sumLines(heading),
    text,
    textHeightPt: sumLines(text),
    items,
    itemGapPt: spacing.itemGapPt,
    sectionGapPt: spacing.sectionGapPt,
  };
}

/** Height of an item range. Heading and body text belong to the first fragment only. */
export function rangeHeight(
  g: SectionGeometry,
  from: number,
  to: number,
  withHeading: boolean,
): number {
  const count = Math.max(0, to - from);
  let h = withHeading ? g.headingHeightPt + g.textHeightPt : 0;
  for (let i = from; i < to; i++) h += g.items[i]?.heightPt ?? 0;
  if (count > 1) h += (count - 1) * g.itemGapPt;
  return h;
}

export function fullSectionHeight(g: SectionGeometry): number {
  return rangeHeight(g, 0, g.items.length, true) + g.sectionGapPt;
}

export interface HeaderGeometry {
  lines: PaintLine[];
  heightPt: number;
}

/** Header block (name / headline / contacts). Shared by measurement and painting. */
export function buildHeaderLines(
  model: RenderModel,
  widthPt: number,
  density: Density,
  measurer: TextMeasurer,
): HeaderGeometry {
  const t = model.theme;
  const base = density.baseSizePt;
  const lg = t.density === 'relaxed' ? 2 : 0;
  const band = !!t.headerBand;
  const ink = band ? '#ffffff' : INK;
  const photoW = model.header.photo ? model.header.photo.sizePt + 10 : 0;
  const width = Math.max(60, widthPt - photoW);
  const lines: PaintLine[] = [];

  const push = (text: string, font: string, size: number, color: string, gapAfterPt: number) => {
    if (!text) return;
    lines.push(measureLine(measurer, { kind: 'text', text, font, size, color, indentPt: 0, gapAfterPt }, width, lg));
  };

  push(model.header.name, boldFace(t.fontFamily), base * (t.nameScale ?? 1.8), band ? '#ffffff' : t.accent, base * 0.12);
  if (model.header.headline) push(model.header.headline, regularFace(t.fontFamily), base * 1.1, ink, base * 0.06);
  const contact = [...model.header.contacts, ...model.header.links.map((l) => `${l.label}: ${l.url}`)].join('  |  ');
  push(contact, regularFace(t.fontFamily), base * 0.95, ink, 0);

  const sum = sumLines(lines);
  return { lines, heightPt: sum + (band ? base * 0.8 : base * 0.4) };
}
