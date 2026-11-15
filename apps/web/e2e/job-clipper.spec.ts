import { expect, test } from '@playwright/test';
import { setup } from './support/setup';

const DESC = 'We need an engineer who knows Docker and Kubernetes, with SQL experience and AWS exposure for our platform team.';

/** Doc 45: explicit capture, review before save, sanitised text, deletable, revocable extension sessions. */
test.describe('Job clipper (doc 45)', () => {
  async function fill(page: import('@playwright/test').Page, over: Record<string, string> = {}) {
    await page.goto('/clips');
    await page.getByTestId('new-clip').click();
    await page.getByTestId('clip-title').fill(over['title'] ?? 'Platform Engineer');
    await page.getByTestId('clip-company').fill(over['company'] ?? 'Acme');
    if (over['url']) await page.getByTestId('clip-url').fill(over['url']);
    await page.getByTestId('clip-desc').fill(over['desc'] ?? DESC);
    await page.getByTestId('clip-review').click();
  }

  test('empty state; nothing is sent until the review is confirmed', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/clips');
    await expect(page.getByTestId('clips-empty')).toBeVisible();
    await fill(page);
    await expect(page.getByTestId('clip-review-panel')).toBeVisible();
    await expect(page.getByTestId('clip-save')).toBeDisabled();
    expect(state.requests.some((r) => r.method === 'POST' && r.path === '/clipped-jobs')).toBe(false);
    await page.getByTestId('clip-confirm').check();
    await page.getByTestId('clip-save').click();
    await expect(page.getByTestId('clip-list').locator('li')).toHaveCount(1);
    const post = state.requests.find((r) => r.method === 'POST' && r.path === '/clipped-jobs')!;
    expect(post.body.reviewed).toBe(true);
    expect(post.body.idempotencyKey).toBeTruthy();
  });

  test('HTML is stripped in the review so the user sees exactly what is stored', async ({ page }) => {
    await setup(page);
    await fill(page, { desc: `<div>${DESC}<script>alert(1)</script></div>` });
    await expect(page.getByTestId('rev-desc')).not.toContainText('script');
    await expect(page.getByTestId('rev-desc')).not.toContainText('<div>');
    await expect(page.getByTestId('rev-desc')).toContainText('Docker');
  });

  test('validates the form and a bad link before review', async ({ page }) => {
    await setup(page);
    await page.goto('/clips');
    await page.getByTestId('new-clip').click();
    await page.getByTestId('clip-url').fill('javascript:alert(1)');
    await page.getByTestId('clip-review').click();
    const errs = page.getByTestId('clip-form-error');
    await expect(errs.filter({ hasText: 'job title' })).toBeVisible();
    await expect(errs.filter({ hasText: 'company' })).toBeVisible();
    await expect(errs.filter({ hasText: 'job description' })).toBeVisible();
    await expect(errs.filter({ hasText: 'http://' })).toBeVisible();
    await expect(page.getByTestId('clip-review-panel')).toHaveCount(0);
  });

  test('back and edit keeps the text; saving the same job twice does not duplicate it', async ({ page }) => {
    await setup(page);
    await fill(page);
    await page.getByTestId('clip-back').click();
    await expect(page.getByTestId('clip-title')).toHaveValue('Platform Engineer');
    await page.getByTestId('clip-review').click();
    await page.getByTestId('clip-confirm').check();
    await page.getByTestId('clip-save').click();
    await expect(page.getByTestId('clip-list').locator('li')).toHaveCount(1);
    await fill(page);
    await page.getByTestId('clip-confirm').check();
    await page.getByTestId('clip-save').click();
    await expect(page.getByTestId('clip-list').locator('li')).toHaveCount(1);
  });

  test('analysis separates terms recorded in the profile from those that are not, with no score', async ({ page }) => {
    await setup(page, { profile: { skills: [{ id: 's1', name: 'Docker' }] } });
    await fill(page, { url: 'https://jobs.example.com/p/1' });
    await page.getByTestId('clip-confirm').check();
    await page.getByTestId('clip-save').click();
    await page.getByTestId('clip-open').click();
    await page.getByTestId('clip-analyze').click();
    const a = page.getByTestId('analysis');
    await expect(a).toContainText('Docker: recorded in your profile');
    await expect(a).toContainText('Kubernetes: not recorded in your profile');
    await expect(a).toContainText('not a match score');
    await expect(page.getByTestId('clip-list')).toContainText('jobs.example.com');
  });

  test('archive and delete (with confirmation)', async ({ page }) => {
    await setup(page);
    await fill(page);
    await page.getByTestId('clip-confirm').check();
    await page.getByTestId('clip-save').click();
    await page.getByTestId('clip-open').click();
    await page.getByTestId('clip-archive').click();
    await expect(page.getByTestId('clip-status').first()).toHaveText('Archived');
    await page.getByTestId('clip-delete').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('clips-empty')).toBeVisible();
  });

  test('extension sessions are short-lived and revocable', async ({ page }) => {
    await setup(page);
    await page.goto('/clips');
    await expect(page.getByTestId('ext-empty')).toBeVisible();
    await page.getByTestId('ext-new').click();
    await expect(page.getByTestId('ext-state')).toHaveText('ACTIVE');
    await page.getByTestId('ext-revoke').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByTestId('ext-state')).toHaveText('REVOKED');
    await expect(page.getByTestId('ext-panel')).toContainText('only when you click Save Job');
  });

  test('error banner and no horizontal overflow', async ({ page }) => {
    const state = await setup(page);
    state.failNext = { path: /^\/clipped-jobs$/, status: 500 };
    await page.goto('/clips');
    await expect(page.getByTestId('clip-error')).toBeVisible();
    await fill(page, { title: 'A very long job title '.repeat(8), url: `https://jobs.example.com/${'segment-'.repeat(30)}` });
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(m.doc).toBeLessThanOrEqual(m.win);
  });
});
