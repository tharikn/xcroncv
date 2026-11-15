import { expect, test } from '@playwright/test';
import { setup } from './support/setup';

test.describe('Dashboard', () => {
  test('prompts new users to create a career profile', async ({ page }) => {
    await setup(page, { profile: false });
    await page.goto('/dashboard');
    await expect(page.getByTestId('dash-no-profile')).toBeVisible();
    await page.getByRole('link', { name: 'Create career profile' }).click();
    await expect(page).toHaveURL(/\/profile$/);
  });

  test('shows counts and recent resume metadata only (no document content, no embedded preview)', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto('/dashboard');
    await expect(page.getByTestId('stat-resumes')).toHaveText('1');
    await expect(page.getByTestId('stat-templates')).toHaveText('3');
    await expect(page.getByText('Engineer CV')).toBeVisible();
    await expect(page.getByText('Wrote the first published algorithm.')).toHaveCount(0);
    await expect(page.getByTestId('sheet')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome, Ada');
  });

  test('navigates to templates, profile and settings from the nav', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard');
    await page.getByTestId('nav-templates').click();
    await expect(page).toHaveURL(/\/templates$/);
    await page.getByTestId('nav-profile').click();
    await expect(page).toHaveURL(/\/profile$/);
    await page.getByTestId('nav-settings').click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test('shows an error banner if the API is unreachable', async ({ page }) => {
    const state = await setup(page);
    state.failNext = { path: /resumes/, status: 500 };
    await page.goto('/dashboard');
    await expect(page.getByRole('alert')).toBeVisible();
  });
});

test.describe('Settings', () => {
  test('validates and saves the API address, then tests the connection', async ({ page }) => {
    await setup(page);
    await page.goto('/settings');
    await page.getByTestId('api-base').fill('javascript:alert(1)');
    await page.getByTestId('api-save').click();
    await expect(page.getByRole('alert')).toContainText('valid http(s) URL');
    await page.getByTestId('api-base').fill('http://localhost:3100/api/v1');
    await page.getByTestId('api-save').click();
    await expect(page.getByText('API address saved')).toBeVisible();
    await page.getByTestId('api-test').click();
    await expect(page.getByTestId('api-status')).toContainText('Connected. 3 templates available.');
  });

  test('reports connection failures', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/settings');
    state.failNext = { path: /templates/, status: 500 };
    await page.getByTestId('api-test').click();
    await expect(page.getByTestId('api-status')).toContainText('Could not connect');
  });

  test('explains local-only file storage', async ({ page }) => {
    await setup(page);
    await page.goto('/settings');
    await expect(page.getByTestId('files-target')).toContainText('Browser downloads');
    await expect(page.getByText('The server never keeps them')).toBeVisible();
  });
});
