import { Injectable, NotFoundException } from '@nestjs/common';
import { SEED_META, TEMPLATE_CATALOG } from './template.catalog';
import { buildRenderModel } from '../render-model/render-model.builder';
import { SAMPLE_PROFILE } from './sample-profile';
import { TemplateVersionPackage } from './template.types';

@Injectable()
export class TemplatesService {
  list(filter: { category?: string; atsProfile?: string } = {}) {
    const latest = new Map<string, TemplateVersionPackage>();
    for (const t of TEMPLATE_CATALOG) {
      const cur = latest.get(t.id);
      if (!cur || t.version > cur.version) latest.set(t.id, t);
    }
    return [...latest.values()]
      .filter((t) => (!filter.category || t.category === filter.category)
        && (!filter.atsProfile || t.atsProfile === filter.atsProfile))
      .map((t) => ({
        id: t.id, slug: t.slug, name: t.name, category: t.category, description: t.description, tags: t.tags,
        version: t.version, atsProfile: t.atsProfile, pageSizes: t.pageSizes, layout: t.layout, theme: t.theme,
        careerLevels: t.careerLevels ?? SEED_META[t.id]?.careerLevels ?? [],
        style: t.style ?? SEED_META[t.id]?.style ?? 'classic',
      }));
  }

  getVersion(id: string, version: number): TemplateVersionPackage {
    const t = TEMPLATE_CATALOG.find((x) => x.id === id && x.version === version);
    if (!t) throw new NotFoundException('Template version not found');
    return t;
  }

  getLatest(id: string): TemplateVersionPackage {
    const all = TEMPLATE_CATALOG.filter((x) => x.id === id).sort((a, b) => b.version - a.version);
    if (!all.length) throw new NotFoundException('Template not found');
    return all[0];
  }

  /** Render model of the latest template filled with the fictional sample profile (same builder as real resumes). */
  sample(id: string) {
    return buildRenderModel(SAMPLE_PROFILE, this.getLatest(id), undefined, {});
  }
}
