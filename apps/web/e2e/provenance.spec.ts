import { expect, test } from '@playwright/test';
import { m2628 } from './support/mock-m26-28';
import { RESUME_ID, setup } from './support/setup';

const confirmedFact = (id = '99999999-0000-4000-8000-000000000001') => ({ id, kind: 'ACHIEVEMENT', origin: 'USER_ENTERED', status: 'CONFIRMED', title: 'Team lead work', data: { action: 'Led the platform team', skills: [] }, source: null, revision: 1, updatedAt: '', confirmedAt: '' });

test.describe('Module 27 - Evidence check', () => {
  test('requires sign-in and is reachable from the hub', async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto('/evidence-check');
    await expect(page).toHaveURL(/\/login/);
    await setup(page, { resume: true });
    await page.goto('/career-tools');
    await page.getByTestId('tool-evidence-check').click();
    await expect(page).toHaveURL(/\/evidence-check$/);
  });

  test('checks a resume: honest wording, summary counts, filters; nothing is changed', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto('/evidence-check');
    await page.getByTestId('pv-run').click();
    await expect(page.getByTestId('pv-result')).toContainText('not that the statement is false');
    await expect(page.getByTestId('sum-direct')).toContainText('Directly supported: 1');
    await expect(page.getByTestId('sum-absent')).toContainText('No evidence linked: 1');
    await expect(page.getByTestId('sum-contradictory')).toContainText('Contradicts your evidence: 1');
    await expect(page.getByTestId('claim-contradictory')).toContainText('differs from "90%"');
    await expect(page.getByTestId('claim-direct')).toContainText('Evidence: Programmer: bullet');
    await page.getByTestId('sum-absent').click();
    await expect(page.getByTestId('claim-text')).toHaveCount(1);
    await expect(page.getByTestId('claim-text')).toContainText('Led a team of 12');
    expect(state.requests.some((r) => ['PUT', 'PATCH', 'DELETE'].includes(r.method))).toBe(false);
  });

  test('linking evidence needs a confirmed fact and upgrades the statement; the page says when there are none', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto('/evidence-check');
    await page.getByTestId('pv-run').click();
    await expect(page.getByTestId('no-facts')).toBeVisible();
    m2628(state).facts.push(confirmedFact());
    await page.reload();
    await page.getByTestId('pv-run').click();
    const absent = page.getByTestId('claim-absent');
    await expect(absent.getByTestId('link-save')).toBeDisabled();
    await absent.getByTestId('link-select').selectOption({ index: 1 });
    await absent.getByTestId('link-save').click();
    await expect(page.getByTestId('sum-absent')).toContainText('No evidence linked: 0');
    await expect(page.getByTestId('sum-direct')).toContainText('Directly supported: 2');
    await expect(page.getByTestId('claim-direct').nth(1)).toContainText('linked by you');
  });

  test('a rewrite with new claims cannot be approved until each is acknowledged', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto('/evidence-check');
    await page.getByTestId('rw-original').fill('Wrote the first published algorithm.');
    await page.getByTestId('rw-proposed').fill('Led a team to write the first published algorithm and saved 60% of time');
    await page.getByTestId('rw-run').click();
    await expect(page.getByTestId('rw-verdict')).toHaveText('Needs your approval');
    await expect(page.getByTestId('rw-diff').locator('ins')).not.toHaveCount(0);
    await expect(page.getByTestId('rw-unsupported')).toContainText('Tick each one only if it is true');
    const acks = page.getByTestId('rw-ack');
    await expect(acks).toHaveCount(2);
    await expect(page.getByTestId('rw-approve')).toBeDisabled();
    await acks.nth(0).check();
    await expect(page.getByTestId('rw-approve')).toBeDisabled();
    await acks.nth(1).check();
    await page.getByTestId('rw-approve').click();
    await expect(page.getByTestId('rw-status')).toContainText('approved');
    await expect(page.getByTestId('rw-final')).toHaveValue(/saved 60%/);
  });

  test('a reword with nothing new needs no acknowledgement; rejecting is final', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto('/evidence-check');
    await page.getByTestId('rw-original').fill('Wrote the first published algorithm.');
    await page.getByTestId('rw-proposed').fill('Authored the first published algorithm.');
    await page.getByTestId('rw-run').click();
    await expect(page.getByTestId('rw-verdict')).toHaveText('No new claims found');
    await expect(page.getByTestId('rw-unsupported')).toHaveCount(0);
    await expect(page.getByTestId('rw-approve')).toBeEnabled();
    await page.getByTestId('rw-reject').click();
    await expect(page.getByTestId('rw-status')).toContainText('rejected');
    await expect(page.getByTestId('rw-approve')).toHaveCount(0);
  });

  test('diff is readable without colour (added and removed words are announced)', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto('/evidence-check');
    await page.getByTestId('rw-original').fill('alpha beta');
    await page.getByTestId('rw-proposed').fill('alpha gamma');
    await page.getByTestId('rw-run').click();
    await expect(page.getByTestId('rw-diff')).toContainText('removed: beta');
    await expect(page.getByTestId('rw-diff')).toContainText('added: gamma');
  });

  test('API failures are shown, and the page does not overflow at any width', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto('/evidence-check');
    await page.getByTestId('pv-run').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    state.failNext = { path: /provenance/, status: 500 };
    await page.getByTestId('pv-run').click();
    await expect(page.getByTestId('pv-error')).toContainText('Injected failure');
    void RESUME_ID;
  });
});
