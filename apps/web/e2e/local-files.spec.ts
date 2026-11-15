import { expect, Page, test } from '@playwright/test';
import { RESUME_ID, setup } from './support/setup';

/**
 * Module 5 - local folder manager.
 * Chromium has the File System Access API but its picker needs a real OS dialog, so an in-memory directory tree with the
 * same surface as FileSystemDirectoryHandle is installed before the app loads. The app keeps the handle in memory for
 * the session (IndexedDB cannot clone the fake), so these tests navigate inside the SPA instead of reloading.
 */
async function installFakeFolder(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__failWrite = false;
    class FakeFile { constructor(public name: string, public data: Blob, public modified = Date.now()) {} get size() { return this.data.size; } get lastModified() { return this.modified; } }
    class FakeFileHandle {
      kind = 'file'; file: FakeFile;
      constructor(public name: string) { this.file = new FakeFile(name, new Blob([])); }
      async getFile() { return this.file; }
      async createWritable() {
        const self = this; let buf: Blob | null = null;
        return {
          async write(b: Blob) { if (w.__failWrite) throw new Error('disk full'); buf = b; },
          async close() { if (buf) self.file = new FakeFile(self.name, buf); },
          async abort() { /* swap file discarded */ },
        };
      }
    }
    class FakeDir {
      kind = 'directory'; children = new Map<string, FakeDir | FakeFileHandle>();
      constructor(public name: string) {}
      async getDirectoryHandle(n: string, o?: { create?: boolean }) {
        let c = this.children.get(n);
        if (!c) { if (!o?.create) throw Object.assign(new Error('not found'), { name: 'NotFoundError' }); c = new FakeDir(n); this.children.set(n, c); }
        return c as FakeDir;
      }
      async getFileHandle(n: string, o?: { create?: boolean }) {
        let c = this.children.get(n);
        if (!c) { if (!o?.create) throw Object.assign(new Error('not found'), { name: 'NotFoundError' }); c = new FakeFileHandle(n); this.children.set(n, c); }
        return c as FakeFileHandle;
      }
      async removeEntry(n: string) { this.children.delete(n); }
      async *entries() { for (const e of this.children) yield e; }
      async queryPermission() { return 'granted'; }
      async requestPermission() { return 'granted'; }
    }
    const root = new FakeDir('MyDocs');
    w.__fakeRoot = root;
    w.showDirectoryPicker = async () => root;
  });
}

/** Navigate inside the SPA without a page reload. */
async function spaGo(page: Page, url: string) {
  await page.evaluate((u) => { history.pushState({}, '', u); window.dispatchEvent(new PopStateEvent('popstate')); }, url);
}

