import { TemplateTheme } from '../templates/template.types';
import { RenderItem, RenderModel, RenderSection } from '../render-model/render-model.types';
import { ElementStyle, resolveColor } from '../render-model/resume-doc';
import { Density, SectionVariant } from './layout.types';
import { boldFace, face, familyFromFace, italicFace, regularFace } from './fonts';
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
  align?: 'left' | 'center' | 'right';
  /** Drawn behind/next to the heading text by the painter. */
  decoration?: 'rule' | 'bar' | 'tint' | 'short';
}

/** Visual-editor overrides applied by BOTH the planner and the painter, so measured and painted sizes agree. */
export interface ElementStyleContext {
  styles?: Record<string, ElementStyle>;
  accent?: string;
}

function styledLine(
  line: Omit<PaintLine, 'heightPt'>,
  style: ElementStyle | undefined,
  accent: string,
  bold: boolean,
  italic: boolean,
): Omit<PaintLine, 'heightPt'> {
  if (!style) return line;
  const resolvedBold = style.bold ?? bold;
  const resolvedItalic = style.italic ?? italic;
  return {
    ...line,
    font: face(style.font ?? familyFromFace(line.font), resolvedBold, resolvedItalic),
    size: style.sizePt ?? line.size,
    color: resolveColor(style.color, accent, line.color),
    gapAfterPt: style.spaceAfterPt ?? line.gapAfterPt,
    align: style.align ?? line.align,
  };
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
    styles?: Record<string, ElementStyle>;
    accent?: string;
  },
): PaintLine[] {
  const { variant, theme, measurer, widthPt, base, spacing } = opts;
  const styles = opts.styles ?? {};
  const accent = opts.accent ?? theme.accent;
  const lg = lineGapFor(theme, variant);
  const bold = boldFace(theme.fontFamily);
  const regular = regularFace(theme.fontFamily);
  const italic = italicFace(theme.fontFamily);
  const out: PaintLine[] = [];
  const push = (
    line: Omit<PaintLine, 'heightPt'>,
    field?: 'title' | 'subtitle' | 'meta' | 'text' | 'bullets' | 'tags' | 'url',
    isBold = false,
    isItalic = false,
  ) => {
    const style = field && item.id ? styles[`i.${item.id}.${field}`] : undefined;
    out.push(measureLine(measurer, styledLine(line, style, accent, isBold, isItalic), widthPt, lg));
  };

  if (variant === 'inline') {
    const text = itemLabel(item);
    const field = (['title', 'subtitle', 'meta', 'tags'] as const).find((f) => styles[`i.${item.id}.${f}`]);
    if (text) push({ kind: 'text', text, font: regular, size: base, color: INK, indentPt: 0, gapAfterPt: 0 }, field);
    return out;
  }

  if (item.title || item.meta) {
    const text = [item.title, item.meta].filter(Boolean).join('    ');
    const field = styles[`i.${item.id}.title`] ? 'title' : 'meta';
    push({ kind: 'text', text, font: bold, size: base, color: INK, indentPt: 0, gapAfterPt: base * 0.08 }, field, true);
  }
  if (item.subtitle) {
    push({ kind: 'text', text: item.subtitle, font: italic, size: base, color: INK, indentPt: 0, gapAfterPt: base * 0.06 }, 'subtitle', false, true);
  }
  if (item.text) {
    push({ kind: 'text', text: item.text, font: regular, size: base, color: INK, indentPt: 0, gapAfterPt: base * 0.08 }, 'text');
  }
  for (const b of item.bullets ?? []) {
    push({ kind: 'bullet', text: `•  ${b}`, font: regular, size: base, color: INK, indentPt: 10, gapAfterPt: spacing.bulletGapPt }, 'bullets');
  }
  if (item.tags?.length) {
    push({ kind: 'text', text: item.tags.join(', '), font: regular, size: base, color: INK, indentPt: 0, gapAfterPt: base * 0.08 }, 'tags');
  }
  if (item.url) {
    push({ kind: 'text', text: item.url, font: regular, size: base, color: INK, indentPt: 0, gapAfterPt: 0, link: item.url }, 'url');
  }
  if (out.length) out[out.length - 1].gapAfterPt = styles[`i.${item.id}.url`]?.spaceAfterPt ?? 0;
  return out;
}

const sumLines = (lines: PaintLine[]) => lines.reduce((n, l) => n + l.heightPt + l.gapAfterPt, 0);

export interface SectionGeometryInput extends ElementStyleContext {
  section: RenderSection;
  variant: SectionVariant;
  widthPt: number;
  theme: TemplateTheme;
  density: Density;
  measurer: TextMeasurer;
}

