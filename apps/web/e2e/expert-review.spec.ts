import { expect, Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { RESUME_ID, setup } from './support/setup';
import { estore } from './support/mock-expert-review';

const version = (n: number) => ({ id: `ver-${n}`, versionNumber: n, changeSummary: null, createdAt: '2026-01-02T10:00:00.000Z' });

/** Doc 50: consent-based, scoped, expiring, revocable expert review; the candidate decides; payment is not configured. */
test.describe('Expert review (doc 50)', () => {
  async function createReview(page: Page, opts: { phone?: boolean } = {}) {
    await page.goto('/expert-review');
    await page.getByTestId('er-new').click();
    if (opts.phone) await page.getByTestId('contact-phone').check();
    await page.getByTestId('er-consent').check();
    await page.getByTestId('er-create').click();
    await expect(page.getByTestId('er-heading')).toBeVisible();
  }

  test('nothing is shared by default; payment is plainly not configured; creating needs explicit consent', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.versions[RESUME_ID] = [version(1)];
    await page.goto('/expert-review');
    await expect(page.getByTestId('er-empty')).toContainText('Nothing is shared');
    await expect(page.getByTestId('er-payment-note')).toContainText('No payment provider is configured');
    await page.getByTestId('er-new').click();
    await expect(page.getByTestId('er-vetting')).toContainText('Not vetted');
    await expect(page.getByTestId('er-conflict')).toContainText('Conflict policy');
    await expect(page.getByTestId('er-package-info')).toContainText('payment is not configured');
    await expect(page.getByTestId('er-create')).toBeDisabled();
    await page.getByTestId('er-consent').check();
    await expect(page.getByTestId('er-create')).toBeEnabled();
    await page.getByTestId('er-create').click();
    await expect(page.getByTestId('er-heading')).toBeVisible();
    const post = state.requests.find((r) => r.method === 'POST' && r.path === '/expert-reviews')!;
    expect(post.body).toMatchObject({ consent: true, contacts: { email: 'hidden', phone: 'hidden', location: 'hidden' }, links: 'hidden' });
    expect(post.body.userId).toBeUndefined();
    expect(post.body.tenantId).toBeUndefined();
    await expect(page.getByTestId('er-pay-status')).toContainText('nothing was charged');
  });

  test('the preview shows only the granted sections and contact kinds, read-only, and every view is audited', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.versions[RESUME_ID] = [version(1)];
    await createReview(page, { phone: true });
    await expect(page.getByTestId('er-contacts')).toContainText('phone');
    await expect(page.getByTestId('er-contacts')).not.toContainText('email');
    await page.getByTestId('er-preview').click();
    const pv = page.getByTestId('er-preview-panel');
    await expect(pv).toContainText('Read-only preview of version 1');
    await expect(pv.getByTestId('pv-contacts')).toContainText('+44 20 7946 0000');
    await expect(pv.getByTestId('pv-contacts')).not.toContainText('ada@example.com');
    await expect(pv.getByTestId('pv-section')).toHaveCount(2);
    await expect(page.getByTestId('er-audit').getByTestId('audit-row')).toHaveCount(3);
    await expect(page.getByTestId('er-audit')).toContainText('Reviewer view opened');
    await expect(page.getByTestId('er-audit')).not.toContainText('Ada');
  });

  test('revoking is immediate: no preview, no new feedback, existing feedback and the audit entry stay', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.versions[RESUME_ID] = [version(1)];
    await createReview(page);
    await page.getByTestId('fb-comment').fill('Clear structure');
    await page.getByTestId('fb-save').click();
    await expect(page.getByTestId('fb-list').locator('li')).toHaveCount(1);
    await page.getByTestId('er-revoke').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByTestId('er-detail-status')).toHaveText('Revoked');
    await expect(page.getByTestId('er-preview')).toHaveCount(0);
    await expect(page.getByTestId('er-ended')).toContainText('revoked');
    await expect(page.getByTestId('er-log-disabled')).toBeVisible();
    await expect(page.getByTestId('fb-list').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('er-audit')).toContainText('Access revoked');
  });

  test('an expired request shows as expired and can be extended only with fresh consent', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.versions[RESUME_ID] = [version(1)];
    await createReview(page);
    estore(state).reviews[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    await page.getByTestId('er-back').click();
    await expect(page.getByTestId('er-status')).toHaveText('Expired');
    await page.getByTestId('er-open').click();
    await expect(page.getByTestId('er-ended')).toContainText('expired');
    await page.getByTestId('er-extend').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Extend' }).click();
    await expect(page.getByTestId('er-detail-status')).toHaveText('Active');
    const grant = state.requests.find((r) => r.path.endsWith('/grant'))!;
    expect(grant.body).toMatchObject({ consent: true });
  });

  test('section-linked feedback; the candidate accepts or declines and accepting never edits the resume', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.versions[RESUME_ID] = [version(1)];
    await createReview(page);
    await page.getByTestId('fb-save').click();
    await expect(page.getByTestId('fb-form-error')).toContainText('at least one rating or a comment');
    await page.getByTestId('fb-section').selectOption('experience');
    await page.getByTestId('rate-clarity').selectOption('4');
    await page.getByTestId('fb-comment').fill('Add numbers to your bullets.');
    await page.getByTestId('fb-save').click();
    await page.getByTestId('fb-comment').fill('Overall tone is good.');
    await page.getByTestId('fb-save').click();
    const rows = page.getByTestId('fb-list').locator('li');
    await expect(rows).toHaveCount(2);
    await expect(rows.first().getByTestId('fb-where')).toHaveText('Whole resume');
    const row = rows.nth(1);
    await expect(row.getByTestId('fb-where')).toHaveText('Experience');
    await expect(row.getByTestId('fb-status')).toHaveText('New');
    await row.getByTestId('fb-accept').click();
    await expect(row.getByTestId('fb-status')).toHaveText('Accepted');
    await expect(row.getByTestId('fb-accepted-note')).toContainText('does not change your resume');
    await rows.first().getByTestId('fb-decline').click();
    await expect(rows.first().getByTestId('fb-status')).toHaveText('Declined');
    await expect(page.getByTestId('er-audit')).toContainText('You accepted a suggestion');
    expect(state.requests.some((r) => r.method !== 'GET' && /\/resumes\//.test(r.path))).toBe(false);
    expect(state.requests.some((r) => r.method === 'POST' && r.path === '/expert-reviews' && r.body?.sections?.includes('skills'))).toBe(false);
  });

  test('guidance without a saved version; delete asks for confirmation; API error; no overflow; hub link; axe', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto('/career-tools');
    await expect(page.getByTestId('tool-expert-review')).toBeVisible();
    await page.getByTestId('tool-expert-review').click();
    await page.getByTestId('er-new').click();
    await expect(page.getByTestId('er-no-versions')).toBeVisible();
    await page.getByTestId('er-consent').check();
    await page.getByTestId('er-create').click();
    await expect(page.locator('ion-toast')).toContainText('Save a version');
    await expect(page.getByTestId('er-list')).toHaveCount(0);

    state.versions[RESUME_ID] = [version(1)];
    await createReview(page);
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(m.doc).toBeLessThanOrEqual(m.win);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
    await page.getByTestId('er-delete').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('er-empty')).toBeVisible();
    state.failNext = { path: /^\/expert-reviews$/, status: 500 };
    await page.goto('/expert-review');
    await expect(page.getByTestId('er-error')).toBeVisible();
  });
});
