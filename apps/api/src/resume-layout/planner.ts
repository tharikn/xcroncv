import { SectionType, TemplateVersionPackage } from '../templates/template.types';
import { RenderSection } from '../render-model/render-model.types';
import { RenderModel } from '../render-model/render-model.types';
import {
  ColumnGeometry, ColumnId, Decision, Density, LAYOUT_ENGINE_VERSION, LayoutOptions, LayoutPlan, PagePlan,
  PlacedSection, SectionPolicy, SectionVariant, pageGeometry,
} from './layout.types';
import { buildHeaderLines, buildSectionGeometry, rangeHeight, SectionGeometry } from './layout-model';
import { resolveSectionPolicies } from './section-policy';
import { createTextMeasurer, TextMeasurer } from './text-metrics';

const GUTTER_PT = 18;
const SIDE_RATIO = 0.3;

export interface SectionPlan {
  index: number;
  section: RenderSection;
  key: SectionType | 'custom';
  policy: SectionPolicy;
  variant: SectionVariant;
  main: SectionGeometry;
  side?: SectionGeometry;
}

export interface FlowResult {
  placed: PlacedSection[];
  overflowPt: number;
  pagesUsed: number;
  usedByPage: number[];
  /** Sections that could not be placed at all (only when a single block exceeds a whole page). */
  unplaced: number;
}

export interface PageBox {
  top: (page: number) => number;
  bottom: number;
  pageHeight: number;
  marginPt: number;
}

export interface PlannerContext {
  measurer: TextMeasurer;
  columns: ColumnGeometry[];
  box: PageBox;
  density: Density;
  headerHeightPt: number;
  policies: Record<SectionType, SectionPolicy>;
  sections: SectionPlan[];
  twoColumn: boolean;
  decisions: Decision[];
  warnings: string[];
}

const cloneDecision = (d: Decision): Decision => ({ ...d });

/** Resolve the engine density from template + options (never from AI). */
export function resolveDensity(model: RenderModel, opts: LayoutOptions): Density {
  return {
    baseSizePt: opts.density?.baseSizePt ?? model.theme.baseSizePt,
    lineGap: opts.density?.lineGap ?? (model.theme.density === 'relaxed' ? 2 : 0),
    gapFactor: opts.density?.gapFactor ?? 1,
  };
}

export function buildPageBox(
  page: { heightPt: number; marginPt: number },
  headerHeightPt: number,
  baseSizePt: number,
): PageBox {
  const headerGap = baseSizePt * 0.8;
  return {
    pageHeight: page.heightPt,
    marginPt: page.marginPt,
    bottom: page.heightPt - page.marginPt,
    top: (index: number) => (index === 0 ? page.marginPt + headerHeightPt + headerGap : page.marginPt),
  };
}

/** Build the measurable form of every section in paint order. */
export function composeSections(
  model: RenderModel,
  template: TemplateVersionPackage,
  opts: LayoutOptions,
  ctx: Pick<PlannerContext, 'measurer' | 'density' | 'columns' | 'policies' | 'twoColumn' | 'decisions'>,
): SectionPlan[] {
  const dropped = new Set(opts.dropped ?? []);
  const orderIndex = new Map<string, number>();
  (opts.order ?? []).forEach((key, i) => orderIndex.set(key, i));

  const source = model.sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => !dropped.has(section.type as SectionType));

  if (orderIndex.size) {
    source.sort((a, b) => {
      const ai = orderIndex.get(a.section.type) ?? Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.get(b.section.type) ?? Number.MAX_SAFE_INTEGER;
      return ai === bi ? a.index - b.index : ai - bi;
    });
  }

  const mainCol = ctx.columns.find((c) => c.id === 'main')!;
  const sideCol = ctx.columns.find((c) => c.id === 'side');

  return source.map(({ section, index }) => {
    const key = section.type;
    const policy = ctx.policies[key as SectionType] ?? ctx.policies.summary;
    const variant = opts.variants?.[key as SectionType] ?? 'normal';
    const main = buildSectionGeometry({
      section, variant, widthPt: mainCol.widthPt, theme: model.theme, density: ctx.density, measurer: ctx.measurer,
    });
    const side = ctx.twoColumn && sideCol
      ? buildSectionGeometry({
        section, variant, widthPt: sideCol.widthPt, theme: model.theme, density: ctx.density, measurer: ctx.measurer,
      })
      : undefined;
    return { index, section, key, policy, variant, main, side };
  });
}

