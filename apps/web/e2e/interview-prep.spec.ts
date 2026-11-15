import { expect, Page, test } from '@playwright/test';
import { RESUME_ID, setup } from './support/setup';

/** Doc 35: resume-grounded practice questions, text-only rubric feedback, private and deletable sessions. */
test.describe('Interview preparation (doc 35)', () => {
  async function start(page: Page, focus = '') {
    await page.goto('/interview-prep');
    await page.getByTestId('new-prep').click();
    await page.getByTestId('ip-role').fill('Platform Engineer');
    if (focus) await page.getByTestId('ip-focus').fill(focus);
    await page.getByTestId('create-prep').click();
    await expect(page.getByTestId('prep-heading')).toBeVisible();
  }

  test('empty state, then questions quote the resume and are labelled', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto('/interview-prep');
    await expect(page.getByTestId('ip-empty')).toBeVisible();
    await start(page);
    const grounded = page.locator('[data-testid^="question-"]').filter({ has: page.locator('[data-testid="q-evidence"]') }).first();
    await expect(grounded.getByTestId('q-grounding')).toHaveText('From your resume');
    await expect(grounded.getByTestId('q-evidence')).toContainText('Wrote the first published algorithm.');
    const general = page.locator('[data-testid^="question-"]').filter({ hasText: 'Walk me through your resume' });
    await expect(general.getByTestId('q-grounding')).toHaveText('General knowledge');
    await expect(page.getByTestId('prep-note')).toContainText('never judges voice or appearance');
  });

  test('skills missing from the resume become honest gap questions', async ({ page }) => {
    await setup(page, { resume: true });
    await start(page, 'Terraform');
    const gap = page.getByTestId('group-GAP_PREPARATION');
    await expect(gap).toContainText('Terraform');
    await expect(gap.getByTestId('q-gap')).toContainText('do not imply you did this work');
  });

  test('answer feedback is a rubric, warns about claims not on the resume, and marks practised', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await start(page);
    const q = page.locator('[data-testid^="question-"]').filter({ has: page.locator('[data-testid="q-evidence"]') }).first();
    await expect(q.getByTestId('q-feedback')).toBeDisabled();
    await q.getByTestId('q-answer').fill('When our system was slow my role was to fix it. I used Kafka and Spark, and as a result latency dropped by 40% for all customers.');
    await q.getByTestId('q-feedback').click();
    await expect(q.getByTestId('q-feedback-result')).toBeVisible();
    await expect(q.getByTestId('rating-structure')).toHaveText('Strong');
    await expect(q.getByTestId('unsupported-terms')).toContainText('kafka, spark');
    await expect(q.getByTestId('q-feedback-result')).toContainText('not a score');
    await expect(q.getByTestId('q-practiced')).toBeChecked();
    await expect(page.getByTestId('prep-progress')).toContainText('1 of');
    expect(state.requests.some((r) => r.method === 'POST' && /\/feedback$/.test(r.path))).toBe(true);
  });

  test('uses the chosen saved version', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.versions[RESUME_ID] = [{ id: 'ver-1', versionNumber: 1, changeSummary: null, createdAt: '2026-01-02T10:00:00.000Z' }];
    await page.goto('/interview-prep');
    await page.getByTestId('new-prep').click();
    await page.getByTestId('ip-version').selectOption('ver-1');
    await page.getByTestId('create-prep').click();
    await expect(page.getByTestId('prep-heading')).toBeVisible();
    expect(state.requests.find((r) => r.method === 'POST' && r.path === '/interview-preps')!.body.resumeVersionId).toBe('ver-1');
  });

  test('shows guidance when there is no resume yet', async ({ page }) => {
    await setup(page, { resume: false });
    await page.goto('/interview-prep');
    await page.getByTestId('new-prep').click();
    await expect(page.getByTestId('ip-no-resumes')).toBeVisible();
  });

  test('sessions can be reopened and deleted after confirmation', async ({ page }) => {
    await setup(page, { resume: true });
    await start(page);
    await page.getByTestId('back-preps').click();
    await expect(page.getByTestId('prep-list').locator('li')).toHaveCount(1);
    await page.getByTestId('open-prep').click();
    await page.getByTestId('delete-prep').click();
    await expect(page.locator('ion-alert')).toHaveCount(1);
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('ip-empty')).toBeVisible();
  });

  test('API error banner, hub link and no overflow', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto('/career-tools');
    await page.getByTestId('tool-interview').click();
    await expect(page).toHaveURL(/\/interview-prep$/);
    await start(page, 'Terraform');
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(m.doc).toBeLessThanOrEqual(m.win);
    state.failNext = { path: /^\/interview-preps$/, status: 500 };
    await page.goto('/interview-prep');
    await expect(page.getByTestId('ip-error')).toBeVisible();
  });
});
