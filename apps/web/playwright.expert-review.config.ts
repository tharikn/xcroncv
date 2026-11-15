import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Private run of the expert-review spec (doc 50) that does not touch the shared build/port.
 * Build:  npx ng build --configuration development --output-path <dir>
 * Run:    ER_WEB_ROOT=<dir> ER_PORT=4391 ER_OUT=<out> npx playwright test -c playwright.expert-review.config.ts
 */
const port = Number(process.env['ER_PORT'] ?? 4391);
export default defineConfig({
  ...base,
  testMatch: ['**/expert-review.spec.ts'],
  reporter: [['list']],
  outputDir: process.env['ER_OUT'] ?? 'test-results-expert-review',
  use: { ...base.use, baseURL: `http://localhost:${port}` },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { WEB_ROOT: process.env['ER_WEB_ROOT'] ?? 'dist/web/browser', PORT: String(port) },
  },
});
