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

const work = (bullets: string[]) => sampleProfile({
  experiences: [{ id: 'e1', employerName: 'Babbage & Co', jobTitle: 'Programmer', startDate: '2020-01', endDate: null, isCurrent: true, location: 'London', bullets: bullets.map((content, i) => ({ id: `b${i}`, kind: 'ACHIEVEMENT', content, displayOrder: i })) }],
  skills: [{ id: 's1', name: 'Docker', category: 'Core' }, { id: 's2', name: 'Algorithms', category: 'Core' }],
});

/** Requirement labels are editable inputs, so read their values (not text content). */
const labels = (page: Page, group: string) => page.getByTestId(group).getByTestId('req-label').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));

async function pasteJd(page: Page, text = JD) {
  await page.goto(`/match?resumeId=${RESUME_ID}`);
  await page.getByTestId('jd-title').fill('Backend Engineer');
  await page.getByTestId('jd-company').fill('Acme');
  await page.getByTestId('jd-text').fill(text);
  await page.getByTestId('extract').click();
  await expect(page.getByTestId('review-step')).toBeVisible();
}

test.describe('Insights hub', () => {
  test('lists the three tools for a resume and links to each', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto('/insights');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Resume insights');
    await expect(page.getByTestId('insights-resume')).toHaveValue(RESUME_ID);
    await page.getByTestId('go-quality').click();
    await expect(page).toHaveURL(new RegExp(`/quality\\?resumeId=${RESUME_ID}`));
    await page.goBack();
    await page.getByTestId('go-recruiter').click();
    await expect(page).toHaveURL(new RegExp(`/recruiter-view/${RESUME_ID}`));
  });

  test('has a navigation entry', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto('/dashboard');
    await page.getByTestId('nav-insights').click();
    await expect(page).toHaveURL(/\/insights$/);
  });

  test('shows an empty state without resumes and an error banner when the API fails', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/insights');
    await expect(page.getByTestId('insights-empty')).toBeVisible();
    state.failNext = { path: /resumes/, status: 500 };
    await page.goto('/insights');
    await expect(page.getByTestId('insights-error')).toBeVisible();
  });
});

