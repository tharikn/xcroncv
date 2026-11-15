import { expect, test } from '@playwright/test';
import { RESUME_ID, setup } from './support/setup';

/** Doc 32: portal job context, evidence-mapped suggestions (no invention), exact version recorded, host owns the lifecycle. */
test.describe('Job portal integration (doc 32)', () => {
  async function addJob(page: import('@playwright/test').Page) {
    await page.goto('/portal-jobs');
    await page.getByTestId('new-pjob').click();
    await page.getByTestId('pj-ext').fill('job-77');
    await page.getByTestId('pj-title').fill('Platform Engineer');
    await page.getByTestId('pj-company').fill('Acme');
    await page.getByTestId('pj-req').fill('Algorithms, Terraform');
    await page.getByTestId('pj-desc').fill('Run our Docker and Kubernetes platform with strong algorithms knowledge.');
    await page.getByTestId('pj-consent').check();
    await page.getByTestId('pj-save').click();
    await expect(page.getByTestId('pjob-list').locator('li')).toHaveCount(1);
  }

  test('empty state, validation, consent and saving a job', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto('/portal-jobs');
    await expect(page.getByTestId('pj-empty')).toBeVisible();
    await page.getByTestId('new-pjob').click();
    await page.getByTestId('pj-save').click();
    for (const t of ['job title', 'company', 'job description', 'Tick the box']) await expect(page.getByTestId('pj-form-error').filter({ hasText: t })).toBeVisible();
    expect(state.requests.some((r) => r.method === 'PUT' && r.path === '/portal/job-contexts')).toBe(false);
    await addJob(page);
    const put = state.requests.find((r) => r.method === 'PUT' && r.path === '/portal/job-contexts')!;
    expect(put.body.consent).toBe(true);
  });

  test('suggestions point at your own facts and never invent; unsupported requirements are flagged, not offered', async ({ page }) => {
    await setup(page, { resume: true });
    await addJob(page);
    await page.getByTestId('pj-open').click();
    await page.getByTestId('pj-propose').click();
    await expect(page.getByTestId('pj-notice')).toContainText('change nothing until you edit');
    await expect(page.getByTestId('pj-items')).toContainText('Emphasise a skill: Algorithms');
    await expect(page.getByTestId('pj-items')).toContainText('Based on: Algorithms');
    const none = page.getByTestId('pj-items').locator('li', { hasText: 'Terraform' });
    await expect(none).toContainText('No evidence recorded');
    await expect(none).toContainText('only if it is true');
    await expect(none.getByTestId('item-accept')).toHaveCount(0); // nothing to accept: no invented content
  });

  test('accept and reject per suggestion', async ({ page }) => {
    await setup(page, { resume: true });
    await addJob(page);
    await page.getByTestId('pj-open').click();
    await page.getByTestId('pj-propose').click();
    const first = page.getByTestId('pj-items').locator('li').first();
    await expect(first.getByTestId('item-decision')).toHaveText('To review');
    await first.getByTestId('item-accept').click();
    await expect(first.getByTestId('item-decision')).toHaveText('Accepted');
    await first.getByTestId('item-reject').click();
    await expect(first.getByTestId('item-decision')).toHaveText('Rejected');
  });

  test('recording needs a saved version and confirmation, and shows the exact version', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await addJob(page);
    await page.getByTestId('pj-open').click();
    await expect(page.getByTestId('pj-no-version')).toBeVisible();
    state.versions[RESUME_ID] = [{ id: 'v1', versionNumber: 1, changeSummary: 'Initial', createdAt: '2026-01-02T10:00:00.000Z' }, { id: 'v2', versionNumber: 2, changeSummary: 'Tailored', createdAt: '2026-01-03T10:00:00.000Z' }];
    await page.getByTestId('pj-close').click();
    await page.getByTestId('pj-open').click();
    await expect(page.getByTestId('pj-record')).toBeDisabled();
    await page.getByTestId('pj-version').selectOption({ index: 1 });
    await page.getByTestId('pj-record-confirm').check();
    await page.getByTestId('pj-record').click();
    await expect(page.getByTestId('app-line').first()).toContainText('Platform Engineer');
    await expect(page.getByTestId('app-line').first()).toContainText('resume version 1');
    await page.getByTestId('app-status').first().fill('Interview');
    await page.getByTestId('app-status').first().blur();
    await expect(page.getByTestId('app-status').first()).toHaveValue('Interview');
  });

  test('delete asks first and removes recorded applications', async ({ page }) => {
    await setup(page, { resume: true });
    await addJob(page);
    await page.getByTestId('pj-open').click();
    await page.getByTestId('pj-delete').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('pj-empty')).toBeVisible();
  });

  test('error banner and no horizontal overflow', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.failNext = { path: /^\/portal\/job-contexts$/, status: 500 };
    await page.goto('/portal-jobs');
    await expect(page.getByTestId('pj-error')).toBeVisible();
    await addJob(page);
    await page.getByTestId('pj-open').click();
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(m.doc).toBeLessThanOrEqual(m.win);
  });
});
