import { SectionType, TemplateLayout } from '../templates/template.types';

/**
 * Adaptive Resume Layout Engine (ARLE).
 *
 * Everything in this file is deterministic data: no AI output, no heuristics that depend on wall-clock
 * time or randomness. The same inputs must always produce the same plan (golden-test requirement).
 */
export const LAYOUT_ENGINE_VERSION = 'arle-1';

export type ColumnId = 'main' | 'side';

/** How much of a section's content is shown. Compressing is a repair action, never a template mutation. */
export type SectionVariant = 'normal' | 'compact' | 'inline';

export type ViolationCode =
  | 'PAGE_LIMIT'
  | 'OVERFLOW'
  | 'UNPLACED'
  | 'ORPHAN'
  | 'LOW_FILL'
  | 'IMBALANCE'
  | 'EMPTY_COLUMN'
  | 'NO_SECTIONS';

export type ViolationSeverity = 'hard' | 'soft';

/** Declarative placement rules. Templates describe intent; the engine decides the actual placement. */
export interface SectionPolicy {
  key: SectionType | 'custom';
  preferred: 'main' | 'side' | 'either';
  /** Editorial weight (0..10). Higher = keep earlier, in the main column, never dropped. */
  weight: number;
  canMove: boolean;
  canReorder: boolean;
  canCompress: boolean;
  canInline: boolean;
  canShorten: boolean;
  canSplit: boolean;
  canDrop: boolean;
  minItems: number;
  keepWithNext: boolean;
}

/** Typography/spacing state. Repair lowers these within template bounds; AI never touches them. */
export interface Density {
  baseSizePt: number;
  lineGap: number;
  /** Multiplier applied to every vertical gap. 1 = template default. */
  gapFactor: number;
}

/** Geometry of one column in points, relative to the page origin. */
export interface ColumnGeometry {
  id: ColumnId;
  xPt: number;
  widthPt: number;
  ratio: number;
}

/** One painted section fragment. A section may appear several times when it spans pages. */
export interface PlacedSection {
  key: SectionType | 'custom';
  /** Index in the source model's section array (stable key for the painter). */
  sectionIndex: number;
  page: number;
  column: ColumnId;
  variant: SectionVariant;
  /** false on continuation fragments: the heading is painted only once. */
  withHeading: boolean;
  itemFrom: number;
  /** Exclusive. */
  itemTo: number;
  startYPt: number;
  heightPt: number;
  /** Remaining leftover space on the page when this fragment was placed (diagnostics only). */
  slackPt: number;
}

export interface PagePlan {
  index: number;
  columns: Record<ColumnId, PlacedSection[]>;
  /** 0..1 of the usable height for that page/column. */
  fill: Record<ColumnId, number>;
}

export interface LayoutMetrics {
  pageCount: number;
  mainFill: number;
  sideFill: number;
  imbalance: number;
  lastPageFill: number;
  repairs: number;
  /** Fragments the planner could not place (always repaired before export when possible). */
  unplaced: number;
}

export type DecisionStage = 'content' | 'balance' | 'paginate' | 'repair';

export interface Decision {
  stage: DecisionStage;
  action: string;
  reason: string;
  sectionKey?: SectionType | 'custom';
  from?: string;
  to?: string;
  page?: number;
}

export interface LayoutPlan {
  engineVersion: typeof LAYOUT_ENGINE_VERSION;
  page: { size: 'A4' | 'LETTER'; widthPt: number; heightPt: number; marginPt: number };
  layout: TemplateLayout;
  columns: ColumnGeometry[];
  density: Density;
  headerHeightPt: number;
  pages: PagePlan[];
  sections: PlacedSection[];
  metrics: LayoutMetrics;
  decisions: Decision[];
  warnings: string[];
}

export interface LayoutViolation {
  code: ViolationCode;
  severity: ViolationSeverity;
  message: string;
  sectionKey?: SectionType | 'custom';
  page?: number;
  column?: ColumnId;
  /** Points that must be reclaimed to clear an overflow, or the fill deficit for soft violations. */
  deltaPt?: number;
}

export interface PlanOptions {
  maxPages?: number;
  density?: Partial<Density>;
  variants?: Partial<Record<SectionType, SectionVariant>>;
  /** Section types removed entirely (repair ladder step 7). */
  dropped?: SectionType[];
  /** Overrides the model's section order. */
  order?: SectionType[];
  /** Forces a page break before these sections. */
  pageBreakBefore?: SectionType[];
  /** Column overrides written by the repair ladder (two-column templates only). */
  columnOverrides?: Partial<Record<SectionType, ColumnId>>;
}

export interface LayoutOptions extends PlanOptions {
  /** Soft target for the last page fill; below this the plan is reported as sparse. */
  minLastPageFill?: number;
  /** Soft target for column balance (absolute fill difference). */
  maxImbalance?: number;
}

export const pageGeometry = (size: 'A4' | 'LETTER', marginPt: number) => {
  const [widthPt, heightPt] = size === 'A4' ? [595.28, 841.89] : [612, 792];
  return { size, widthPt, heightPt, marginPt };
};
