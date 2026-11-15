import { expect, test } from '@playwright/test';
import { fakeToken } from './support/mock-api';
import { setup } from './support/setup';

test.describe('Authentication', () => {
  test('unauthenticated users are redirected to sign in (no guest access)', async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto('/resumes');
    await expect(page).toHaveURL(/\/login\?next=%2Fresumes/);
    await expect(page.getByRole('heading', { name: 'Sign in with a token' })).toBeVisible();
  });

  test('rejects a malformed token with an inline error', async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto('/login');
    await page.getByTestId('token-input').fill('garbage');
    await page.getByTestId('token-signin').click();
    await expect(page.getByTestId('login-error')).toHaveText(/invalid or expired/);
    await expect(page).toHaveURL(/\/login/);
  });

  test('rejects an expired token', async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto('/login');
    await page.getByTestId('token-input').fill(fakeToken('u', -60));
    await page.getByTestId('token-signin').click();
    await expect(page.getByTestId('login-error')).toBeVisible();
  });

  test('signs in with a valid token, returns to the requested page and sends it as a Bearer header', async ({ page }) => {
    const state = await setup(page, { signedIn: false });
    await page.goto('/templates');
    await page.getByTestId('token-input').fill(fakeToken('alice'));
    await page.getByTestId('token-signin').click();
    await expect(page).toHaveURL(/\/templates$/);
    await expect(page.getByTestId('template-grid')).toBeVisible();
    const call = state.requests.find((r) => r.path === '/templates');
    expect(call?.auth).toMatch(/^Bearer .+\..+\..+$/);
  });

  test('developer sign-in works in dev builds', async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto('/login');
    await page.getByTestId('dev-signin').click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('ignores an unsafe ?next redirect target', async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto('/login?next=//evil.example');
    await page.getByTestId('dev-signin').click();
    await expect(page).toHaveURL(/localhost:\d+\/dashboard/);
  });

  test('accepts a single-use token handoff in the URL fragment and strips it', async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto(`/#access_token=${fakeToken('handoff')}`);
    await expect(page).toHaveURL(/localhost:\d+\/dashboard$/);
    expect(page.url()).not.toContain('access_token');
  });

  test('sign out clears the session and blocks protected routes', async ({ page }) => {
    await setup(page);
    await page.goto('/settings');
    await expect(page.getByTestId('account-subject')).toHaveText('e2e-user');
    await page.getByTestId('signout').click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a 401 from the API signs the user out', async ({ page }) => {
    const state = await setup(page);
    state.failNext = { path: /\/resumes$/, status: 401 };
    await page.goto('/resumes');
    await expect(page).toHaveURL(/\/login/);
  });
});
