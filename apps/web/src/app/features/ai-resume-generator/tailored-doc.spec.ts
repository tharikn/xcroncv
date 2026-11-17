import { RenderModel } from '../../core/models';
import { buildTailoredDoc } from './tailored-doc';

const baseModel: RenderModel = {
  schemaVersion: 1,
  template: { id: 'ats-first', version: 1 },
  page: { size: 'A4', marginPt: 54 },
  layout: 'single-column',
  sideSections: [],
  theme: {
    fontFamily: 'Helvetica',
    baseSizePt: 10,
    accent: '#6d4ff0',
    headingTransform: 'upper',
    headerAlign: 'left',
    sectionRule: true,
    density: 'normal',
  },
  header: { name: 'Ada Lovelace', headline: 'Engineer', contacts: ['ada@example.com'] },
  sections: [
    { id: 'summary', type: 'summary', title: 'Summary', text: 'Old summary' },
    {
      id: 'experience',
      type: 'experience',
      title: 'Experience',
      items: [{ id: 'job1', title: 'Engineer', subtitle: 'Acme', bullets: ['Shipped features'] }],
    },
  ],
};

describe('buildTailoredDoc', () => {
  it('replaces only the summary text with the JD-tailored summary', () => {
    const doc = buildTailoredDoc(baseModel, 'Senior engineer with Angular and AWS.');
    expect(doc.sections.find((s) => s.type === 'summary')?.text).toBe('Senior engineer with Angular and AWS.');
    expect(doc.sections.find((s) => s.type === 'experience')?.items?.[0].bullets).toEqual(['Shipped features']);
  });

  it('inserts a summary section when the profile has none', () => {
    const doc = buildTailoredDoc({ ...baseModel, sections: baseModel.sections.slice(1) }, 'Tailored text');
    expect(doc.sections[0]).toEqual({ id: 'summary', type: 'summary', title: 'Summary', text: 'Tailored text' });
    expect(doc.sections).toHaveLength(2);
  });

  it('carries the confirmed header, items and styles into the visual-editor document', () => {
    const doc = buildTailoredDoc({ ...baseModel, styles: { 'header.name': { bold: true } } }, 'Tailored text');
    expect(doc.v).toBe(1);
    expect(doc.header).toEqual({ name: 'Ada Lovelace', headline: 'Engineer', contacts: ['ada@example.com'] });
    expect(doc.sections[1].items?.[0].title).toBe('Engineer');
    expect(doc.styles).toEqual({ 'header.name': { bold: true } });
  });
});
