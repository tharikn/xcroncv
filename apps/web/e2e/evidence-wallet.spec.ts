import { expect, test } from '@playwright/test';
import { setup } from './support/setup';

/** Doc 49: credential metadata, honest verification states, evidence references, selective disclosure. */
test.describe('Evidence wallet (doc 49)', () => {
  async function addCredential(page: import('@playwright/test').Page, extra: Record<string, string> = {}) {
    await page.goto('/wallet');
    await page.getByTestId('new-credential').click();
    await page.getByTestId('cred-name').fill(extra['name'] ?? 'AWS Solutions Architect');
    await page.getByTestId('cred-issuer').fill('Amazon');
    if (extra['expires']) await page.getByTestId('cred-expires').fill(extra['expires']);
    await page.getByTestId('cred-id').fill('ABC-123456');
    await page.getByTestId('save-credential').click();
    await expect(page.getByTestId('wallet-empty')).toHaveCount(0);
  }

  test('empty state, then a credential starts as self-reported with a masked identifier', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/wallet');
    await expect(page.getByTestId('wallet-empty')).toBeVisible();
    await addCredential(page);
    const row = page.getByTestId('credential-list').locator('li').first();
    await expect(row.getByTestId('credential-status')).toHaveText('Self-reported');
    await expect(row).toContainText('••••3456');
    await expect(row).not.toContainText('ABC-123456');
    const post = state.requests.find((r) => r.method === 'POST' && r.path === '/credentials')!;
    expect(post.body.status).toBeUndefined(); // status is never client supplied
  });

  test('validates required fields and date format before calling the API', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/wallet');
    await page.getByTestId('new-credential').click();
    await page.getByTestId('cred-issued').fill('2024-13');
    await page.getByTestId('save-credential').click();
    const errs = page.getByTestId('cred-form-error');
    await expect(errs.filter({ hasText: 'Enter the credential name' })).toBeVisible();
    await expect(errs.filter({ hasText: 'Enter the issuer' })).toBeVisible();
    await expect(errs.filter({ hasText: 'Issue date must be' })).toBeVisible();
    expect(state.requests.some((r) => r.method === 'POST' && r.path === '/credentials')).toBe(false);
  });

  test('past expiry shows as expired', async ({ page }) => {
    await setup(page);
    await addCredential(page, { expires: '2020-01' });
    await expect(page.getByTestId('credential-status').first()).toHaveText('Expired');
  });

  test('self review is labelled as your own statement; a provider attempt with none connected changes nothing', async ({ page }) => {
    await setup(page);
    await addCredential(page);
    await page.getByTestId('open-credential').click();
    await expect(page.getByTestId('verify-self')).toBeDisabled(); // needs consent
    await page.getByTestId('verify-consent').check();
    await page.getByTestId('verify-self').click();
    await expect(page.getByTestId('detail-status')).toHaveText('Document reviewed by you');
    await expect(page.getByTestId('status-help')).toContainText('your own statement');
    await expect(page.getByTestId('status-source')).toContainText('you');
    await page.getByTestId('verify-consent').check();
    await page.getByTestId('verify-provider').click();
    await expect(page.getByTestId('verify-note')).toContainText('No verification provider is connected');
    await expect(page.getByTestId('detail-status')).toHaveText('Document reviewed by you'); // not downgraded
    await expect(page.getByTestId('detail-status')).not.toHaveText('Issuer verified');
  });

  test('editing verified facts resets the standing to self-reported', async ({ page }) => {
    await setup(page);
    await addCredential(page);
    await page.getByTestId('open-credential').click();
    await page.getByTestId('verify-consent').check();
    await page.getByTestId('verify-self').click();
    await expect(page.getByTestId('detail-status')).toHaveText('Document reviewed by you');
    await page.getByTestId('edit-name').fill('AWS SA Professional');
    await page.getByTestId('save-edit').click();
    await expect(page.getByTestId('detail-status')).toHaveText('Self-reported');
  });

  test('links evidence by reference only: link, profile item and local note', async ({ page }) => {
    const state = await setup(page);
    await addCredential(page);
    await page.getByTestId('open-credential').click();
    await expect(page.getByTestId('evidence-empty')).toBeVisible();
    await page.getByTestId('ev-label').fill('Badge page');
    await page.getByTestId('ev-url').fill('https://badges.example/abc');
    await page.getByTestId('add-evidence').click();
    await expect(page.getByTestId('evidence-list')).toContainText('Badge page');
    await page.getByTestId('ev-kind').selectOption('PROFILE_ITEM');
    await page.getByTestId('ev-profile').selectOption({ index: 1 });
    await page.getByTestId('add-evidence').click();
    await expect(page.getByTestId('evidence-list')).toContainText('Profile item');
    await page.getByTestId('ev-kind').selectOption('LOCAL_NOTE');
    await page.getByTestId('ev-label').fill('PDF in Documents/Certs');
    await page.getByTestId('add-evidence').click();
    await expect(page.getByTestId('evidence-list')).toContainText('Local note: PDF in Documents/Certs');
    // metadata only: no request ever carries file content
    for (const r of state.requests.filter((x) => x.path.includes('/evidence'))) expect(JSON.stringify(r.body ?? {})).not.toMatch(/base64|data:/);
  });

  test('a disclosure is nothing by default, minimal, and revocable', async ({ page }) => {
    await setup(page);
    await addCredential(page);
    await page.getByTestId('open-credential').click();
    await expect(page.getByTestId('grants-empty')).toBeVisible();
    await expect(page.getByTestId('create-grant')).toBeDisabled();
    await page.getByTestId('grant-field-name').check();
    await page.getByTestId('grant-field-credentialIdMasked').check();
    await expect(page.getByTestId('create-grant')).toBeDisabled(); // needs confirmation
    await page.getByTestId('grant-confirm').check();
    await page.getByTestId('create-grant').click();
    const proj = page.getByTestId('grant-projection');
    await expect(proj).toContainText('AWS Solutions Architect');
    await expect(proj).toContainText('••••3456');
    await expect(proj).not.toContainText('ABC-123456');
    await expect(proj).not.toContainText('Amazon'); // issuer was not granted
    await expect(page.getByTestId('grant-list').locator('li').first().getByTestId('grant-state')).toHaveText('ACTIVE');
    await page.getByTestId('revoke-grant').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByTestId('grant-list').locator('li').first().getByTestId('grant-state')).toHaveText('REVOKED');
  });

  test('deleting asks for confirmation and removes the credential', async ({ page }) => {
    await setup(page);
    await addCredential(page);
    await page.getByTestId('open-credential').click();
    await page.getByTestId('delete-credential').click();
    await expect(page.locator('ion-alert')).toHaveCount(1);
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('wallet-empty')).toBeVisible();
  });

  test('shows an error banner when the API fails', async ({ page }) => {
    const state = await setup(page);
    state.failNext = { path: /^\/credentials$/, status: 500 };
    await page.goto('/wallet');
    await expect(page.getByTestId('wallet-error')).toBeVisible();
  });

  test('no horizontal overflow on the list and the detail view', async ({ page }) => {
    await setup(page);
    await addCredential(page);
    for (const step of ['list', 'detail']) {
      if (step === 'detail') await page.getByTestId('open-credential').click();
      await page.waitForLoadState('networkidle');
      const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
      expect(m.doc, step).toBeLessThanOrEqual(m.win);
    }
  });
});
