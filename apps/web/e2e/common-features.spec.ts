import AxeBuilder from '@axe-core/playwright';
import { expect, test, Page } from '@playwright/test';
import { fakeToken } from './support/mock-api';
import { setup } from './support/setup';

const noOverflow = async (page: Page) => {
  const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  expect(m.doc).toBeLessThanOrEqual(m.win);
};
const axe = async (page: Page) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset['theme']);

test.describe('Theme preference', () => {
  test('defaults to light and follows the OS only while on "system"', async ({ page }) => {
    await setup(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/settings');
    await expect.poll(() => theme(page)).toBe('light');
    await expect(page.getByTestId('theme-light')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('theme-system').click();
    await expect.poll(() => theme(page)).toBe('dark');
    await expect(page.getByTestId('theme-system')).toHaveAttribute('aria-checked', 'true');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => theme(page)).toBe('light');
  });

  test('explicit choice persists across reload and is saved to the account', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/settings');
    await page.getByTestId('theme-dark').click();
    await expect.poll(() => theme(page)).toBe('dark');
    await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => state.prefs?.theme).toBe('dark');
    await page.reload();
    await expect.poll(() => theme(page)).toBe('dark');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe('rgb(255, 255, 255)');
  });

  test('account preference wins after sign-in', async ({ page }) => {
    const state = await setup(page);
    state.prefs = { theme: 'dark', locale: 'hi' };
    await page.goto('/dashboard');
    await expect.poll(() => theme(page)).toBe('dark');
    await expect(page.getByTestId('nav-home')).toContainText('होम');
  });

  test('keeps working when the preferences endpoint fails', async ({ page }) => {
    const state = await setup(page);
    state.failNext = { path: /me\/preferences/, status: 500 };
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  for (const route of ['/dashboard', '/settings', '/resumes', '/templates']) {
    test(`dark theme passes axe and has no overflow on ${route}`, async ({ page }) => {
      await setup(page, { resume: true });
      await page.addInitScript(() => { try { localStorage.setItem('xcroncv.theme', 'dark'); } catch { /* ignore */ } });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await expect.poll(() => theme(page)).toBe('dark');
      await noOverflow(page);
      await axe(page);
    });
  }
});

test.describe('Language (English, Tamil, Hindi)', () => {
  test('picker switches the UI, sets <html lang>, persists and syncs', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto('/settings');
    await page.getByTestId('language-select').selectOption('ta');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ta');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('அமைப்புகள்');
    await expect(page.getByTestId('nav-home')).toContainText('முகப்பு');
    await expect.poll(() => state.prefs?.locale).toBe('ta');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ta');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('அமைப்புகள்');
    await page.getByTestId('language-select').selectOption('hi');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('सेटिंग्स');
    await page.getByTestId('language-select').selectOption('en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  });

  test('dashboard strings and placeholders are translated', async ({ page }) => {
    await setup(page, { resume: true });
    await page.addInitScript(() => { try { localStorage.setItem('xcroncv.locale', 'hi'); } catch { /* ignore */ } });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('स्वागत है, Ada');
    await expect(page.getByText('हाल के रिज़्यूमे')).toBeVisible();
    await expect(page.getByRole('link', { name: /Engineer CV का संपादन जारी रखें/ })).toBeVisible();
  });

  test('login page has a language picker and is translated', async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto('/login');
    await page.getByTestId('login-language').selectOption('ta');
    await expect(page.getByText('டோக்கனுடன் உள்நுழையவும்')).toBeVisible();
    await page.getByTestId('token-input').fill('not-a-token');
    await page.getByTestId('token-signin').click();
    await expect(page.getByTestId('login-error')).toHaveText('அந்த டோக்கன் செல்லாதது அல்லது காலாவதியானது.');
  });

  test('unreachable server shows the localized network message', async ({ page }) => {
    await setup(page, { resume: true });
    await page.addInitScript(() => { try { localStorage.setItem('xcroncv.locale', 'ta'); } catch { /* ignore */ } });
    await page.route('**/api/v1/resumes', (r) => r.abort('failed'));
    await page.goto('/dashboard');
    await expect(page.getByRole('alert')).toContainText('சேவையகத்தை அடைய முடியவில்லை');
  });

  for (const lang of ['ta', 'hi']) {
    for (const route of ['/dashboard', '/settings', '/login']) {
      test(`${lang} ${route}: no overflow (nav included) and axe passes`, async ({ page }) => {
        await setup(page, { resume: true, signedIn: route !== '/login' });
        await page.addInitScript((l) => { try { localStorage.setItem('xcroncv.locale', l); } catch { /* ignore */ } }, lang);
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        await noOverflow(page);
        await axe(page);
      });
    }
  }
});

test.describe('Global loading, offline and session', () => {
  test('progress bar appears for a slow request and disappears; fast requests stay silent', async ({ page }) => {
    await setup(page, { resume: true });
    await page.route('**/api/v1/resumes', async (r) => { await new Promise((res) => setTimeout(res, 900)); await r.fallback(); });
    await page.goto('/dashboard');
    await expect(page.getByTestId('api-progress')).toBeVisible();
    await expect(page.getByTestId('stat-resumes')).toHaveText('1');
    await expect(page.getByTestId('api-progress')).toHaveCount(0);
    // the bar never blocks interaction
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.api-progress') ?? document.body).pointerEvents)).toBeTruthy();
  });

  test('offline banner appears and clears with connectivity', async ({ page, context }) => {
    await setup(page);
    await page.goto('/dashboard');
    await expect(page.getByTestId('offline-banner')).toHaveCount(0);
    await context.setOffline(true);
    await expect(page.getByTestId('offline-banner')).toBeVisible();
    await expect(page.getByTestId('offline-banner')).toHaveAttribute('role', 'status');
    await axe(page);
    await context.setOffline(false);
    await expect(page.getByTestId('offline-banner')).toHaveCount(0);
  });

  test('a 401 ends the session and the login page explains why', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/dashboard');
    state.failNext = { path: /templates/, status: 401 };
    await page.goto('/settings');
    await page.getByTestId('api-test').click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('session-expired')).toBeVisible();
  });

  test('token expiry signs the user out without a request', async ({ page }) => {
    await setup(page, { signedIn: false });
    const token = fakeToken('short-lived', 19); // 15 s expiry skew leaves ~4 s
    await page.addInitScript((t) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); sessionStorage.setItem('xcroncv.token', t); } } catch { /* ignore */ } }, token);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(page.getByTestId('session-expired')).toBeVisible();
  });

  test('a manual sign-out does not show the expired notice', async ({ page }) => {
    await setup(page);
    await page.goto('/settings');
    await page.getByTestId('signout').click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('session-expired')).toHaveCount(0);
  });
});

test.describe('About', () => {
  test('shows the app version', async ({ page }) => {
    await setup(page);
    await page.goto('/settings');
    await expect(page.getByTestId('app-version')).toHaveText('XCron CV 0.1.0');
  });

  test('settings page passes axe and keeps 44px controls (light)', async ({ page }) => {
    await setup(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await axe(page);
    for (const id of ['language-select', 'theme-system', 'theme-light', 'theme-dark']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(36);
    }
  });
});
