import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite. The API is mocked in-process (e2e/support/mock-api.ts) so tests are hermetic and fast.
 * Projects cover desktop web, tablet, phone-width web and Android-device emulation (Pixel profiles, touch + mobile UA).
 * Real-API smoke tests live in e2e/live (run with: npm run e2e:live; needs API + Postgres up).
 */
/**
 * Isolation: several runs (or agents) may share this checkout. A shared dist/ and test-results/ made runs flaky: one run's
 * `ng build` rewrote the bundle another run was serving (blank page), and one run's start-up wiped another's trace files
 * (ENOENT on browserContext.close). Each run therefore builds into dist/pw-<port>, serves on its own port and writes to
 * test-results/pw-<port>. The values are set once in the main process and inherited by workers.
 * Set PW_SHARED=1 to use the shared dist/web/browser on port 4200 (e.g. with `npm run web:dev` running).
 */
const shared = process.env['PW_SHARED'] === '1';
if (!shared) process.env['PW_PORT'] ??= String(4300 + (process.pid % 600));
const port = shared ? 4200 : Number(process.env['PW_PORT']);
const distDir = shared ? 'dist/web' : `dist/pw-${port}`;

export default defineConfig({
  outputDir: shared ? 'test-results' : `test-results/pw-${port}`,
  testDir: './e2e',
  testIgnore: ['**/live/**'],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: { channel: process.env['PW_CHANNEL'] ?? (process.platform === 'win32' ? 'msedge' : undefined), baseURL: `http://localhost:${port}`, trace: 'retain-on-failure', screenshot: 'only-on-failure', acceptDownloads: true },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: 'phone-web', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 }, hasTouch: true } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Build once (development config: dev auth enabled), then serve statically. Avoids `ng serve` (native Rollup).
    command: shared ? 'npm run build:dev && node scripts/serve.mjs' : `npm run build:dev -- --output-path ${distDir} && node scripts/serve.mjs`,
    url: `http://localhost:${port}`,
    env: { PORT: String(port), WEB_ROOT: `${distDir}/browser` },
    reuseExistingServer: shared,
    timeout: 300_000,
  },
});
