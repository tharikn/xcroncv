import { expect, test } from '@playwright/test';
import { mockApi, freshState, sampleProfile, sampleResume, signIn, MockState } from './support/mock-api';

const TARGET = '[data-tour="step-profile-action"]';
const LATEST = '22222222-2222-4222-8222-222222222222';

test.describe('onboarding tour', () => {
  let state: MockState;
  test.beforeEach(async ({ page }) => {
    state = freshState(); state.profile = sampleProfile({});
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

  test('guides the user to each page: profile (import & details), templates, editor (text editing first), export', async ({ page }) => {
    state.resumes = [sampleResume({ updatedAt: '2026-01-01T00:00:00.000Z' }), sampleResume({ id: LATEST, name: 'Latest', updatedAt: '2026-06-01T00:00:00.000Z' })];
    await page.goto('/dashboard');
    const tip = page.getByTestId('tour-tip');
    await expect(tip).toContainText('1 of 10', { timeout: 8000 });
    await expect(page).toHaveURL(/\/profile/);
    await page.getByTestId('tour-next').click();
    await expect(tip).toContainText('2 of 10');
    await page.getByTestId('tour-next').click();
    await expect(page).toHaveURL(/\/templates/);
    await expect(tip).toContainText('3 of 10');
    await page.getByTestId('tour-next').click();
    await expect(page).toHaveURL(new RegExp(`/resumes/${LATEST}$`));
    await expect(tip).toContainText('4 of 10');
    await expect(tip).toContainText('Click any text to edit');
    await expect(page.getByTestId('tour-ring')).toBeVisible();
    for (let n = 5; n <= 9; n++) { await page.getByTestId('tour-next').click(); await expect(tip).toContainText(`${n} of 10`); }
    await page.getByTestId('tour-next').click();
    await expect(page).toHaveURL(/step=export/);
    await expect(tip).toContainText('10 of 10');
    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour')).toHaveCount(0);
  });

  test('edit-resume guide: auto on first editor visit, never again on its own, Guide button replays any time', async ({ page }) => {
    state.resumes = [sampleResume({ id: LATEST, updatedAt: '2026-06-01T00:00:00.000Z' })];
    await page.addInitScript(() => { try { if (!sessionStorage.getItem('e2e.tour.seed')) { sessionStorage.setItem('e2e.tour.seed', '1'); localStorage.setItem('xcroncv.tour.done.tour-user', '1'); } } catch { /* ignore */ } });
    await page.goto(`/resumes/${LATEST}`);
    const tip = page.getByTestId('tour-tip');
    await expect(tip).toContainText('Click any text to edit', { timeout: 10000 });
    await expect(tip).toContainText('1 of 6');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tour')).toHaveCount(0);
    await page.reload();
    await page.waitForTimeout(3000);
    await expect(page.getByTestId('tour')).toHaveCount(0);
    await page.getByTestId('editor-guide').click();
    await expect(tip).toContainText('1 of 6');
    await page.getByTestId('tour-next').click();
    await expect(tip).toContainText('Undo, zoom and fit');
  });

  test('without a resume the editor steps are skipped and the tour ends after templates', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('tour-tip')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('tour-next').click();
    await expect(page).toHaveURL(/\/templates/);
    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour')).toHaveCount(0, { timeout: 8000 });
  });

  test('clicking the highlighted control passes through and advances to step 3', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/profile/, { timeout: 8000 });
    // Advance past step 1 (import) to step 2 (profile save/continue action)
    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour-ring')).toBeVisible();
    await page.locator(TARGET).click();
    await expect(page).toHaveURL(/\/templates/);
    await expect(page.getByTestId('tour-tip')).toContainText('3 of', { timeout: 5000 });
  });

  test('the rest of the screen is blocked while the tour is active', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('tour-ring')).toBeVisible({ timeout: 8000 });
    await expect(page).toHaveURL(/\/profile/);
    const box = await page.locator('[data-tour="nav-templates"]').boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(600);
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByTestId('tour-tip')).toContainText('1 of');
  });

  test('Tab is trapped inside the dialog and Enter advances', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('tour-tip')).toBeVisible({ timeout: 8000 });
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="tour-tip"]'))).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="tour-tip"]'))).toBe(true);
    await page.getByTestId('tour-next').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('tour-tip')).toContainText('2 of');
  });

  test('ring blinks normally but not with prefers-reduced-motion', async ({ page }) => {
    await page.goto('/dashboard');
    const ring = page.getByTestId('tour-ring');
    await expect(ring).toBeVisible({ timeout: 8000 });
    expect(await ring.evaluate((e) => getComputedStyle(e).animationName)).toContain('tour-pulse');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await ring.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  });

  test('the off-screen target is scrolled into view; tooltip and ring stay on screen after resize', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/profile/, { timeout: 8000 });
    await expect(page.getByTestId('tour-ring')).toBeVisible();
    for (const [width, height] of [[375, 667], [667, 375], [1200, 800]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(900);
      const tip = await page.getByTestId('tour-tip').boundingBox();
      expect(tip!.x).toBeGreaterThanOrEqual(0);
      expect(tip!.x + tip!.width).toBeLessThanOrEqual(width + 1);
      expect(tip!.y).toBeGreaterThanOrEqual(0);
      expect(tip!.y + tip!.height).toBeLessThanOrEqual(height + 1);
      const ring = await page.getByTestId('tour-ring').boundingBox();
      const target = await page.locator(TARGET).boundingBox();
      expect(target!.y).toBeGreaterThanOrEqual(-1);
      expect(target!.y + target!.height).toBeLessThanOrEqual(height + 1);
      expect(Math.abs(ring!.x - (target!.x - 6))).toBeLessThanOrEqual(8);
      expect(Math.abs(ring!.y - (target!.y - 6))).toBeLessThanOrEqual(8);
    }
  });
});
