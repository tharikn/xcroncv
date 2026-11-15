import { expect, test } from '@playwright/test';
import { pstore } from './support/mock-platform-tools';
import { setup } from './support/setup';

/** Doc 37: signed webhooks, SSRF-safe targets, secret shown once, delivery log with retry. */
test.describe('Integrations / webhooks (doc 37)', () => {
  async function add(page: import('@playwright/test').Page, url = 'https://hooks.example.com/xcron') {
    await page.goto('/integrations');
    await page.getByTestId('new-webhook').click();
    await page.getByTestId('wh-url').fill(url);
    await page.getByTestId('save-webhook').click();
  }

  test('empty state, then an endpoint is created and the secret is shown exactly once', async ({ page }) => {
    await setup(page);
    await page.goto('/integrations');
    await expect(page.getByTestId('wh-empty')).toBeVisible();
    await add(page);
    await expect(page.getByTestId('secret-panel')).toBeVisible();
    await expect(page.getByTestId('secret-value')).toContainText('whsec_');
    await expect(page.getByTestId('wh-list').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('wh-list')).not.toContainText('whsec_mock'); // list only shows a masked hint
    await page.getByTestId('dismiss-secret').click();
    await expect(page.getByTestId('secret-panel')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('secret-panel')).toHaveCount(0);
  });

  for (const bad of ['http://hooks.example.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://169.254.169.254/latest', 'https://printer.local/x', 'not a url']) {
    test(`rejects unsafe or invalid target ${bad} before calling the API`, async ({ page }) => {
      const state = await setup(page);
      await add(page, bad);
      await expect(page.getByTestId('wh-form-error')).toBeVisible();
      expect(state.requests.some((r) => r.method === 'POST' && r.path === '/webhooks')).toBe(false);
    });
  }

  test('requires at least one event', async ({ page }) => {
    await setup(page);
    await page.goto('/integrations');
    await page.getByTestId('new-webhook').click();
    await page.getByTestId('wh-url').fill('https://hooks.example.com/x');
    await page.getByTestId('wh-event-test.ping').uncheck();
    await page.getByTestId('save-webhook').click();
    await expect(page.getByTestId('wh-form-error')).toContainText('at least one event');
  });

  test('a test delivery appears in the log; failures can be retried', async ({ page }) => {
    const state = await setup(page);
    await add(page);
    await page.getByTestId('dismiss-secret').click();
    await page.getByTestId('wh-test').click();
    await expect(page.getByTestId('dl-status').first()).toHaveText('SUCCESS');
    pstore(state)['wh'].failTests = true;
    await page.getByTestId('wh-test').click();
    await expect(page.getByTestId('dl-status').first()).toHaveText('FAILED');
    await expect(page.getByTestId('delivery-log')).toContainText('HTTP 503');
    await page.getByTestId('dl-retry').click();
    await expect(page.getByTestId('dl-status').first()).toHaveText('SUCCESS');
    await expect(page.getByTestId('dl-retry')).toHaveCount(0);
  });

  test('pausing disables test sending; rotating asks first and shows a new secret once', async ({ page }) => {
    await setup(page);
    await add(page);
    await page.getByTestId('dismiss-secret').click();
    await page.getByTestId('wh-toggle').click();
    await expect(page.getByTestId('wh-state')).toHaveText('Paused');
    await expect(page.getByTestId('wh-test')).toBeDisabled();
    await page.getByTestId('wh-toggle').click();
    await expect(page.getByTestId('wh-state')).toHaveText('Active');
    await page.getByTestId('wh-rotate').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Rotate' }).click();
    await expect(page.getByTestId('secret-value')).toContainText('whsec_rot');
    await expect(page.getByTestId('wh-list')).toContainText('v2');
  });

  test('deleting asks for confirmation and removes the endpoint and its log', async ({ page }) => {
    await setup(page);
    await add(page);
    await page.getByTestId('dismiss-secret').click();
    await page.getByTestId('wh-delete').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('wh-empty')).toBeVisible();
  });

  test('shows an error banner when the API fails and does not overflow', async ({ page }) => {
    const state = await setup(page);
    state.failNext = { path: /^\/webhooks$/, status: 500 };
    await page.goto('/integrations');
    await expect(page.getByTestId('wh-error')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(m.doc).toBeLessThanOrEqual(m.win);
  });

  test('no horizontal overflow with a long URL and an open secret panel', async ({ page }) => {
    await setup(page);
    await add(page, `https://hooks.example.com/${'very-long-path-segment-'.repeat(8)}`);
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(m.doc).toBeLessThanOrEqual(m.win);
  });
});
