import { expect, test } from '@playwright/test';
import { RESUME_ID, setup } from './support/setup';

const file = (name = 'cv.docx', body = 'PK mock docx') => ({ name, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(body) });

test.describe('Module 07 - Parsing test', () => {
  test('requires sign-in', async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto('/parsing-test');
    await expect(page).toHaveURL(/\/login/);
  });

  test('is reachable from the career tools hub', async ({ page }) => {
    await setup(page);
    await page.goto('/career-tools');
    await page.getByTestId('tool-parsing-test').click();
    await expect(page).toHaveURL(/\/parsing-test$/);
    await expect(page.getByRole('heading', { name: 'Parsing test', level: 1 })).toBeVisible();
  });

  test('tests a created resume: score, indicators, findings, parsers and a one-time preview', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto('/parsing-test');
    await expect(page.getByTestId('pt-resume')).toHaveValue(RESUME_ID);
    await page.getByTestId('pt-format').selectOption('docx');
    await page.getByTestId('pt-run').click();
    const post = state.requests.find((r) => r.method === 'POST' && r.path === `/resumes/${RESUME_ID}/parsing-tests`)!;
    expect(post.body).toEqual({ format: 'docx' });
    expect(post.auth).toMatch(/^Bearer /);

    await expect(page.getByTestId('pt-score')).toContainText('92');
    await expect(page.getByTestId('pt-score-note')).toContainText('separate from the quality and job match');
    await expect(page.getByTestId('ind-textExtracted')).toContainText('Text extracted: Good');
    await expect(page.getByTestId('ind-layout')).toContainText('Layout: Check'); // state is conveyed in words, not just colour
    await expect(page.getByTestId('adapter-pdf-geometric-v1')).toContainText('PDF layout-aware text extractor');
    await expect(page.getByTestId('finding-PT-FLD-003')).toContainText('did not detect your phone number');
    await expect(page.getByTestId('finding-PT-FLD-003')).toContainText('Expected: +44 20 7946 0000');
    await expect(page.getByTestId('finding-PT-LAY-004')).toContainText('Suggestion: Put your name');
    await expect(page.getByTestId('pt-preview')).toContainText('not stored');
    await expect(page.getByText('do not emulate any employer ATS')).toBeVisible();
  });

  test('history lists earlier tests; reopening shows the report without the preview; delete asks first', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto('/parsing-test');
    await page.getByTestId('pt-run').click();
    await expect(page.getByTestId('pt-score')).toBeVisible();
    const hist = page.getByTestId('pt-history');
    await expect(hist).toContainText('92/100');
    await hist.getByTestId('hist-open').click();
    await expect(page.getByTestId('pt-no-preview')).toBeVisible();
    await expect(page.getByTestId('pt-preview')).toHaveCount(0);

    await hist.getByTestId('hist-delete').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('ion-alert')).toHaveCount(0);
    await expect(hist.getByTestId('hist-open')).toHaveCount(1);
    await hist.getByTestId('hist-delete').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('pt-history')).toHaveCount(0);
  });

  test('uploaded files get diagnostics only: no score and no invented accuracy', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/parsing-test');
    await page.getByTestId('mode-upload').check();
    await page.getByTestId('pt-file').setInputFiles(file());
    await expect(page.getByTestId('pt-report')).toBeVisible();
    await expect(page.getByTestId('pt-no-score')).toBeVisible();
    await expect(page.getByTestId('pt-score')).toHaveCount(0);
    await expect(page.getByTestId('pt-score-note')).toContainText('invented');
    await expect(page.getByTestId('pt-rerun')).toBeDisabled();
    expect(state.requests.some((r) => r.path === '/parsing-tests/upload')).toBe(true);
    // the file name is not echoed anywhere on the page
    await expect(page.getByText('cv.docx')).toHaveCount(0);
  });

  test('upload: client-side checks and server rejection messages', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/parsing-test');
    await page.getByTestId('mode-upload').check();
    await page.getByTestId('pt-file').setInputFiles({ name: 'cv.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
    await expect(page.getByTestId('pt-error')).toContainText('PDF or DOCX');
    expect(state.requests.some((r) => r.path === '/parsing-tests/upload')).toBe(false);
    await page.getByTestId('pt-file').setInputFiles(file('cv.docx', 'MOCK-UNSUPPORTED'));
    await expect(page.getByTestId('pt-error')).toContainText('Only PDF and DOCX');
    await expect(page.getByTestId('pt-report')).toHaveCount(0);
  });

  test('shows a clear message when there are no resumes, and surfaces API failures', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/parsing-test');
    await expect(page.getByTestId('pt-no-resumes')).toBeVisible();
    await expect(page.getByTestId('pt-run')).toBeDisabled();
    state.resumes = [{ id: RESUME_ID, name: 'Engineer CV', templateId: 'ats-classic', templateVersion: 1, status: 'DRAFT', sections: [], overrides: {}, createdAt: '', updatedAt: '' }];
    await page.reload();
    await expect(page.getByTestId('pt-run')).toBeEnabled();
    await page.waitForLoadState('networkidle');
    state.failNext = { path: /parsing-tests/, status: 500 };
    await page.getByTestId('pt-run').click();
    await expect(page.getByTestId('pt-error')).toContainText('Injected failure');
  });

  test('report layout has no horizontal overflow at any device width', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto('/parsing-test');
    await page.getByTestId('pt-run').click();
    await expect(page.getByTestId('pt-report')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
});
