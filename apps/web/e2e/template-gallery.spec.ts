import { expect, Page, test } from '@playwright/test';
import { TEMPLATE_CATALOG } from '../../api/src/templates/template.catalog';
import { RESUME_ID, setup } from './support/setup';

// Serve the real 314-template catalogue (same manifests the API lists) to the gallery.
const LATEST = TEMPLATE_CATALOG.map((t) => ({
  id: t.id, slug: t.slug, name: t.name, category: t.category, description: t.description, tags: t.tags, version: t.version,
  atsProfile: t.atsProfile, pageSizes: t.pageSizes, layout: t.layout, theme: t.theme,
  careerLevels: t.careerLevels ?? ['entry', 'mid', 'senior'], style: t.style ?? 'classic',
}));
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type' };
const API = 'http://localhost:3100/api/v1';

async function gallery(page: Page, url = '/templates') {
  const state = await setup(page, { resume: url.includes('resumeId') });
  await page.route(`${API}/templates`, (route) => route.request().method() === 'GET'
    ? route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(LATEST) })
    : route.fallback());
  // Dummy-data render model per template (what GET /templates/:id/sample returns), built from the catalogue manifest.
  await page.route(new RegExp(`${API}/templates/[^/]+/sample$`), (route) => {
    const id = route.request().url().split('/templates/')[1].split('/')[0];
    const t = TEMPLATE_CATALOG.find((x) => x.id === id)!;
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({
      schemaVersion: 1, template: { id, version: t.version }, layout: t.layout, sideSections: t.sideSections ?? [], page: { size: 'A4', marginPt: 54 }, theme: t.theme,
      header: { name: 'Alex Morgan', headline: 'Senior Product Designer', contacts: ['alex.morgan@example.com'], links: [] },
      sections: [{ type: 'summary', title: 'Summary', text: 'Sample summary.' }, { type: 'skills', title: 'Skills', items: [{ title: 'Core', tags: ['Design'] }] }],
    }) });
  });
  await page.goto(url);
  return state;
}
const cards = (page: Page) => page.getByTestId('template-grid').locator('article');