test.describe('Job match (docs 23, 29)', () => {
  test('paste, review and edit requirements, confirm, then see an evidence-linked score', async ({ page }) => {
    const state = await setup(page, { resume: true, profile: work(['Built NestJS services on PostgreSQL for the billing system.']) });
    await pasteJd(page);

    // Extracted by rules and shown for review, grouped, with the source sentence.
    await expect(page.getByTestId('group-required_skill')).toContainText('NestJS');
    await expect(page.getByTestId('group-required_skill')).toContainText('PostgreSQL');
    await expect(page.getByTestId('group-preferred_skill')).toContainText('Terraform');
    await expect(page.getByTestId('group-experience')).toContainText('3+ years');
    await expect(page.getByTestId('req-count')).toContainText('of');

    // Untick Terraform, add Kubernetes.
    const terraform = page.getByTestId('group-preferred_skill').locator('li').filter({ hasText: 'Terraform' });
    await terraform.getByTestId('req-include').uncheck();
    await page.getByTestId('new-label').fill('Kubernetes');
    await page.getByTestId('add-req-btn').click();
    await expect.poll(() => labels(page, 'group-required_skill')).toContain('Kubernetes');

    await page.getByTestId('confirm-score').click();
    await expect(page).toHaveURL(/\/match\/reports\//);
    await expect(page.getByTestId('match-score')).toBeVisible();
    await expect(page.getByTestId('report-title')).toContainText('Backend Engineer');
    await expect(page.getByTestId('report-version')).toContainText('working draft');

    // Requirements were PATCHed (whitelisted fields only) with confirm, then a report was created.
    const patch = state.requests.find((r) => r.method === 'PATCH' && r.path.startsWith('/job-descriptions/'))!;
    expect(patch.body.confirm).toBe(true);
    expect(patch.body.requirements.every((r: any) => !('normalized' in r) && !('degreeLevel' in r))).toBe(true);
    expect(patch.body.requirements.find((r: any) => r.label === 'Terraform').included).toBe(false);
    expect(patch.body.requirements.find((r: any) => r.label === 'Kubernetes')).toMatchObject({ type: 'required_skill', origin: 'USER' });
    expect(state.requests.some((r) => r.method === 'POST' && /match-reports$/.test(r.path))).toBe(true);

    // Evidence statuses and explanations.
    const nestjs = page.getByTestId('items').locator('li').filter({ hasText: 'NestJS' }).first();
    await expect(nestjs.getByTestId('item-status')).toHaveText('Strong evidence');
    await expect(nestjs.getByTestId('evidence')).toBeVisible();
    const docker = page.getByTestId('items').locator('li').filter({ hasText: 'Docker' }).first();
    await expect(docker.getByTestId('item-status')).toHaveText('Partial evidence');
    const k8s = page.getByTestId('items').locator('li').filter({ hasText: 'Kubernetes' }).first();
    await expect(k8s.getByTestId('item-status')).toHaveText('Not found');
    await expect(k8s.getByTestId('evidence')).toHaveCount(0);
    await expect(k8s).toContainText('No evidence');

    // Filters.
    await page.getByTestId('filter-missing').click();
    await expect(page.getByTestId('items').locator('li')).toHaveCount(1);
    await page.getByTestId('filter-all').click();

    // Dimensions: non-applicable dimensions are N/A and the weight is redistributed.
    await expect(page.getByTestId('dim-score-role_seniority')).toHaveText('N/A');
    await expect(page.getByTestId('dim-required_skills')).toContainText('used');
    await expect(page.getByTestId('limitation').first()).toContainText('redistributed');
    // Honest framing.
    await expect(page.getByTestId('disclaimer')).toContainText('not a hiring probability');
    await expect(page.getByTestId('coverage-badge')).toBeVisible();
  });

  test('score is tied to the chosen resume version', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.versions[RESUME_ID] = [{ id: 'ver-1', versionNumber: 1, changeSummary: 'First cut', createdAt: '2026-01-02T10:00:00.000Z' }];
    await pasteJd(page, 'Requirements\n- Algorithms\n- Docker');
    // The version select is part of step 1 and stays editable after extraction.
    await page.getByTestId('match-version').selectOption('ver-1');
    await page.getByTestId('confirm-score').click();
    await expect(page.getByTestId('report-version')).toContainText('version 1');
    const post = state.requests.find((r) => r.method === 'POST' && /match-reports$/.test(r.path))!;
    expect(post.body.resumeVersionId).toBe('ver-1');
  });

  test('validates the paste form and needs at least one included requirement', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(`/match?resumeId=${RESUME_ID}`);
    await page.getByTestId('extract').click();
    await expect(page.getByTestId('jd-invalid')).toBeVisible();
    await page.getByTestId('jd-title').fill('Engineer');
    await page.getByTestId('jd-text').fill('Requirements\n- Docker');
    await page.getByTestId('extract').click();
    await page.getByTestId('req-include').first().uncheck();
    await expect(page.getByTestId('confirm-score')).toBeDisabled();
    await page.getByTestId('req-include').first().check();
    await expect(page.getByTestId('confirm-score')).toBeEnabled();
  });

  test('shows an empty state when nothing could be extracted and lets the user add requirements', async ({ page }) => {
    await setup(page, { resume: true });
    await pasteJd(page, 'We are a lovely company with excellent snacks and a big garden.');
    await expect(page.getByTestId('no-reqs')).toBeVisible();
    await expect(page.getByTestId('jd-warning')).toBeVisible();
    await expect(page.getByTestId('confirm-score')).toBeDisabled();
    await page.getByTestId('new-label').fill('Docker');
    await page.getByTestId('add-req-btn').click();
    await expect(page.getByTestId('confirm-score')).toBeEnabled();
  });

  test('URL import: login-walled sources fall back to paste, public pages import, private addresses are refused', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(`/match?resumeId=${RESUME_ID}`);
    await page.getByTestId('mode-url').click();

    await page.getByTestId('jd-url').fill('https://www.linkedin.com/jobs/view/123');
    await page.getByTestId('fetch-url').click();
    await expect(page.getByTestId('import-status')).toHaveAttribute('data-status', 'manual_paste_required');
    await expect(page.getByTestId('import-status')).toContainText('Paste the job description');
    await expect(page.getByTestId('review-step')).toHaveCount(0);

    await page.getByTestId('jd-url').fill('http://169.254.169.254/latest/meta-data');
    await page.getByTestId('fetch-url').click();
    await expect(page.getByTestId('import-status')).toHaveAttribute('data-status', 'unsupported_source');

    await page.getByTestId('jd-url').fill('https://good.example.com/jobs/1');
    await page.getByTestId('fetch-url').click();
    await expect(page.getByTestId('review-step')).toBeVisible();
    await expect(page.getByTestId('group-required_skill')).toContainText('NestJS');
    expect(state.requests.filter((r) => r.path === '/job-descriptions/import-url')).toHaveLength(3);

    // Fallback button switches to paste mode.
    await page.getByTestId('start-over').click();
    await page.getByTestId('jd-url').fill('https://broken.example.com/x');
    await page.getByTestId('fetch-url').click();
    await expect(page.getByTestId('import-status')).toHaveAttribute('data-status', 'retrieval_failed');
    await page.getByTestId('switch-paste').click();
    await expect(page.getByTestId('paste-form')).toBeVisible();
  });

  test('editing requirements after a report marks it stale; recalculating keeps both in history', async ({ page }) => {
    await setup(page, { resume: true, profile: work(['Built NestJS services on PostgreSQL.']) });
    await pasteJd(page, 'Requirements\n- NestJS\n- Docker');
    await page.getByTestId('confirm-score').click();
    await expect(page.getByTestId('match-score')).toBeVisible();
    await expect(page.getByTestId('stale-banner')).toHaveCount(0);

    await page.getByTestId('edit-reqs').click();
    await expect(page.getByTestId('review-step')).toBeVisible();
    await page.getByTestId('new-label').fill('Terraform');
    await page.getByTestId('add-req-btn').click();
    await page.getByTestId('confirm-score').click();
    await expect(page.getByTestId('match-score')).toBeVisible();

    await page.goto(`/match?resumeId=${RESUME_ID}`);
    await expect(page.getByTestId('history-list').locator('li')).toHaveCount(2);
    await expect(page.getByTestId('comparison')).toContainText('Backend Engineer');
    await expect(page.getByTestId('history-list')).toContainText('Job edited since');
    await page.getByTestId('open-report').last().click();
    await expect(page.getByTestId('stale-banner')).toBeVisible();
    await page.getByTestId('recalc-inline').click();
    // Ionic keeps the previous page in the DOM (hidden), so only look at what the user can see.
    await expect(page.locator('[data-testid="stale-banner"]:visible')).toHaveCount(0);
    await expect(page.locator('[data-testid="match-score"]:visible')).toBeVisible();
  });

  test('deleting a report asks for confirmation and removes it', async ({ page }) => {
    await setup(page, { resume: true });
    await pasteJd(page, 'Requirements\n- Docker');
    await page.getByTestId('confirm-score').click();
    await expect(page.getByTestId('match-score')).toBeVisible();
    await page.getByTestId('delete-report').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/match$/);
    await expect(page.getByTestId('history-empty')).toBeVisible();
  });

  test('requests carry the bearer token and nothing but structured data is sent', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await pasteJd(page, 'Requirements\n- Docker');
    const create = state.requests.find((r) => r.path === '/job-descriptions' && r.method === 'POST')!;
    expect(create.auth).toMatch(/^Bearer /);
    expect(create.body.retainRawText).toBe(false);
  });
});