const geometryFor = (s: SectionPlan, column: ColumnId): SectionGeometry | undefined =>
  column === 'main' ? s.main : s.side;

/** Greedy flow with block-boundary pagination. Never splits a bullet or a word. */
export function flowSections(
  sections: SectionPlan[],
  column: ColumnId,
  box: PageBox,
  pageLimit: number,
  decisions: Decision[],
  warnings: string[],
): FlowResult {
  const placed: PlacedSection[] = [];
  const usedByPage: number[] = [];
  let page = 0;
  let y = box.top(0);
  let overflowPt = 0;
  let unplaced = 0;

  const touch = (p: number, endY: number) => {
    const used = Math.max(0, endY - box.top(p));
    usedByPage[p] = Math.max(usedByPage[p] ?? 0, used);
  };

  const newPage = (): boolean => {
    const next = page + 1;
    if (next >= pageLimit) return false;
    page = next;
    y = box.top(page);
    return true;
  };

  for (const s of sections) {
    const g = geometryFor(s, column);
    if (!g) continue;
    const total = g.items.length;
    let from = 0;
    let withHeading = true;
    let guard = 0;

    while (from < total || (total === 0 && withHeading)) {
      if (guard++ > 500) {
        warnings.push(`Layout guard tripped on ${String(s.key)}; content left unplaced.`);
        unplaced += 1;
        break;
      }
      const avail = box.bottom - y;

      if (total === 0) {
        const h = g.headingHeightPt + g.textHeightPt;
        if (h <= avail + 0.01) {
          placed.push({
            key: s.key, sectionIndex: s.index, page, column, variant: s.variant, withHeading,
            itemFrom: 0, itemTo: 0, startYPt: y, heightPt: h, slackPt: avail - h,
          });
          y += h + g.sectionGapPt;
          touch(page, y);
          break;
        }
        if (y <= box.top(page) + 0.01) {
          overflowPt += h - avail;
          unplaced += 1;
          warnings.push(`${String(s.key)} is taller than a full page.`);
          break;
        }
        if (!newPage()) {
          overflowPt += h - avail;
          unplaced += 1;
          warnings.push(`${String(s.key)} could not be placed within ${pageLimit} page(s).`);
          break;
        }
        continue;
      }

      // Largest item prefix that fits on the remaining space.
      let fitTo = from;
      for (let to = from + 1; to <= total; to++) {
        if (rangeHeight(g, from, to, withHeading) <= avail + 0.01) fitTo = to;
        else break;
      }

      // Prefer moving an unsplittable section whole onto a fresh page over splitting it.
      if (fitTo < total && !s.policy.canSplit && y > box.top(page) + 0.01 && page + 1 < pageLimit) {
        const whole = rangeHeight(g, from, total, withHeading) + g.sectionGapPt;
        if (whole <= box.bottom - box.top(page + 1)) {
          newPage();
          decisions.push({
            stage: 'paginate', action: 'move-whole-section', sectionKey: s.key,
            reason: `${String(s.key)} did not fit in the remaining space and cannot split`, page,
          });
          continue;
        }
      }

      if (fitTo === from) {
        if (y > box.top(page) + 0.01 && newPage()) continue;
        const need = rangeHeight(g, from, Math.min(from + 1, total), withHeading);
        overflowPt += need - avail;
        unplaced += 1;
        warnings.push(`${String(s.key)} item ${from + 1} does not fit on a page.`);
        break;
      }

      const isLast = fitTo === total;
      const h = rangeHeight(g, from, fitTo, withHeading) + (isLast ? g.sectionGapPt : 0);
      placed.push({
        key: s.key, sectionIndex: s.index, page, column, variant: s.variant, withHeading,
        itemFrom: from, itemTo: fitTo, startYPt: y, heightPt: h, slackPt: avail - h,
      });
      y += h;
      touch(page, y);

      if (!isLast) {
        decisions.push({
          stage: 'paginate', action: 'split-section', sectionKey: s.key,
          reason: `${String(s.key)} continues on the next page after item ${fitTo} of ${total}`, page,
        });
        if (!newPage()) {
          overflowPt += rangeHeight(g, fitTo, total, false);
          warnings.push(`${String(s.key)} overflows the page budget.`);
          break;
        }
        withHeading = false;
        from = fitTo;
      } else {
        from = total;
      }
    }
  }

  return { placed, overflowPt, pagesUsed: Math.max(1, usedByPage.length), usedByPage, unplaced };
}

