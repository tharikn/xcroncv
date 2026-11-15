import { expect, test } from '@playwright/test';
import { setup } from './support/setup';

test.describe('Module 26 - Achievement bank', () => {
  test('requires sign-in and is reachable from the career tools hub', async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto('/career-facts');
    await expect(page).toHaveURL(/\/login/);
    await setup(page);
    await page.goto('/career-tools');
    await page.getByTestId('tool-career-facts').click();
    await expect(page).toHaveURL(/\/career-facts$/);
    await expect(page.getByTestId('facts-empty')).toBeVisible();
  });

  test('quick draft structures only what you wrote; the detected number stays unconfirmed until you confirm it', async ({ page }) => {
    await setup(page);
    await page.goto('/career-facts');
    await page.getByTestId('rough-text').fill('Reduced build time by 35% by caching Docker layers');
    await page.getByTestId('make-draft').click();
    await expect(page.getByTestId('draft-info')).toContainText('only a suggestion until you confirm');
    await page.getByTestId('filter-DRAFT').click();
    const fact = page.getByTestId('fact-list').locator('li').first();
    await expect(fact.getByTestId('fact-status')).toHaveText('Drafts'.slice(0, 5));
    await expect(fact.getByTestId('fact-metric')).toContainText('number not confirmed');

    await fact.getByTestId('fact-confirm').click();
    await fact.getByTestId('do-confirm').click();                       // without ticking the metric box
    await expect(page.getByTestId('facts-error')).toContainText('Confirm the number is accurate');
    await fact.getByTestId('confirm-metric').check();
    await fact.getByTestId('do-confirm').click();
    await page.getByTestId('filter-CONFIRMED').click();
    const confirmed = page.getByTestId('fact-list').locator('li').first();
    await expect(confirmed.getByTestId('fact-status')).toHaveText('Confirmed');
    await expect(confirmed.getByTestId('fact-metric')).toContainText('number confirmed');
  });

  test('too-short notes are rejected before anything is created', async ({ page }) => {
    await setup(page);
    await page.goto('/career-facts');
    await page.getByTestId('rough-text').fill('short');
    await expect(page.getByTestId('make-draft')).toBeDisabled();
  });

  test('the form validates, saves drafts, and will not confirm an unconfirmed number', async ({ page }) => {
    await setup(page);
    await page.goto('/career-facts');
    await page.getByTestId('toggle-form').click();
    await page.getByTestId('save-fact').click();
    await expect(page.getByRole('alert').filter({ hasText: 'Describe what you did' })).toBeVisible();

    await page.getByTestId('f-action').fill('Migrated billing to Kubernetes');
    await page.getByTestId('f-metric-value').fill('99.9%');
    await page.getByTestId('f-metric-label').fill('uptime');
    await page.getByTestId('save-confirm-fact').click();
    await expect(page.getByTestId('facts-error')).toContainText('Confirm the number');
    await page.getByTestId('f-metric-confirm').check();
    await page.getByTestId('save-confirm-fact').click();
    await expect(page.getByTestId('fact-list').getByTestId('fact-status').first()).toHaveText('Confirmed');
  });

  test('skill names are normalised to standard names; unknown names are kept as typed', async ({ page }) => {
    await setup(page);
    await page.goto('/career-facts');
    await page.getByTestId('toggle-form').click();
    await page.getByTestId('f-skills').fill('js, Underwater basket weaving');
    await page.getByTestId('f-action').click();
    await expect(page.getByTestId('f-skills')).toHaveValue('JavaScript, Underwater basket weaving');
    await expect(page.getByTestId('skill-note')).toContainText('Kept as you typed');
  });

  test('edits add revisions; any revision can be restored without losing history', async ({ page }) => {
    await setup(page);
    await page.goto('/career-facts');
    await page.getByTestId('toggle-form').click();
    await page.getByTestId('f-action').fill('First wording');
    await page.getByTestId('save-fact').click();
    const fact = page.getByTestId('fact-list').locator('li').first();
    await fact.getByTestId('fact-edit').click();
    await fact.getByTestId('edit-text').fill('Second wording');
    await fact.getByTestId('edit-save').click();
    await expect(fact.getByTestId('fact-title')).toHaveText('Second wording');
    await fact.getByTestId('fact-history').click();
    await expect(fact.getByTestId('fact-revisions').locator('li')).toHaveCount(2);
    await fact.getByTestId('restore-revision').click();
    await expect(fact.getByTestId('fact-title')).toHaveText('First wording');
    await expect(fact.getByTestId('fact-revisions').locator('li')).toHaveCount(3);
  });

  test('archive hides a fact from the default list and shows it under Archived', async ({ page }) => {
    await setup(page);
    await page.goto('/career-facts');
    await page.getByTestId('toggle-form').click();
    await page.getByTestId('f-action').fill('Old achievement');
    await page.getByTestId('save-fact').click();
    await page.getByTestId('fact-archive').click();
    await expect(page.getByTestId('facts-empty')).toBeVisible();
    await page.getByTestId('filter-ARCHIVED').click();
    await expect(page.getByTestId('fact-title')).toHaveText('Old achievement');
  });

  test('a confirmed fact is copied to the profile only when you choose; the fact itself is untouched', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/career-facts');
    await page.getByTestId('toggle-form').click();
    await page.getByTestId('f-action').fill('Cut deployment time in half');
    await page.getByTestId('save-confirm-fact').click();
    expect(state.requests.some((r) => r.method === 'PUT' && r.path === '/career-profile')).toBe(false);
    const fact = page.getByTestId('fact-list').locator('li').first();
    await fact.getByTestId('fact-use').click();
    await fact.getByTestId('use-confirm').click();
    await expect.poll(() => state.requests.some((r) => r.method === 'PUT' && r.path === '/career-profile')).toBe(true);
    const put = state.requests.find((r) => r.method === 'PUT' && r.path === '/career-profile')!;
    const bullets = put.body.experiences[0].bullets;
    expect(bullets.at(-1)).toMatchObject({ content: 'Cut deployment time in half', isUserConfirmed: true });
    expect(bullets[0].content).toBe('Wrote the first published algorithm.');
  });

  test('delete and delete-all ask for confirmation first', async ({ page }) => {
    await setup(page);
    await page.goto('/career-facts');
    await page.getByTestId('toggle-form').click();
    await page.getByTestId('f-action').fill('Temporary');
    await page.getByTestId('save-fact').click();
    await page.getByTestId('fact-delete').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('ion-alert')).toHaveCount(0);
    await expect(page.getByTestId('fact-title')).toHaveText('Temporary');
    await page.getByTestId('facts-delete-all').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete all' }).click();
    await expect(page.getByTestId('facts-empty')).toBeVisible();
  });

  test('career breaks: add, edit and delete with neutral wording and date validation', async ({ page }) => {
    await setup(page);
    await page.goto('/career-facts');
    await expect(page.getByTestId('breaks')).toContainText('never scored, flagged');
    await expect(page.getByTestId('breaks-empty')).toBeVisible();
    await page.getByTestId('break-save').click();
    await expect(page.getByTestId('break-error')).toContainText('at least a start date or a note');
    await page.getByTestId('break-start').fill('2021-13');
    await page.getByTestId('break-save').click();
    await expect(page.getByTestId('break-error')).toContainText('YYYY or YYYY-MM');
    await page.getByTestId('break-start').fill('2022-05');
    await page.getByTestId('break-end').fill('2021');
    await page.getByTestId('break-save').click();
    await expect(page.getByTestId('break-error')).toContainText('before the start');
    await page.getByTestId('break-end').fill('2022-09');
    await page.getByTestId('break-note').fill('Caring for family');
    await page.getByTestId('break-save').click();
    await expect(page.getByTestId('break-item')).toHaveCount(1);
    await expect(page.getByTestId('break-item')).toContainText('2022-05 to 2022-09 - Caring for family');
    await expect(page.getByTestId('break-error')).toHaveCount(0);
    await page.getByTestId('break-edit').click();
    await expect(page.getByTestId('break-note')).toHaveValue('Caring for family');
    await page.getByTestId('break-end').fill('');
    await page.getByTestId('break-save').click();
    await expect(page.getByTestId('break-item')).toContainText('2022-05 to ongoing');
    await page.getByTestId('break-delete').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('ion-alert')).toHaveCount(0);
    await expect(page.getByTestId('break-item')).toHaveCount(1);
    await page.getByTestId('break-delete').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByTestId('breaks-empty')).toBeVisible();
  });

  test('preferences save and the export is a local download', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/career-facts');
    await page.getByTestId('pref-roles').fill('Backend Engineer, SRE');
    await page.getByTestId('mode-remote').check();
    await page.getByTestId('save-prefs').click();
    await expect.poll(() => state.requests.length).toBeGreaterThan(0);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('facts-export').click()]);
    expect(dl.suggestedFilename()).toBe('career-facts.json');
  });

  test('no horizontal overflow at any device width', async ({ page }) => {
    await setup(page);
    await page.goto('/career-facts');
    await page.getByTestId('toggle-form').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
});
