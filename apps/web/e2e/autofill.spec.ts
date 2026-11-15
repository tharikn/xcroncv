import { expect, test } from '@playwright/test';
import { setup } from './support/setup';

/** Doc 47: user-started sessions, field-by-field review, consent for sensitive fields, copy only, revocation. */
test.describe('Autofill assistant (doc 47)', () => {
  async function startSession(page: import('@playwright/test').Page) {
    await page.goto('/autofill');
    await page.getByTestId('start-session').click();
    await expect(page.getByTestId('review-panel')).toBeVisible();
  }

  test('prompts for a profile when none exists', async ({ page }) => {
    await setup(page, { profile: false });
    await page.goto('/autofill');
    await expect(page.getByTestId('autofill-needs-profile')).toBeVisible();
    await expect(page.getByTestId('start-session')).toBeDisabled();
    await expect(page.getByTestId('sessions-empty')).toBeVisible();
  });

  test('nothing is pre-selected and release stays disabled until fields are chosen and reviewed', async ({ page }) => {
    await setup(page);
    await startSession(page);
    await expect(page.getByTestId('field-email')).not.toBeChecked();
    await expect(page.getByTestId('authorize-btn')).toBeDisabled();
    await page.getByTestId('field-email').check();
    await expect(page.getByTestId('authorize-btn')).toBeDisabled(); // not yet reviewed
    await page.getByTestId('review-confirm').check();
    await expect(page.getByTestId('authorize-btn')).toBeEnabled();
    await expect(page.getByTestId('field-email')).toBeVisible();
    await expect(page.getByText('a***@example.com')).toBeVisible(); // masked preview, not the raw value
  });

  test('sensitive fields need explicit per-session consent', async ({ page }) => {
    const state = await setup(page);
    await startSession(page);
    await page.getByTestId('field-phone').check();
    await page.getByTestId('review-confirm').check();
    await expect(page.getByTestId('authorize-btn')).toBeDisabled();
    await page.getByTestId('sensitive-consent').check();
    await page.getByTestId('authorize-btn').click();
    await expect(page.getByTestId('fill-phone')).toContainText('+44 20 7946 0000');
    const req = state.requests.find((r) => r.path.endsWith('/authorize-fields'))!;
    expect(req.body).toMatchObject({ fieldKeys: ['phone'], sensitiveConsent: true, confirm: true });
  });

  test('releases only the selected fields, states nothing was submitted, and can clear values', async ({ page }) => {
    await setup(page);
    await startSession(page);
    await page.getByTestId('field-firstName').check();
    await page.getByTestId('field-lastName').check();
    await page.getByTestId('review-confirm').check();
    await page.getByTestId('authorize-btn').click();
    const list = page.getByTestId('fill-list');
    await expect(list.getByTestId('fill-firstName')).toContainText('Ada');
    await expect(list.getByTestId('fill-lastName')).toContainText('Lovelace');
    await expect(list.getByTestId('fill-email')).toHaveCount(0);
    await expect(page.getByTestId('no-submit-note')).toContainText('Nothing has been submitted');
    await page.getByTestId('clear-values').click();
    await expect(page.getByTestId('result-panel')).toHaveCount(0);
  });

  test('a bad hostname is rejected with a clear message', async ({ page }) => {
    await setup(page);
    await page.goto('/autofill');
    await page.getByTestId('host-input').fill('https://example.com/apply?id=1');
    await page.getByTestId('start-session').click();
    await expect(page.locator('ion-toast')).toContainText('hostname only');
    await expect(page.getByTestId('review-panel')).toHaveCount(0);
  });

  test('revoking a session ends it and later authorisation is refused', async ({ page }) => {
    const state = await setup(page);
    await startSession(page);
    await page.getByTestId('revoke-session').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByTestId('start-panel')).toBeVisible();
    await expect(page.getByTestId('session-status').first()).toHaveText('REVOKED');
    expect(state.requests.some((r) => r.path.endsWith('/revoke'))).toBe(true);
    await expect(page.getByTestId('resume-session')).toHaveCount(0);
  });

  test('an API failure is shown, not swallowed', async ({ page }) => {
    const state = await setup(page);
    state.failNext = { path: /\/autofill\/sessions$/, status: 500 };
    await page.goto('/autofill');
    await expect(page.getByTestId('autofill-error')).toBeVisible();
  });

  test('no horizontal overflow on the review screen', async ({ page }) => {
    await setup(page);
    await startSession(page);
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(m.doc).toBeLessThanOrEqual(m.win);
  });
});
