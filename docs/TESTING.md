# Running and testing locally

## Prerequisites
Node 20, Docker (Postgres), JDK 17 + Android SDK (Android only). Run `npm install` at the repo root.

## Run the stack
```bash
docker compose up -d db
cp .env.example apps/api/.env
npm run db:migrate
npm run api:dev        # http://localhost:3100  (Swagger: /api/docs)
npm run web:dev        # http://localhost:4200  (ng build --watch + static server)
```
Sign in with the **Developer sign-in** panel (secret matches `AUTH_DEV_SECRET`), or `node scripts/dev-token.mjs` and paste the token.
`npm run web:dev` is used instead of `ng serve` because `ng serve` needs a native Rollup binary that Windows Application Control may block.

## Tests
| Command | What |
|---|---|
| `npm run api:test` | API unit tests (Jest) |
| `npm run web:test` | Web unit tests (Jest: auth, mappers, validation, layout maths, local files) |
| `npm run e2e` | Playwright, all device profiles, API mocked in-process |
| `npm run e2e -w apps/web -- --project=desktop` | one profile (`desktop`, `tablet`, `phone-web`, `android`) |
| `npm run e2e -w apps/web -- e2e/profile.spec.ts` | one spec |

Playwright builds the dev bundle and serves `dist/web/browser`. On Windows it uses the installed Microsoft Edge (`PW_CHANNEL=chrome` to change) because downloaded Chromium can be blocked by Application Control. The `android` project emulates a Pixel 7 (touch, mobile UA, small viewport) in a browser; it does not run the APK.

Suites: auth, profile, resumes/templates, editor/preview, dashboard/settings, responsive + axe accessibility, local files (module 05), cover letters, contacts, job analytics and career-tools overflow/axe (modules 42/46/48; fake API in `e2e/support/mock-career-tools.ts`); insights (match, quality, recruiter view: `e2e/insights.spec.ts`).

## Android app
```bash
npm run cap:sync -w apps/web      # ng build + cap sync android
npm run android:open -w apps/web  # open in Android Studio, run on emulator/device
npm run android:build -w apps/web # debug APK (needs JAVA_HOME=JDK17; first run downloads Gradle)
```
Emulator reaches the host API at `http://10.0.2.2:3100/api/v1`: set it under Settings, and add `http://localhost` to `CORS_ORIGINS`.

Platform modules (docs 06/38, 37, 44, 45, 32, 51, 52): Jest `ai`, `webhooks`, `sdk`, `career-path`, `job-clipper`, `job-portal`, `interview-copilot`, `career-documents` specs; Playwright `ai-assistant`, `integrations`, `career-path`, `job-clipper`, `job-portal`, `interview-copilot`, `career-documents`, `platform-a11y` (fake API in `e2e/support/mock-platform-tools.ts`). SDK type-check: `npx tsc -p packages/sdk --noEmit`.

Profile/readiness/expert modules (docs 41, 47, 49, 33-36, 50): Jest `portfolio`, `portfolio.http`, `autofill`, `evidence-wallet`, `application-vault`, `readiness`, `interview-prep`, `feedback-sharing`, `expert-review`; Playwright specs of the same names plus `readiness-tools-a11y` (mocks in `e2e/support/mock-profile-tools.ts`, `mock-readiness-tools.ts`, `mock-expert-review.ts`). Run `npm run db:migrate` once after pulling: schema additions have no generated migration yet.

ATS engine (doc 07): Jest `ats-engine`; Playwright `ats-engine` (mock in `e2e/support/mock-ats.ts`; postings are added through the Job match page mock).

