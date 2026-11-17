import { expect, test } from '@playwright/test';
import { setup } from './support/setup';

/**
 * Docs 06/38: the assistant is a console inside the shell, not a page.
 * It opens above the FAB dock, keeps the two floating actions apart, and falls
 * back to guided answers that never leave the platform.
 */
test.describe('Floating assistant console (docs 06, 38)', () => {
  test('keeps the floating buttons apart and answers in place without navigating', async ({ page }) => {
    const state = await setup(page);
    state.helpChat = { enabled: true };
    await page.goto('/dashboard');

    const chatFab = page.getByTestId('fab-chatbot');
    await expect(chatFab).toBeVisible();

    const ai = await page.getByTestId('fab-ai-resume').boundingBox();
    const chat = await chatFab.boundingBox();
    expect(ai).toBeTruthy();
    expect(chat).toBeTruthy();
    expect(chat!.y - (ai!.y + ai!.height)).toBeGreaterThan(8);

    await chatFab.click();
    const panel = page.locator('#xcron-help');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Guided answers');
    expect(new URL(page.url()).pathname).toBe('/dashboard');

    await panel.getByRole('button', { name: 'What makes a resume ATS-friendly?' }).click();
    await expect(panel).toContainText('standard section titles');
    expect(new URL(page.url()).pathname).toBe('/dashboard');

    await panel.getByRole('button', { name: 'Close help chat' }).click();
    await expect(panel).toBeHidden();
  });

  test('hides the button when the assistant is switched off', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard');
    await expect(page.getByTestId('fab-ai-resume')).toBeVisible();
    await expect(page.getByTestId('fab-chatbot')).toHaveCount(0);
  });

  test('offers the AI opt-in link when external answers need consent', async ({ page }) => {
    const state = await setup(page);
    state.helpChat = { enabled: true, aiOptInRequired: true };
    await page.goto('/dashboard');
    await page.getByTestId('fab-chatbot').click();
    const panel = page.locator('#xcron-help');
    await expect(panel.getByRole('link', { name: 'Turn on AI answers' })).toHaveAttribute('href', '/ai');
  });
});
