import { buildRenderModel, ProfileInput, sanitizeOverrides } from '../src/render-model/render-model.builder';
import { renderHtml } from '../src/export/html.renderer';
import { safeFilename } from '../src/export/filename';
import { TEMPLATE_CATALOG } from '../src/templates/template.catalog';

const profile: ProfileInput = {
  fullName: 'Ada <script>alert(1)</script>', email: 'ada@example.com', links: [
    { label: 'Site', url: 'https://ada.dev' }, { label: 'Bad', url: 'javascript:alert(1)' }],
  summary: 'Engineer.', headline: 'Backend',
  experiences: [{ employerName: 'Acme', jobTitle: 'Dev', startDate: '2020-01', isCurrent: true, bullets: [{ content: 'Built <b>x</b>' }] }],
  skills: [{ name: 'TypeScript', category: 'Languages' }, { name: 'Go', category: 'Languages' }],
  educations: [], projects: [], certifications: [], languages: [],
};

describe('render model', () => {
  const tpl = TEMPLATE_CATALOG[0];
  it('omits empty sections and drops unsafe links', () => {
    const m = buildRenderModel(profile, tpl, undefined, {});
    expect(m.sections.map((s) => s.type)).toEqual(['summary', 'experience', 'skills']);
    expect(m.header.links).toHaveLength(1);
  });
  it('honours hidden sections and template order', () => {
    const m = buildRenderModel(profile, TEMPLATE_CATALOG[1], [
      { type: 'experience', visible: true }, { type: 'summary', visible: false }], {});
    expect(m.sections.map((s) => s.type)).toEqual(['experience']);
  });
  it('formats current role as Present', () => {
    const m = buildRenderModel(profile, tpl, undefined, {});
    expect(m.sections[1].items![0].meta).toBe('Jan 2020 – Present');
  });
  it('allowlists overrides', () => {
    expect(sanitizeOverrides({ accent: 'red', baseSizePt: 99, evil: 1, pageSize: 'LETTER' })).toEqual({ pageSize: 'LETTER' });
  });
});

describe('html export', () => {
  it('escapes user content and has no script tags', () => {
    const html = renderHtml(buildRenderModel(profile, TEMPLATE_CATALOG[0], undefined, {}));
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Built &lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('javascript:');
  });
});

describe('filenames', () => {
  it('strips path traversal', () => {
    expect(safeFilename('../../etc/passwd', 'pdf')).toBe('etcpasswd.pdf');
    expect(safeFilename('', 'pdf')).toBe('resume.pdf');
  });
});
