import { expect, Page, test } from '@playwright/test';
import { setup } from './support/setup';

/** Doc 34: evidence by kind, gaps as missing recorded evidence, editable recommendations, no score. */
test.describe('Career readiness (doc 34)', () => {
  async function createPlan(page: Page, required = 'Algorithm, Rust, Kubernetes', preferred = '') {
    await page.goto('/readiness');
    await page.getByTestId('new-plan').click();
    await page.getByTestId('rd-role').fill('Backend Engineer');
    await page.getByTestId('rd-required').fill(required);
    if (preferred) await page.getByTestId('rd-preferred').fill(preferred);
    await page.getByTestId('create-plan').click();
    await expect(page.getByTestId('plan-heading')).toHaveText('Backend Engineer');
  }

  test('empty state, then evidence is shown by kind with no score', async ({ page }) => {
    await setup(page, { profile: { skills: [{ id: 's1', name: 'Kubernetes' }, { id: 's2', name: 'Algorithms' }] } });
    await page.goto('/readiness');
    await expect(page.getByTestId('rd-empty')).toBeVisible();
    await createPlan(page);
    await expect(page.getByTestId('skill-Algorithm').getByTestId('skill-level')).toHaveText('Demonstrated in experience');
    await expect(page.getByTestId('skill-Kubernetes').getByTestId('skill-level')).toHaveText('Self-reported only');
    await expect(page.getByTestId('skill-Rust').getByTestId('skill-level')).toHaveText('No recorded evidence');
    await expect(page.getByTestId('skill-Rust').getByTestId('skill-statement')).toContainText('does not mean you lack it');
    await expect(page.getByTestId('plan-note')).toContainText('not a score');
    await expect(page.getByTestId('plan-summary')).not.toContainText(/employab|likelihood|%/i);
  });

  test('recommendations are labelled and can be completed, dismissed, reopened and extended', async ({ page }) => {
    await setup(page);
    await createPlan(page, 'Rust');
    const ms = page.getByTestId('milestones').locator('li').first();
    await expect(ms.getByTestId('ms-origin')).toHaveText('Recommendation');
    await ms.getByTestId('ms-done').click();
    await expect(ms.getByTestId('ms-status')).toHaveText('Done');
    await ms.getByTestId('ms-reopen').click();
    await ms.getByTestId('ms-dismiss').click();
    await expect(ms.getByTestId('ms-status')).toHaveText('Dismissed');
    await page.getByTestId('ms-new').fill('Finish a Rust course');
    await page.getByTestId('ms-add').click();
    await expect(page.getByTestId('milestones').locator('li').filter({ hasText: 'Finish a Rust course' }).getByTestId('ms-origin')).toHaveText('Added by you');
  });

  test('re-checking the profile keeps your edits', async ({ page }) => {
    const state = await setup(page);
    await createPlan(page, 'Rust');
    await page.getByTestId('ms-dismiss').first().click();
    state.profile.skills.push({ id: 's9', name: 'Rust' });
    await page.getByTestId('refresh-plan').click();
    await expect(page.getByTestId('skill-Rust').getByTestId('skill-level')).toHaveText('Self-reported only');
    await expect(page.getByTestId('milestones').locator('li').first().getByTestId('ms-status')).toHaveText('Dismissed');
  });

  test('shows transferable evidence without claiming the skill', async ({ page }) => {
    await setup(page, { profile: { projects: [{ id: 'p1', name: 'Pg tool', description: 'Built on PostgreSQL', technologies: [] }] } });
    await createPlan(page, 'MySQL');
    await expect(page.getByTestId('skill-MySQL').getByTestId('skill-level')).toHaveText('No recorded evidence');
    await expect(page.getByTestId('skill-transfer')).toContainText('related, but it is not the same skill');
  });

  test('validates input and handles a missing profile', async ({ page }) => {
    const state = await setup(page, { profile: false });
    await page.goto('/readiness');
    await page.getByTestId('new-plan').click();
    await page.getByTestId('create-plan').click();
    await expect(page.getByTestId('rd-form-error').filter({ hasText: 'Enter the target role' })).toBeVisible();
    expect(state.requests.some((r) => r.method === 'POST' && r.path === '/readiness-plans')).toBe(false);
    await page.getByTestId('rd-role').fill('Dev');
    await page.getByTestId('rd-required').fill('Go');
    await page.getByTestId('create-plan').click();
    await expect(page.locator('ion-toast')).toContainText('Create your career profile first');
  });

  test('delete asks for confirmation; API errors show a banner; no overflow', async ({ page }) => {
    const state = await setup(page);
    await createPlan(page, 'Rust, Algorithms');
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(m.doc).toBeLessThanOrEqual(m.win);
    await page.getByTestId('delete-plan').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('rd-empty')).toBeVisible();
    state.failNext = { path: /^\/readiness-plans$/, status: 500 };
    await page.goto('/readiness');
    await expect(page.getByTestId('rd-error')).toBeVisible();
  });

  test('reachable from the hub', async ({ page }) => {
    await setup(page);
    await page.goto('/career-tools');
    await page.getByTestId('tool-readiness').click();
    await expect(page).toHaveURL(/\/readiness$/);
  });
});

test.describe('Career readiness import (doc 34)', () => {
  test('fills target skills from a saved job description and a career-path role, still editable', async ({ page }) => {
    const state = await setup(page, { profile: { skills: [{ id: 's1', name: 'Kubernetes' }] } });
    await page.goto('/readiness');
    await page.getByTestId('new-plan').click();
    await page.getByTestId('rd-source').selectOption('JOB_DESCRIPTION:jd-1');
    await page.getByTestId('rd-import').click();
    await expect(page.getByTestId('rd-role')).toHaveValue('Senior Platform Engineer');
    await expect(page.getByTestId('rd-required')).toHaveValue('Kubernetes, Terraform');
    await expect(page.getByTestId('rd-preferred')).toHaveValue('Kafka');
    await expect(page.getByTestId('rd-import-note')).toContainText('nothing is added to your profile');
    expect(state.requests.some((r) => r.method === 'POST' && r.path === '/readiness-plans')).toBe(false); // preview creates nothing

    await page.getByTestId('rd-source').selectOption('CAREER_PATH_ROLE:backend-engineer');
    await page.getByTestId('rd-import').click();
    await expect(page.getByTestId('rd-import-note')).toContainText('not a guarantee');
    await page.getByTestId('rd-required').fill('SQL, Docker, Go');
    await page.getByTestId('create-plan').click();
    await expect(page.getByTestId('plan-heading')).toHaveText('Backend Engineer');
    await expect(page.getByTestId('skill-Go')).toBeVisible();
  });
});
