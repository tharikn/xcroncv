import { RenderModel, RenderItem, RenderSection } from '../render-model/render-model.types';
import { LayoutPlan } from '../resume-layout/layout.types';
import { ContentPlan } from './content-selector';

const trimItem = (item: RenderItem, bullets: number): RenderItem => {
  if (!item.bullets?.length) return item;
  const keep = Math.max(0, bullets);
  return keep === 0 ? { ...item, bullets: undefined } : { ...item, bullets: item.bullets.slice(0, keep) };
};

/** Rewrites a profile-derived model into the selected, ranked content. Pure: no I/O. */
export function applyContentPlan(model: RenderModel, plan: ContentPlan): RenderModel {
  const byType = new Map(model.sections.map((s) => [s.type, s]));
  const sections: RenderSection[] = [];

  for (const content of plan.sections) {
    if (!content.included) continue;
    const section = byType.get(content.key);
    if (!section) continue;

    if (content.key === 'summary') {
      sections.push({ ...section, text: plan.summaryText || section.text });
      continue;
    }
    if (!section.items?.length) continue;

    const items = content.items
      .map((ranked) => {
        const item = section.items?.[ranked.sourceIndex];
        return item ? trimItem(item, ranked.bullets) : undefined;
      })
      .filter((i): i is RenderItem => !!i);

    if (items.length) sections.push({ ...section, items });
  }

  return { ...model, sections };
}

/**
 * Safety net: clamp every section to the item ranges the plan actually paints, and drop sections
 * the plan omitted. Keeps preview and export identical to the validated plan.
 */
export function limitToPlan(model: RenderModel, plan: LayoutPlan): RenderModel {
  const cap = new Map<number, number>();
  for (const placed of plan.sections) {
    cap.set(placed.sectionIndex, Math.max(cap.get(placed.sectionIndex) ?? 0, placed.itemTo));
  }
  const sections = model.sections
    .map((section, index) => ({ section, index }))
    .filter(({ index }) => cap.has(index))
    .map(({ section, index }) => {
      const items = section.items;
      if (!items?.length) return section;
      return { ...section, items: items.slice(0, Math.max(0, cap.get(index) ?? 0)) };
    });
  return { ...model, sections };
}
