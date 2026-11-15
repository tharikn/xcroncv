import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { signIn } from './support/mock-api';
import { setup } from './support/setup';

/**
 * Doc 24 audit: every authenticated screen must survive a failing API honestly.
 * With every API call answering 500 a page must (1) stop loading, (2) tell the user something went wrong in an
 * announced alert, (3) not throw, (4) have a heading, and (5) not overflow horizontally or fail axe, on every profile.
 */
const ID = '11111111-1111-4111-8111-111111111111';
const CORS = {
  'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
};

/** Screens that load data on entry. Static hubs/forms (login, settings, career-tools, import, parsing-test) need no error state. */
const DATA_ROUTES = [
  '/dashboard', '/profile', '/resumes', `/resumes/${ID}`, `/resumes/${ID}/versions`, `/resumes/${ID}/preview`, `/recruiter-view/${ID}`,
  '/ats', '/career-imports', '/career-facts', '/evidence-check', '/files', '/templates', '/cover-letters', `/cover-letters/${ID}`,
  '/contacts', '/job-analytics', '/portfolio', '/autofill', '/wallet', '/insights', '/match', '/quality', '/application-vault',
  '/readiness', '/interview-prep', '/feedback-shares', '/ai', '/integrations', '/career-path', '/clips', '/portal-jobs',
  '/interview-copilot', '/documents', '/expert-review',
];
/** Screens with no API call on entry in this setup: /career-imports is an upload form, /files reads the device folder, not the API. */
const NO_ALERT_NEEDED = new Set<string>(['/career-imports', '/files']);

async function failEverything(page: Page) {
  await page.route('http://localhost:3100/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({ status: 500, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Injected failure' }) });
  });
}

test.describe('UX audit: failing API', () => {
  for (const route of DATA_ROUTES) {
    test(`${route} shows an announced error and stays usable`, async ({ page }) => {
      const thrown: string[] = [];
      page.on('pageerror', (e) => thrown.push(e.message));
      await failEverything(page);
      await signIn(page);
      await page.goto(route);
      await expect(page.locator('h1, ion-title').first(), 'page renders a heading').toBeVisible({ timeout: 20_000 }); // cold lazy chunk on a busy machine
      if (!NO_ALERT_NEEDED.has(route)) {
        await expect(page.locator('[role="alert"]:visible').first(), 'an alert explains the failure').toBeVisible();
        await expect(page.getByText(/^Loading/), 'must not stay in a loading state').toHaveCount(0);
      }
      expect(thrown, 'no uncaught exceptions').toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(1);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    });
  }
});

test.describe('UX audit: navigation', () => {
  test('every top-level screen is reachable from the shell, the career-tools hub or the insights hub', async ({ page }) => {
    await setup(page, { resume: true });
    const hrefs = new Set<string>();
    for (const hub of ['/career-tools', '/insights', '/dashboard']) {
      await page.goto(hub);
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });
      for (const h of await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => (a.getAttribute('href') ?? '').split('?')[0]))) hrefs.add(h);
    }
    const missing = DATA_ROUTES.filter((r) => !r.includes(ID) && !hrefs.has(r));
    expect(missing, 'routes with no navigation entry').toEqual([]);
  });
});
