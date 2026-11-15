import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { setup } from './support/setup';

const ROUTES = ['/career-tools', '/ai', '/integrations', '/career-path', '/clips', '/portal-jobs', '/interview-copilot', '/documents'];

/** Responsive layout and accessibility for the platform module pages (docs 06/38, 37, 44, 45, 32, 51, 52). */
test.describe('Platform modules: responsive layout and accessibility', () => {
  for (const route of ROUTES) {
    test(`no horizontal overflow and no serious a11y violations on ${route}`, async ({ page }) => {
      await setup(page, { resume: true });
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

  test('the career tools hub links every platform module', async ({ page }) => {
    await setup(page);
    await page.goto('/career-tools');
    for (const id of ['tool-ai', 'tool-integrations', 'tool-career-path', 'tool-clips', 'tool-portal-jobs', 'tool-copilot', 'tool-documents']) await expect(page.getByTestId(id)).toBeVisible();
  });
});