const pageCountOf = (main: FlowResult, side: FlowResult) => Math.max(main.pagesUsed, side.pagesUsed, 1);

const fillOf = (r: FlowResult, box: PageBox, pageCount: number) => {
  let capacity = 0;
  for (let p = 0; p < pageCount; p++) capacity += Math.max(1, box.bottom - box.top(p));
  const used = r.usedByPage.reduce((n, v) => n + v, 0);
  return Math.min(1, used / Math.max(1, capacity));
};

const lastPageFillOf = (r: FlowResult, box: PageBox, pageCount: number) => {
  const capacity = Math.max(1, box.bottom - box.top(pageCount - 1));
  return Math.min(1, (r.usedByPage[pageCount - 1] ?? 0) / capacity);
};

interface Evaluation {
  main: FlowResult;
  side: FlowResult;
  pageCount: number;
  score: number;
  moved: number;
  decisions: Decision[];
  warnings: string[];
}

/** Deterministic local search over column assignment. Bounded candidate count. */
function evaluateAssignment(
  sections: SectionPlan[],
  assignment: Map<number, ColumnId>,
  box: PageBox,
  maxPages: number,
  twoColumn: boolean,
  seed: Map<number, ColumnId>,
): Evaluation {
  const mainSections = twoColumn ? sections.filter((s) => (assignment.get(s.index) ?? 'main') === 'main') : sections;
  const sideSections = twoColumn ? sections.filter((s) => assignment.get(s.index) === 'side') : [];

  const warnings: string[] = [];
  const decisions: Decision[] = [];
  const main = flowSections(mainSections, 'main', box, Number.POSITIVE_INFINITY, decisions, warnings);
  const pageCap = Math.max(main.pagesUsed, 1);
  const side = flowSections(sideSections, 'side', box, Number.POSITIVE_INFINITY, decisions, warnings);
  const pageCount = pageCountOf(main, side);

  let moved = 0;
  for (const s of sections) {
    if ((assignment.get(s.index) ?? 'main') !== (seed.get(s.index) ?? 'main')) moved += 1;
  }

  const imbalance = twoColumn ? Math.abs(fillOf(main, box, pageCount) - fillOf(side, box, pageCount)) : 0;
  const lastFill = Math.min(lastPageFillOf(main, box, pageCount), twoColumn ? lastPageFillOf(side, box, pageCount) : 1);
  const overPages = Math.max(0, pageCount - maxPages);

  const score =
    (main.overflowPt + side.overflowPt) * 4 +
    (main.unplaced + side.unplaced) * 2000 +
    overPages * 1000 +
    imbalance * 120 +
    (1 - lastFill) * 12 +
    moved * 0.6;

  return { main, side, pageCount, score, moved, decisions, warnings };
}

export interface BuildPlanResult {
  plan: LayoutPlan;
  sections: SectionPlan[];
  flow: { main: FlowResult; side: FlowResult };
  ctx: PlannerContext;
}

