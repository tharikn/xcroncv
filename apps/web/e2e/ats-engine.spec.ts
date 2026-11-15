import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { sampleProfile } from './support/mock-api';
import { RESUME_ID, setup } from './support/setup';

const JD = `Backend Engineer

Requirements
- 3+ years of experience
- NestJS and PostgreSQL
- Docker

Nice to have
- Terraform
`;

const profile = () => sampleProfile({
  experiences: [{ id: 'e1', employerName: 'Babbage & Co', jobTitle: 'Programmer', startDate: '2020-01', endDate: null, isCurrent: true, location: 'London', bullets: [{ id: 'b1', kind: 'ACHIEVEMENT', content: 'Built NestJS services on PostgreSQL for the billing system.', displayOrder: 0 }] }],
  skills: [{ id: 's1', name: 'Docker', category: 'Core' }],
});

/** Adds a posting through the Job match page (the ATS score reuses stored, reviewed postings), optionally confirming it. */
async function addJob(page: Page, confirm = false) {
  await page.goto(`/match?resumeId=${RESUME_ID}`);
  await page.getByTestId('jd-title').fill('Backend Engineer');
  await page.getByTestId('jd-company').fill('Acme');
  await page.getByTestId('jd-text').fill(JD);
  await page.getByTestId('extract').click();
  await expect(page.getByTestId('review-step')).toBeVisible();
  if (confirm) { await page.getByTestId('confirm-score').click(); await expect(page).toHaveURL(/\/match\/reports\//); }
}

test.describe('Module 07 - ATS engine', () => {
  test('requires sign-in', async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto('/ats');
    await expect(page).toHaveURL(/\/login/);
  });

  test('is reachable from the career tools hub', async ({ page }) => {
    await setup(page);
    await page.goto('/career-tools');
    await page.getByTestId('tool-ats').click();
    await expect(page).toHaveURL(/\/ats$/);
    await expect(page.getByRole('heading', { name: 'ATS score', level: 1 })).toBeVisible();
  });

  test('guides the user when there is no resume or no job posting yet', async ({ page }) => {
    await setup(page);
    await page.goto('/ats');
    await expect(page.getByTestId('ats-no-resumes')).toBeVisible();
    await setup(page, { resume: true });
    await page.goto('/ats');
    await expect(page.getByTestId('ats-no-jobs')).toContainText('Job match');
    await expect(page.getByTestId('ats-run')).toHaveCount(0);
  });

  test('scores a resume against a posting with explained dimensions, evidence and honest wording', async ({ page }) => {
    const state = await setup(page, { resume: true, profile: profile() });
    await addJob(page);
    await page.goto('/ats');
    await expect(page.getByTestId('ats-resume')).toHaveValue(RESUME_ID);
    await expect(page.getByTestId('ats-job')).toContainText('requirements not confirmed');
    await page.getByTestId('ats-run').click();

    const post = state.requests.find((r) => r.method === 'POST' && r.path === `/resumes/${RESUME_ID}/ats-reports`)!;
    expect(Object.keys(post.body)).toEqual(['jobDescriptionId']); // no owner/tenant ids, no resume text sent
    expect(post.auth).toMatch(/^Bearer /);

    await expect(page.getByTestId('ats-score')).toContainText('/ 100 ATS compatibility estimate');
    await expect(page.getByTestId('ats-version-badge')).toContainText('ats-1.0.0');
    await expect(page.getByTestId('ats-confidence')).toContainText('medium');
    await expect(page.getByTestId('ats-disclaimer')).toContainText('does not predict');
    await expect(page.getByTestId('ats-limits')).toContainText('not confirmed');

    // Eight dimensions, each with weight and a text status (not colour only).
    await expect(page.getByTestId('ats-dimensions').locator('li.item-card')).toHaveCount(8);
    const req = page.getByTestId('dim-required_skills');
    await expect(req).toContainText('Weight 20%');
    await expect(req.getByTestId('dim-score')).toContainText('/ 100');
    await expect(req).toContainText(/Strong|Partly supported|Needs attention/);
    // Dimensions the posting gave nothing for are "Not applicable" with a redistribution note, not zero.
    await expect(page.getByTestId('dim-role_title').getByTestId('dim-na')).toContainText('redistributed');

    await req.locator('summary').click();
    const nest = req.locator('li').filter({ hasText: 'NestJS' });
    await expect(nest).toContainText('Found');
    await expect(nest).toContainText('Resume evidence');
    await page.getByTestId('dim-preferred_skills').locator('summary').click();
    const tf = page.getByTestId('dim-preferred_skills').locator('li').filter({ hasText: 'Terraform' });
    await expect(tf).toContainText('Not found');
    await expect(tf).toContainText('only if it reflects work you have actually done');

    await expect(page.getByTestId('ats-strong')).toContainText('NestJS');
    await expect(page.getByTestId('ats-weak')).toContainText('Terraform');
    await expect(page.getByTestId('ats-improvements')).toContainText('Terraform');
    await expect(page.getByTestId('ats-model')).toContainText('Weights are initial values');
  });

  test('a confirmed posting gives high confidence and keeps the score separate from the match score', async ({ page }) => {
    await setup(page, { resume: true, profile: profile() });
    await addJob(page, true);
    await page.goto('/ats');
    await page.getByTestId('ats-run').click();
    await expect(page.getByTestId('ats-confidence')).toContainText('high');
    await expect(page.getByTestId('ats-score')).toBeVisible();
    await expect(page.getByTestId('match-score')).toHaveCount(0);
    await expect(page.getByText('separate from your job match, quality and parsing scores')).toBeVisible();
  });

  test('history lists earlier checks; reopen works; delete asks first', async ({ page }) => {
    await setup(page, { resume: true, profile: profile() });
    await addJob(page);
    await page.goto('/ats');
    await page.getByTestId('ats-run').click();
    await expect(page.getByTestId('ats-score')).toBeVisible();
    const hist = page.getByTestId('ats-history');
    await expect(hist).toContainText('Backend Engineer');
    await expect(hist).toContainText('ats-1.0.0');
    await hist.getByTestId('hist-open').click();
    await expect(page.getByTestId('ats-report')).toBeVisible();

    await hist.getByTestId('hist-delete').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('ion-alert')).toHaveCount(0);
    await expect(hist.getByTestId('hist-open')).toHaveCount(1);
    await hist.getByTestId('hist-delete').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('ats-history')).toHaveCount(0);
    await expect(page.getByTestId('ats-report')).toHaveCount(0);
  });

  test('shows a clear error when the posting no longer exists', async ({ page }) => {
    await setup(page, { resume: true, profile: profile() });
    await addJob(page);
    await page.goto('/ats');
    await page.route('**/resumes/*/ats-reports', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ message: 'Job description not found' }) }) : r.fallback()));
    await page.getByTestId('ats-run').click();
    await expect(page.getByTestId('ats-error')).toContainText('Job description not found');
  });

  test('has no horizontal overflow and no serious accessibility violations', async ({ page }) => {
    await setup(page, { resume: true, profile: profile() });
    await addJob(page);
    await page.goto('/ats');
    await page.getByTestId('ats-run').click();
    await expect(page.getByTestId('ats-score')).toBeVisible();
    await page.getByTestId('dim-required_skills').locator('summary').click();
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(m.doc).toBeLessThanOrEqual(m.win + 1);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  });
});