## Flaky-test notes (fixed)
- **Parallel runs share the checkout.** `playwright.config.ts` now builds each run into `dist/pw-<port>`, serves it on its own port and writes to `test-results/pw-<port>`, so concurrent runs (or agents) no longer rewrite each other's bundle (blank page) or delete each other's trace files (`ENOENT ... .network`). `PW_SHARED=1` restores the shared `dist/web` on port 4200 (use with `npm run web:dev`).
- **Local files rename test:** `LocalFolderService.init()` overwrote a folder chosen while its IndexedDB read was pending, so the first-run prompt reappeared. Fixed; unit test `local-folder.race.spec.ts`.
- **Quality "error banner" test:** the "No reviews yet" marker rendered before history loaded, so the injected failure hit the history request and `run()` cleared it. The page now shows a loading state until history has loaded.

## Android APK build (verified)
`npm run android:build -w apps/web` produced `apps/web/android/app/build/outputs/apk/debug/app-debug.apk` (about 7.4 MB, Gradle 8.2.1, AGP 8.2.1, compileSdk 34, first run about 4 minutes incl. downloads).
- **The one gotcha: `JAVA_HOME` must be JDK 17.** Gradle 8.2.1 cannot run on JDK 21, and the machine default `JAVA_HOME` was JDK 21. Use e.g. `JAVA_HOME="C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot"`.
- Needs network on first run (Gradle distribution, Android platform 34 and build-tools via the SDK licences already accepted).
- Not verified: installing/running the APK on an emulator or device (none available in this session); the Playwright `android` project only emulates a Pixel 7 in a browser.

## UI/UX audit (doc 24)
`apps/web/e2e/ux-audit.spec.ts` runs on all four profiles: every data-driven screen is loaded with the whole API answering 500 and must render a heading, show an announced `role="alert"`, leave no "Loading…" behind, throw no uncaught error, avoid horizontal overflow and pass axe (WCAG 2 A/AA). A second test checks every screen is reachable from the shell nav or the career-tools / insights / dashboard hubs. Exempt: `/career-imports` (upload form) and `/files` (device folder, no API call). The audit found one gap, fixed: the quality page showed "No reviews yet" while history was still loading.

Pending-items pass (modules 37, 46, 41, 33, 34, 52, 48, 20/31, AI tasks): Jest additions in `webhooks` (outbox, worker, producers), `crm` (CSV import), `portfolio` (password, lockout), `application-vault` (reminders, snooze), `readiness` (import), `career-documents` (DOCX/PDF round-trip), `job-analytics` (ingestion), `quality-review` (real extraction read-back), `ai` (POLISH_TEXT, COACH_ANSWER). Playwright additions in `contacts`, `portfolio`, `application-vault`, `readiness`, `career-documents`, `job-analytics`, `insights`. Playwright shares `test-results/` and port 4200 with any other run: when several sessions run it at once pass `--output=<private dir>` and rebuild with `npm run build:dev -w apps/web` first, otherwise a reused server can serve a stale bundle. The webhook worker is disabled under `NODE_ENV=test` or `WEBHOOK_WORKER=off`. Run `npm run db:migrate` once: `Portfolio` gained `passwordHash`, `passwordFailCount`, `passwordLockedUntil`.

## Common app features (module 12, docs/modules/common-app-features.md)
Jest: `apps/web/src/app/core/common-features.spec.ts` (theme resolve, loading counter, error mapping, back rule), `core/i18n/i18n.spec.ts` (ta/hi key + placeholder parity with en, interpolation, detection), `apps/api/test/preferences.spec.ts` (tenant/owner isolation, partial update, DTO validation). Playwright: `e2e/common-features.spec.ts` on all four profiles (theme persistence/system follow/account sync, dark-theme axe, ta/hi pages no-overflow + axe, localized errors, progress bar, offline banner, 401 and token-expiry sign-out, version). Jest cannot import Angular ESM: keep logic testable in Angular-free files (`translate.ts`, `theme.ts`, `api-loading-counter.ts`, `back-action.ts`, `error-message.ts`). Mock: `/me/preferences` in `e2e/support/mock-api.ts`. Run `prisma generate` after pulling (new `UserPreference` model) and `npm run db:migrate`. When running Playwright alongside other runs use `--workers=1 --output=<private dir>`.