test.describe('Template gallery (314 templates)', () => {
  test('shows all 314 templates, each with a thumbnail, ATS label and use action', async ({ page }) => {
    await gallery(page);
    await expect(cards(page)).toHaveCount(314);
    await expect(page.getByTestId('template-count')).toHaveText('314 of 314 templates');
    await expect(page.locator('app-template-live-card [role="img"]')).toHaveCount(314);
    for (const t of LATEST) await expect(page.getByTestId(`ats-${t.id}`)).toHaveCount(1);
    await expect(page.getByTestId('use-exec-concise')).toBeVisible();
  });

  test('filters by category chip', async ({ page }) => {
    await gallery(page);
    await page.getByRole('button', { name: 'Technology' }).click();
    await expect(cards(page)).toHaveCount(8);
    await page.getByRole('button', { name: 'Leadership / executive' }).click();
    await expect(cards(page)).toHaveCount(5);
    await page.getByTestId('cat-all').click();
    await expect(cards(page)).toHaveCount(314);
  });

  test('filters by ATS profile, layout, career level, style and page format; filters combine', async ({ page }) => {
    await gallery(page);
    const n = (fn: (t: (typeof LATEST)[number]) => boolean) => LATEST.filter(fn).length;

    await page.getByTestId('filter-ats').selectOption('VISUAL');
    await expect(cards(page)).toHaveCount(n((t) => t.atsProfile === 'VISUAL'));
    await page.getByTestId('filter-ats').selectOption('');

    await page.getByTestId('filter-layout').selectOption('two-column');
    await expect(cards(page)).toHaveCount(n((t) => t.layout === 'two-column'));
    await page.getByTestId('filter-layout').selectOption('');

    await page.getByTestId('filter-level').selectOption('executive');
    await expect(cards(page)).toHaveCount(n((t) => t.careerLevels.includes('executive')));
    await page.getByTestId('filter-level').selectOption('');

    await page.getByTestId('filter-style').selectOption('creative');
    await expect(cards(page)).toHaveCount(n((t) => t.style === 'creative'));

    await page.getByTestId('filter-page').selectOption('LETTER');
    await expect(cards(page)).toHaveCount(n((t) => t.style === 'creative' && t.pageSizes.includes('LETTER')));

    await page.getByTestId('filter-layout').selectOption('timeline'); // creative + ATS-first never co-occur
    await page.getByTestId('filter-ats').selectOption('ATS_FIRST');
    await expect(page.getByTestId('templates-empty')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(cards(page)).toHaveCount(314);
  });

  test('searches by name, tag and description', async ({ page }) => {
    await gallery(page);
    await page.getByTestId('template-search').fill('europass');
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByTestId('template-intl-europass-inspired')).toBeVisible();
    await page.getByTestId('template-search').fill('cybersecurity');
    await expect(page.getByTestId('template-tech-cybersecurity')).toBeVisible();
    await page.getByTestId('template-search').fill('zzz-no-match');
    await expect(page.getByTestId('templates-empty')).toBeVisible();
  });

  test('warns on non-ATS-first templates but never on ATS-first ones', async ({ page }) => {
    await gallery(page);
    await expect(page.getByTestId('warn-ats-classic')).toHaveCount(0);
    await expect(page.getByTestId('warn-modern-clean-geometric')).toContainText('two columns');
    await expect(page.getByTestId('warn-creative-portfolio-led')).toContainText('may parse less reliably');
  });

  test('thumbnails reflect the declared layout', async ({ page }) => {
    await gallery(page);
    const card = (id: string) => page.getByTestId('template-' + id);
    await card('modern-clean-geometric').scrollIntoViewIfNeeded();
    await expect(card('modern-clean-geometric').locator('.sheet[data-layout="two-column"]')).toHaveCount(1);
    await card('modern-structured-timeline').scrollIntoViewIfNeeded();
    await expect(card('modern-structured-timeline').locator('.sheet[data-layout="timeline"]')).toHaveCount(1);
    await card('modern-split-header').scrollIntoViewIfNeeded();
    await expect(card('modern-split-header').locator('[data-testid="doc-header"].band')).toHaveCount(1);
    await card('ats-clean-professional').scrollIntoViewIfNeeded();
    await expect(card('ats-clean-professional').locator('[data-testid="doc-columns"]')).toHaveCount(0);
  });

  test('picking a catalogue template for an existing resume sends only the template id', async ({ page }) => {
    const state = await gallery(page, `/templates?resumeId=${RESUME_ID}`);
    await page.getByTestId('use-exec-director-profile').click();
    await expect.poll(() => state.requests.some((r) => r.method === 'PATCH')).toBe(true);
    expect(state.requests.find((r) => r.method === 'PATCH')!.body).toEqual({ templateId: 'exec-director-profile' });
  });
});

test.describe('Preview of declarative layouts', () => {
  test('two-column + header band render side rail and band from the shared model', async ({ page }) => {
    await setup(page, { resume: true });
    const tpl = TEMPLATE_CATALOG.find((t) => t.id === 'creative-graphic-designer')!;
    await page.route(`${API}/resumes/${RESUME_ID}/render-model`, (route) => route.fulfill({
      status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({
        schemaVersion: 1, template: { id: tpl.id, version: 1 }, layout: 'two-column', sideSections: tpl.sideSections,
        page: { size: 'A4', marginPt: 54 }, theme: tpl.theme,
        header: { name: 'Ada Lovelace', headline: 'Designer', contacts: ['ada@example.com'], links: [] },
        sections: [
          { type: 'summary', title: 'Summary', text: 'Designs engines.' },
          { type: 'skills', title: 'Skills', items: [{ title: 'Core', tags: ['Math'] }] },
        ],
      }),
    }));
    await page.goto(`/resumes/${RESUME_ID}/preview`);
    await expect(page.getByTestId('doc-columns')).toBeVisible();
    await expect(page.getByTestId('doc-side').getByTestId('doc-skills')).toBeVisible();
    await expect(page.getByTestId('doc-main').getByTestId('doc-summary')).toBeVisible();
    await expect(page.getByTestId('doc-header')).toHaveClass(/band/);
  });
});
