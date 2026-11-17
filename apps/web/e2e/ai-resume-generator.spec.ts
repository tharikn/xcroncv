import { expect, test } from '@playwright/test';
import { setup } from './support/setup';

/** Two-step JD generator: one input, then both documents. Template and layout stay deterministic. */
test.describe('AI Resume generator page', () => {
  test('shows the hero, step rail and only enables generation for a real posting', async ({ page }) => {
    await setup(page);
    await page.goto('/ai-resume-generator');

    await expect(page.getByTestId('ai-resume-step1')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('AI Resume Generator');
    await expect(page.getByText('ATS Optimized')).toBeVisible();

    const generate = page.getByTestId('ai-resume-generate');
    await expect(generate).toBeDisabled();

    await page.getByTestId('ai-resume-jd').fill('x'.repeat(49));
    await expect(generate).toBeDisabled();

    await page.getByTestId('ai-resume-jd').fill('Senior backend engineer owning billing and platform reliability.');
    await expect(generate).toBeEnabled();

    await page.getByRole('button', { name: 'Upload file' }).click();
    await expect(page.getByTestId('ai-resume-upload')).toBeVisible();
    await expect(generate).toBeDisabled();
  });

  test('keeps the page inside the viewport on a phone', async ({ page }) => {
    await setup(page);
    await page.goto('/ai-resume-generator');
    await expect(page.getByTestId('ai-resume-step1')).toBeVisible();
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(m.doc).toBeLessThanOrEqual(m.win);
  });
});
