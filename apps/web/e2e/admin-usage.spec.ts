import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { setup } from './support/setup';

test.describe('Admin usage analytics (doc 16)', () => {
  test('shows aggregate KPIs, funnel and suppressed template groups, accessibly', async ({ page }) => {
    await setup(page);
    await page.goto('/admin/usage');
    await expect(page.getByTestId('usage-kpis')).toContainText('Resumes created');
    await expect(page.getByTestId('usage-funnel')).toContainText('EXPORT_SUCCEEDED');
    await expect(page.getByTestId('usage-templates')).toContainText('<3');
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
  });

  test('a non-admin sees a clear access message, not data', async ({ page }) => {
    const state = await setup(page);
    state.usageForbidden = true;
    await page.goto('/admin/usage');
    await expect(page.getByTestId('usage-error')).toContainText('Admin access is required');
    await expect(page.getByTestId('usage-kpis')).toHaveCount(0);
  });

  test('opening the dashboard sends only an allowlisted event with no content', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/dashboard');
    await expect.poll(() => state.requests.find((r) => r.path === '/analytics/usage/events')).toBeTruthy();
    const ev = (state.requests.find((r) => r.path === '/analytics/usage/events')!.body as { events: Record<string, unknown>[] }).events[0];
    expect(Object.keys(ev).sort()).toEqual(['eventId', 'name', 'occurredAt', 'platform']);
    expect(ev['name']).toBe('DASHBOARD_OPENED');
  });
});
