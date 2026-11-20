import { expect, Page, test } from '@playwright/test';
import { setup } from './support/setup';

/** Sections start collapsed; expand one the way a user does before touching its fields. */
async function expand(page: Page, section: string) {
  const header = page.getByRole('button', { name: section, exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'true');
}

test.describe('Career profile', () => {
  test('creates a profile from scratch and sends exactly the API DTO', async ({ page }) => {
    const state = await setup(page, { profile: false });
    await page.goto('/profile');
    await expect(page.getByTestId('save-state')).toHaveText('All changes saved');

    await page.getByTestId('fullName').fill('Grace Hopper');
    await page.getByTestId('headline').fill('Rear Admiral and computer scientist');
    await page.getByTestId('email').fill('grace@example.com');
    await page.getByTestId('phone').fill('+1 555 010 0100');
    await page.getByTestId('location').fill('Arlington, USA');
    await page.getByTestId('summary').fill('Invented the first compiler and pioneered machine-independent programming.');
    await expand(page, 'Experience');
    await expand(page, 'Skills');
    await page.getByTestId('add-experience').click();
    await page.getByTestId('exp-employer').fill('US Navy');
    await page.getByTestId('exp-title').fill('Rear Admiral');
    await page.getByTestId('exp-start').fill('1943-12');
    await page.getByTestId('experience-0').getByLabel('Location *').fill('Arlington, USA');
    await page.getByTestId('exp-current').check();
    await page.getByRole('button', { name: 'Add bullet' }).click();
    await page.getByTestId('exp-bullet').fill('Invented the first compiler.');
    await page.getByTestId('add-skill').click();
    await page.getByTestId('skill-name').fill('COBOL');
    await page.getByRole('textbox', { name: 'Category *' }).fill('Programming');
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
    await expand(page, 'Experience');
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
    await expand(page, 'Experience');
    await expect(employers.nth(0)).toHaveValue('First Co');
    await page.getByRole('button', { name: 'Move experience 1 down' }).click();
    await expect(employers.nth(0)).toHaveValue('Second Co');
    await expect(page.getByRole('button', { name: 'Move experience 1 up' })).toBeDisabled();
    await page.getByRole('button', { name: 'Remove experience 1' }).click();
    await expect(employers).toHaveCount(1);
    await expect(employers.first()).toHaveValue('First Co');
  });

  test('education course drives the branch list and every education field is mandatory', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/profile');
    await expand(page, 'Education');
    await page.getByTestId('add-education').click();
    const card = page.getByTestId('education-1');
    await expect(card).toBeVisible();

    // a second click must not stack another untouched blank card
    await page.getByTestId('add-education').click();
    await expect(page.locator('[data-testid^="education-"]')).toHaveCount(2);

    await card.getByLabel('Institution *').fill('Yale University');
    await card.getByLabel('Course *').selectOption('Bachelor of Science (B.Sc)');
    await expect(card.getByLabel('Branch / specialisation *').locator('option[value="Mathematics"]')).toHaveCount(1);
    await card.getByLabel('Branch / specialisation *').selectOption('Mathematics');
    await card.getByLabel('Start (YYYY-MM) *').fill('2016-09');
    await card.getByLabel('End (YYYY-MM) *').fill('2020-05');

    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('save-state')).toHaveText('All changes saved');
    const put = state.requests.filter((r) => r.method === 'PUT' && r.path === '/career-profile').at(-1)!;
    expect(put.body.educations[1]).toMatchObject({
      institution: 'Yale University', degree: 'Bachelor of Science (B.Sc)', field: 'Mathematics', startDate: '2016-09', endDate: '2020-05',
    });
  });

  test('blank education rows are dropped on load instead of rendering empty cards', async ({ page }) => {
    await setup(page, { profile: { educations: [
      { id: 'ed1', institution: 'Home tutored', degree: 'Bachelor of Science (B.Sc)', field: 'Mathematics', startDate: '2014-09', endDate: '2018-05' },
      { id: 'ed2', institution: '', degree: '', field: '', startDate: '', endDate: '' },
    ] } });
    await page.goto('/profile');
    await expand(page, 'Education');
    await expect(page.locator('[data-testid^="education-"]')).toHaveCount(1);
    await expect(page.getByTestId('save-state')).toHaveText('All changes saved');
  });

  test('shows an error banner when the profile fails to load', async ({ page }) => {
    const state = await setup(page);
    state.failNext = { path: /career-profile/, status: 500, times: 99 };
    await page.goto('/profile');
    await expect(page.getByRole('alert')).toContainText('Injected failure');
  });

  test('surfaces server-side save failures as a toast', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/profile');
    await page.getByTestId('headline').fill('Engineer');
    state.failNext = { path: /career-profile/, status: 400 };
    await page.getByTestId('profile-save').click();
    await expect(page.getByText('Injected failure')).toBeVisible();
    await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes');
  });

  test('reset restores the starter profile only after the typed confirmation', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/profile');
    await expect(page.getByTestId('fullName')).toHaveValue('Ada Lovelace');

    await page.getByTestId('profile-reset').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('reset-confirm')).toBeDisabled();

    await page.getByTestId('reset-confirm-input').fill('nope');
    await expect(page.getByTestId('reset-confirm')).toBeDisabled();
    await page.getByTestId('reset-confirm-input').fill('RESET');
    await expect(page.getByTestId('reset-confirm')).toBeEnabled();
    await page.getByTestId('reset-confirm').click();

    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('fullName')).toHaveValue('Your Name');
    await expect(page.getByTestId('exp-employer')).toHaveValue('Example Company');
    await expect(page.getByTestId('save-state')).toHaveText('All changes saved');
    expect(state.requests.some((r) => r.method === 'POST' && r.path === '/career-profile/reset')).toBe(true);
  });

  test('cancelling reset leaves the profile untouched and calls no reset endpoint', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/profile');
    await page.getByTestId('profile-reset').click();
    await page.getByTestId('reset-cancel').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('fullName')).toHaveValue('Ada Lovelace');
    expect(state.requests.some((r) => r.method === 'POST' && r.path === '/career-profile/reset')).toBe(false);
  });
});