test.describe('Quality and export check (docs 20, 31)', () => {
  test('runs a review: score, readiness, findings with locations, filters, evidence', async ({ page }) => {
    await setup(page, { resume: true, profile: work(['Responsible for billing.', 'built dashboards for the finance team.', 'Delivered world-class results.']) });
    await page.goto(`/quality?resumeId=${RESUME_ID}`);
    await expect(page.getByTestId('q-history-empty')).toBeVisible();
    await page.getByTestId('run-review').click();
    await expect(page.getByTestId('quality-score')).toBeVisible();
    await expect(page.getByTestId('readiness')).toHaveAttribute('data-readiness', 'review_recommended');
    await expect(page.getByTestId('count-warning')).toContainText('1 Warning');
    const weak = page.getByTestId('finding-WRITING.WEAK_PHRASE');
    await expect(weak).toContainText('Experience: Programmer, bullet 1');
    await expect(weak.getByTestId('finding-evidence')).toContainText('Responsible for billing.');
    await expect(page.getByTestId('finding-CONTENT.SUPERLATIVE').getByTestId('confirm-badge')).toBeVisible();
    await page.getByTestId('sev-warning').click();
    await expect(page.getByTestId('findings').locator('li')).toHaveCount(1);
    await page.getByTestId('sev-critical').click();
    await expect(page.getByTestId('no-shown')).toBeVisible();
    await expect(page.getByTestId('qdim-writing')).toBeVisible();
    await expect(page.getByTestId('q-history').locator('li')).toHaveCount(1);
  });

  test('a clean resume shows no findings and is ready; the score is a quality score only', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(`/quality?resumeId=${RESUME_ID}`);
    await page.getByTestId('run-review').click();
    await expect(page.getByTestId('no-findings')).toBeVisible();
    await expect(page.getByTestId('readiness')).toHaveAttribute('data-readiness', 'ready');
    await expect(page.getByTestId('quality-score')).toHaveText('100');
    await expect(page.getByTestId('match-score')).toHaveCount(0); // no job-match figure on the quality page
  });

  test('a regression is explained against the previous review', async ({ page }) => {
    const state = await setup(page, { resume: true, profile: work(['Responsible for billing.']) });
    await page.goto(`/quality?resumeId=${RESUME_ID}`);
    await page.getByTestId('run-review').click();
    await expect(page.getByTestId('quality-score')).toBeVisible();
    await expect(page.getByTestId('comparison')).toHaveCount(0);
    state.profile.experiences[0].bullets = [{ id: 'b9', kind: 'ACHIEVEMENT', content: 'Cut billing errors by 40%.', displayOrder: 0 }];
    await page.getByTestId('run-review').click();
    await expect(page.getByTestId('comparison')).toContainText('1 resolved');
    await expect(page.getByTestId('q-history').locator('li')).toHaveCount(2);
  });

  test('shows an error banner when the review fails', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(`/quality?resumeId=${RESUME_ID}`);
    await expect(page.getByTestId('q-history-empty')).toBeVisible();
    state.failNext = { path: /quality-reviews/, status: 500 };
    await page.getByTestId('run-review').click();
    await expect(page.getByTestId('quality-error')).toBeVisible();
  });
});

