import { expect, test } from '@playwright/test';
import { pstore } from './support/mock-platform-tools';
import { setup } from './support/setup';

/** Doc 44: explainable options, evidence vs gap wording, editable plans, no numbers without a licensed source. */
test.describe('Career path and compensation (doc 44)', () => {
  test('explores options from profile facts with counts, evidence wording and no hiring claims', async ({ page }) => {
    await setup(page);
    await page.goto('/career-path');
    await expect(page.getByTestId('plans-empty')).toBeVisible();
    await page.getByTestId('cp-analyze').click();
    const results = page.getByTestId('cp-results');
    await expect(results).toBeVisible();
    await expect(page.getByTestId('opt-devops-engineer').getByTestId('opt-coverage')).toContainText(/\d of 4 requirements have recorded evidence/);
    await expect(results).toContainText('not that you lack the skill');
    await expect(results).not.toContainText(/probability|likelihood|chance of/i);
    await page.getByTestId('opt-devops-engineer').locator('summary').click();
    await expect(page.getByTestId('opt-devops-engineer')).toContainText('No evidence recorded yet');
  });

  test('a chosen target role is shown first and says why', async ({ page }) => {
    await setup(page);
    await page.goto('/career-path');
    await page.getByTestId('cp-role').selectOption('data-analyst');
    await page.getByTestId('cp-analyze').click();
    await expect(page.getByTestId('opt-data-analyst')).toContainText('You chose this role as your target.');
  });

  test('without a profile it explains what to do instead of inventing data', async ({ page }) => {
    await setup(page, { profile: false });
    await page.goto('/career-path');
    await page.getByTestId('cp-analyze').click();
    await expect(page.getByTestId('cp-no-profile')).toBeVisible();
    await expect(page.getByTestId('cp-results')).toHaveCount(0);
  });

  test('saves an option as a plan whose milestones are editable and tracked', async ({ page }) => {
    await setup(page);
    await page.goto('/career-path');
    await page.getByTestId('cp-role').selectOption('devops-engineer');
    await page.getByTestId('cp-analyze').click();
    await page.getByTestId('opt-devops-engineer').getByTestId('opt-save').click();
    const plan = page.getByTestId('plan-list').locator('li').first();
    await expect(plan.getByTestId('plan-title')).toContainText('Towards DevOps');
    await expect(plan.locator('[data-testid^=ms-]').first()).toBeVisible();
    await expect(plan.getByTestId('plan-progress')).toContainText('0 of');
    await plan.getByTestId('ms-status').first().selectOption('DONE');
    await expect(plan.getByTestId('plan-progress')).toContainText('1 of');
    await plan.getByTestId('ms-date').first().fill('2027-03-31');
    await plan.getByTestId('ms-new').fill('Complete a Kubernetes course');
    await plan.getByTestId('ms-add').click();
    await expect(plan).toContainText('Complete a Kubernetes course');
    await plan.getByTestId('plan-status').selectOption('PAUSED');
    await expect(plan.getByTestId('plan-status')).toHaveValue('PAUSED');
    await plan.getByTestId('ms-remove').last().click();
    await expect(plan).not.toContainText('Complete a Kubernetes course');
  });

  test('deleting a plan asks first', async ({ page }) => {
    await setup(page);
    await page.goto('/career-path');
    await page.getByTestId('cp-analyze').click();
    await page.getByTestId('opt-save').first().click();
    await page.getByTestId('plan-delete').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('plans-empty')).toBeVisible();
  });

  test('compensation shows no figures without a licensed source', async ({ page }) => {
    await setup(page);
    await page.goto('/career-path');
    await expect(page.getByTestId('comp-go')).toBeDisabled();
    await page.getByTestId('comp-role').fill('Backend Engineer');
    await page.getByTestId('comp-location').fill('Germany');
    await page.getByTestId('comp-go').click();
    await expect(page.getByTestId('comp-unavailable')).toContainText('does not estimate pay');
    await expect(page.getByTestId('comp-rows')).toHaveCount(0);
  });

  test('with a source, every figure carries source, geography, currency and date', async ({ page }) => {
    const state = await setup(page);
    pstore(state)['cp'] = { plans: [], compSource: true };
    await page.goto('/career-path');
    await page.getByTestId('comp-role').fill('Backend Engineer');
    await page.getByTestId('comp-go').click();
    const row = page.getByTestId('comp-rows').locator('li').first();
    await expect(row).toContainText('Germany');
    await expect(row).toContainText('EUR');
    await expect(row).toContainText('Licensed Survey 2026');
    await expect(row).toContainText('Mar 1, 2026');
  });

  test('shows an error banner when plans fail to load, and has no horizontal overflow', async ({ page }) => {
    const state = await setup(page);
    state.failNext = { path: /^\/career-paths$/, status: 500 };
    await page.goto('/career-path');
    await expect(page.getByTestId('cp-error')).toBeVisible();
    await page.getByTestId('cp-analyze').click();
    await expect(page.getByTestId('cp-results')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(m.doc).toBeLessThanOrEqual(m.win);
  });
});
