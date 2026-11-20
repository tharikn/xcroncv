import { RenderModel } from '../src/render-model/render-model.types';
import { buildHeaderLines, buildSectionGeometry } from '../src/resume-layout/layout-model';
import { createTextMeasurer } from '../src/resume-layout/text-metrics';
import { Density } from '../src/resume-layout/layout.types';

const theme: RenderModel['theme'] = {
  fontFamily: 'Helvetica', baseSizePt: 10, accent: '#6d4ff0',
  headingTransform: 'none', headerAlign: 'left', sectionRule: false, density: 'normal',
};
const density: Density = { baseSizePt: 10, lineGap: 0, gapFactor: 1 };
const measurer = createTextMeasurer('A4', 54);

const model: RenderModel = {
  schemaVersion: 1,
  template: { id: 'test', version: 1 },
  page: { size: 'A4', marginPt: 54 },
  theme,
  layout: 'single-column',
  sideSections: [],
  header: { name: 'Ada Lovelace', contacts: [], links: [] },
  styles: {
    'header.name': { bold: false, italic: true },
    's.s1.title': { bold: false },
    'i.i1.title': { bold: false, italic: true },
  },
  sections: [{
    id: 's1', type: 'experience', title: 'Experience',
    items: [{ id: 'i1', title: 'Engineer', meta: '2020' }],
  }],
};

describe('planned PDF element styles', () => {
  it('applies bold/italic overrides even when the font family is unchanged', () => {
    const header = buildHeaderLines(model, 480, density, measurer, { styles: model.styles });
    expect(header.lines[0].font).toBe('Helvetica-Oblique');

    const geometry = buildSectionGeometry({
      section: model.sections[0], variant: 'normal', widthPt: 480,
      theme, density, measurer, styles: model.styles,
    });
    expect(geometry.heading[0].font).toBe('Helvetica');
    expect(geometry.items[0].lines[0].font).toBe('Helvetica-Oblique');
  });
});