test.describe('Recruiter view (doc 22)', () => {
  const multi = () => sampleProfile({
    email: 'ada@example.com', phone: '+44 20 7946 0000',
    experiences: [
      { id: 'e1', employerName: 'Babbage & Co', jobTitle: 'Programmer', startDate: '2020-01', endDate: null, isCurrent: true, location: 'London', bullets: ['Wrote the first published algorithm.', 'Responsible for the engine.', 'Cut errors 40%.'].map((c, i) => ({ id: `b${i}`, kind: 'ACHIEVEMENT', content: c, displayOrder: i })) },
      { id: 'e2', employerName: 'Old Co', jobTitle: 'Analyst', startDate: '2015-01', endDate: '2019-12', isCurrent: false, location: 'London', bullets: [{ id: 'b8', kind: 'ACHIEVEMENT', content: 'Analysed things.', displayOrder: 0 }] },
    ],
  });

  test('quick scan collapses and says what it collapsed; full content shows everything', async ({ page }) => {
    await setup(page, { resume: true, profile: multi() });
    await page.goto(`/recruiter-view/${RESUME_ID}`);
    await expect(page.getByTestId('rv-name')).toHaveText('Ada Lovelace');
    await expect(page.getByTestId('rv-readonly')).toContainText('Nothing here changes your resume');
    await expect(page.getByTestId('rv-collapsed')).toContainText('Quick scan collapsed');
    await expect(page.getByTestId('rv-item-experience-1')).toContainText('Analyst'); // title kept even when collapsed
    await expect(page.getByTestId('rv-doc')).not.toContainText('Responsible for the engine.');
    await page.getByTestId('show-all').click();
    await expect(page.getByTestId('rv-collapsed')).toHaveCount(0);
    await expect(page.getByTestId('rv-doc')).toContainText('Responsible for the engine.');
    await expect(page.getByTestId('rv-doc')).toContainText('Analysed things.');
    await expect(page.getByTestId('mode-full')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('rv-overview')).toContainText('Programmer');
  });

  test('anonymising hides contact details and says so; turning it off restores them', async ({ page }) => {
    await setup(page, { resume: true, profile: multi() });
    await page.goto(`/recruiter-view/${RESUME_ID}`);
    await expect(page.getByTestId('rv-contacts')).toContainText('ada@example.com');
    await page.getByTestId('anonymize').check();
    await expect(page.getByTestId('rv-anon-banner')).toBeVisible();
    await expect(page.getByTestId('rv-contacts')).toContainText('[email hidden]');
    await expect(page.locator('body')).not.toContainText('ada@example.com');
    await expect(page.locator('body')).not.toContainText('7946');
    await page.getByTestId('anonymize').uncheck();
    await expect(page.getByTestId('rv-contacts')).toContainText('ada@example.com');
  });

  test('review notes are optional, link to findings and can be hidden', async ({ page }) => {
    await setup(page, { resume: true, profile: multi() });
    await page.goto(`/recruiter-view/${RESUME_ID}`);
    await page.getByTestId('mode-full').click();
    await expect(page.getByTestId('rv-note')).toHaveCount(0);
    await page.getByTestId('show-notes').check();
    await expect(page.getByTestId('rv-note').first()).toHaveAttribute('data-rule', 'WRITING.WEAK_PHRASE');
    await page.getByTestId('show-notes').uncheck();
    await expect(page.getByTestId('rv-note')).toHaveCount(0);
  });

  test('is read-only: only GET requests to the recruiter-view endpoint, no resume writes, no score shown', async ({ page }) => {
    const state = await setup(page, { resume: true, profile: multi() });
    await page.goto(`/recruiter-view/${RESUME_ID}`);
    await page.getByTestId('mode-full').click();
    await page.getByTestId('anonymize').check();
    await expect(page.getByTestId('rv-anon-banner')).toBeVisible();
    const writes = state.requests.filter((r) => r.method !== 'GET' && r.method !== 'OPTIONS');
    expect(writes).toEqual([]);
    expect(state.requests.every((r) => r.path.startsWith(`/resumes/${RESUME_ID}`) || r.path === '/career-profile' || r.path === '/templates')).toBe(true);
    await expect(page.getByTestId('print')).toBeVisible();
    await expect(page.locator('[data-testid="rv-doc"]')).not.toContainText(/\bscore\b/i);
  });

  test('section navigation is keyboard reachable and an unknown resume shows an error', async ({ page }) => {
    await setup(page, { resume: true, profile: multi() });
    await page.goto(`/recruiter-view/${RESUME_ID}`);
    await expect(page.getByTestId('rv-nav')).toBeVisible();
    await page.getByTestId('nav-experience').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('rv-section-experience')).toBeVisible();
    await page.goto('/recruiter-view/00000000-0000-4000-8000-0000000000ff');
    await expect(page.getByTestId('rv-error')).toBeVisible();
  });
});

