import { expect, Page, test } from '@playwright/test';
import { RESUME_ID, setup } from './support/setup';
import { rstore } from './support/mock-readiness-tools';

const version = (n: number) => ({ id: `ver-${n}`, versionNumber: n, changeSummary: null, createdAt: '2026-01-02T10:00:00.000Z' });

/** Doc 36: private-by-default, version-scoped, consented, expiring and revocable sharing; the candidate decides on feedback. */
test.describe('Feedback and sharing (doc 36)', () => {
  async function createShare(page: Page, opts: { phone?: boolean } = {}) {
    await page.goto('/feedback-shares');
    await page.getByTestId('new-share').click();
    await page.getByTestId('fs-recipient').fill('Recruiter at Acme');
    if (opts.phone) await page.getByTestId('contact-phone').check();
    await page.getByTestId('fs-consent').check();
    await page.getByTestId('create-share').click();
    await expect(page.getByTestId('share-heading')).toHaveText('Recruiter at Acme');
  }

  test('nothing is shared by default, and a share needs explicit confirmation', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.versions[RESUME_ID] = [version(1)];
    await page.goto('/feedback-shares');
    await expect(page.getByTestId('fs-empty')).toContainText('not shared');
    await expect(page.getByTestId('fs-note')).toContainText('No public link');
    await page.getByTestId('new-share').click();
    await page.getByTestId('fs-recipient').fill('R');
    await expect(page.getByTestId('create-share')).toBeDisabled();
    await page.getByTestId('fs-consent').check();
    await expect(page.getByTestId('create-share')).toBeEnabled();
    await page.getByTestId('create-share').click();
    await expect(page.getByTestId('share-heading')).toBeVisible();
    const post = state.requests.find((r) => r.method === 'POST' && r.path === '/feedback-shares')!;
    expect(post.body).toMatchObject({ consent: true, contacts: { email: 'hidden', phone: 'hidden', location: 'hidden' }, links: 'hidden' });
    expect(post.body.userId).toBeUndefined();
  });

  test('preview shows only granted sections and contact fields, read-only', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.versions[RESUME_ID] = [version(1)];
    await createShare(page, { phone: true });
    await expect(page.getByTestId('perm-contacts')).toContainText('phone');
    await expect(page.getByTestId('perm-contacts')).not.toContainText('email');
    await page.getByTestId('preview-share').click();
    const pv = page.getByTestId('share-preview');
    await expect(pv).toContainText('Read-only preview of version 1');
    await expect(pv.getByTestId('pv-contacts')).toContainText('+44 20 7946 0000');
    await expect(pv.getByTestId('pv-contacts')).not.toContainText('ada@example.com');
    await expect(pv.getByTestId('pv-section')).toHaveCount(2);
  });

  test('revoking is immediate: the preview is gone and no more feedback is accepted', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.versions[RESUME_ID] = [version(1)];
    await createShare(page);
    await page.getByTestId('fb-comment').fill('Clear structure');
    await page.getByTestId('save-feedback').click();
    await expect(page.getByTestId('feedback-list').locator('li')).toHaveCount(1);
    await page.getByTestId('revoke-share').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByTestId('detail-status')).toHaveText('Revoked');
    await expect(page.getByTestId('preview-share')).toHaveCount(0);
    await expect(page.getByTestId('share-ended')).toBeVisible();
    await expect(page.getByTestId('log-disabled')).toBeVisible();
    await expect(page.getByTestId('feedback-list').locator('li')).toHaveCount(1); // kept
  });

  test('an expired share is shown as expired', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.versions[RESUME_ID] = [version(1)];
    await createShare(page);
    rstore(state).shares[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    await page.getByTestId('back-shares').click();
    await expect(page.getByTestId('share-status')).toHaveText('Expired');
  });

  test('feedback needs content; the candidate accepts it and accepting does not edit the resume', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.versions[RESUME_ID] = [version(1)];
    await createShare(page);
    await page.getByTestId('save-feedback').click();
    await expect(page.getByTestId('fb-form-error')).toContainText('at least one rating or a comment');
    await page.getByTestId('rate-clarity').selectOption('4');
    await page.getByTestId('rate-evidence').selectOption('2');
    await page.getByTestId('fb-comment').fill('Add numbers to your bullets.');
    await page.getByTestId('save-feedback').click();
    const row = page.getByTestId('feedback-list').locator('li').first();
    await expect(row.getByTestId('fb-status')).toHaveText('New');
    await expect(page.getByTestId('fb-summary')).toContainText('1 entry');
    await expect(page.getByTestId('fb-summary-note')).toContainText('very little feedback');
    await row.getByTestId('fb-accept').click();
    await expect(row.getByTestId('fb-status')).toHaveText('Accepted');
    await expect(row.getByTestId('fb-accepted-note')).toContainText('does not change your resume');
    expect(state.requests.some((r) => r.method === 'PATCH' && /\/resumes\//.test(r.path))).toBe(false);
  });

  test('guidance without a saved version; delete; API error; overflow; hub link', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto('/career-tools');
    await page.getByTestId('tool-feedback').click();
    await page.getByTestId('new-share').click();
    await expect(page.getByTestId('fs-no-versions')).toBeVisible();
    await page.getByTestId('fs-recipient').fill('R');
    await page.getByTestId('fs-consent').check();
    await page.getByTestId('create-share').click();
    await expect(page.locator('ion-toast')).toContainText('Save a version');
    await expect(page.getByTestId('share-list')).toHaveCount(0);

    state.versions[RESUME_ID] = [version(1)];
    await createShare(page);
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(m.doc).toBeLessThanOrEqual(m.win);
    await page.getByTestId('delete-share').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('fs-empty')).toBeVisible();
    state.failNext = { path: /^\/feedback-shares$/, status: 500 };
    await page.goto('/feedback-shares');
    await expect(page.getByTestId('fs-error')).toBeVisible();
  });
});
