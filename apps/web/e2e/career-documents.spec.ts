import { expect, test } from '@playwright/test';
import { setup } from './support/setup';

/** Doc 52: drafts from confirmed facts, evidence vs user-authored labels, placeholders, immutable versions, diff, local export. */
test.describe('Career documents (doc 52)', () => {
  async function create(page: import('@playwright/test').Page, type = 'BIO', fill: Record<string, string> = {}) {
    await page.goto('/documents');
    await page.getByTestId('cd-type').selectOption(type);
    for (const [k, v] of Object.entries(fill)) await page.getByTestId(`in-${k}`).fill(v);
    await page.getByTestId('cd-create').click();
    await expect(page.getByTestId('cd-title')).toBeVisible();
  }

  test('empty state, then a bio draft from profile facts with evidence labels', async ({ page }) => {
    await setup(page);
    await page.goto('/documents');
    await expect(page.getByTestId('cd-empty')).toBeVisible();
    await create(page);
    await expect(page.getByTestId('sec-intro').getByTestId('sec-text')).toHaveValue('Ada Lovelace is a Programmer at Babbage & Co.');
    await expect(page.getByTestId('sec-intro').getByTestId('sec-origin')).toHaveText('From your profile');
    await expect(page.getByTestId('sec-intro').getByTestId('sec-evidence')).toContainText('Evidence: Programmer at Babbage & Co');
    await expect(page.getByTestId('sec-skills').getByTestId('sec-evidence')).toContainText('Mathematics');
  });

  test('missing facts are visible placeholders, not invented text; the check reports them', async ({ page }) => {
    await setup(page);
    await create(page, 'THANK_YOU');
    await expect(page.getByTestId('sec-greet').getByTestId('sec-placeholder')).toBeVisible();
    await expect(page.getByTestId('sec-greet').getByTestId('sec-text')).toHaveValue('Dear [add recipient name],');
    await expect(page.getByTestId('sec-greet').getByTestId('sec-evidence')).toContainText('not verified');
    await page.getByTestId('cd-validate').click();
    await expect(page.getByTestId('val-placeholders')).toContainText('1 placeholder');
  });

  test('inputs fill placeholders and the resignation shows a neutral, not-legal-advice notice', async ({ page }) => {
    await setup(page);
    await page.goto('/documents');
    await page.getByTestId('cd-type').selectOption('RESIGNATION');
    await expect(page.getByTestId('cd-disclaimer')).toContainText('not legal');
    await page.getByTestId('in-managerName').fill('Charles');
    await page.getByTestId('cd-create').click();
    await expect(page.getByTestId('sec-greet').getByTestId('sec-text')).toHaveValue('Dear Charles,');
    await expect(page.getByTestId('cd-disclaimer')).toBeVisible();
  });

  test('editing creates a new immutable version; edited text becomes yours and the diff shows the change', async ({ page }) => {
    await setup(page);
    await create(page);
    await expect(page.getByTestId('cd-save')).toBeDisabled();
    await page.getByTestId('sec-intro').getByTestId('sec-text').fill('Ada is a mathematician and programmer.');
    await page.getByTestId('cd-summary').fill('Reworded');
    await page.getByTestId('cd-save').click();
    await expect(page.getByTestId('cd-versions').locator('li')).toHaveCount(2);
    await expect(page.getByTestId('sec-intro').getByTestId('sec-origin')).toHaveText('Written by you');
    await expect(page.getByTestId('sec-intro').getByTestId('sec-evidence')).toContainText('not verified');
    await expect(page.getByTestId('sec-skills').getByTestId('sec-origin')).toHaveText('From your profile');
    await page.getByTestId('ver-diff').click();
    const diff = page.getByTestId('cd-diff');
    await expect(diff).toContainText('changed');
    await expect(diff).toContainText('Before: Ada Lovelace is a Programmer');
    await page.getByTestId('ver-view').first().click();
    await expect(page.getByTestId('cd-old')).toBeVisible();
    await expect(page.getByTestId('sec-intro').getByTestId('sec-text')).toBeDisabled();
    await expect(page.getByTestId('sec-intro').getByTestId('sec-text')).toHaveValue('Ada Lovelace is a Programmer at Babbage & Co.');
  });

  test('evidence check on a complete draft is clean; export downloads a file', async ({ page }) => {
    await setup(page);
    await create(page);
    await page.getByTestId('cd-validate').click();
    await expect(page.getByTestId('cd-validation')).toContainText('linked to your profile');
    await expect(page.getByTestId('cd-validation')).toContainText('Everything is linked and filled in');
    const dl = page.waitForEvent('download');
    await page.getByTestId('cd-export-txt').click();
    expect((await dl).suggestedFilename()).toMatch(/\.txt$/);
    for (const fmt of ['docx', 'pdf']) {
      const d2 = page.waitForEvent('download');
      await page.getByTestId(`cd-export-${fmt}`).click();
      expect((await d2).suggestedFilename()).toMatch(new RegExp(`\\.${fmt}$`));
    }
  });

  test('deleting asks for confirmation', async ({ page }) => {
    await setup(page);
    await create(page);
    await page.getByTestId('cd-delete').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('cd-empty')).toBeVisible();
  });

  test('error banner and no horizontal overflow', async ({ page }) => {
    const state = await setup(page);
    state.failNext = { path: /^\/career-documents$/, status: 500 };
    await page.goto('/documents');
    await expect(page.getByTestId('cd-error')).toBeVisible();
    await create(page);
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(m.doc).toBeLessThanOrEqual(m.win);
  });
});