/** One planning pass: assignment + pagination + assembled plan. */
export function planResume(
  model: RenderModel,
  template: TemplateVersionPackage,
  opts: LayoutOptions,
  measurer: TextMeasurer,
): BuildPlanResult {
  const page = pageGeometry(model.page.size, model.page.marginPt);
  const width = page.widthPt - page.marginPt * 2;
  const density = resolveDensity(model, opts);
  const twoColumn = model.layout === 'two-column';
  const policies = resolveSectionPolicies(template);
  const decisions: Decision[] = [];
  const warnings: string[] = [];

  const columns: ColumnGeometry[] = twoColumn
    ? (() => {
      const sideW = Math.round(width * SIDE_RATIO);
      const mainW = width - sideW - GUTTER_PT;
      return [
        { id: 'main' as const, xPt: page.marginPt, widthPt: mainW, ratio: mainW / width },
        { id: 'side' as const, xPt: page.marginPt + mainW + GUTTER_PT, widthPt: sideW, ratio: sideW / width },
      ];
    })()
    : [{ id: 'main' as const, xPt: page.marginPt, widthPt: width, ratio: 1 }];

  const header = buildHeaderLines(model, width, density, measurer);
  const box = buildPageBox(page, header.heightPt, density.baseSizePt);

  const ctx: PlannerContext = {
    measurer, columns, box, density, headerHeightPt: header.heightPt,
    policies, sections: [], twoColumn, decisions, warnings,
  };
  const sections = composeSections(model, template, opts, ctx);
  ctx.sections = sections;

  const seed = new Map<number, ColumnId>();
  for (const s of sections) {
    const override = opts.columnOverrides?.[s.key as SectionType];
    const pref = override ?? s.policy.preferred;
    seed.set(s.index, twoColumn && pref === 'side' ? 'side' : 'main');
  }

  const maxPages = Math.max(1, opts.maxPages ?? 2);
  let best = evaluateAssignment(sections, seed, box, maxPages, twoColumn, seed);
  let bestAssignment = new Map(seed);

  if (twoColumn) {
    // Single flips for movable sections, ordered by weight ascending (least important moves first).
    const movable = sections.filter((s) => s.policy.canMove).sort((a, b) => a.policy.weight - b.policy.weight);
    for (const s of movable) {
      const candidate = new Map(bestAssignment);
      candidate.set(s.index, (candidate.get(s.index) ?? 'main') === 'main' ? 'side' : 'main');
      const ev = evaluateAssignment(sections, candidate, box, maxPages, twoColumn, seed);
      if (ev.score < best.score - 0.001) {
        best = ev;
        bestAssignment = candidate;
        decisions.push({
          stage: 'balance', action: 'move-section', sectionKey: s.key,
          from: seed.get(s.index) ?? 'main', to: candidate.get(s.index),
          reason: `Moving ${String(s.key)} reduced imbalance/page pressure`,
        });
      }
    }
  }

  // Re-evaluate with the final assignment and record its decisions once.
  const finalEval = evaluateAssignment(sections, bestAssignment, box, maxPages, twoColumn, seed);
  const pageCount = finalEval.pageCount;

  const pages: PagePlan[] = Array.from({ length: pageCount }, (_, index) => ({
    index,
    columns: { main: [], side: [] },
    fill: { main: 0, side: 0 },
  }));
  for (const p of [...finalEval.main.placed, ...finalEval.side.placed]) {
    const target = pages[p.page] ?? pages[pages.length - 1];
    target.columns[p.column].push(p);
  }
  for (const pg of pages) {
    const capacity = Math.max(1, box.bottom - box.top(pg.index));
    const mainUsed = pg.columns.main.reduce((n, p) => Math.max(n, p.startYPt + p.heightPt), 0) - box.top(pg.index);
    const sideUsed = pg.columns.side.reduce((n, p) => Math.max(n, p.startYPt + p.heightPt), 0) - box.top(pg.index);
    pg.fill = { main: Math.max(0, Math.min(1, mainUsed / capacity)), side: Math.max(0, Math.min(1, sideUsed / capacity)) };
  }

  const mainFill = fillOf(finalEval.main, box, pageCount);
  const sideFill = twoColumn ? fillOf(finalEval.side, box, pageCount) : 0;
  const last = pages[pageCount - 1];
  const lastPageFill = twoColumn ? Math.max(last.fill.main, last.fill.side) : last.fill.main;

  const plan: LayoutPlan = {
    engineVersion: LAYOUT_ENGINE_VERSION,
    page,
    layout: model.layout,
    columns,
    density,
    headerHeightPt: header.heightPt,
    pages,
    sections: [...finalEval.main.placed, ...finalEval.side.placed].sort((a, b) => a.page - b.page || a.startYPt - b.startYPt),
    metrics: {
      pageCount,
      mainFill,
      sideFill,
      imbalance: twoColumn ? Math.abs(mainFill - sideFill) : 0,
      lastPageFill,
      repairs: 0,
      unplaced: finalEval.main.unplaced + finalEval.side.unplaced,
    },
    decisions: [...decisions, ...finalEval.decisions, ...ctx.decisions].map(cloneDecision),
    warnings: [...new Set([...warnings, ...finalEval.warnings])],
  };

  return { plan, sections, flow: { main: finalEval.main, side: finalEval.side }, ctx };
}