test.describe('Insights: responsive layout and accessibility', () => {
  const routes = ['/insights', '/match', '/quality', `/recruiter-view/${RESUME_ID}`];
  for (const route of routes) {
    test(`no horizontal overflow and no serious a11y violations on ${route.replace(RESUME_ID, ':id')}`, async ({ page }) => {
      await setup(page, { resume: true, profile: work(['Responsible for billing.', 'Built NestJS services.']) });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1').first()).toBeVisible();
      if (route === '/quality') { await page.getByTestId('run-review').click(); await expect(page.getByTestId('quality-score')).toBeVisible(); }
      if (route === '/match') { await page.getByTestId('jd-title').fill('Engineer'); await page.getByTestId('jd-text').fill(JD); await page.getByTestId('extract').click(); await expect(page.getByTestId('review-step')).toBeVisible(); }
      const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth, wide: [...document.querySelectorAll('ion-content, .page-shell, .shell')].map((e) => (e as HTMLElement).scrollWidth - (e as HTMLElement).clientWidth) }));
      expect(m.doc).toBeLessThanOrEqual(m.win);
      for (const w of m.wide) expect(w).toBeLessThanOrEqual(1);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    });
  }

  test('match report is responsive and accessible', async ({ page }) => {
    await setup(page, { resume: true, profile: work(['Built NestJS services on PostgreSQL.']) });
    await pasteJd(page);
    await page.getByTestId('confirm-score').click();
    await expect(page.getByTestId('match-score')).toBeVisible();
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(m.doc).toBeLessThanOrEqual(m.win);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  });
});

test.describe('Export extraction check (docs 20/31)', () => {
  test('shows what a text extractor recovers from PDF and DOCX without a score', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(`/quality?resumeId=${RESUME_ID}`);
    await page.getByTestId('run-export-check').click();
    await expect(page.getByTestId('extract-pdf')).toContainText('text read back cleanly');
    await expect(page.getByTestId('extract-docx')).toContainText('needs attention');
    await expect(page.getByTestId('extract-finding')).toContainText('10% of words');
    await expect(page.getByTestId('export-check')).toContainText('not an employer ATS result');
    await expect(page.getByTestId('quality-score')).toHaveCount(0); // a separate check, not a score
  });
});
