import { LayoutPlan, LayoutViolation } from './layout.types';

export interface ValidationOptions {
  maxPages: number;
  /** Absolute fill difference beyond which columns are reported as unbalanced. */
  maxImbalance?: number;
  /** Last-page fill below which the page is reported as sparse. */
  minLastPageFill?: number;
  /** Number of sections the planner could not place. */
  unplaced?: number;
}

/**
 * Hard violations must be repaired before export. Soft violations are reported and repaired
 * when a cheap fix exists, but never block a build: a resume with slightly empty space is
 * still better than a resume that fails to generate.
 */
export function validatePlan(plan: LayoutPlan, opts: ValidationOptions): LayoutViolation[] {
  const out: LayoutViolation[] = [];
  const maxImbalance = opts.maxImbalance ?? 0.35;
  const minLastPageFill = opts.minLastPageFill ?? 0.5;

  if (!plan.sections.length) {
    out.push({ code: 'NO_SECTIONS', severity: 'hard', message: 'No content could be placed on the resume.' });
  }

  if (plan.metrics.pageCount > opts.maxPages) {
    out.push({
      code: 'PAGE_LIMIT', severity: 'hard',
      message: `Layout needs ${plan.metrics.pageCount} pages but the budget is ${opts.maxPages}.`,
      deltaPt: plan.metrics.pageCount - opts.maxPages,
    });
  }

  if ((opts.unplaced ?? 0) > 0) {
    out.push({
      code: 'UNPLACED', severity: 'hard',
      message: `${opts.unplaced} section fragment(s) could not be placed.`,
      deltaPt: opts.unplaced ?? 0,
    });
  }

  for (const placed of plan.sections) {
    const page = plan.pages[placed.page];
    if (!page) {
      out.push({
        code: 'OVERFLOW', severity: 'hard', sectionKey: placed.key, page: placed.page,
        message: `${String(placed.key)} was placed on a page that does not exist.`,
      });
      continue;
    }
    const top = placed.page === 0 ? plan.page.marginPt + plan.headerHeightPt + plan.density.baseSizePt * 0.8 : plan.page.marginPt;
    const capacity = plan.page.heightPt - plan.page.marginPt - top;
    const end = placed.startYPt + placed.heightPt;
    if (end > plan.page.heightPt - plan.page.marginPt + 0.5) {
      out.push({
        code: 'OVERFLOW', severity: 'hard', sectionKey: placed.key, page: placed.page, column: placed.column,
        deltaPt: end - (plan.page.heightPt - plan.page.marginPt),
        message: `${String(placed.key)} overflows page ${placed.page + 1} by ${Math.round(end - (plan.page.heightPt - plan.page.marginPt))}pt.`,
      });
    } else if (placed.startYPt < top - 0.5 || placed.heightPt > capacity + 0.5) {
      out.push({
        code: 'OVERFLOW', severity: 'hard', sectionKey: placed.key, page: placed.page, column: placed.column,
        deltaPt: Math.max(0, placed.startYPt - top) + Math.max(0, placed.heightPt - capacity),
        message: `${String(placed.key)} does not fit the printable area on page ${placed.page + 1}.`,
      });
    }
  }

  // Heading alone on a page while its content continues elsewhere.
  const bySection = new Map<string, typeof plan.sections>();
  for (const p of plan.sections) {
    const list = bySection.get(String(p.key)) ?? [];
    list.push(p);
    bySection.set(String(p.key), list);
  }
  for (const [key, list] of bySection) {
    const hasBody = list.some((p) => p.itemTo > p.itemFrom);
    if (!hasBody) continue;
    for (const p of list) {
      if (p.withHeading && p.itemTo === p.itemFrom) {
        out.push({
          code: 'ORPHAN', severity: 'soft', sectionKey: p.key, page: p.page, column: p.column,
          message: `The ${key} heading is stranded on page ${p.page + 1} without content.`,
        });
      }
    }
  }

  if (plan.metrics.pageCount > 1) {
    if (plan.metrics.lastPageFill < minLastPageFill) {
      out.push({
        code: 'LOW_FILL', severity: 'soft',
        message: `The last page is only ${Math.round(plan.metrics.lastPageFill * 100)}% full.`,
        deltaPt: (minLastPageFill - plan.metrics.lastPageFill) * 100,
      });
    }
    if (plan.layout === 'two-column' && plan.metrics.imbalance > maxImbalance) {
      out.push({
        code: 'IMBALANCE', severity: 'soft',
        message: `Columns are unbalanced by ${Math.round(plan.metrics.imbalance * 100)}%.`,
        deltaPt: Math.round(plan.metrics.imbalance * 100),
      });
    }
    if (plan.layout === 'two-column' && (plan.metrics.sideFill < 0.15 || plan.metrics.mainFill < 0.15)) {
      out.push({
        code: 'EMPTY_COLUMN', severity: 'soft',
        message: 'One column is almost empty.',
        deltaPt: Math.round(Math.min(plan.metrics.sideFill, plan.metrics.mainFill) * 100),
      });
    }
  }

  return out;
}