test.describe('Local folder manager - no folder', () => {
  test('first export uses defaults and asks for nothing: a plain download, no options dialog', async ({ page }) => {
    await setup(page, { resume: true, firstRunPrompt: true });
    await page.goto(`/resumes/${RESUME_ID}?step=export`);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-pdf').click()]);
    expect(dl.suggestedFilename()).toBe('Engineer-CV.pdf');
    await expect(page.locator('ion-alert')).toHaveCount(0);
    // Advanced options stay available afterwards (more formats, folder choice on the Files page).
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-html').click()]);
    expect(dl2.suggestedFilename()).toBe('Engineer-CV.html');
    await expect(page.getByTestId('export-folder-options')).toBeVisible();
  });

  test('Local files screen is honest when no folder is chosen', async ({ page }) => {
    await setup(page);
    await page.goto('/files');
    await expect(page.getByTestId('folder-status')).toContainText(/No folder chosen|cannot save to a folder/);
    await expect(page.getByTestId('loss-warning')).toContainText('no cloud backup');
  });

  test('is its own route, reachable from navigation', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard');
    await page.getByTestId('nav-files').click();
    await expect(page).toHaveURL(/\/files$/);
    await expect(page.getByRole('heading', { name: 'Local files' })).toBeVisible();
  });

  test('requires sign-in (no guest access)', async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto('/files');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Local folder manager - chosen folder', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name === 'android', 'File System Access picker is a desktop-browser feature; Android uses the Capacitor adapter');
    await installFakeFolder(page);
  });

  async function chooseFolder(page: Page) {
    await page.goto('/files');
    await page.getByTestId('choose-folder').click();
    await expect(page.getByTestId('folder-status')).toContainText('MyDocs');
    await expect(page.getByTestId('files-empty')).toBeVisible();
  }

  async function exportTwice(page: Page) {
    await spaGo(page, `/resumes/${RESUME_ID}?step=export`);
    await page.getByTestId('export-pdf').click();
    await expect(page.getByText('Saved Engineer-CV-v001.pdf')).toBeVisible();
    await page.getByTestId('export-pdf').click();
    await expect(page.getByText('Saved Engineer-CV-v002.pdf')).toBeVisible();
  }

  test('saves versioned files without overwriting and lists them', async ({ page }) => {
    await setup(page, { resume: true });
    await chooseFolder(page);
    await exportTwice(page);
    await page.getByTestId('export-html').click();
    await expect(page.getByText('Saved Engineer-CV-v001.html')).toBeVisible();

    await spaGo(page, '/files');
    await expect(page.getByTestId('group-Engineer-CV')).toBeVisible();
    for (const n of ['Engineer-CV-v001.pdf', 'Engineer-CV-v002.pdf', 'Engineer-CV-v001.html']) await expect(page.getByTestId(`file-${n}`)).toBeVisible();
    // Stored under XCronCV/Resumes/<resume>/ inside the chosen folder
    const paths = await page.evaluate(() => {
      const r = (window as any).__fakeRoot; const d = r.children.get('XCronCV').children.get('Resumes').children.get('Engineer-CV');
      return [...d.children.keys()].sort();
    });
    expect(paths).toEqual(['Engineer-CV-v001.html', 'Engineer-CV-v001.pdf', 'Engineer-CV-v002.pdf']);
  });

  test('a failed write shows an error and never claims the file was saved', async ({ page }) => {
    await setup(page, { resume: true });
    await chooseFolder(page);
    await spaGo(page, `/resumes/${RESUME_ID}?step=export`);
    await page.evaluate(() => { (window as any).__failWrite = true; });
    await page.getByTestId('export-pdf').click();
    await expect(page.getByText('disk full')).toBeVisible();
    await expect(page.getByText(/^Saved /)).toHaveCount(0);
  });

  test('rename rejects collisions, accepts a unique name', async ({ page }) => {
    await setup(page, { resume: true });
    await chooseFolder(page);
    await exportTwice(page);
    await spaGo(page, '/files');
    const row = page.getByTestId('file-Engineer-CV-v002.pdf');
    await row.getByTestId('rename-file').click();
    await row.getByTestId('rename-input').fill('Engineer-CV-v001');
    await row.getByTestId('rename-save').click();
    await expect(row.getByTestId('rename-error')).toContainText('already exists');
    await row.getByTestId('rename-input').fill('Final CV');
    await row.getByTestId('rename-save').click();
    await expect(page.getByTestId('file-Final-CV.pdf')).toBeVisible();
    await expect(page.getByTestId('file-Engineer-CV-v002.pdf')).toHaveCount(0);
  });

  test('delete asks for confirmation and can be cancelled', async ({ page }) => {
    await setup(page, { resume: true });
    await chooseFolder(page);
    await exportTwice(page);
    await spaGo(page, '/files');
    const row = page.getByTestId('file-Engineer-CV-v001.pdf');
    await row.getByTestId('delete-file').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('ion-alert')).toHaveCount(0); // wait for the dismiss animation
    await expect(row).toBeVisible();
    await row.getByTestId('delete-file').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(row).toHaveCount(0);
    await expect(page.getByTestId('file-Engineer-CV-v002.pdf')).toBeVisible();
  });

  test('files deleted outside the app are flagged as missing, not recreated', async ({ page }) => {
    await setup(page, { resume: true });
    await chooseFolder(page);
    await exportTwice(page);
    await page.evaluate(() => {
      const d = (window as any).__fakeRoot.children.get('XCronCV').children.get('Resumes').children.get('Engineer-CV');
      d.children.delete('Engineer-CV-v001.pdf');
    });
    await spaGo(page, '/files');
    await page.getByTestId('nav-resumes').click();
    await page.getByTestId('nav-files').click();
    const row = page.getByTestId('file-Engineer-CV-v001.pdf');
    await expect(row.getByTestId('missing-badge')).toBeVisible();
    await row.getByTestId('forget-file').click();
    await expect(row).toHaveCount(0);
  });

  test('stop using this folder returns to downloads after confirmation', async ({ page }) => {
    await setup(page, { resume: true });
    await chooseFolder(page);
    await page.getByTestId('forget-folder').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Stop using' }).click();
    await expect(page.getByTestId('folder-status')).toContainText('No folder chosen');
  });
});
