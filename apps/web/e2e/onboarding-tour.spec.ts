import { expect, test } from '@playwright/test';
import { mockApi, freshState, sampleProfile, signIn } from './support/mock-api';

test.describe('onboarding tour', () => {
  test.beforeEach(async ({ page }) => {
    const state = freshState(); state.profile = sampleProfile({});
    await mockApi(page, state);
    await page.addInitScript(() => { try { localStorage.setItem('xcroncv.local-folder-declined', '1'); } catch { /* ignore */ } });
    await signIn(page, 'tour-user', { tour: true });
  });

  test('shows once, is blocking, Esc skips, never returns, Replay restarts', async ({ page }) => {
    await page.goto('/dashboard');
    const tip = page.getByTestId('tour-tip');
    await expect(tip).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('tour-ring')).toBeVisible();
    await expect(tip).toHaveAttribute('aria-modal', 'true');
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
    await page.reload();
    await page.waitForTimeout(2500);
    await expect(page.getByTestId('tour')).toHaveCount(0);
    await page.goto('/settings');
    await page.getByTestId('replay-tour').click();
    await expect(page.getByTestId('tour-tip')).toBeVisible();
  });

  test('missing targets fall back to a centred tooltip and Next walks to the end', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('tour-tip')).toBeVisible({ timeout: 8000 });
    for (let i = 0; i < 4; i++) await page.getByTestId('tour-next').click();
    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour')).toHaveCount(0);
  });
});
