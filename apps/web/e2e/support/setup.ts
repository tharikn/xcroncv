import { expect, Page } from '@playwright/test';
import { freshState, mockApi, MockState, sampleProfile, sampleResume, signIn } from './mock-api';

export const RESUME_ID = '11111111-1111-4111-8111-111111111111';

export interface SetupOptions { profile?: boolean | Record<string, unknown>; resume?: boolean | Record<string, unknown>; signedIn?: boolean; firstRunPrompt?: boolean }

/** Mock the API and (optionally) sign in. Returns the mutable mock state. */
export async function setup(page: Page, opts: SetupOptions = {}): Promise<MockState> {
  const { profile = true, resume = false, signedIn = true } = opts;
  const state = freshState();
  if (profile) state.profile = sampleProfile(typeof profile === 'object' ? profile : {});
  if (resume) state.resumes = [sampleResume(typeof resume === 'object' ? resume : {})];
  await mockApi(page, state);
  // Skip the first-export folder prompt by default; local-files.spec.ts opts back in.
  if (opts.firstRunPrompt !== true) await page.addInitScript(() => { try { localStorage.setItem('xcroncv.local-folder-declined', '1'); } catch { /* ignore */ } });
  if (signedIn) await signIn(page);
  return state;
}

export const isMobileProject = (name: string) => name === 'phone-web' || name === 'android';

/** The editor's section/design/version controls sit in a bottom sheet on phones (no-op where the side panel is always visible). */
export async function openEditorPanel(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) < 768) await page.getByTestId('open-panel').click();
  await expect(page.getByTestId('side-panel')).toBeVisible();
}
export async function closeEditorPanel(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) < 768) await page.getByTestId('panel-close').click();
}
