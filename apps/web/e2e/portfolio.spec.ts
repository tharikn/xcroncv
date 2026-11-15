import { expect, test } from '@playwright/test';
import { mockApi } from './support/mock-api';
import { setup } from './support/setup';

/** Doc 41: private editor, preview, publish by token, expiry, revocation. The API is mocked in-process. */
test.describe('Career portfolio (doc 41)', () => {
  async function createPortfolio(page: import('@playwright/test').Page) {
    await page.goto('/portfolio');
    await page.getByTestId('portfolio-new').click();
    await page.getByTestId('pf-name').fill('Backend roles');
    await page.getByTestId('header-vis-fullName').selectOption('public');
    await page.getByTestId('header-vis-email').selectOption('masked');
    await page.getByTestId('pick-experience').first().check();
    await page.getByTestId('pf-create').click();
    await expect(page.getByTestId('portfolio-heading')).toHaveText('Backend roles');
  }

  test('shows an empty state and a profile prompt when there is no profile', async ({ page }) => {
    await setup(page, { profile: false });
    await page.goto('/portfolio');
    await expect(page.getByTestId('portfolios-empty')).toBeVisible();
    await expect(page.getByTestId('portfolio-needs-profile')).toBeVisible();
    await expect(page.getByTestId('portfolio-new')).toBeDisabled();
  });

  test('everything starts hidden; preview shows exactly the selection', async ({ page }) => {
    await setup(page);
    await page.goto('/portfolio');
    await page.getByTestId('portfolio-new').click();
    await expect(page.getByTestId('selected-count')).toHaveText('0 items selected');
    await page.getByTestId('header-vis-fullName').selectOption('public');
    await page.getByTestId('header-vis-email').selectOption('masked');
    await page.getByTestId('pick-skills').first().check();
    await page.getByTestId('preview-btn').click();
    const pane = page.getByTestId('preview-pane');
    await expect(pane.getByTestId('pf-name-out')).toHaveText('Ada Lovelace');
    await expect(pane.getByTestId('pf-email-out')).toHaveText('a***@example.com');
    const html = await pane.innerHTML();
    for (const hidden of ['ada@example.com', '7946', 'Pioneer of computing', 'Babbage', 'London']) expect(html).not.toContain(hidden);
    await expect(pane.getByTestId('pf-section-skills')).toContainText('Mathematics');
  });

  test('validates the name and sends the allowlist selection', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/portfolio');
    await page.getByTestId('portfolio-new').click();
    await page.getByTestId('pf-create').click();
    await expect(page.getByRole('alert').filter({ hasText: 'Give the portfolio a name' })).toBeVisible();
    expect(state.requests.some((r) => r.method === 'POST' && r.path === '/portfolios')).toBe(false);
    await page.getByTestId('pf-name').fill('X');
    await page.getByTestId('header-vis-headline').selectOption('public');
    await page.getByTestId('pf-create').click();
    await expect(page.getByTestId('portfolio-status')).toHaveText('Private draft');
    const post = state.requests.find((r) => r.method === 'POST' && r.path === '/portfolios')!;
    expect(post.body.selection.header).toMatchObject({ headline: 'public' });
    expect(post.body.selection.header.email).toBeUndefined();
  });

  test('publish needs confirmation, shows the link once, and the public page shows only selected fields', async ({ page, browser }) => {
    const state = await setup(page);
    await createPortfolio(page);
    await expect(page.getByTestId('publish-btn')).toBeDisabled();
    await page.getByTestId('publish-confirm').check();
    await page.getByTestId('publish-btn').click();
    await expect(page.getByTestId('portfolio-status')).toHaveText('Published');
    const link = (await page.getByTestId('share-link').innerText()).trim();
    expect(link).toMatch(/\/p\/tok/);
    expect(state.requests.find((r) => r.path.endsWith('/publish'))!.body.confirm).toBe(true);

    // anonymous visitor: a fresh context with no token
    const visitor = await browser.newContext();
    const vp = await visitor.newPage();
    await mockApi(vp, state); // same in-memory state, no token
    await vp.goto(new URL(link).pathname);
    await expect(vp.getByTestId('portfolio-render')).toBeVisible();
    await expect(vp.getByTestId('pf-name-out')).toHaveText('Ada Lovelace');
    await expect(vp.getByTestId('pf-email-out')).toHaveText('a***@example.com');
    const body = await vp.locator('body').innerText();
    for (const hidden of ['ada@example.com', '7946', 'Pioneer of computing', 'London']) expect(body).not.toContain(hidden);
    expect(await vp.locator('head meta[name="robots"]').getAttribute('content')).toContain('noindex');
    expect(state.requests.filter((r) => r.path.startsWith('/public/')).every((r) => !r.auth)).toBe(true);
    await visitor.close();
  });

  test('a password gates the public page and can be removed', async ({ page, browser }) => {
    const state = await setup(page);
    await createPortfolio(page);
    await page.getByTestId('publish-confirm').check();
    await page.getByTestId('publish-btn').click();
    const path = new URL((await page.getByTestId('share-link').innerText()).trim()).pathname;
    await page.getByTestId('policy-password').fill('short');
    await page.getByTestId('save-policy').click();
    expect(state.requests.some((r) => r.method === 'PATCH' && r.body?.password)).toBe(false); // too short, blocked client-side
    await page.getByTestId('policy-password').fill('correct horse');
    await page.getByTestId('save-policy').click();
    await expect(page.getByTestId('policy-remove-password')).toBeVisible();

    const visitor = await browser.newContext();
    const vp = await visitor.newPage();
    await mockApi(vp, state);
    await vp.goto(path);
    await expect(vp.getByTestId('password-gate')).toBeVisible();
    await expect(vp.getByTestId('portfolio-render')).toHaveCount(0); // nothing leaks before the password
    await vp.getByTestId('gate-password').fill('wrong password');
    await vp.getByTestId('gate-submit').click();
    await expect(vp.getByTestId('gate-error')).toContainText('Incorrect password');
    await vp.getByTestId('gate-password').fill('correct horse');
    await vp.getByTestId('gate-submit').click();
    await expect(vp.getByTestId('pf-name-out')).toHaveText('Ada Lovelace');
    const hit = state.requests.filter((r) => r.path.startsWith('/public/'));
    expect(hit.every((r) => !r.auth)).toBe(true);
    expect(vp.url()).not.toContain('correct'); // never in the URL
    await visitor.close();

    await page.getByTestId('policy-remove-password').check();
    await page.getByTestId('save-policy').click();
    await expect(page.getByTestId('policy-remove-password')).toHaveCount(0);
  });

  test('revoking makes the link stop working immediately', async ({ page }) => {
    await setup(page);
    await createPortfolio(page);
    await page.getByTestId('publish-confirm').check();
    await page.getByTestId('publish-btn').click();
    const path = new URL((await page.getByTestId('share-link').innerText()).trim()).pathname;
    await page.getByTestId('revoke-btn').click();
    await expect(page.locator('ion-alert')).toHaveCount(1);
    await page.locator('ion-alert').getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByTestId('portfolio-status')).toHaveText('Revoked');
    await expect(page.getByTestId('share-box')).toHaveCount(0);
    await page.goto(path);
    await expect(page.getByTestId('public-unavailable')).toBeVisible();
  });

  test('an expired or unknown link shows the same neutral message', async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto('/p/does-not-exist');
    await expect(page.getByTestId('public-unavailable')).toBeVisible();
  });

  test('a new version does not change the live page until published', async ({ page }) => {
    const state = await setup(page);
    await createPortfolio(page);
    await page.getByTestId('publish-confirm').check();
    await page.getByTestId('publish-btn').click();
    await expect(page.getByTestId('portfolio-status')).toHaveText('Published');
    await page.getByTestId('header-vis-headline').selectOption('public');
    await page.getByTestId('save-version').click();
    await expect(page.getByTestId('version-2')).toBeVisible();
    await expect(page.getByTestId('version-1')).toContainText('Live');
    await expect(page.getByTestId('version-2')).not.toContainText('Live');
    expect(state.requests.some((r) => r.path.endsWith('/versions') && r.method === 'POST')).toBe(true);
  });

  test('shows an error banner when the API fails', async ({ page }) => {
    const state = await setup(page);
    state.failNext = { path: /^\/portfolios$/, status: 500 };
    await page.goto('/portfolio');
    await expect(page.getByTestId('portfolio-error')).toBeVisible();
  });

  test('the hub links to the portfolio and the page has no horizontal overflow', async ({ page }) => {
    await setup(page);
    await page.goto('/career-tools');
    await page.getByTestId('tool-portfolio').click();
    await expect(page).toHaveURL(/\/portfolio$/);
    await page.getByTestId('portfolio-new').click();
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(m.doc).toBeLessThanOrEqual(m.win);
  });
});
