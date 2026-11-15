import { expect, Page, test } from '@playwright/test';
import { RESUME_ID, setup } from './support/setup';

const version = (n: number) => ({ id: `ver-${n}`, versionNumber: n, changeSummary: `Edit ${n}`, createdAt: '2026-01-02T10:00:00.000Z' });

/** Doc 33: application-to-resume history that later edits cannot change. */
test.describe('Application vault (doc 33)', () => {
  async function log(page: Page, employer = 'Acme') {
    await page.goto('/application-vault');
    await page.getByTestId('new-entry').click();
    await page.getByTestId('v-employer').fill(employer);
    await page.getByTestId('v-job').fill('Backend Engineer');
    await page.getByTestId('save-entry').click();
    await expect(page.getByTestId('vault-form')).toHaveCount(0);
  }

  test('empty state, then a record pins the latest saved version', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.versions[RESUME_ID] = [version(1), version(2)];
    await page.goto('/application-vault');
    await expect(page.getByTestId('vault-empty')).toBeVisible();
    await expect(page.getByTestId('vault-note')).toContainText('source of truth');
    await log(page);
    const row = page.getByTestId('vault-list').locator('li').first();
    await expect(row.getByTestId('entry-employer')).toHaveText('Acme');
    await expect(row.getByTestId('entry-version')).toHaveText('Resume v2');
    const post = state.requests.find((r) => r.method === 'POST' && r.path === '/application-vault')!;
    expect(post.body.userId).toBeUndefined();
    expect(post.body.tenantId).toBeUndefined();
  });

  test('a later resume version does not change the historical record', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.versions[RESUME_ID] = [version(1)];
    await log(page);
    state.versions[RESUME_ID].push(version(2)); // the resume is edited and saved again afterwards
    await page.reload();
    const row = page.getByTestId('vault-list').locator('li').first();
    await expect(row.getByTestId('entry-version')).toHaveText('Resume v1');
    await expect(row.getByTestId('entry-newer')).toContainText('still points to version 1');
  });

  test('a working draft cannot be recorded: guidance when no version is saved, and the API refuses it', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto('/application-vault');
    await page.getByTestId('new-entry').click();
    await expect(page.getByTestId('v-no-versions')).toBeVisible();
    await page.getByTestId('v-employer').fill('Acme');
    await page.getByTestId('save-entry').click();
    await expect(page.locator('ion-toast')).toContainText('Save a version');
    expect(state.requests.some((r) => r.method === 'POST' && r.path === '/application-vault')).toBe(true);
    await expect(page.getByTestId('vault-list')).toHaveCount(0);
  });

  test('validates required fields before calling the API', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.versions[RESUME_ID] = [version(1)];
    await page.goto('/application-vault');
    await page.getByTestId('new-entry').click();
    await page.getByTestId('save-entry').click();
    await expect(page.getByTestId('v-form-error').filter({ hasText: 'Enter the employer' })).toBeVisible();
    expect(state.requests.some((r) => r.method === 'POST' && r.path === '/application-vault')).toBe(false);
  });

  test('stage changes, filters and delete confirmation', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.versions[RESUME_ID] = [version(1)];
    await log(page, 'Acme');
    await log(page, 'Globex');
    await page.getByTestId('vault-list').locator('li').first().getByTestId('entry-stage').selectOption('INTERVIEWING');
    await expect.poll(() => state.requests.some((r) => r.method === 'PATCH' && r.body?.stage === 'INTERVIEWING')).toBe(true);
    await page.getByTestId('filter-stage').selectOption('INTERVIEWING');
    await expect(page.getByTestId('vault-list').locator('li')).toHaveCount(1);
    await page.getByTestId('filter-stage').selectOption('OFFER');
    await expect(page.getByTestId('vault-empty')).toContainText('No matching applications');
    await page.getByTestId('filter-stage').selectOption('');
    await page.getByTestId('filter-employer').fill('acme');
    await expect(page.getByTestId('vault-list').locator('li')).toHaveCount(1);
    await page.getByTestId('entry-delete').click();
    await expect(page.locator('ion-alert')).toHaveCount(1);
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('vault-empty')).toBeVisible();
  });

  test('shows an error banner when the API fails', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.failNext = { path: /^\/application-vault$/, status: 500 };
    await page.goto('/application-vault');
    await expect(page.getByTestId('vault-error')).toBeVisible();
  });

  test('reachable from the hub and no horizontal overflow', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.versions[RESUME_ID] = [version(1)];
    await page.goto('/career-tools');
    await page.getByTestId('tool-vault').click();
    await expect(page).toHaveURL(/\/application-vault$/);
    await log(page);
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(m.doc).toBeLessThanOrEqual(m.win);
  });
});

test.describe('Application vault reminders (doc 33)', () => {
  test('a stale application gets a labelled suggestion; snooze makes it upcoming and done clears it', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.versions[RESUME_ID] = [version(1)];
    await page.goto('/application-vault');
    await page.getByTestId('new-entry').click();
    await page.getByTestId('v-employer').fill('Stale Co');
    await page.getByTestId('v-date').fill('2026-01-01');
    await page.getByTestId('save-entry').click();
    await expect(page.getByTestId('vault-form')).toHaveCount(0);

    const suggested = page.getByTestId('reminder-suggested');
    await expect(suggested).toContainText('Stale Co');
    await expect(suggested).toContainText('Suggestion only');
    await expect(suggested.getByTestId('reminder-done')).toHaveCount(0); // a suggestion is not a recorded follow-up
    await suggested.getByTestId('reminder-snooze').click();
    const upcoming = page.getByTestId('reminder-upcoming');
    await expect(upcoming).toContainText('due in 3 days');
    await upcoming.getByTestId('reminder-done').click();
    await expect(page.getByTestId('vault-reminders')).toHaveCount(0);
    expect(state.requests.some((r) => r.path.endsWith('/snooze') && r.body.days === 3)).toBe(true);
    expect(JSON.stringify(state.requests.filter((r) => r.method !== 'GET').map((r) => r.body))).not.toMatch(/userId|tenantId/);
  });
});
