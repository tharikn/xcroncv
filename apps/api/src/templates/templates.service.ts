import { Injectable, NotFoundException } from '@nestjs/common';
import { TEMPLATE_CATALOG } from './template.catalog';
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
      .map(({ id, slug, name, category, description, tags, version, atsProfile, pageSizes }) =>
        ({ id, slug, name, category, description, tags, version, atsProfile, pageSizes }));
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
}
