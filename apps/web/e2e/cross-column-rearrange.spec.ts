import { expect, test } from '@playwright/test';
import { RESUME_ID, setup } from './support/setup';
import { TEMPLATES } from './support/mock-api';

TEMPLATES.push({
  id: 'two-col-rearrange', slug: 'two-col-rearrange', name: 'Two Column Rearrange', category: 'Modern', description: 'Two-column test template.', tags: [], version: 1,
  atsProfile: 'BALANCED', layout: 'two-column', pageSizes: ['A4'], sideSections: ['skills'],
  theme: { fontFamily: 'Helvetica', baseSizePt: 10.5, accent: '#1f3a5f', headingTransform: 'none', headerAlign: 'left', sectionRule: true },
} as never);

const draftDocs = (state: any) => state.requests.filter((r: any) => r.method === 'PUT' && r.path.endsWith('/draft')).map((r: any) => r.body?.overrides?.doc).filter(Boolean);

test('cross-column rearrangement moves boxes between main and side', async ({ page }) => {
  const state = await setup(page, { resume: { templateId: 'two-col-rearrange' } });
  await page.goto(`/resumes/${RESUME_ID}/design`);
  const docMain = page.locator('[data-testid=doc-main]');
  const docSide = page.locator('[data-testid=doc-side]');
  await expect(page.getByTestId('doc-columns')).toBeVisible();
  await expect(docSide).toContainText('Skills');
  await expect(docMain).not.toContainText('Skills');
  await expect(docMain).toContainText('Summary');

  // Move Skills to the main column before Education.
  await page.getByTestId('ve-rearrange-open').click();
  await expect(page.getByTestId('ve-tile-skills')).toHaveAttribute('data-col', 'side');
  const education = await page.getByTestId('ve-tile-education').boundingBox();
  const grip = await page.getByTestId('ve-tile-skills').locator('[data-grip]').boundingBox();
  expect(education && grip).toBeTruthy();
  await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
  await page.mouse.down();
  await page.mouse.move(education!.x + 20, education!.y + 10, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(1800);
  await expect(docMain).toContainText('Skills');
  await expect(docSide).not.toContainText('Skills');

  // Move Summary into the side rail (now empty) by dropping it into the rail itself.
  const dlg = page.getByTestId('ve-rearrange');
  const summaryGrip = await page.getByTestId('ve-tile-summary').locator('[data-grip]').boundingBox();
  const sideCol = await dlg.locator('.rr-col[data-col="side"]').boundingBox();
  expect(summaryGrip && sideCol).toBeTruthy();
  await page.mouse.move(summaryGrip!.x + summaryGrip!.width / 2, summaryGrip!.y + summaryGrip!.height / 2);
  await page.mouse.down();
  await page.mouse.move(sideCol!.x + Math.min(40, sideCol!.width / 2), sideCol!.y + Math.min(40, sideCol!.height / 2), { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(1800);
  await expect(docSide).toContainText('Summary');
  await expect(docMain).not.toContainText('Summary');

  const doc = draftDocs(state).at(-1);
  expect(doc.sections.find((s: any) => s.type === 'skills')?.column).toBe('main');
  expect(doc.sections.find((s: any) => s.type === 'summary')?.column).toBe('side');
  await expect(page.getByTestId('ve-status')).toHaveText('All changes saved', { timeout: 8000 });
});
