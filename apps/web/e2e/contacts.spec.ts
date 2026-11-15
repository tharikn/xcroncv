import { expect, test } from '@playwright/test';
import { setup } from './support/setup';
import { mockCareerTools } from './support/mock-career-tools';

async function addContact(page: import('@playwright/test').Page, name = 'Jane Doe', org = 'Acme', expectSaved = true) {
  if (!(await page.getByTestId('contact-form').isVisible())) await page.getByTestId('new-contact').click();
  await page.getByTestId('contact-name').fill(name);
  await page.getByTestId('contact-org').fill(org);
  await page.getByTestId('contact-role').fill('Recruiter');
  await page.getByTestId('contact-rel').selectOption('RECRUITER');
  await page.getByTestId('contact-email').fill('jane@acme.test');
  await page.getByTestId('contact-tags').fill('warm, referral');
  await page.getByTestId('contact-notes').fill('Met at a meetup');
  await page.getByTestId('save-contact').click();
  // The form closes after the save returns; wait for that so the next call does not see the old, closing form.
  if (expectSaved) await expect(page.getByTestId('contact-form')).toBeHidden();
}

test.describe('Application CRM and contacts (doc 46)', () => {
  test('shows an empty state, validates, then saves a contact', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    await page.goto('/contacts');
    await expect(page.getByTestId('contacts-empty')).toBeVisible();
    await page.getByTestId('new-contact').click();
    await page.getByTestId('save-contact').click();
    await expect(page.getByRole('alert')).toContainText('Enter a name');
    expect(tools.calls.some((c) => c.method === 'POST')).toBe(false);

    await addContact(page);
    const row = page.getByTestId('contact-list').locator('li').first();
    await expect(row).toContainText('Jane Doe');
    await expect(row).toContainText('Acme');
    await expect(row).toContainText('warm');
    const post = tools.calls.find((c) => c.method === 'POST' && c.path === '/contacts')!;
    expect(post.body).toMatchObject({ name: 'Jane Doe', organization: 'Acme', relationship: 'RECRUITER', tags: ['warm', 'referral'], notes: 'Met at a meetup' });
    expect(post.body.channels).toEqual([{ type: 'email', value: 'jane@acme.test' }]);
    expect(JSON.stringify(post.body)).not.toMatch(/userId|tenantId/);
  });

  test('refuses a duplicate contact with a helpful message', async ({ page }) => {
    await setup(page);
    await mockCareerTools(page);
    await page.goto('/contacts');
    await addContact(page);
    await addContact(page, 'Jane Doe', 'Acme', false);
    await expect(page.locator('ion-toast').last()).toContainText('already have a matching contact');
    await expect(page.getByTestId('contact-list').locator('li')).toHaveCount(1);
  });

  test('searches by name or organisation', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    await page.goto('/contacts');
    await addContact(page, 'Jane Doe', 'Acme');
    await addContact(page, 'Sam Lee', 'Globex');
    await expect(page.getByTestId('contact-list').locator('li')).toHaveCount(2);
    await page.getByTestId('contact-search').fill('globex');
    await expect(page.getByTestId('contact-list').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('contact-list')).toContainText('Sam Lee');
    expect(tools.calls.some((c) => c.path === '/contacts' && c.query['q'] === 'globex')).toBe(true);
    await page.getByTestId('contact-search').fill('zzz');
    await expect(page.getByTestId('contacts-empty')).toContainText('No matching contacts');
  });

  test('timeline, links and reminders on a contact', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    await page.goto('/contacts');
    await addContact(page);
    await page.getByTestId('open-contact').click();
    await expect(page.getByTestId('contact-heading')).toHaveText('Jane Doe');
    await expect(page.getByTestId('timeline-empty')).toBeVisible();

    await page.getByTestId('link-kind').selectOption('APPLICATION');
    await page.getByTestId('link-ref').fill('app-77');
    await page.getByTestId('link-label').fill('Acme backend');
    await page.getByTestId('add-link').click();
    await expect(page.getByTestId('link-list')).toContainText('Acme backend');
    await page.getByTestId('link-ref').fill('app-77');
    await page.getByTestId('link-kind').selectOption('APPLICATION');
    await page.getByTestId('add-link').click();
    await expect(page.locator('ion-toast').last()).toContainText('already exists');

    await page.getByTestId('act-type').selectOption('RECRUITER_CALL');
    await page.getByTestId('act-date').fill('2026-03-02');
    await page.getByTestId('act-summary').fill('Intro call, sent CV');
    await page.getByTestId('add-activity').click();
    await expect(page.getByTestId('timeline')).toContainText('Recruiter call');
    await expect(page.getByTestId('timeline')).toContainText('Intro call, sent CV');

    await page.getByTestId('task-title').fill('Send thank-you note');
    await page.getByTestId('task-due').fill('2026-03-05');
    await page.getByTestId('add-task').click();
    expect(tools.tasks).toHaveLength(1);
    expect(tools.tasks[0]).toMatchObject({ title: 'Send thank-you note', status: 'OPEN', contactId: tools.contacts[0].id });

    await page.getByTestId('save-notes').click();
    expect(tools.calls.some((c) => c.method === 'PATCH' && c.body?.notes === 'Met at a meetup')).toBe(true);
  });

  test('completes a follow-up from the list and removes it from the open list', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page, undefined);
    tools.tasks.push({ id: 't-1', contactId: null, title: 'Chase recruiter', dueAt: '2020-01-01T09:00:00.000Z', status: 'OPEN' });
    await page.goto('/contacts');
    const row = page.getByTestId('task-t-1');
    await expect(row).toContainText('Overdue');
    await row.getByTestId('task-toggle').check();
    await expect(page.getByTestId('tasks-empty')).toBeVisible();
    expect(tools.tasks[0].status).toBe('DONE');
  });

  test('deleting a contact needs confirmation and removes its records', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    await page.goto('/contacts');
    await addContact(page);
    await page.getByTestId('open-contact').click();
    await page.getByTestId('delete-contact').click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('ion-alert')).toHaveCount(0);
    expect(tools.contacts).toHaveLength(1);
    await page.getByTestId('delete-contact').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('contacts-empty')).toBeVisible();
    expect(tools.contacts).toHaveLength(0);
  });

  test('exports contacts to the device', async ({ page }) => {
    await setup(page);
    await mockCareerTools(page);
    await page.goto('/contacts');
    await addContact(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-contacts').click()]);
    expect(download.suggestedFilename()).toBe('contacts-export.json');
  });

  test('shows an error banner when the API fails', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    tools.failNext = { path: /^\/contacts$/, status: 500, message: 'Contacts unavailable' };
    await page.goto('/contacts');
    await expect(page.getByTestId('contacts-error')).toContainText('Contacts unavailable');
  });
});

