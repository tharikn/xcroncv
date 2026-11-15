import { expect, test } from '@playwright/test';
import { RESUME_ID, setup } from './support/setup';

const pdf = (name = 'cv.pdf', body = '%PDF-1.4 mock resume') => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(body) });

test.describe('Module 06 - Import (review and confirm)', () => {
  test('requires sign-in', async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto('/import');
    await expect(page).toHaveURL(/\/login/);
  });

  test('profile page links to the importer', async ({ page }) => {
    await setup(page);
    await page.goto('/profile');
    await page.getByTestId('goto-import').click();
    await expect(page).toHaveURL(/\/import$/);
    await expect(page.getByTestId('upload-card')).toContainText('not stored');
  });

  test('rejects unsupported and oversized files before uploading', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/import');
    await page.getByTestId('import-file').setInputFiles({ name: 'cv.doc', mimeType: 'application/msword', buffer: Buffer.from('x') });
    await expect(page.getByTestId('import-error')).toContainText('PDF or DOCX');
    await page.getByTestId('import-file').setInputFiles({ name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
    await expect(page.getByTestId('import-error')).toContainText('5 MB');
    expect(state.requests.some((r) => r.path === '/resume-imports/parse')).toBe(false);
  });

  test('shows the server message when the file is rejected', async ({ page }) => {
    await setup(page);
    await page.goto('/import');
    await page.getByTestId('import-file').setInputFiles(pdf('cv.pdf', 'MOCK-UNSUPPORTED'));
    await expect(page.getByTestId('import-error')).toContainText('Only PDF and DOCX');
    await expect(page.getByTestId('review')).toHaveCount(0);
  });

  test('uploads with the bearer token and shows suggestions with warnings and confidence', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/import');
    await page.getByTestId('import-file').setInputFiles(pdf());
    await expect(page.getByTestId('review')).toBeVisible();
    expect(state.requests.find((r) => r.path === '/resume-imports/parse')!.auth).toMatch(/^Bearer /);
    await expect(page.getByTestId('import-warning')).toContainText('only had a year');
    await expect(page.getByTestId('exp-row')).toHaveCount(2);
    await expect(page.getByTestId('exp-conf').nth(1)).toContainText('low confidence');
    // low-confidence role is not pre-selected
    await expect(page.getByTestId('use-exp').nth(0)).toBeChecked();
    await expect(page.getByTestId('use-exp').nth(1)).not.toBeChecked();
    // the uploaded document was never retained: the mock server has no copy, and the UI keeps none either
    expect(await page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)))).not.toContain('mock resume');
  });

  test('nothing is saved until confirmed; confirm merges only ticked items and never overwrites existing data by default', async ({ page }) => {
    const state = await setup(page); // existing profile: Ada Lovelace
    await page.goto('/import');
    await page.getByTestId('import-file').setInputFiles(pdf());
    await expect(page.getByTestId('review')).toBeVisible();
    expect(state.requests.some((r) => r.method === 'PUT' && r.path === '/career-profile')).toBe(false);

    // differing existing values are NOT pre-selected, and the current value is displayed
    await expect(page.getByTestId('use-fullName')).not.toBeChecked();
    await expect(page.getByTestId('cur-fullName')).toContainText('Ada Lovelace');
    await page.getByTestId('use-skill').nth(1).uncheck(); // drop "Mathematics" (already exists anyway)
    await page.getByTestId('exp-title').first().fill('Rear Admiral (edited)');
    await page.getByTestId('import-confirm').click();
    await expect(page).toHaveURL(/\/profile$/);

    const put = state.requests.find((r) => r.method === 'PUT' && r.path === '/career-profile')!;
    expect(put.body.fullName).toBe('Ada Lovelace');
    expect(put.body.id).toBeUndefined();
    expect(put.body.experiences.map((e: any) => e.employerName)).toEqual(['Babbage & Co', 'US Navy']);
    const navy = put.body.experiences[1];
    expect(navy).toMatchObject({ jobTitle: 'Rear Admiral (edited)', startDate: '2010-03', endDate: '2015-06' });
    expect(navy.bullets[0]).toMatchObject({ content: 'Led language standardisation.', isUserConfirmed: true });
    expect(put.body.skills.map((s: any) => s.name)).toEqual(['Mathematics', 'Algorithms', 'COBOL']);
    expect(put.body.educations.map((e: any) => e.institution)).toEqual(['Home tutored', 'Yale University']);
  });

  test('creates a new profile from an import when none exists', async ({ page }) => {
    const state = await setup(page, { profile: false });
    await page.goto('/import');
    await page.getByTestId('import-file').setInputFiles(pdf());
    await expect(page.getByTestId('use-fullName')).toBeChecked();
    await page.getByTestId('import-confirm').click();
    await expect(page).toHaveURL(/\/profile$/);
    expect(state.profile.fullName).toBe('Grace Hopper');
    expect(state.profile.email).toBe('grace@example.com');
  });

  test('validates before saving (bad date) and when nothing is selected', async ({ page }) => {
    const state = await setup(page, { profile: false });
    await page.goto('/import');
    await page.getByTestId('import-file').setInputFiles(pdf());
    await page.getByTestId('exp-start').first().fill('2010-13');
    await page.getByTestId('import-confirm').click();
    await expect(page.getByTestId('import-errors')).toContainText('YYYY-MM');
    expect(state.requests.some((r) => r.method === 'PUT')).toBe(false);
    for (const box of await page.locator('[data-testid^="use-"]').all()) await box.uncheck();
    await page.getByTestId('import-confirm').click();
    await expect(page.getByTestId('import-errors')).toContainText(/Nothing is selected|required/);
  });

  test('start over returns to the upload step', async ({ page }) => {
    await setup(page);
    await page.goto('/import');
    await page.getByTestId('import-file').setInputFiles(pdf());
    await page.getByTestId('import-cancel').click();
    await expect(page.getByTestId('upload-card')).toBeVisible();
  });

  test('the import screen has no horizontal overflow at any device width', async ({ page }) => {
    await setup(page);
    await page.goto('/import');
    await page.getByTestId('import-file').setInputFiles(pdf());
    await expect(page.getByTestId('review')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('Module 06 - DOCX and XLSX export', () => {
  test('editor exports DOCX and XLSX as local downloads', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(`/resumes/${RESUME_ID}?step=export`);
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-docx').click()]);
    expect(d.suggestedFilename()).toBe('Engineer-CV.docx');
    const [x] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-xlsx').click()]);
    expect(x.suggestedFilename()).toBe('Engineer-CV.xlsx');
    expect(state.exportCalls).toEqual(['docx', 'xlsx']);
  });

  test('preview exports DOCX', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(`/resumes/${RESUME_ID}/preview`);
    await expect(page.getByTestId('sheet')).toBeVisible();
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByTestId('preview-export-docx').click()]);
    expect(d.suggestedFilename()).toBe('Ada-Lovelace.docx'); // preview names files after the resume header
    expect(state.exportCalls).toEqual(['docx']);
  });

  test('export failure shows an error toast', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(`/resumes/${RESUME_ID}?step=export`);
    state.failNext = { path: /export/, status: 500 };
    await page.getByTestId('export-xlsx').click();
    await expect(page.getByText('Injected failure')).toBeVisible();
  });
});
