import { expect, test } from '@playwright/test';
import { setup } from './support/setup';
import { mockCareerTools } from './support/mock-career-tools';

const LETTER_URL = /\/cover-letters\/[0-9a-f-]{36}$/;

async function draft(page: import('@playwright/test').Page, title = 'Acme - Backend') {
  await page.goto('/cover-letters');
  await page.getByTestId('new-letter').click();
  await page.getByTestId('letter-title').fill(title);
  await page.getByTestId('letter-company').fill('Acme');
  await page.getByTestId('letter-job').fill('Backend Engineer');
  await page.getByTestId('create-draft').click();
  await expect(page).toHaveURL(LETTER_URL);
}

test.describe('Cover letters: list and draft (doc 42)', () => {
  test('shows an empty state and warns when there is no career profile', async ({ page }) => {
    await setup(page, { profile: false });
    await mockCareerTools(page);
    await page.goto('/cover-letters');
    await expect(page.getByTestId('letters-empty')).toBeVisible();
    await expect(page.getByTestId('letters-needs-profile')).toBeVisible();
  });

  test('validates the form, then creates a draft and opens the editor', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    await page.goto('/cover-letters');
    await page.getByTestId('new-letter').click();
    await page.getByTestId('create-draft').click();
    await expect(page.getByRole('alert')).toContainText('Give the letter a title');
    expect(tools.calls.some((c) => c.method === 'POST')).toBe(false);

    await page.getByTestId('letter-title').fill('Acme - Backend');
    await page.getByTestId('letter-company').fill('Acme');
    await page.getByTestId('letter-job').fill('Backend Engineer');
    await page.getByTestId('letter-tone').selectOption('direct');
    await page.getByTestId('letter-jd').fill('We need billing and Postgres experience.');
    await page.getByTestId('create-draft').click();
    await expect(page).toHaveURL(LETTER_URL);
    await expect(page.getByTestId('letter-heading')).toHaveText('Acme - Backend');
    await expect(page.getByTestId('section-opening')).toBeVisible();
    await expect(page.getByTestId('claims-summary')).toContainText('No unsupported claims');

    const post = tools.calls.find((c) => c.method === 'POST' && c.path === '/cover-letters/drafts')!;
    expect(post.body).toMatchObject({ title: 'Acme - Backend', company: 'Acme', jobTitle: 'Backend Engineer', kind: 'standard', tone: 'direct', length: 'medium', jdText: 'We need billing and Postgres experience.' });
    expect(Object.keys(post.body)).not.toEqual(expect.arrayContaining(['userId']));
    expect(Object.keys(post.body)).not.toEqual(expect.arrayContaining(['tenantId']));
  });

  test('a referral letter needs a referrer name that the user supplies', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    await page.goto('/cover-letters');
    await page.getByTestId('new-letter').click();
    await page.getByTestId('letter-title').fill('Referral');
    await page.getByTestId('letter-kind').selectOption('referral');
    await page.getByTestId('create-draft').click();
    await expect(page.getByRole('alert')).toContainText('needs the referrer');
    expect(tools.calls.some((c) => c.path === '/cover-letters/drafts')).toBe(false);
    await page.getByTestId('letter-referrer').fill('Grace Hopper');
    await page.getByTestId('create-draft').click();
    await expect(page).toHaveURL(LETTER_URL);
    expect(tools.calls.find((c) => c.path === '/cover-letters/drafts')!.body.referrerName).toBe('Grace Hopper');
  });

  test('lists letters and deletes one after confirmation', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    await draft(page);
    await page.goto('/cover-letters');
    const card = page.getByTestId('letter-list').locator('li').first();
    await expect(card).toContainText('Acme - Backend');
    await card.getByTestId('delete-letter').click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('ion-alert')).toHaveCount(0);
    expect(tools.letters).toHaveLength(1);
    await card.getByTestId('delete-letter').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('letters-empty')).toBeVisible();
    expect(tools.letters).toHaveLength(0);
  });

  test('surfaces a server error instead of a blank screen', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    tools.failNext = { path: /^\/cover-letters$/, status: 500, message: 'Database unavailable' };
    await page.goto('/cover-letters');
    await expect(page.getByRole('alert')).toContainText('Database unavailable');
  });
});

test.describe('Cover letters: editor, claims, export, binding', () => {
  test('flags an invented metric, lets the user claim it, and saves a new immutable version', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    await draft(page);

    const opening = page.getByTestId('text-opening');
    const base = await opening.inputValue();
    await opening.fill(`${base}\nI grew revenue by 300%.`);
    await expect(page.getByTestId('unsaved')).toBeVisible();
    await page.getByTestId('check-claims').click();
    await expect(page.getByTestId('unsupported-warning')).toContainText('300%');
    await expect(page.getByTestId('claims-summary')).toContainText('1 claim(s) are not backed');

    await page.getByTestId('mark-mine').click();
    await expect(page.getByTestId('unsupported-warning')).toHaveCount(0);
    await expect(page.getByTestId('claim-user_authored')).toBeVisible();
    await expect(page.getByTestId('claims-summary')).toContainText('No unsupported claims');

    await page.getByTestId('save-version').click();
    await expect(page.getByTestId('version-list').locator('li')).toHaveCount(2);
    const save = tools.calls.find((c) => c.method === 'POST' && c.path.endsWith('/versions'))!;
    expect(save.body.userAuthored).toEqual(['300%']);
    expect(tools.versions[tools.letters[0].id]).toHaveLength(2);
    expect(tools.versions[tools.letters[0].id][0].sections[0].text).toBe(base); // v1 untouched
  });

  test('asks before saving a version that still has unsupported claims', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    await draft(page);
    await page.getByTestId('text-closing').fill('I doubled sales by 200%.');
    await page.getByTestId('check-claims').click();
    await expect(page.getByTestId('unsupported-warning')).toBeVisible();
    await page.getByTestId('save-version').click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('ion-alert')).toHaveCount(0);
    expect(tools.versions[tools.letters[0].id]).toHaveLength(1);
    await page.getByTestId('save-version').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Save anyway' }).click();
    await expect(page.getByTestId('version-list').locator('li')).toHaveCount(2);
  });

  test('exports locally from a saved version only', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    await draft(page);
    await page.getByTestId('text-closing').fill('Thanks.');
    await page.getByTestId('export-pdf').click();
    await expect(page.locator('ion-toast').last()).toContainText('Save your edits first');
    expect(tools.exports).toEqual([]);

    await page.getByTestId('save-version').click();
    await expect(page.getByTestId('unsaved')).toHaveCount(0);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-pdf').click()]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    expect(tools.exports).toEqual(['pdf']);
  });

  test('attaching to an application needs explicit approval and an exact saved version', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    await draft(page);
    const submit = page.getByTestId('bind-submit');
    await expect(submit).toBeDisabled();
    await page.getByTestId('bind-ref').fill('app-1042');
    await expect(submit).toBeDisabled();
    await page.getByTestId('bind-confirm').check();
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByTestId('bind-done')).toContainText('version 1');
    const call = tools.calls.find((c) => c.path === '/applications/app-1042/cover-letter-bindings')!;
    expect(call.body).toMatchObject({ versionNumber: 1, confirm: true });
    expect(call.body.coverLetterId).toBe(tools.letters[0].id);
  });

  test('shows a clear message for an unknown letter', async ({ page }) => {
    await setup(page);
    await mockCareerTools(page);
    await page.goto('/cover-letters/00000000-0000-4000-8000-0000000000aa');
    await expect(page.getByTestId('editor-error')).toContainText('not found');
  });
});
