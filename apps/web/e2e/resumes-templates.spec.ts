import { expect, test } from '@playwright/test';
import { RESUME_ID, setup } from './support/setup';

test.describe('Resumes list', () => {
  test('shows an empty state, then creates a resume and lands in the editor', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/resumes');
    await expect(page.getByTestId('resumes-empty')).toBeVisible();
    await page.getByTestId('new-resume').click();
    await page.getByTestId('create-resume').click(); // name missing
    await expect(page.getByRole('alert')).toContainText('Give your resume a name');
    await page.getByTestId('resume-name').fill('Backend - Acme');
    await page.getByTestId('resume-role').fill('Backend Engineer');
    await page.getByTestId('resume-template').selectOption('tech-compact');
    await page.getByTestId('create-resume').click();
    await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('editor-name')).toHaveValue('Backend - Acme');
    const post = state.requests.find((r) => r.method === 'POST' && r.path === '/resumes')!;
    expect(post.body).toEqual({ name: 'Backend - Acme', targetRole: 'Backend Engineer', templateId: 'tech-compact' });
  });

  test('warns when there is no career profile and surfaces the API conflict', async ({ page }) => {
    await setup(page, { profile: false });
    await page.goto('/resumes?new=1');
    await expect(page.getByTestId('needs-profile')).toBeVisible();
    await page.getByTestId('resume-name').fill('X');
    await page.getByTestId('create-resume').click();
    await expect(page.getByText('Create your career profile before creating a resume.')).toBeVisible();
  });

  test('lists resumes with actions and deletes only after confirmation', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto('/resumes');
    const card = page.getByTestId(`resume-${RESUME_ID}`);
    await expect(card).toContainText('Engineer CV');
    await expect(card).toContainText('Backend Engineer');

    await card.getByTestId('delete-resume').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('ion-alert')).toHaveCount(0); // wait for the dismiss animation: a second alert must not overlap the first
    await expect(card).toBeVisible();
    expect(state.resumes).toHaveLength(1);

    await card.getByTestId('delete-resume').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('resumes-empty')).toBeVisible();
    expect(state.resumes).toHaveLength(0);
  });

  test('preview and edit links route correctly', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto('/resumes');
    await page.getByTestId('preview-resume').click();
    await expect(page).toHaveURL(new RegExp(`/resumes/${RESUME_ID}/preview$`));
  });
});

test.describe('Template gallery', () => {
  test('lists templates, filters by category and searches', async ({ page }) => {
    await setup(page);
    await page.goto('/templates');
    await expect(page.getByTestId('template-grid').locator('article')).toHaveCount(3);

    await page.getByRole('button', { name: 'Technology' }).click();
    await expect(page.getByTestId('template-grid').locator('article')).toHaveCount(1);
    await expect(page.getByTestId('template-tech-compact')).toBeVisible();

    await page.getByTestId('cat-all').click();
    await page.getByTestId('template-search').fill('graduate');
    await expect(page.getByTestId('template-grid').locator('article')).toHaveCount(1);

    await page.getByTestId('template-search').fill('zzz-no-match');
    await expect(page.getByTestId('templates-empty')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByTestId('template-grid').locator('article')).toHaveCount(3);
  });

  test('"Use template" creates the user CV with that template and goes straight to the editor (Step 3)', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/templates');
    await page.getByTestId('use-graduate-clean').click();
    await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('editor-template')).toContainText('Graduate Clean');
    await expect(page.locator('app-resume-editor').getByTestId('step-3')).toHaveAttribute('aria-current', 'step');
    expect(state.requests.find((r) => r.method === 'POST' && r.path === '/resumes')!.body.templateId).toBe('graduate-clean');
  });

  test('switching template for an existing resume changes only the template', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(`/resumes/${RESUME_ID}`);
    await page.getByTestId('change-template').click();
    await expect(page).toHaveURL(new RegExp(`/templates\\?resumeId=${RESUME_ID}`));
    await page.getByTestId('use-tech-compact').click();
    await expect(page).toHaveURL(new RegExp(`/resumes/${RESUME_ID}$`));
    await expect(page.getByTestId('editor-template')).toContainText('Software Engineer Compact');
    const patch = state.requests.find((r) => r.method === 'PATCH')!;
    expect(patch.body).toEqual({ templateId: 'tech-compact' });
  });
});
