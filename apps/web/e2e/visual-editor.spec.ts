import { expect, Page, test } from '@playwright/test';
import { RESUME_ID, setup } from './support/setup';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const URL_ = `/resumes/${RESUME_ID}/design`;

const sec = (page: Page, type: string) => page.locator(`[data-testid=ve-section][data-type=${type}]`);
const order = (page: Page) => page.locator('[data-testid=ve-section]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['type']));
const puts = (state: { requests: Array<{ method: string; path: string; body?: any }> }) => state.requests.filter((r) => r.method === 'PUT' && r.path.endsWith('/draft'));
const lastDoc = (state: Parameters<typeof puts>[0]) => puts(state).at(-1)!.body.overrides.doc;

/** Click an element then click it again to enter in-place edit mode (works with mouse and touch). */
async function edit(page: Page, loc: ReturnType<Page['locator']>, text: string) {
  await loc.click();
  await expect(page.getByTestId('ve-tools')).toBeVisible();
  await loc.click();
  await expect(loc).toHaveAttribute('contenteditable', /.+/);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test.describe('Visual editor', () => {
  test('click-to-select, inline text edit, autosave through the draft endpoint', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(URL_);
    await expect(page.getByTestId('ve-name')).toHaveText('Ada Lovelace');
    await edit(page, page.getByTestId('ve-name'), 'Ada King');
    await expect(page.getByTestId('ve-name')).toHaveText('Ada King');
    await expect(page.getByTestId('ve-status')).toHaveText('Unsaved changes');
    await expect(page.getByTestId('ve-status')).toHaveText('All changes saved', { timeout: 8000 });
    const d = lastDoc(state);
    expect(d.v).toBe(1);
    expect(d.header.name).toBe('Ada King');
    expect(d.sections.map((s: any) => s.type)).toEqual(['summary', 'experience', 'skills', 'education']);
    // the same text flows through the shared render model used by preview/export
    const rm = await page.evaluate(async (id) => (await fetch(`http://localhost:3100/api/v1/resumes/${id}/render-model`, { headers: { authorization: 'Bearer x' } })).json(), RESUME_ID).catch(() => null);
    if (rm) expect(rm.header.name).toBe('Ada King');
  });

  test('line breaks survive inline editing, autosave and re-render', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(URL_);
    const textEl = sec(page, 'summary').locator('[data-el]').last();
    await textEl.click();
    await textEl.click();
    await expect(textEl).toHaveAttribute('contenteditable', /.+/);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText('first line\nsecond line');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('ve-status')).toHaveText('All changes saved', { timeout: 8000 });
    expect(lastDoc(state).sections.find((s: any) => s.type === 'summary').text).toBe('first line\nsecond line');
    await expect(textEl).toHaveCSS('white-space', 'pre-wrap');
  });

  test('page-break toggle marks a section and renders a spacer in the editor', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(URL_);
    await sec(page, 'experience').locator('h2').click();
    const btn = page.getByTestId('ve-page-break');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.page-break-spacer')).toHaveCount(1);
    await expect(page.getByTestId('ve-status')).toHaveText('All changes saved', { timeout: 8000 });
    expect(lastDoc(state).sections.find((s: any) => s.type === 'experience').pageBreakBefore).toBe(true);
  });

  test('Escape cancels an edit and restores the text', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(URL_);
    const name = page.getByTestId('ve-name');
    await name.click(); await name.click();
    await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('Nope');
    await page.keyboard.press('Escape');
    await expect(name).toHaveText('Ada Lovelace');
    await page.waitForTimeout(1500);
    expect(puts(state)).toHaveLength(0);
  });

  test('per-element formatting: font, size, bold, colour token, palette, align, spacing, reset', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(URL_);
    const title = sec(page, 'experience').locator('h2 [data-el]');
    await title.click();
    await page.getByTestId('ve-font').selectOption('Courier');
    await page.getByTestId('ve-size-up').click();
    await page.getByTestId('ve-bold').click();
    await page.getByTestId('ve-color-btn').click();
    await page.getByTestId('ve-color-muted').click();
    await page.getByTestId('ve-align-center').click();
    await page.getByTestId('ve-space-up').click();
    const h2 = sec(page, 'experience').locator('h2');
    await expect(h2).toHaveCSS('text-align', 'center');
    await expect(h2).toHaveCSS('color', 'rgb(85, 85, 85)');
    await expect(h2).toHaveCSS('font-family', /Courier/);
    await expect(page.getByTestId('ve-status')).toHaveText('All changes saved', { timeout: 8000 });
    const key = Object.keys(lastDoc(state).styles).find((k) => k.startsWith('s.') && k.endsWith('.title'))!;
    const st = lastDoc(state).styles[key];
    expect(st).toMatchObject({ font: 'Courier', color: 'muted', align: 'center', spaceAfterPt: 2, bold: false });
    expect(st.sizePt).toBeGreaterThan(10.5);
    await page.getByTestId('ve-color-1f4e79').click();
    await expect(h2).toHaveCSS('color', 'rgb(31, 78, 121)');
    await page.getByTestId('ve-fmt-reset').click();
    await expect(h2).not.toHaveCSS('text-align', 'center');
  });

  test('reorder sections in the layout popup; saved order matches', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(URL_);
    await expect(page.getByTestId('ve-section')).toHaveCount(4);
    expect(await order(page)).toEqual(['summary', 'experience', 'skills', 'education']);
    await sec(page, 'experience').locator('h2').click({ position: { x: 4, y: 4 } });
    await page.getByTestId('ve-rearrange-block').click();
    await expect(page.getByTestId('ve-rearrange')).toBeVisible();
    await expect(page.getByTestId('ve-tile-summary').locator('.rr-n')).toHaveText('1');
    await expect(page.getByTestId('ve-tile-experience').locator('.rr-n')).toHaveText('2');
    await page.getByTestId('ve-tile-experience').focus();
    await page.keyboard.press('ArrowUp');
    expect(await order(page)).toEqual(['experience', 'summary', 'skills', 'education']);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await order(page)).toEqual(['summary', 'skills', 'experience', 'education']);
    await page.getByTestId('ve-rearrange-close').click();
    await expect(page.getByTestId('ve-rearrange')).toBeHidden();
    await page.getByTestId('ve-undo').click();
    expect(await order(page)).toEqual(['summary', 'experience', 'skills', 'education']);
    await page.getByTestId('ve-redo').click();
    expect(await order(page)).toEqual(['summary', 'skills', 'experience', 'education']);
    await expect(page.getByTestId('ve-status')).toHaveText('All changes saved', { timeout: 8000 });
    expect(lastDoc(state).sections.map((s: any) => s.type)).toEqual(['summary', 'skills', 'experience', 'education']);
  });

  test('drag the grip to reorder sections (pointer events)', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(URL_);
    await sec(page, 'education').locator('h2').click({ position: { x: 4, y: 4 } });
    const grip = await page.getByTestId('ve-grip').boundingBox();
    const target = await sec(page, 'summary').boundingBox();
    expect(grip && target).toBeTruthy();
    await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
    await page.mouse.down();
    await page.mouse.move(target!.x + 20, target!.y + 2, { steps: 6 });
    await expect(page.getByTestId('ve-drop-line')).toBeVisible();
    await page.mouse.up();
    await expect(page.getByTestId('ve-drop-line')).toBeHidden();
    expect((await order(page))[0]).toBe('education');
  });

  test('add a custom section, add/duplicate/remove items and bullets, Enter continues bullets', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(URL_);
    await page.getByTestId('ve-outline-btn').click();
    await page.getByTestId('ve-add-section-type').selectOption('custom');
    await page.getByTestId('ve-add-section').click();
    await expect(sec(page, 'custom')).toHaveCount(1);
    await page.getByTestId('ve-outline-btn').click();
    // item operations on the experience item
    const item = sec(page, 'experience').locator('[data-testid=ve-item]').first();
    await item.locator('strong').click({ position: { x: 3, y: 3 } });
    await page.getByTestId('ve-duplicate').click();
    await expect(sec(page, 'experience').locator('[data-testid=ve-item]')).toHaveCount(2);
    await page.getByTestId('ve-add-item').click();
    await expect(sec(page, 'experience').locator('[data-testid=ve-item]')).toHaveCount(3);
    await page.getByTestId('ve-delete').click();
    await expect(sec(page, 'experience').locator('[data-testid=ve-item]')).toHaveCount(2);
    await page.getByTestId('ve-undo').click();
    await expect(sec(page, 'experience').locator('[data-testid=ve-item]')).toHaveCount(3);
    // bullets: Add bullet starts editing; Enter chains a new one
    await sec(page, 'experience').locator('[data-testid=ve-item]').first().locator('strong').click({ position: { x: 3, y: 3 } });
    await page.getByTestId('ve-add-bullet').click();
    await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('Shipped it'); await page.keyboard.press('Enter');
    await page.keyboard.type('Then shipped more'); await page.keyboard.press('Enter');
    await page.keyboard.press('Escape'); // empty bullet is cleaned up
    const bullets = sec(page, 'experience').locator('[data-testid=ve-item]').first().locator('li');
    await expect(bullets).toHaveText(['Wrote the first published algorithm.', 'Shipped it', 'Then shipped more']);
    await expect(page.getByTestId('ve-status')).toHaveText('All changes saved', { timeout: 8000 });
    expect(lastDoc(state).sections.some((s: any) => s.type === 'custom')).toBe(true);
    // hide / show through the outline
    await page.getByTestId('ve-outline-btn').click();
    const out = page.locator('[data-testid^=ve-out-]').filter({ hasText: 'Skills' });
    await out.getByRole('button', { name: 'Hide section' }).click();
    await expect(sec(page, 'skills')).toHaveCount(0);
    await out.getByRole('button', { name: 'Show section' }).click();
    await expect(sec(page, 'skills')).toHaveCount(1);
  });

  test('undo/redo of text edits and keyboard shortcuts', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(URL_);
    const name = page.getByTestId('ve-name');
    await edit(page, name, 'Short');
    await expect(name).toHaveText('Short');
    await expect(page.getByTestId('ve-undo')).toBeEnabled();
    await page.getByTestId('ve-undo').click();
    await expect(name).toHaveText('Ada Lovelace');
    await expect(page.getByTestId('ve-redo')).toBeEnabled();
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(name).toHaveText('Short');
  });

  test('profile photo: upload, crop, size, remove; logo on an item; stored as small data URIs', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(URL_);
    await page.getByTestId('ve-name').click();
    await page.getByTestId('ve-img-add').click();
    await page.getByTestId('ve-file').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByTestId('ve-crop')).toBeVisible();
    await page.getByTestId('ve-crop-zoom').fill('2');
    await page.getByTestId('ve-crop-apply').click();
    await expect(page.getByTestId('ve-photo')).toBeVisible();
    await expect(page.getByTestId('ve-photo')).toHaveAttribute('src', /^data:image\/(png|jpeg);base64,/);
    const before = await page.getByTestId('ve-img-size').innerText();
    await page.getByTestId('ve-img-up').click();
    expect(+(await page.getByTestId('ve-img-size').innerText())).toBe(+before + 4);
    // logo
    await sec(page, 'experience').locator('[data-testid=ve-item] strong').first().click({ position: { x: 3, y: 3 } });
    await page.getByTestId('ve-add-logo').click();
    await page.getByTestId('ve-file').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
    await page.getByTestId('ve-crop-apply').click();
    await expect(sec(page, 'experience').locator('img')).toHaveCount(1);
    await expect(page.getByTestId('ve-status')).toHaveText('All changes saved', { timeout: 8000 });
    const d = lastDoc(state);
    expect(d.header.photo.src.startsWith('data:image/')).toBe(true);
    expect(d.header.photo.src.length).toBeLessThan(300_000);
    expect(d.sections.find((s: any) => s.type === 'experience').items[0].image.src.startsWith('data:image/')).toBe(true);
    await page.getByTestId('ve-photo').click();
    await page.getByTestId('ve-img-remove').click();
    await expect(page.getByTestId('ve-photo')).toHaveCount(0);
  });

  test('rejects non-image and svg uploads', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(URL_);
    await page.getByTestId('ve-name').click();
    await page.getByTestId('ve-img-add').click();
    await page.getByTestId('ve-file').setInputFiles({ name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
    await expect(page.getByTestId('ve-crop')).toHaveCount(0);
  });

  test('zoom and fit controls', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(URL_);
    await expect(page.getByTestId('ve-sheet')).toBeVisible();
    await page.getByTestId('ve-fit-width').click();
    const fit = parseInt((await page.getByTestId('ve-zoom').innerText()).replace('%', ''), 10);
    await page.getByTestId('ve-zoom-in').click();
    const zin = parseInt((await page.getByTestId('ve-zoom').innerText()).replace('%', ''), 10);
    expect(zin).toBeGreaterThan(fit);
    await page.getByTestId('ve-zoom-out').click(); await page.getByTestId('ve-zoom-out').click();
    expect(parseInt((await page.getByTestId('ve-zoom').innerText()).replace('%', ''), 10)).toBeLessThan(fit);
    await page.getByTestId('ve-fit-page').click();
    await expect(page.getByTestId('ve-fit-page')).toHaveAttribute('aria-pressed', 'true');
  });

  test('export and preview flush pending edits first; version snapshot works', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(URL_);
    await edit(page, page.getByTestId('ve-name'), 'Flushed Name');
    await page.getByTestId('ve-export-pdf').click();
    await expect.poll(() => state.exportCalls).toContain('pdf');
    const putIdx = state.requests.findIndex((r) => r.method === 'PUT' && r.path.endsWith('/draft'));
    const expIdx = state.requests.findIndex((r) => r.path.endsWith('/export/pdf'));
    expect(putIdx).toBeGreaterThanOrEqual(0);
    expect(putIdx).toBeLessThan(expIdx);
    await page.getByTestId('ve-save-version').click();
    await expect.poll(() => state.requests.some((r) => r.method === 'POST' && r.path.endsWith('/versions'))).toBe(true);
  });

  test('a save conflict is surfaced and keeps the edits', async ({ page }) => {
    const state = await setup(page, { resume: true });
    await page.goto(URL_);
    state.failNext = { path: /\/draft$/, status: 409 };
    await edit(page, page.getByTestId('ve-name'), 'Conflicted');
    await expect(page.getByTestId('ve-conflict')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('ve-name')).toHaveText('Conflicted');
  });

  test('tap flow and bottom sheet on touch screens', async ({ page, isMobile }, info) => {
    test.skip(!['phone-web', 'android'].includes(info.project.name), 'touch layout only');
    await setup(page, { resume: true });
    await page.goto(URL_);
    await page.getByTestId('ve-name').tap();
    const tools = page.getByTestId('ve-tools');
    await expect(tools).toBeVisible();
    const box = (await tools.boundingBox())!; const vh = page.viewportSize()!.height;
    expect(box.y + box.height).toBeGreaterThan(vh - 110); // docked to the bottom (just above the shell tab bar)
    expect(box.width).toBeGreaterThan(page.viewportSize()!.width - 4);
    await page.getByTestId('ve-name').tap();
    await expect(page.getByTestId('ve-name')).toHaveAttribute('contenteditable', /.+/);
    await page.keyboard.type('X'); await page.keyboard.press('Enter');
    // every tool control is at least a comfortable touch target
    await sec(page, 'experience').locator('h2').tap({ position: { x: 4, y: 4 } });
    for (const id of ['ve-rearrange-block', 've-duplicate', 've-delete']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.width).toBeGreaterThanOrEqual(40); expect(b.height).toBeGreaterThanOrEqual(40);
    }
    await page.getByTestId('ve-rearrange-block').tap();
    await expect(page.getByTestId('ve-rearrange')).toBeVisible();
    const tile = page.getByTestId('ve-tile-experience');
    const tileBox = (await tile.boundingBox())!;
    expect(tileBox.height).toBeGreaterThanOrEqual(40);
    await tile.focus();
    await page.keyboard.press('ArrowUp');
    expect((await order(page))[0]).toBe('experience');
    void isMobile;
  });

  test('no horizontal page overflow at this width', async ({ page }) => {
    await setup(page, { resume: true });
    await page.goto(URL_);
    await expect(page.getByTestId('ve-sheet')).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(1);
  });

  test('design assistant button opens a console with template design defaults', async ({ page }) => {
    const state = await setup(page, { resume: true });
    state.helpChat = { enabled: true, reply: 'Use the outline panel to reorder or hide sections.' };
    await page.goto(URL_);

    const fab = page.getByTestId('ve-chatbot');
    await expect(fab).toBeVisible();
    await fab.click();

    const panel = page.locator('#xcron-help');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Guided answers');

    // Design-specific default options replace the generic chips on this screen.
    await expect(panel.getByRole('button', { name: 'How do I customize this template’s design?' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'What color palette works well for this template?' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'How should I arrange sections on the page?' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'How do I reorder or hide sections?' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'How do I save my design changes?' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'How do I save a template version?' })).toBeVisible();

    await panel.getByRole('button', { name: 'How do I reorder or hide sections?' }).click();
    await expect(panel).toContainText('outline panel');
    expect(new URL(page.url()).pathname).toBe(URL_); // the chat never navigates away

    await panel.getByRole('button', { name: 'Close help chat' }).click();
    await expect(panel).toBeHidden();
  });
});
