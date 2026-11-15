import { SAMPLE_PROFILE } from '../src/templates/sample-profile';
import { TEMPLATE_CATALOG } from '../src/templates/template.catalog';
import { TemplatesService } from '../src/templates/templates.service';

describe('template sample render model (dummy data for gallery/preview)', () => {
  const svc = new TemplatesService();

  it('builds a model for every template from the fictional profile only', () => {
    for (const id of new Set(TEMPLATE_CATALOG.map((t) => t.id))) {
      const m = svc.sample(id);
      expect(m.template.id).toBe(id);
      expect(m.header.name).toBe(SAMPLE_PROFILE.fullName);
      expect(m.sections.length).toBeGreaterThan(2);
    }
  });

  it('is deterministic and rejects unknown templates', () => {
    expect(svc.sample('ats-classic')).toEqual(svc.sample('ats-classic'));
    expect(() => svc.sample('nope')).toThrow();
  });
});
