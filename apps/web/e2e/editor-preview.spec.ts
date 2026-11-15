import { expect, test } from '@playwright/test';
import { sampleProfile } from './support/mock-api';
import { closeEditorPanel, openEditorPanel, RESUME_ID, setup } from './support/setup';

test.describe('Resume editor', () => {
  test('edits details and sections, tracks unsaved state and saves exact payload', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(`/resumes/${RESUME_ID}`);
    await expect(page.getByTestId('save-state')).toHaveText('All changes saved');
    await expect(page.getByTestId('editor-save')).toBeDisabled();

    await page.getByTestId('editor-name').fill('Staff Engineer CV');
    await openEditorPanel(page);
    await page.getByTestId('visible-projects').uncheck();
    await page.getByTestId('down-summary').click();
    await closeEditorPanel(page);
    await page.getByTestId('editor-status').selectOption('ACTIVE');
    await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes');

    await page.getByTestId('editor-save').click();
    await expect(page.getByTestId('save-state')).toHaveText('All changes saved');
    const patch = state.requests.find((r) => r.method === 'PUT')!;
    expect(patch.body.name).toBe('Staff Engineer CV');
    expect(patch.body.status).toBe('ACTIVE');
    expect(patch.body.sections[0].type).toBe('experience');
    expect(patch.body.sections[1].type).toBe('summary');
    expect(patch.body.sections.find((s: any) => s.type === 'projects').visible).toBe(false);
  });

  test('design overrides are sent only when set and can be reset', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(`/resumes/${RESUME_ID}`);
    await openEditorPanel(page);
    await page.getByTestId('accent').fill('#336699');
    await page.getByTestId('base-size').fill('11');
    await page.getByTestId('page-size').selectOption('LETTER');
    await closeEditorPanel(page);
    await page.getByTestId('editor-save').click();
    await expect(page.getByTestId('save-state')).toHaveText('All changes saved');
    expect(state.requests.find((r) => r.method === 'PUT')!.body.overrides).toEqual({ accent: '#336699', baseSizePt: 11, pageSize: 'LETTER' });
    await openEditorPanel(page);
    await page.getByRole('button', { name: 'Template default' }).click();
    await closeEditorPanel(page);
    await page.getByTestId('editor-save').click();
    await expect.poll(() => state.requests.filter((r) => r.method === 'PUT').length).toBe(2);
    expect(state.requests.filter((r) => r.method === 'PUT')[1].body.overrides.accent).toBeUndefined();
  });

  test('blocks saving an empty name', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(`/resumes/${RESUME_ID}`);
    await page.getByTestId('editor-name').fill('   ');
    await expect(page.getByTestId('editor-save')).toBeDisabled();
  });

  test('saves immutable versions (only when there are no unsaved edits)', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(`/resumes/${RESUME_ID}`);
    await openEditorPanel(page);
    await expect(page.getByTestId('no-versions')).toBeVisible();
    await page.getByTestId('save-version').click();
    await expect(page.getByTestId('version-list')).toContainText('Version 1');
    await closeEditorPanel(page);
    await page.getByTestId('editor-role').fill('Changed');
    await expect(page.getByTestId('save-version')).toBeDisabled();
  });

  test('shows a not-found state for an unknown resume', async ({ page }) => {
    await setup(page);
    await page.goto('/resumes/22222222-2222-4222-8222-222222222222');
    await expect(page.getByTestId('editor-error')).toHaveText('Resume not found.');
  });

  test('exports PDF and HTML to a local download without storing anything server-side', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(`/resumes/${RESUME_ID}?step=export`);
    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-pdf').click()]);
    expect(pdf.suggestedFilename()).toBe('Engineer-CV.pdf');
    const [html] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-html').click()]);
    expect(html.suggestedFilename()).toBe('Engineer-CV.html');
    expect(state.exportCalls).toEqual(['pdf', 'html']);
  });

  test('shows an error toast when export fails', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(`/resumes/${RESUME_ID}?step=export`);
    state.failNext = { path: /export/, status: 500 };
    await page.getByTestId('export-pdf').click();
    await expect(page.getByText('Injected failure')).toBeVisible();
  });
});

