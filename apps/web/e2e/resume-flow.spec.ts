import { expect, Page, test } from '@playwright/test';
import { closeEditorPanel, openEditorPanel, RESUME_ID, setup } from './support/setup';

/** Ionic keeps previous pages in the DOM (hidden), so address the visible stepper only. */
const stepBtn = (page: Page, k: string) => page.locator(`[data-tour="stepper-step-${k}"] >> visible=true`);

test.describe('Resume creation flow (stepper, template preview, editor panel, first export)', () => {
  test('stepper has stable tour hooks on every step and marks the current one', async ({ page }) => {
    await setup(page);
    await page.goto('/templates');
    await expect(page.locator('[data-tour="resume-stepper"]')).toBeVisible();
    for (const k of ['profile', 'template', 'edit', 'export']) await expect(stepBtn(page, k)).toHaveCount(1);
    await expect(stepBtn(page, 'template')).toHaveAttribute('aria-current', 'step');
    await expect(page.locator('[data-tour="step-template-action"]').first()).toBeVisible();
    // Step 1 is a completed, tappable step: it goes back to the profile.
    await stepBtn(page, 'profile').click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.locator('[data-tour="step-profile-action"]')).toBeVisible();
  });

  test('gallery cards render the template live with dummy data and open a dummy-data preview', async ({ page }) => {
    await setup(page);
    await page.goto('/templates');
    const card = page.getByTestId('template-ats-classic');
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('app-resume-sheet [data-testid="doc-name"]')).toHaveText('Alex Morgan'); // dummy persona, not the signed-in user's profile
    await card.getByTestId('preview-ats-classic').click();
    const dlg = page.getByTestId('template-preview');
    await expect(dlg).toBeVisible();
    await expect(dlg.getByTestId('doc-name')).toHaveText('Alex Morgan');
    await expect(page.getByTestId('sample-note')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
  });

  test('choosing a template from the preview goes straight to the editor (Step 3) with the CV open', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/templates');
    await page.getByTestId('preview-tech-compact').click();
    await page.getByTestId('preview-use').click();
    await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]{36}$/);
    await expect(page.locator('app-resume-editor [data-tour="stepper-step-edit"]')).toHaveAttribute('aria-current', 'step');
    await expect(page.getByTestId('editor-live-preview').getByTestId('doc-name')).toBeVisible();
    expect(state.requests.filter((r) => r.method === 'POST' && r.path === '/resumes')).toHaveLength(1);
  });

  test('choosing a template without a profile sends the user to Step 1', async ({ page }) => {
    await setup(page, { profile: false });
    await page.goto('/templates');
    await page.getByTestId('use-ats-classic').click();
    await expect(page).toHaveURL(/\/profile$/);
  });

  test('editor keeps sections, design and versions in a panel beside (or, on phones, over) the preview', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(`/resumes/${RESUME_ID}`);
    const vp = page.viewportSize()!;
    await openEditorPanel(page);
    const panel = page.getByTestId('side-panel');
    for (const id of ['section-list', 'accent', 'save-version']) await expect(panel.getByTestId(id)).toBeAttached();
    if (vp.width >= 768) {
      const p = (await panel.boundingBox())!;
      const pv = (await page.getByTestId('editor-live-preview').boundingBox())!;
      expect(p.x).toBeGreaterThanOrEqual(pv.x + pv.width - 1); // beside the preview, not above/below it
    } else {
      const p = (await panel.boundingBox())!;
      expect(p.y + p.height).toBeGreaterThan(vp.height - 2); // bottom sheet anchored to the bottom
      await closeEditorPanel(page);
      await expect(panel).toBeHidden();
    }
  });

  test('Continue to export (Step 4) offers a one-tap PDF with defaults and no options dialog', async ({ page }) => {
    const state = await setup(page, { resume: true, firstRunPrompt: true });
    await page.goto(`/resumes/${RESUME_ID}`);
    await page.getByTestId('continue-export').click();
    await expect(page).toHaveURL(/step=export/);
    await expect(stepBtn(page, 'export')).toHaveAttribute('aria-current', 'step');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-tour="step-export-action"] >> visible=true').click()]);
    expect(dl.suggestedFilename()).toBe('Engineer-CV.pdf');
    await expect(page.locator('ion-alert')).toHaveCount(0);
    expect(state.exportCalls).toEqual(['pdf']);
    // Completed Step 3 is tappable to go back.
    await stepBtn(page, 'edit').click();
    await expect(page.getByTestId('editor-live-preview')).toBeVisible();
  });
});
