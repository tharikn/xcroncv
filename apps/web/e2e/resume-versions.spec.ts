import { expect, test } from '@playwright/test';
import { RESUME_ID, setup } from './support/setup';

const url = `/resumes/${RESUME_ID}/versions`;

test.describe('Module 28 - Variants and immutable versions', () => {
  test('requires sign-in and is reachable from the resume list', async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto(url);
    await expect(page).toHaveURL(/\/login/);
    await setup(page, { resume: true });
    await page.goto('/resumes');
    await page.getByTestId('versions-resume').click();
    await expect(page).toHaveURL(new RegExp(`/resumes/${RESUME_ID}/versions$`));
    await expect(page.getByTestId('no-versions')).toBeVisible();
  });

  test('saves labelled versions, newest first', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(url);
    await page.getByTestId('snap-label').fill('Acme');
    await page.getByTestId('snap-summary').fill('Sent to Acme');
    await page.getByTestId('snap-create').click();
    await page.getByTestId('snap-create').click();
    await expect(page.getByTestId('version-2')).toBeVisible();
    await expect(page.getByTestId('version-1')).toContainText('Version 1 · Acme');
    await expect(page.getByTestId('version-1')).toContainText('Sent to Acme');
  });

  test('verify reports whether a saved version still matches what was saved', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(url);
    await page.getByTestId('snap-create').click();
    await page.getByTestId('verify').click();
    await expect(page.getByTestId('integrity-1')).toContainText('Unchanged since saved');
  });

  test('compares two versions, and a version with the current resume, at every level', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(url);
    await page.getByTestId('snap-create').click();
    await page.getByTestId('snap-create').click();
    await expect(page.getByTestId('cmp-run')).toBeVisible();
    await page.getByTestId('cmp-run').click();
    const diff = page.getByTestId('diff');
    await expect(diff).toContainText('Version 1 → Version 2');
    await expect(page.getByTestId('diff-counts')).toContainText('Bullets 2');
    await expect(page.getByTestId('diff-items')).toContainText('added bullet: + Led the engine team.');
    await expect(page.getByTestId('diff-items')).toContainText('removed bullet: - Mentored two juniors.');
    await expect(page.getByTestId('diff-skills')).toContainText('Added: Poetry');
    await expect(page.getByTestId('diff-design')).toContainText('accent');
    await page.getByTestId('cmp-from').selectOption('2');
    await page.getByTestId('cmp-to').selectOption('2');
    await page.getByTestId('cmp-run').click();
    await expect(page.getByTestId('diff-identical')).toBeVisible();
    await page.getByTestId('version-2').getByTestId('compare-draft').click();
    await expect(diff).toContainText('Version 2 → Working draft');
  });

  test('evidence-level comparison: new statements without evidence, removed ones, support changes; wording is not an accusation', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(url);
    await page.getByTestId('snap-create').click();
    await page.getByTestId('snap-create').click();
    await page.getByTestId('cmp-run').click();
    await expect(page.getByTestId('ev-summary')).toContainText('1 new statement without full evidence');
    await expect(page.getByTestId('ev-summary')).toContainText('1 removed statement that had none');
    await expect(page.getByTestId('ev-added')).toContainText('added: + Led the engine team.');
    await expect(page.getByTestId('ev-added')).toContainText('No evidence linked');
    await expect(page.getByTestId('ev-removed')).toContainText('removed: - Mentored two juniors.');
    await expect(page.getByTestId('ev-changed')).toContainText('Partly supported → Directly supported');
    await expect(page.getByTestId('diff')).toContainText('does not mean a statement is false');
    await page.getByTestId('cmp-from').selectOption('2');
    await page.getByTestId('cmp-to').selectOption('2');
    await page.getByTestId('cmp-run').click();
    await expect(page.getByTestId('diff-identical')).toBeVisible();
    await expect(page.getByTestId('ev-summary')).toHaveCount(0);
  });

  test('restore adds a new version instead of rewriting history', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(url);
    await page.getByTestId('snap-create').click();
    await page.getByTestId('snap-create').click();
    await page.getByTestId('version-1').getByTestId('restore').click();
    await expect(page.getByTestId('restore-box')).toContainText('Nothing is overwritten');
    await page.getByTestId('restore-layout').check();
    await page.getByTestId('restore-confirm').click();
    await expect(page.getByTestId('version-3')).toContainText('restored from version 1');
    await expect(page.getByTestId('version-1')).toBeVisible();
    await expect(page.getByTestId('version-2')).toBeVisible();
  });

  test('old versions can be exported exactly as saved (local download)', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(url);
    await page.getByTestId('snap-create').click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-v-pdf').click()]);
    expect(dl.suggestedFilename()).toBe('Engineer-CV-v1.pdf');
  });

  test('resume type: one master only, and copies for roles/jobs appear in the family list', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(url);
    await page.getByTestId('variant-kind').selectOption('MASTER');
    await page.getByTestId('variant-save').click();
    await expect(page.getByTestId('variant-badge')).toHaveText('Master resume');
    await page.getByTestId('newvariant-name').fill('Acme backend');
    await page.getByTestId('newvariant-create').click();
    await expect(page.getByTestId('variant-list')).toContainText('Acme backend · Job-specific');
    await expect(page.getByTestId('variant-list')).toContainText('Engineer CV · Master resume');
  });

  test('a second master is refused with a clear message', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(url);
    await page.getByTestId('variant-kind').selectOption('MASTER');
    await page.getByTestId('variant-save').click();
    await page.getByTestId('newvariant-name').fill('Copy');
    await page.getByTestId('newvariant-create').click();
    await expect(page.getByTestId('variant-list')).toContainText('Copy');
    // open the copy's version page via the list of resumes
    await page.goto('/resumes');
    await page.getByTestId('versions-resume').first().click();
    await page.getByTestId('variant-kind').selectOption('MASTER');
    await page.getByTestId('variant-save').click();
    await expect(page.getByTestId('ver-error')).toContainText('already have a master');
  });

  test('errors are shown and the page fits every device width', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(url);
    await page.getByTestId('snap-create').click();
    await expect(page.getByTestId('version-1')).toBeVisible();
    await page.getByTestId('snap-create').click();
    await expect(page.getByTestId('version-2')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    state.failNext = { path: /snapshots/, status: 500 };
    await page.getByTestId('snap-create').click();
    await expect(page.getByTestId('ver-error')).toContainText('Injected failure');
  });
});
