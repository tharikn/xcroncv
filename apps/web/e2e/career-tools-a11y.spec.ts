import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { setup } from './support/setup';
import { freshTools, mockCareerTools } from './support/mock-career-tools';

const LETTER_ID = '00000000-0000-4000-8000-000000000001';
const ROUTES = ['/career-tools', '/cover-letters', `/cover-letters/${LETTER_ID}`, '/contacts', '/job-analytics'];

function seeded() {
  const sections = [{ id: 'opening', heading: 'Opening', text: 'Dear Hiring Manager,', origin: 'GENERATED' }];
  return freshTools({
    seq: 1,
    letters: [{ id: LETTER_ID, title: 'Acme', company: 'Acme', jobTitle: 'Engineer', kind: 'standard', tone: 'professional', length: 'medium', currentVersion: 1, updatedAt: '2026-01-02T10:00:00.000Z' }],
    versions: { [LETTER_ID]: [{ id: 'v1', versionNumber: 1, changeSummary: 'Initial draft', createdAt: '2026-01-02T10:00:00.000Z', sections, claims: [] }] },
    contacts: [{ id: 'c1', name: 'Jane Doe', organization: 'Acme', role: 'Recruiter', relationship: 'RECRUITER', channels: [], tags: ['warm'], notes: null, links: [] }],
    events: [{ type: 'APPLIED', occurredAt: '2026-03-02T12:00:00.000Z', applicationRef: 'a', source: 'MANUAL' }],
  });
}

test.describe('Career tools: responsive layout and accessibility (docs 24, 25)', () => {
  for (const route of ROUTES) {
    test(`no horizontal overflow and no serious a11y violations on ${route.replace(LETTER_ID, ':id')}`, async ({ page }) => {
      await setup(page);
      await mockCareerTools(page, seeded());
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1').first()).toBeVisible();
      const m = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth, win: window.innerWidth,
        wide: [...document.querySelectorAll('ion-content, .page-shell, .shell')].map((e) => (e as HTMLElement).scrollWidth - (e as HTMLElement).clientWidth),
      }));
      expect(m.doc).toBeLessThanOrEqual(m.win);
      for (const w of m.wide) expect(w).toBeLessThanOrEqual(1);

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    });
  }

  test('hub links reach all three tools', async ({ page }) => {
    await setup(page);
    await mockCareerTools(page);
    await page.goto('/career-tools');
    await page.getByTestId('tool-cover-letters').click();
    await expect(page).toHaveURL(/\/cover-letters$/);
    await page.goto('/career-tools');
    await page.getByTestId('tool-contacts').click();
    await expect(page).toHaveURL(/\/contacts$/);
    await page.goto('/career-tools');
    await page.getByTestId('tool-analytics').click();
    await expect(page).toHaveURL(/\/job-analytics$/);
  });

  test('primary navigation exposes the career tools entry', async ({ page }) => {
    await setup(page);
    await mockCareerTools(page);
    await page.goto('/dashboard');
    await page.getByTestId('nav-career-tools').click();
    await expect(page).toHaveURL(/\/career-tools$/);
  });

  test('keyboard: the new-letter form is reachable and operable without a mouse', async ({ page }, info) => {
    test.skip(info.project.name === 'android' || info.project.name === 'phone-web', 'keyboard flow is desktop/tablet only');
    await setup(page);
    await mockCareerTools(page);
    await page.goto('/cover-letters');
    await page.getByTestId('new-letter').focus();
    await page.keyboard.press('Enter');
    await page.getByTestId('letter-title').focus();
    await page.keyboard.type('Keyboard letter');
    await page.getByTestId('create-draft').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/cover-letters\/[0-9a-f-]{36}$/);
  });
});
