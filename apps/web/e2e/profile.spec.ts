import { expect, test } from '@playwright/test';
import { setup } from './support/setup';

test.describe('Career profile', () => {
  test('creates a profile from scratch and sends exactly the API DTO', async ({ page }) => {
    const state = await setup(page, { profile: false });
    await page.goto('/profile');
    await expect(page.getByTestId('save-state')).toHaveText('All changes saved');

    await page.getByTestId('fullName').fill('Grace Hopper');
    await page.getByTestId('email').fill('grace@example.com');
    await page.getByTestId('add-experience').click();
    await page.getByTestId('exp-employer').fill('US Navy');
    await page.getByTestId('exp-title').fill('Rear Admiral');
    await page.getByTestId('exp-start').fill('1943-12');
    await page.getByTestId('exp-current').check();
    await page.getByRole('button', { name: 'Add bullet' }).click();
    await page.getByTestId('exp-bullet').fill('Invented the first compiler.');
    await page.getByTestId('add-skill').click();
    await page.getByTestId('skill-name').fill('COBOL');
    await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes');

    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('save-state')).toHaveText('All changes saved');

    const put = state.requests.find((r) => r.method === 'PUT' && r.path === '/career-profile')!;
    expect(put.body.fullName).toBe('Grace Hopper');
    expect(put.body.id).toBeUndefined();
    expect(put.body.experiences[0]).toMatchObject({ employerName: 'US Navy', jobTitle: 'Rear Admiral', startDate: '1943-12', isCurrent: true });
    expect(put.body.experiences[0].bullets[0].content).toBe('Invented the first compiler.');
    expect(put.body.skills[0].name).toBe('COBOL');
  });

  test('shows validation errors and does not call the API', async ({ page }) => {
    const state = await setup(page, { profile: false });
    await page.goto('/profile');
    await page.getByTestId('email').fill('not-an-email');
    await page.getByTestId('add-experience').click();
    await page.getByTestId('exp-start').fill('2020-13');
    await page.getByTestId('profile-save').click();
    const errs = page.getByTestId('profile-errors');
    await expect(errs).toContainText('Full name is required');
    await expect(errs).toContainText('Email address looks invalid');
    await expect(errs).toContainText('start date must be YYYY-MM');
    expect(state.requests.some((r) => r.method === 'PUT')).toBe(false);
  });

  test('loads an existing profile and strips server-only fields on save', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/profile');
    await expect(page.getByTestId('fullName')).toHaveValue('Ada Lovelace');
    await expect(page.getByTestId('exp-employer')).toHaveValue('Babbage & Co');
    await page.getByTestId('headline').fill('Countess of Lovelace');
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('save-state')).toHaveText('All changes saved');
    const put = state.requests.find((r) => r.method === 'PUT')!;
    expect(put.body.experiences[0].id).toBeUndefined();
    expect(put.body.experiences[0].profileId).toBeUndefined();
    expect(put.body.headline).toBe('Countess of Lovelace');
  });

  test('experiences can be reordered and removed without drag and drop', async ({ page }) => {
    await setup(page, { profile: { experiences: [
      { employerName: 'First Co', jobTitle: 'A', startDate: '2018-01', isCurrent: false, endDate: '2019-01', bullets: [] },
      { employerName: 'Second Co', jobTitle: 'B', startDate: '2019-02', isCurrent: false, endDate: '2020-01', bullets: [] },
    ] } });
    await page.goto('/profile');
    const employers = page.getByTestId('exp-employer');
    await expect(employers.nth(0)).toHaveValue('First Co');
    await page.getByRole('button', { name: 'Move experience 1 down' }).click();
    await expect(employers.nth(0)).toHaveValue('Second Co');
    await expect(page.getByRole('button', { name: 'Move experience 1 up' })).toBeDisabled();
    await page.getByRole('button', { name: 'Remove experience 1' }).click();
    await expect(employers).toHaveCount(1);
    await expect(employers.first()).toHaveValue('First Co');
  });

  test('shows an error banner when the profile fails to load', async ({ page }) => {
    const state = await setup(page);
    state.failNext = { path: /career-profile/, status: 500 };
    await page.goto('/profile');
    await expect(page.getByRole('alert')).toContainText('Injected failure');
  });

  test('surfaces server-side save failures as a toast', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/profile');
    await page.getByTestId('headline').fill('x');
    state.failNext = { path: /career-profile/, status: 400 };
    await page.getByTestId('profile-save').click();
    await expect(page.getByText('Injected failure')).toBeVisible();
    await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes');
  });
});