test.describe('Contact CSV import (doc 46)', () => {
  test('requires consent, previews, skips duplicates and imports new contacts', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    await page.goto('/contacts');
    await addContact(page, 'Jane Doe', 'Acme');
    await page.getByTestId('import-contacts').click();
    await page.getByTestId('import-text').fill('name,company\nJane Doe,Acme\nBob Ray,Globex\n,Nowhere');
    await expect(page.getByTestId('import-preview')).toBeDisabled(); // consent first
    await page.getByTestId('import-consent').check();
    await page.getByTestId('import-preview').click();
    await expect(page.getByTestId('import-summary')).toContainText('1 new');
    await expect(page.getByTestId('import-summary')).toContainText('1 duplicates');
    await expect(page.getByTestId('import-summary')).toContainText('1 invalid');
    expect(tools.calls.filter((c) => c.path === '/contacts/import/commit')).toHaveLength(0); // preview never writes
    await page.getByTestId('import-commit').click();
    await expect(page.getByTestId('contact-list')).toContainText('Bob Ray');
    await expect(page.getByTestId('import-panel')).toHaveCount(0);
    const commit = tools.calls.find((c) => c.path === '/contacts/import/commit')!;
    expect(commit.body.consent).toBe(true);
    expect(JSON.stringify(commit.body)).not.toMatch(/userId|tenantId/);
  });
});
