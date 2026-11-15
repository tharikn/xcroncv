import { expect, test } from '@playwright/test';
import { RESUME_ID, setup } from './support/setup';

const LONG = 'At Babbage and Co our team had a problem running analyses, so my task was to write the first algorithm. I designed it, built the notation and tested it, which reduced the manual work from days to hours so that the whole team could rely on it every week.';

/** Doc 51: text-only practice, grounded and explained questions, observations about answers, opt-in retention, deletion. */
test.describe('Interview copilot (doc 51)', () => {
  async function start(page: import('@playwright/test').Page, retain = false) {
    await page.goto('/interview-copilot');
    await page.getByTestId('ic-title').fill('Platform Engineer');
    if (retain) await page.getByTestId('ic-retain').check();
    await page.getByTestId('ic-practice').check();
    await page.getByTestId('ic-start').click();
    await expect(page.getByTestId('ic-questions')).toBeVisible();
  }
  const seed = (state: Awaited<ReturnType<typeof setup>>) => { state.versions[RESUME_ID] = [{ id: 'v1', versionNumber: 1, changeSummary: null, createdAt: '2026-01-02T10:00:00.000Z' }]; };

  test('without a resume it explains what to do', async ({ page }) => {
    await setup(page);
    await page.goto('/interview-copilot');
    await expect(page.getByTestId('ic-no-resume')).toBeVisible();
  });

  test('needs a saved version; validates and requires the practice-only confirmation', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto('/interview-copilot');
    await expect(page.getByTestId('ic-no-version')).toBeVisible();
    seed(state);
    await page.reload();
    await page.getByTestId('ic-start').click();
    await expect(page.getByTestId('ic-form-error').filter({ hasText: 'role you are practising' })).toBeVisible();
    await expect(page.getByTestId('ic-form-error').filter({ hasText: 'practice only' })).toBeVisible();
  });

  test('every question explains why it was chosen and a weak spot is flagged honestly', async ({ page }) => {
    const state = await setup(page, { resume: true }); seed(state);
    await start(page);
    await expect(page.getByTestId('ic-notice')).toContainText('Practice only');
    await expect(page.getByTestId('q-why').first()).toContainText('Why this question');
    await expect(page.getByTestId('q-q-g1')).toContainText('Possible weak spot');
    await expect(page.getByTestId('q-q-g1')).toContainText('does not mention it');
  });

  test('feedback describes the answer, not the person, and a summary rates no one', async ({ page }) => {
    const state = await setup(page, { resume: true }); seed(state);
    await start(page);
    const q = page.getByTestId('q-q-recent');
    await q.getByTestId('q-answer').fill('I did stuff.');
    await q.getByTestId('q-submit').click();
    await expect(q.getByTestId('dim-status').first()).toHaveText('Could improve');
    await q.getByTestId('q-answer').fill(LONG);
    await q.getByTestId('q-submit').click();
    await expect(q.getByTestId('dim-status').first()).toHaveText('Looks strong');
    await page.getByTestId('ic-summary').click();
    const panel = page.getByTestId('ic-summary-panel');
    await expect(panel).toContainText('1 of 2 questions answered');
    await expect(panel).toContainText('not a rating of you');
    await expect(panel).not.toContainText(/score|confidence level/i);
  });

  test('answer text is not retained unless opted in, and turning retention off wipes it', async ({ page }) => {
    const state = await setup(page, { resume: true }); seed(state);
    await start(page);
    const q = page.getByTestId('q-q-recent');
    await q.getByTestId('q-answer').fill(LONG);
    await q.getByTestId('q-submit').click();
    await expect(q.getByTestId('dim-status').first()).toBeVisible();
    await page.getByTestId('ic-back').click();
    await page.getByTestId('ic-open').click();
    await expect(page.getByTestId('q-q-recent').getByTestId('q-answer')).toHaveValue('');
    await expect(page.getByTestId('ic-retain-toggle')).not.toBeChecked();
    await page.getByTestId('ic-retain-toggle').check();
    await expect(page.getByTestId('ic-retain-toggle')).toBeChecked();
    await page.getByTestId('q-q-recent').getByTestId('q-answer').fill(LONG);
    await page.getByTestId('q-q-recent').getByTestId('q-submit').click();
    await expect(page.getByTestId('q-q-recent').getByTestId('dim-status').first()).toBeVisible();
    await page.getByTestId('ic-back').click();
    await page.getByTestId('ic-open').click();
    await expect(page.getByTestId('q-q-recent').getByTestId('q-answer')).toHaveValue(LONG);
    await page.getByTestId('ic-retain-toggle').uncheck();
    await expect(page.getByTestId('ic-retain-toggle')).not.toBeChecked();
    await page.getByTestId('ic-back').click();
    await page.getByTestId('ic-open').click();
    await expect(page.getByTestId('q-q-recent').getByTestId('q-answer')).toHaveValue('');
  });

  test('deleting a session asks first', async ({ page }) => {
    const state = await setup(page, { resume: true }); seed(state);
    await start(page);
    await page.getByTestId('ic-delete').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('ic-empty')).toBeVisible();
  });

  test('error banner and no horizontal overflow', async ({ page }) => {
    const state = await setup(page, { resume: true }); seed(state);
    state.failNext = { path: /^\/interview-copilot\/sessions$/, status: 500 };
    await page.goto('/interview-copilot');
    await expect(page.getByTestId('ic-error')).toBeVisible();
    await start(page);
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(m.doc).toBeLessThanOrEqual(m.win);
  });
});