test.describe('Preview (dedicated route)', () => {
  test('opens as its own route (no dashboard navigation) and renders the render model', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(`/resumes/${RESUME_ID}/preview`);
    await expect(page.getByTestId('doc-name')).toHaveText('Ada Lovelace');
    await expect(page.getByTestId('doc-experience')).toContainText('Wrote the first published algorithm.');
    await expect(page.getByTestId('doc-skills')).toContainText('Mathematics, Algorithms');
    await expect(page.locator('nav[aria-label="Primary"]')).toHaveCount(0);
    await expect(page.getByTestId('page-count')).toHaveText('1 page · A4');
  });

  test('zoom and fit controls change the scale', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(`/resumes/${RESUME_ID}/preview`);
    await expect(page.getByTestId('sheet')).toBeVisible();
    const level = page.getByTestId('zoom-level');
    const pct = async () => parseInt(await level.innerText());
    const z0 = await pct();
    await page.getByTestId('zoom-in').click();
    await expect.poll(pct, 'first zoom-in renders a larger scale').toBeGreaterThan(z0); // the label re-renders after the click returns
    const z1 = await pct();
    await page.getByTestId('zoom-in').click();
    await expect.poll(pct, 'second zoom-in renders a larger scale').toBeGreaterThan(z1);
    await page.getByTestId('zoom-out').click();
    await page.getByTestId('fit-width').click();
    await expect(page.getByTestId('fit-width')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('fit-page').click();
    await expect(page.getByTestId('fit-page')).toHaveAttribute('aria-pressed', 'true');
  });

  test('hidden sections are not rendered; Letter size is reflected', async ({ page }) => {
    await setup(page, {
      resume: {
        overrides: { pageSize: 'LETTER' },
        sections: ['summary', 'experience', 'skills', 'education', 'projects', 'certifications', 'languages'].map((type) => ({ type, visible: type !== 'skills' })),
      },
    });
    await page.goto(`/resumes/${RESUME_ID}/preview`);
    await expect(page.getByTestId('doc-experience')).toBeVisible();
    await expect(page.getByTestId('doc-skills')).toHaveCount(0);
    await expect(page.getByTestId('page-count')).toContainText('LETTER');
  });

  test('warns about overflow and shows page guides when content exceeds two pages', async ({ page }) => {
    const bullets = Array.from({ length: 140 }, (_, i) => ({ id: `b${i}`, kind: 'RESPONSIBILITY', content: `Delivered measurable outcome number ${i} across several teams and quarters.`, displayOrder: i }));
    await setup(page, { resume: true, profile: sampleProfile({ experiences: [{ id: 'e1', employerName: 'Big Co', jobTitle: 'Dev', startDate: '2010-01', isCurrent: true, bullets }] }) });
    await page.goto(`/resumes/${RESUME_ID}/preview`);
    await expect(page.getByTestId('overflow-warning')).toContainText('pages');
    await expect(page.locator('.page-guide').first()).toBeVisible();
    await expect(page.getByTestId('page-count')).not.toHaveText(/^1 page/);
  });

  test('renders hostile content as inert text (no HTML injection)', async ({ page }) => {
    await setup(page, { resume: true, profile: sampleProfile({ fullName: '<img src=x onerror="window.__xss=1">Mallory', summary: '<script>window.__xss=2</script>' }) });
    await page.goto(`/resumes/${RESUME_ID}/preview`);
    await expect(page.getByTestId('doc-name')).toContainText('<img src=x');
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
    await expect(page.locator('[data-testid="sheet"] img')).toHaveCount(0);
  });

  test('exports from preview and navigates back to the editor', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(`/resumes/${RESUME_ID}/preview`);
    await expect(page.getByTestId('sheet')).toBeVisible();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('preview-export-pdf').click()]);
    expect(dl.suggestedFilename()).toBe('Ada-Lovelace.pdf');
    expect(state.exportCalls).toEqual(['pdf']);
    await page.getByTestId('back-to-editor').click();
    await expect(page).toHaveURL(new RegExp(`/resumes/${RESUME_ID}$`));
  });

  test('editor saves pending edits before opening preview', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(`/resumes/${RESUME_ID}`);
    await page.getByTestId('editor-name').fill('Renamed');
    await page.getByTestId('editor-preview').click();
    await expect(page).toHaveURL(/\/preview$/);
    expect(state.requests.some((r) => r.method === 'PUT' && r.body.name === 'Renamed')).toBe(true);
  });

  test('saves with the version it last saw; a change made elsewhere is a conflict, never an overwrite (module 28)', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(`/resumes/${RESUME_ID}`);
    await page.getByTestId('editor-name').fill('My edit');
    await page.getByTestId('editor-save').click();
    await expect(page.getByTestId('save-state')).toHaveText('All changes saved');
    const put = state.requests.find((r) => r.method === 'PUT' && r.path === `/resumes/${RESUME_ID}/draft`)!;
    expect(put.body.expectedUpdatedAt).toBe('2026-01-02T10:00:00.000Z');
    expect(state.requests.some((r) => r.method === 'PATCH')).toBe(false);
    // a second save uses the updatedAt returned by the first one
    await page.getByTestId('editor-role').fill('Lead');
    await page.getByTestId('editor-save').click();
    await expect(page.getByTestId('save-state')).toHaveText('All changes saved');
    await expect(page.getByTestId('editor-conflict')).toHaveCount(0);
    // somebody else changes the resume
    state.resumes[0].updatedAt = '2030-01-01T00:00:00.000Z'; state.resumes[0].name = 'Changed elsewhere';
    await page.getByTestId('editor-name').fill('Stale edit');
    await page.getByTestId('editor-save').click();
    await expect(page.getByTestId('editor-conflict')).toContainText('changed somewhere else');
    await expect(page.getByTestId('editor-name')).toHaveValue('Stale edit'); // edits are kept
    await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes');
    expect(state.resumes[0].name).toBe('Changed elsewhere');
    await page.getByTestId('editor-preview').click();
    await expect(page).toHaveURL(new RegExp(`/resumes/${RESUME_ID}$`)); // preview is not opened on an unsaved conflict
    await page.getByTestId('editor-reload').click();
    await expect(page.getByTestId('editor-name')).toHaveValue('Changed elsewhere');
    await expect(page.getByTestId('editor-conflict')).toHaveCount(0);
    await page.getByTestId('editor-name').fill('After reload');
    await page.getByTestId('editor-save').click();
    await expect(page.getByTestId('save-state')).toHaveText('All changes saved');
    expect(state.resumes[0].name).toBe('After reload');
  });

  test('shows an error for an unknown resume', async ({ page }) => {
    await setup(page);
    await page.goto('/resumes/22222222-2222-4222-8222-222222222222/preview');
    await expect(page.getByTestId('preview-error')).toHaveText('Resume not found.');
  });
});
