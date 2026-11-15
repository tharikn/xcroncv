import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { RESUME_ID, setup } from './support/setup';

const ROUTES = [
  { path: '/application-vault', open: 'new-entry', form: 'vault-form' },
  { path: '/readiness', open: 'new-plan', form: 'plan-form' },
  { path: '/interview-prep', open: 'new-prep', form: 'prep-form' },
  { path: '/feedback-shares', open: 'new-share', form: 'share-form' },
];

test.describe('Docs 33-36: layout and accessibility', () => {
  for (const r of ROUTES) {
    test(`no overflow and no serious a11y violations on ${r.path} (list and form)`, async ({ page }) => {
      const state = await setup(page, { resume: true });
      state.versions[RESUME_ID] = [{ id: 'ver-1', versionNumber: 1, changeSummary: null, createdAt: '2026-01-02T10:00:00.000Z' }];
      await page.goto(r.path);
      await page.getByTestId(r.open).click();
      await expect(page.getByTestId(r.form)).toBeVisible();
      await page.waitForLoadState('networkidle');
      const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
      expect(m.doc).toBeLessThanOrEqual(m.win);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    });
  }
});
