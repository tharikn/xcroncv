import { expect, Page, test } from '@playwright/test';
import { setup } from './support/setup';

const json = (name = 'export.json', body = '{"fullName":"Ada"}') => ({ name, mimeType: 'application/json', buffer: Buffer.from(body) });
const row = (page: Page, label: string) => page.getByTestId(/^ci-field-/).filter({ hasText: label });
const upload = async (page: Page, file = json()) => { await page.goto('/career-imports'); await page.getByTestId('ci-file').setInputFiles(file); await expect(page.getByTestId('ci-review')).toBeVisible(); };
const writes = (state: { requests: Array<{ method: string; path: string }> }) => state.requests.filter((r) => ['PUT', 'PATCH'].includes(r.method) && r.path.startsWith('/career-profile'));

test.describe('Module 43 - Import career data', () => {
  test('requires sign-in and is reachable from the Career tools hub', async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto('/career-imports');
    await expect(page).toHaveURL(/\/login/);
    await setup(page);
    await page.goto('/career-tools');
    await page.getByTestId('tool-career-imports').click();
    await expect(page).toHaveURL(/\/career-imports$/);
    await expect(page.getByTestId('ci-upload')).toContainText('not stored');
    await expect(page.getByTestId('ci-upload')).toContainText('export your data');
  });

  test('stages a file as unconfirmed items with provenance and changes nothing', async ({ page }) => {
    const state = await setup(page);
    const before = JSON.stringify(state.profile);
    await upload(page);
    await expect(page.getByTestId('ci-counts')).toContainText('2 new, 2 already in your profile, 2 differ');
    await expect(row(page, 'Rust').getByTestId('ci-class')).toHaveText('New to your profile');
    await expect(row(page, 'location: London').getByTestId('ci-class')).toHaveText('Already in your profile');
    await expect(row(page, 'Programmer at Babbage').getByTestId('ci-class')).toHaveText('Differs from your profile');
    await expect(row(page, 'Rust')).toContainText('Source: skill #5');
    await expect(row(page, 'Rust')).toContainText('parser career-import-1.0.0');
    for (const box of await page.getByTestId('ci-include').all()) await expect(box).not.toBeChecked();
    await expect(page.getByTestId('ci-preview')).toBeDisabled();
    expect(JSON.stringify(state.profile)).toBe(before);
    expect(writes(state)).toHaveLength(0);
  });

  test('select new items, preview, merge, then undo', async ({ page }) => {
    const state = await setup(page);
    await upload(page);
    await page.getByTestId('ci-select-new').click();
    await page.getByTestId('ci-preview').click();
    await expect(page.getByTestId('ci-plan-summary')).toHaveText('2 to add, 0 to replace, 0 skipped.');
    await expect(page.getByTestId('ci-change')).toHaveCount(2);
    expect(state.profile.skills.map((s: any) => s.name)).not.toContain('Rust'); // preview wrote nothing
    await page.getByTestId('ci-confirm').click();
    await expect(page.getByTestId('ci-done-summary')).toContainText('2 added, 0 replaced, 0 skipped');
    await expect(row(page, 'Rust').getByTestId('ci-merged')).toHaveText('Added to your profile');
    expect(state.profile.skills.map((s: any) => s.name)).toContain('Rust');
    expect(state.profile.experiences).toHaveLength(2);
    await page.getByTestId('ci-undo').click();
    await expect(page.getByTestId('ci-merge')).toBeVisible();
    expect(state.profile.skills.map((s: any) => s.name)).not.toContain('Rust');
    expect(state.profile.experiences).toHaveLength(1);
  });

  test('a conflict blocks the merge until you decide; profile fields cannot "keep both"', async ({ page }) => {
    const state = await setup(page);
    await upload(page);
    await row(page, 'phone:').getByTestId('ci-include').check();
    await row(page, 'Programmer at Babbage').getByTestId('ci-include').check();
    await page.getByTestId('ci-preview').click();
    await expect(page.getByTestId('ci-unresolved')).toContainText('2 differences still need a decision');
    await expect(page.getByTestId('ci-confirm')).toBeDisabled();
    const phone = row(page, 'phone:').getByTestId('ci-conflict');
    await expect(phone).toContainText('Phone: yours "+44 20 7946 0000", imported "+44 20 7946 1111"');
    await expect(phone.getByTestId('ci-choice-keep_both')).toHaveCount(0);
    await expect(row(page, 'Programmer at Babbage').getByTestId('ci-choice-keep_both')).toHaveCount(1);
    await expect(page.getByRole('group', { name: /Decide: phone:/ })).toBeVisible();
    await phone.getByTestId('ci-choice-use_imported').check();
    await row(page, 'Programmer at Babbage').getByTestId('ci-choice-keep_existing').check();
    await page.getByTestId('ci-preview').click();
    await expect(page.getByTestId('ci-plan-summary')).toHaveText('0 to add, 1 to replace, 1 skipped.');
    await expect(page.getByTestId('ci-unresolved')).toHaveCount(0);
    await page.getByTestId('ci-confirm').click();
    await expect(page.getByTestId('ci-done')).toBeVisible();
    expect(state.profile.phone).toBe('+44 20 7946 1111');
    expect(state.profile.experiences[0].isCurrent).toBe(true); // existing kept
  });

  test('duplicates are skipped even when included', async ({ page }) => {
    const state = await setup(page);
    await upload(page);
    await row(page, 'location: London').getByTestId('ci-include').check();
    await row(page, 'Rust').getByTestId('ci-include').check();
    await page.getByTestId('ci-preview').click();
    await expect(page.getByTestId('ci-plan-summary')).toHaveText('1 to add, 0 to replace, 1 skipped.');
    await expect(page.getByTestId('ci-plan')).toContainText('Already in your profile');
    await page.getByTestId('ci-confirm').click();
    await expect(page.getByTestId('ci-done-summary')).toContainText('1 added');
    expect(state.profile.skills.filter((s: any) => /rust/i.test(s.name))).toHaveLength(1);
  });

  test('shows file problems clearly and never leaves the upload step', async ({ page }) => {
    await setup(page);
    await page.goto('/career-imports');
    await page.getByTestId('ci-file').setInputFiles({ name: 'cv.doc', mimeType: 'application/msword', buffer: Buffer.from('x') });
    await expect(page.getByTestId('ci-error')).toContainText('Choose a PDF, DOCX, JSON or CSV file');
    await page.getByTestId('ci-file').setInputFiles({ name: 'big.json', mimeType: 'application/json', buffer: Buffer.alloc(1024 * 1024 + 1) });
    await expect(page.getByTestId('ci-error')).toContainText('too large');
    await page.getByTestId('ci-file').setInputFiles(json('x.json', 'MOCK-UNSUPPORTED'));
    await expect(page.getByTestId('ci-error')).toContainText('Only PDF, DOCX, JSON and CSV');
    await page.getByTestId('ci-file').setInputFiles(json('y.json', 'MOCK-BAD'));
    await expect(page.getByTestId('ci-error')).toContainText('not valid JSON');
    await expect(page.getByTestId('ci-review')).toHaveCount(0);
  });

  test('shows parser warnings, keeps imports in a list and discards only after confirmation', async ({ page }) => {
    await setup(page);
    await upload(page, json('w.csv', 'type,name MOCK-WARN'));
    await expect(page.getByTestId('ci-warning')).toContainText('unknown type; skipped');
    await expect(page.getByTestId('ci-review')).toContainText('CSV import');
    await page.getByTestId('ci-back').click();
    await expect(page.getByTestId('ci-recent')).toContainText('CSV import, 6 items, ready to review');
    await page.getByTestId('ci-open').click();
    await expect(page.getByTestId('ci-review')).toBeVisible();
    await page.getByTestId('ci-discard').click();
    await expect(page.getByTestId('ci-review')).toBeVisible(); // asks first
    await page.getByTestId('ci-discard-yes').click();
    await expect(page.getByTestId('ci-upload')).toBeVisible();
    await expect(page.getByTestId('ci-recent')).toHaveCount(0);
  });

  test('an unconfirmed import can be deleted from the list', async ({ page }) => {
    await setup(page);
    await upload(page);
    await page.getByTestId('ci-back').click();
    await page.getByTestId('ci-delete-recent').click();
    await expect(page.getByTestId('ci-recent')).toHaveCount(0);
  });
});
