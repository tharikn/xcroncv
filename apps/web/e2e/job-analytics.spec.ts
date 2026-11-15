import { expect, Page, test } from '@playwright/test';
import { setup } from './support/setup';
import { mockCareerTools } from './support/mock-career-tools';

async function record(page: Page, type: string, ref: string, extra: { role?: string; version?: string } = {}) {
  if (!(await page.getByTestId('record-form').isVisible())) await page.getByTestId('record-toggle').click();
  await page.getByTestId('ev-type').selectOption(type);
  await page.getByTestId('ev-date').fill('2026-03-02');
  await page.getByTestId('ev-ref').fill(ref);
  if (extra.role) await page.getByTestId('ev-role').fill(extra.role);
  if (extra.version) await page.getByTestId('ev-ver').fill(extra.version);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/analytics/job-search/events') && r.request().method() === 'POST'),
    page.getByTestId('ev-save').click(),
  ]);
  await expect(page.getByTestId('ev-ref')).toHaveValue(''); // form cleared => the save finished
}

test.describe('Job search analytics (doc 48)', () => {
  test('starts with an honest empty state', async ({ page }) => {
    await setup(page);
    await mockCareerTools(page);
    await page.goto('/job-analytics');
    await expect(page.getByTestId('analytics-empty')).toBeVisible();
    await expect(page.getByTestId('coverage')).toContainText('No authorised job portal is connected');
  });

  test('validates the record form and sends only the minimal event fields', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    await page.goto('/job-analytics');
    await page.getByTestId('record-toggle').click();
    await page.getByTestId('ev-save').click();
    await expect(page.getByRole('alert')).toContainText('Enter an application reference');
    expect(tools.calls.some((c) => c.method === 'POST')).toBe(false);

    await page.getByTestId('ev-ref').fill('acme-backend');
    await page.getByTestId('ev-role').fill('Engineering');
    await page.getByTestId('ev-save').click();
    await expect(page.locator('ion-toast').last()).toContainText('Activity recorded');
    const post = tools.calls.find((c) => c.method === 'POST' && c.path === '/analytics/job-search/events')!;
    expect(post.body.events).toHaveLength(1);
    expect(post.body.events[0]).toMatchObject({ type: 'APPLIED', applicationRef: 'acme-backend', source: 'MANUAL', roleFamily: 'Engineering' });
    expect(post.body.events[0].idempotencyKey).toMatch(/^ui-/);
    expect(JSON.stringify(post.body)).not.toMatch(/userId|tenantId|resume text|description/i);
  });

  test('funnel shows numerator, denominator and counts; totals update', async ({ page }) => {
    await setup(page);
    await mockCareerTools(page);
    await page.goto('/job-analytics');
    await record(page, 'APPLIED', 'a');
    await record(page, 'APPLIED', 'b');
    await record(page, 'APPLIED', 'c');
    await record(page, 'RESPONSE', 'a');
    await record(page, 'INTERVIEW', 'a');
    await expect(page.getByTestId('tot-applied')).toHaveText('3');
    await expect(page.getByTestId('tot-responses')).toHaveText('1');
    await expect(page.getByTestId('tot-interviews')).toHaveText('1');
    await expect(page.getByTestId('stage-applied').getByTestId('stage-rate')).toHaveText('33.3% (1 of 3)');
    await expect(page.getByTestId('stage-responded').getByTestId('stage-rate')).toHaveText('100% (1 of 1)');
    await expect(page.getByTestId('funnel-note').first()).toContainText('not what caused');
    await expect(page.getByTestId('time-to-response')).toContainText('based on 1 application');
  });

  test('hides rates for small resume-version cohorts and never claims causation', async ({ page }) => {
    await setup(page);
    await mockCareerTools(page);
    await page.goto('/job-analytics');
    await record(page, 'APPLIED', 'a', { version: 'resume-v3' });
    await expect(page.getByTestId('version-insights')).toContainText('resume-v3');
    await expect(page.getByTestId('small-cohort')).toContainText('rates are hidden');
    await expect(page.getByTestId('version-insights')).not.toContainText('Response:');
    await expect(page.getByTestId('no-causation')).toContainText('do not show that one version caused');
  });

  test('applies filters to the API request and shows the window', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    await page.goto('/job-analytics');
    await record(page, 'APPLIED', 'a', { role: 'Engineering' });
    await record(page, 'APPLIED', 'b', { role: 'Design' });
    await expect(page.getByTestId('tot-applied')).toHaveText('2');
    await page.getByTestId('f-role').fill('design');
    await page.getByTestId('f-role').blur();
    await expect(page.getByTestId('tot-applied')).toHaveText('1');
    expect(tools.calls.some((c) => c.path.endsWith('/overview') && c.query['roleFamily'] === 'design')).toBe(true);
    await page.getByTestId('f-from').fill('2026-01-01');
    await expect(page.getByTestId('coverage')).toContainText('Since 2026-01-01');
  });

  test('exports to the device and deletes all events after confirmation', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    await page.goto('/job-analytics');
    await record(page, 'APPLIED', 'a');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-analytics').click()]);
    expect(download.suggestedFilename()).toBe('job-search-analytics.json');

    await page.getByTestId('delete-events').click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('ion-alert')).toHaveCount(0);
    await expect(page.locator('ion-alert')).toHaveCount(0);
    expect(tools.events).toHaveLength(1);
    await page.getByTestId('delete-events').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('analytics-empty')).toBeVisible();
    expect(tools.events).toHaveLength(0);
    expect(tools.calls.find((c) => c.method === 'DELETE')!.query['confirm']).toBe('true');
  });

  test('shows an error banner when analytics cannot load', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    tools.failNext = { path: /overview/, status: 503, message: 'Analytics unavailable' };
    await page.goto('/job-analytics');
    await expect(page.getByTestId('analytics-error')).toContainText('Analytics unavailable');
  });
});

test.describe('Job analytics ingestion (doc 48)', () => {
  test('builds events from the vault after confirmation and is safe to repeat', async ({ page }) => {
    await setup(page);
    const tools = await mockCareerTools(page);
    await page.goto('/job-analytics');
    await page.getByTestId('ingest-vault').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('ion-alert')).toHaveCount(0);
    expect(tools.calls.some((c) => c.path === '/analytics/job-search/ingest/vault')).toBe(false); // nothing without a yes
    await page.getByTestId('ingest-vault').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Build events', exact: true }).click();
    await expect(page.locator('ion-alert')).toHaveCount(0);
    await expect(page.getByTestId('analytics-empty')).toHaveCount(0);
    const call = tools.calls.find((c) => c.path === '/analytics/job-search/ingest/vault')!;
    expect(call.body).toEqual({ confirm: true });
    await page.getByTestId('ingest-vault').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Build events', exact: true }).click();
    await expect(page.locator('ion-alert')).toHaveCount(0);
    await expect(page.locator('ion-toast').last()).toContainText('already present');
  });
});