export function buildSectionGeometry(input: SectionGeometryInput): SectionGeometry {
  const { section, variant, widthPt, theme, density, measurer } = input;
  const styles = input.styles ?? {};
  const accent = input.accent ?? theme.accent;
  const base = density.baseSizePt;
  const spacing = spacingTokens(theme, density, variant);
  const lg = lineGapFor(theme, variant);
  const bold = boldFace(theme.fontFamily);
  const regular = regularFace(theme.fontFamily);
  const decoration = theme.sectionRule ? 'rule' : theme.headingStyle && theme.headingStyle !== 'plain' ? theme.headingStyle : undefined;

  const headingText = theme.headingTransform === 'upper' ? section.title.toUpperCase() : section.title;
  const headingLine = styledLine({
    kind: 'heading',
    text: headingText,
    font: bold,
    size: base * 1.05,
    color: theme.accent,
    indentPt: theme.headingStyle === 'bar' ? 8 : theme.headingStyle === 'tint' ? 6 : 0,
    gapAfterPt: spacing.headingGapPt + (decoration ? 2 : 0),
    decoration,
  }, section.id ? styles[`s.${section.id}.title`] : undefined, accent, true, false);
  const heading: PaintLine[] = [measureLine(measurer, headingLine, widthPt, lg)];

  const textLine = section.text
    ? styledLine({
      kind: 'text', text: section.text, font: regular, size: base, color: INK, indentPt: 0, gapAfterPt: spacing.paragraphGapPt,
    }, section.id ? styles[`s.${section.id}.text`] : undefined, accent, false, false)
    : null;
  const text: PaintLine[] = textLine ? [measureLine(measurer, textLine, widthPt, lg)] : [];

  let items: ItemGeometry[];
  if (variant === 'inline') {
    // Keep each item as its own line so per-item overrides stay style-aware. Separators are
    // appended to the preceding line so the painted text matches the joined web rendering.
    const source = section.items ?? [];
    const lines = source.flatMap((item, index) => {
      const text = itemLabel(item);
      if (!text) return [];
      const field = (['title', 'subtitle', 'meta', 'tags'] as const).find((f) => styles[`i.${item.id}.${f}`]);
      const label = index < source.length - 1 ? `${text} · ` : text;
      return [measureLine(measurer, styledLine({
        kind: 'text', text: label, font: regular, size: base, color: INK, indentPt: 0, gapAfterPt: 0,
      }, field ? styles[`i.${item.id}.${field}`] : undefined, accent, false, false), widthPt, lg)];
    });
    items = lines.length ? [{ lines, heightPt: sumLines(lines) }] : [];
  } else {
    items = (section.items ?? []).map((item) => {
      const lines = buildItemLines(item, { variant, theme, measurer, widthPt, base, spacing, styles, accent });
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
  ctx: ElementStyleContext = {},
): HeaderGeometry {
  const t = model.theme;
  const base = density.baseSizePt;
  const lg = t.density === 'relaxed' ? 2 : 0;
  const band = !!t.headerBand;
  const ink = band ? '#ffffff' : INK;
  const accent = ctx.accent ?? t.accent;
  const styles = ctx.styles ?? {};
  const photoW = model.header.photo ? model.header.photo.sizePt + 10 : 0;
  const width = Math.max(60, widthPt - photoW);
  const lines: PaintLine[] = [];

  const push = (
    text: string,
    font: string,
    size: number,
    color: string,
    gapAfterPt: number,
    field: 'header.name' | 'header.headline' | 'header.contacts',
    isBold = false,
    isItalic = false,
  ) => {
    if (!text) return;
    const line = styledLine(
      { kind: 'text', text, font, size, color, indentPt: 0, gapAfterPt },
      styles[field],
      accent,
      isBold,
      isItalic,
    );
    lines.push(measureLine(measurer, line, width, lg));
  };

  push(
    model.header.name,
    boldFace(t.fontFamily),
    base * (t.nameScale ?? 1.8),
    band ? '#ffffff' : t.accent,
    base * 0.12,
    'header.name',
    true,
  );
  if (model.header.headline) {
    push(model.header.headline, regularFace(t.fontFamily), base * 1.1, ink, base * 0.06, 'header.headline');
  }
  const contact = [...model.header.contacts, ...model.header.links.map((l) => `${l.label}: ${l.url}`)].join('  |  ');
  push(contact, regularFace(t.fontFamily), base * 0.95, ink, 0, 'header.contacts');

  const sum = sumLines(lines);
  return { lines, heightPt: sum + (band ? base * 0.8 : base * 0.4) };
}
