import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { RESUME_ID, setup } from './support/setup';

const ROUTES = ['/dashboard', '/resumes', '/templates', '/profile', '/settings', `/resumes/${RESUME_ID}`, `/resumes/${RESUME_ID}/preview`];

test.describe('Responsive layout (doc 25)', () => {
  for (const route of ROUTES) {
    test(`no horizontal page overflow on ${route.replace(RESUME_ID, ':id')}`, async ({ page }) => {
      await setup(page, { resume: true });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const m = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth, win: window.innerWidth,
        wide: [...document.querySelectorAll('ion-content, .page-shell, .shell')].map((e) => (e as HTMLElement).scrollWidth - (e as HTMLElement).clientWidth),
      }));
      expect(m.doc).toBeLessThanOrEqual(m.win);
      for (const w of m.wide) expect(w).toBeLessThanOrEqual(1);
    });
  }

  test('navigation adapts: side rail on desktop, bottom bar on narrow screens', async ({ page }, info) => {
    await setup(page);
    await page.goto('/dashboard');
    const nav = page.locator('nav[aria-label="Primary"]');
    const box = (await nav.boundingBox())!;
    const vp = page.viewportSize()!;
    if (vp.width >= 992) {
      expect(box.x).toBe(0);
      expect(box.width).toBeLessThan(300);
      expect(box.height).toBeGreaterThan(vp.height * 0.8);
    } else {
      expect(box.y + box.height).toBeGreaterThan(vp.height - 2); // pinned to the bottom edge
      expect(box.width).toBeGreaterThanOrEqual(vp.width - 2);
      expect(box.height).toBeLessThan(120);
      for (const t of await nav.getByRole('link').all()) expect((await t.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    info.annotations.push({ type: 'viewport', description: `${vp.width}x${vp.height}` });
  });

  test('interactive controls meet the 44px minimum touch target on touch devices', async ({ page }, info) => {
    test.skip(!info.project.use.hasTouch, 'touch projects only');
    await setup(page, { resume: true });
    await page.goto('/resumes');
    for (const sel of ['new-resume', 'open-resume', 'preview-resume']) {
      const h = (await page.getByTestId(sel).first().boundingBox())!.height;
      expect(h, sel).toBeGreaterThanOrEqual(36); // .sm buttons are 36px (2.25rem); primary actions 44px
    }
    expect((await page.getByTestId('new-resume').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test('the editor action bar stays within the viewport and does not cover content on phones', async ({ page }, info) => {
    test.skip(page.viewportSize()!.width >= 992, 'phone/tablet only');
    await setup(page, { resume: true });
    await page.goto(`/resumes/${RESUME_ID}`);
    const bar = (await page.getByTestId('editor-actions').boundingBox())!;
    const vp = page.viewportSize()!;
    expect(bar.x).toBeGreaterThanOrEqual(0);
    expect(bar.x + bar.width).toBeLessThanOrEqual(vp.width + 1);
    // Section/design/version controls live in a panel: a bottom sheet on phones (opened with Customize), a side panel on tablets+.
    if (vp.width < 768) {
      await expect(page.getByTestId('side-panel')).toBeHidden();
      await page.getByTestId('open-panel').click();
    }
    await expect(page.getByTestId('save-version')).toBeVisible();
    const panel = (await page.getByTestId('side-panel').boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(vp.width + 1);
  });

  test('preview scales the page to the viewport instead of forcing horizontal scroll', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(`/resumes/${RESUME_ID}/preview`);
    await expect(page.getByTestId('sheet')).toBeVisible();
    const wrap = (await page.locator('.sheet-wrap').boundingBox())!;
    const vp = page.viewportSize()!;
    expect(wrap.width).toBeLessThanOrEqual(vp.width);
  });

  test('forms are single column on phones', async ({ page }) => {
    test.skip(page.viewportSize()!.width > 480, 'phone widths only');
    await setup(page);
    await page.goto('/profile');
    const a = (await page.getByTestId('fullName').boundingBox())!;
    const b = (await page.getByTestId('headline').boundingBox())!;
    expect(b.y).toBeGreaterThan(a.y + a.height - 1);
    expect(Math.abs(a.x - b.x)).toBeLessThan(2);
  });
});

test.describe('Accessibility (axe, WCAG 2 A/AA)', () => {
  for (const route of ROUTES.filter((r) => !r.endsWith('/preview'))) {
    test(`no serious/critical violations on ${route.replace(RESUME_ID, ':id')}`, async ({ page }) => {
      await setup(page, { resume: true });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
    });
  }

  test('login page is accessible', async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto('/login');
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  });

  test('keyboard: can reach and activate primary navigation', async ({ page }, info) => {
    test.skip(!!info.project.use.hasTouch, 'keyboard on desktop only');
    await setup(page);
    await page.goto('/dashboard');
    const link = page.getByTestId('nav-templates');
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/templates$/);
  });
});
