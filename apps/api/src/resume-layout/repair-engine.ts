import { SectionType, TemplateVersionPackage } from '../templates/template.types';
import { RenderModel, RenderSection } from '../render-model/render-model.types';
import {
  ColumnId, Decision, Density, LayoutOptions, LayoutPlan, LayoutViolation, SectionVariant,
} from './layout.types';
import { planResume } from './planner';
import { resolveSectionPolicies } from './section-policy';
import { validatePlan } from './layout-validator';
import { createTextMeasurer, TextMeasurer } from './text-metrics';

export interface AdaptiveLayout {
  plan: LayoutPlan;
  violations: LayoutViolation[];
  iterations: number;
  actions: Decision[];
  /** The repaired content model the plan was computed against (persist this with the plan). */
  model: RenderModel;
}

interface RepairState {
  model: RenderModel;
  variants: Partial<Record<SectionType, SectionVariant>>;
  columnOverrides: Partial<Record<SectionType, ColumnId>>;
  dropped: SectionType[];
  density: Density;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const cloneModel = (m: RenderModel): RenderModel => ({
  ...m,
  sections: m.sections.map((s) => ({
    ...s,
    items: s.items ? s.items.map((i) => ({ ...i, bullets: i.bullets ? [...i.bullets] : undefined, tags: i.tags ? [...i.tags] : undefined })) : undefined,
  })),
});

function replaceSection(model: RenderModel, index: number, next: RenderSection): RenderModel {
  return { ...model, sections: model.sections.map((s, i) => (i === index ? next : s)) };
}

interface Candidate {
  index: number;
  section: RenderSection;
  key: SectionType;
  weight: number;
  variant: SectionVariant;
  preferred: 'main' | 'side' | 'either';
  itemCount: number;
  bulletCount: number;
  canCompress: boolean;
  canInline: boolean;
  canShorten: boolean;
  canMove: boolean;
  canDrop: boolean;
  minItems: number;
}

function candidates(state: RepairState, template: TemplateVersionPackage): Candidate[] {
  const policies = resolveSectionPolicies(template);
  return state.model.sections
    .map((section, index) => {
      const key = section.type as SectionType;
      const policy = policies[key];
      if (!policy) return null;
      return {
        index, section, key, weight: policy.weight,
        variant: state.variants[key] ?? 'normal',
        preferred: policy.preferred,
        itemCount: section.items?.length ?? (section.text ? 1 : 0),
        bulletCount: (section.items ?? []).reduce((n, i) => n + (i.bullets?.length ?? 0), 0),
        canCompress: policy.canCompress,
        canInline: policy.canInline,
        canShorten: policy.canShorten,
        canMove: policy.canMove,
        canDrop: policy.canDrop,
        minItems: policy.minItems,
      } satisfies Candidate;
    })
    .filter((c): c is Candidate => !!c)
    .sort((a, b) => a.weight - b.weight || b.itemCount - a.itemCount || a.index - b.index);
}

/**
 * Applies the cheapest fix that can clear the reported hard violations.
 * Every branch strictly shrinks content or spacing, so the loop always terminates.
 */
function nextFix(
  state: RepairState,
  hard: LayoutViolation[],
  template: TemplateVersionPackage,
): Decision | null {
  const base = state.density.baseSizePt;
  const overflow = hard
    .filter((v) => v.code === 'OVERFLOW' || v.code === 'UNPLACED')
    .reduce((n, v) => Math.max(n, v.deltaPt ?? 0), 0);
  const list = candidates(state, template);

  // 1. small overflow / page pressure: tighten vertical rhythm first (cheapest, visually invisible).
  const pagePressure = hard.some((v) => v.code === 'PAGE_LIMIT');
  if ((overflow > 0 || pagePressure) && overflow < base * 4 && state.density.gapFactor > 0.8) {
    state.density = { ...state.density, gapFactor: round2(state.density.gapFactor - 0.1) };
    return { stage: 'repair', action: 'tighten-spacing', reason: `Reclaimed ${Math.round(overflow)}pt by tightening gaps` };
  }

  // 2. normal -> compact. Under page pressure the whole set is compressed in one pass so the
  //    ladder converges in a handful of iterations instead of one section per pass.
  const compressible = list.filter((c) => c.variant === 'normal' && c.canCompress);
  if (compressible.length) {
    const targets = pagePressure && compressible.length > 1 ? compressible : [compressible[0]];
    for (const t of targets) state.variants[t.key] = 'compact';
    return {
      stage: 'repair', action: 'compress-section', sectionKey: targets[0].key, from: 'normal', to: 'compact',
      reason: `${targets.length} section(s) switched to the compact style`,
    };
  }

  // 3. compact -> inline for tag-like sections (skills, certifications, languages).
  const inlinable = list.filter((c) => c.variant === 'compact' && c.canInline);
  if (inlinable.length) {
    const targets = pagePressure && inlinable.length > 1 ? inlinable : [inlinable[0]];
    for (const t of targets) state.variants[t.key] = 'inline';
    return {
      stage: 'repair', action: 'inline-section', sectionKey: targets[0].key, from: 'compact', to: 'inline',
      reason: `${targets.length} section(s) collapsed to an inline list`,
    };
  }

  // 4. fewer bullets. Batch when the layout is over the page budget. The cut is floored so the
  //    bullet count always strictly decreases (ceil(2 * 0.6) === 2 would be a no-op and spin).
  const bulletCuts = list.filter((c) => c.canShorten && (c.section.items ?? []).some((i) => (i.bullets?.length ?? 0) > 1));
  if (bulletCuts.length) {
    const targets = pagePressure ? bulletCuts : [bulletCuts[0]];
    let before = 0;
    let after = 0;
    for (const t of targets) {
      const items = t.section.items ?? [];
      before += t.bulletCount;
      const trimmed = items.map((i) => {
        if (!i.bullets || i.bullets.length <= 1) return i;
        const keep = Math.max(1, Math.floor(i.bullets.length * 0.6));
        return { ...i, bullets: i.bullets.slice(0, keep) };
      });
      after += trimmed.reduce((n, i) => n + (i.bullets?.length ?? 0), 0);
      state.model = replaceSection(state.model, t.index, { ...t.section, items: trimmed });
    }
    return {
      stage: 'repair', action: 'trim-bullets', sectionKey: targets[0].key,
      from: `${before} bullets`, to: `${after} bullets`,
      reason: 'Low-priority bullets removed to reclaim space',
    };
  }

  // 5. fewer items (never below the policy minimum). Floored for the same reason as bullets.
  const itemCuts = list.filter((c) => (c.section.items?.length ?? 0) > c.minItems && c.canShorten);
  if (itemCuts.length) {
    const targets = pagePressure ? itemCuts : [itemCuts[0]];
    let before = 0;
    let after = 0;
    for (const t of targets) {
      const items = t.section.items ?? [];
      const keep = Math.max(t.minItems, Math.min(items.length - 1, Math.floor(items.length * 0.7)));
      before += items.length;
      after += keep;
      state.model = replaceSection(state.model, t.index, { ...t.section, items: items.slice(0, keep) });
    }
    return {
      stage: 'repair', action: 'cut-items', sectionKey: targets[0].key,
      from: `${before} items`, to: `${after} items`,
      reason: 'Lowest-ranked entries removed to fit the page budget',
    };
  }

  // 6. move a low-weight section to the other column.
  if (state.model.layout === 'two-column') {
    const movable = list.find((c) => c.canMove && !state.columnOverrides[c.key]);
    if (movable) {
      const current = movable.preferred === 'side' ? 'side' : 'main';
      const to: ColumnId = current === 'side' ? 'main' : 'side';
      state.columnOverrides[movable.key] = to;
      return { stage: 'repair', action: 'move-column', sectionKey: movable.key, from: current, to, reason: 'Section moved to rebalance the columns' };
    }
  }

  // 7. drop an optional section entirely.
  const droppable = list.find((c) => c.canDrop && !state.dropped.includes(c.key));
  if (droppable) {
    state.dropped.push(droppable.key);
    return {
      stage: 'repair', action: 'drop-section', sectionKey: droppable.key, to: 'omitted',
      reason: 'Optional section omitted: not enough space and lowest JD relevance',
    };
  }

  // 8. last resort: step the base size down within readable bounds.
  if (state.density.baseSizePt > 9) {
    state.density = { ...state.density, baseSizePt: round2(state.density.baseSizePt - 0.25) };
    return { stage: 'repair', action: 'reduce-base-size', from: `${base}pt`, to: `${state.density.baseSizePt}pt`, reason: 'Base font stepped down to fit the budget' };
  }

  return null;
}

const MAX_ITERATIONS = 20;

function planOnce(state: RepairState, template: TemplateVersionPackage, opts: LayoutOptions, measurer: TextMeasurer) {
  const result = planResume(state.model, template, {
    ...opts,
    density: state.density,
    variants: state.variants,
    dropped: state.dropped,
    columnOverrides: state.columnOverrides,
  }, measurer);
  return { ...result, model: state.model };
}

/**
 * Plan → validate → repair → re-plan. Deterministic and bounded. The returned plan always
 * contains every piece of selected content; only optional sections and low-priority bullets
 * can be removed, and every removal is recorded in `decisions`.
 */
export function buildAdaptiveLayout(
  model: RenderModel,
  template: TemplateVersionPackage,
  opts: LayoutOptions = {},
): AdaptiveLayout {
  const measurer = createTextMeasurer(model.page.size, model.page.marginPt);
  const maxPages = Math.max(1, opts.maxPages ?? 2);
  const state: RepairState = {
    model: cloneModel(model),
    variants: { ...(opts.variants ?? {}) },
    columnOverrides: { ...(opts.columnOverrides ?? {}) },
    dropped: [...(opts.dropped ?? [])],
    density: {
      baseSizePt: opts.density?.baseSizePt ?? model.theme.baseSizePt,
      lineGap: opts.density?.lineGap ?? (model.theme.density === 'relaxed' ? 2 : 0),
      gapFactor: opts.density?.gapFactor ?? 1,
    },
  };

  const actions: Decision[] = [];
  let last = planOnce(state, template, opts, measurer);
  const validate = (plan: LayoutPlan) => validatePlan(plan, {
    maxPages, maxImbalance: opts.maxImbalance, minLastPageFill: opts.minLastPageFill, unplaced: plan.metrics.unplaced,
  });
  let violations = validate(last.plan);

  /** A repair must change the state, otherwise the ladder is spinning on a rung that does nothing. */
  const signature = (s: RepairState) => JSON.stringify({
    density: s.density,
    variants: s.variants,
    columns: s.columnOverrides,
    dropped: s.dropped,
    content: s.model.sections.map((sec) => [
      sec.type,
      sec.items?.length ?? 0,
      (sec.items ?? []).reduce((n, i) => n + (i.bullets?.length ?? 0), 0),
    ]),
  });

  /** Lower is better: clear hard violations first, then fewer pages, then a well-filled last page. */
  const rank = (plan: LayoutPlan, v: LayoutViolation[]) =>
    v.filter((x) => x.severity === 'hard').length * 10_000
    + plan.metrics.pageCount * 100
    + (1 - plan.metrics.lastPageFill) * 10;

  let best = { plan: last.plan, violations, model: last.model, rank: rank(last.plan, violations) };
  const seen = new Set<string>([signature(state)]);

  try {
    for (let step = 0; step < MAX_ITERATIONS; step++) {
      const hard = violations.filter((v) => v.severity === 'hard');
      if (!hard.length) break;
      const fix = nextFix(state, hard, template);
      if (!fix) break;
      const sig = signature(state);
      if (seen.has(sig)) {
        // Every remaining rung is a no-op for this content: keep the best plan found so far.
        last.plan.warnings.push('The repair ladder stalled before every violation was cleared.');
        break;
      }
      seen.add(sig);
      actions.push(fix);
      last = planOnce(state, template, opts, measurer);
      violations = validate(last.plan);
      const current = rank(last.plan, violations);
      if (current < best.rank) best = { plan: last.plan, violations, model: last.model, rank: current };
    }
  } finally {
    measurer.dispose();
  }

  best.plan.metrics.repairs = actions.length;
  best.plan.decisions = [...best.plan.decisions, ...actions];
  best.plan.warnings = [...new Set(best.plan.warnings)];

  return { plan: best.plan, violations: best.violations, iterations: actions.length, actions, model: best.model };
}
