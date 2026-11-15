# Module 12/25 - Web shell, authentication and responsive layout (docs 12, 16, 25, 39)

## What it does
- Login is mandatory (no guest access). Token sign-in; single-use `#access_token=` handoff (stripped immediately); dev-only HS256 sign-in panel (`environment.devAuth`, removed from production builds).
- Token in `sessionStorage`; the client only decodes (expiry/subject for UI). The API verifies. A 401 signs the user out. `?next=` accepts only same-origin paths.
- Responsive shell: side rail >= 992px, bottom tab bar below. Tokens in `src/styles.scss` (white canvas, near-black text, greys). Fluid gutters, `min-width:0` grids, 44px primary targets, safe-area insets, reduced-motion respected.
- Settings: API address (validated http(s) or `/path`), connection test, sign out, local-files explanation.

## Android (Capacitor)
`apps/web/capacitor.config.ts` (`com.xcron.cv`, webDir `dist/web/browser`, dev cleartext). Platform in `apps/web/android`.
Emulator API address: `http://10.0.2.2:3100/api/v1` (Settings). Add `http://localhost` to API `CORS_ORIGINS`.

## Code map
`core/auth*.ts`, `core/jwt.ts`, `core/settings.service.ts`, `core/url.ts`, `shell/shell.component.ts`, `pages/login.page.ts`, `pages/settings.page.ts`, `src/styles.scss`.

## Tests
- Unit: jwt, expiry skew, fragment parsing, URL validation (`core/core.spec.ts`).
- Playwright `e2e/auth.spec.ts`; `e2e/responsive-a11y.spec.ts` (overflow on every route, nav adaptation, touch targets, single-column forms, axe WCAG A/AA, keyboard nav) on desktop 1440, tablet 820, phone 375 and Pixel 7 profiles.

## First-time guided tour
Spotlight coach-mark walkthrough in `apps/web/src/app/shared/tour`: `TourComponent` (mounted once in `AppComponent`), `TourService` (signals) over the pure `TourFlow` state machine, `tour.config.ts` (step list), `tour.logic.ts` (placement and target maths).
- Steps: Add profile details, Choose template, Edit (sections/design/versions panel), Canvas editor, Export. Targets are `data-tour` hooks, first existing wins: `step-profile-action|nav-profile`, `step-template-action|nav-templates`, `editor-side-panel`, `editor-canvas`, `step-export-action`. Page hooks are owned by the stepper/gallery/editor pages; `nav-*` by the shell.
- Starts automatically once, 1.2 s after sign-in, only if the user has not completed or skipped it. Completion is stored per user (token subject) in localStorage (`xcroncv.tour.done.<sub>`); the preferences API carries only theme/locale, so it is device-local (gap). Settings > Help > Replay tour restarts it.
- Dims and blocks the screen around the target (the target stays clickable); pulsing ring. Click steps advance after the user presses the highlighted control; info steps use Next. Missing target: after 1.2 s a centred tooltip with Next/Skip (never blocks). Re-measures on route change, resize, orientation, scroll and layout shifts (250 ms poll); scrolls the target into view.
- Esc skips, Enter = Next, Tab/Shift+Tab trapped in the dialog (`role=dialog`, `aria-modal`, labelled title/body), focus returns to the opener; `prefers-reduced-motion` disables blinking. 44 px touch targets; tooltip clamped to the viewport (phone/Android).
- i18n `tour.*` and `settings.help*` in en/ta/hi; theme tokens only.

## Known gaps
Real OIDC + PKCE flow (needs X Cron issuer contract); status-bar/back-button native polish needs a device run; visual-regression snapshots.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-15 | First-time guided onboarding tour (spotlight, pulsing ring, tooltip, per-user once, Replay in Settings > Help), shell nav data-tour hooks, editor-canvas hook. | shared/tour/*, app.component.ts, shell.component.ts, pages/settings.page.ts, pages/resume-editor.page.ts (1 attribute), core/i18n/{en,ta,hi}.ts, e2e/support/mock-api.ts (signIn marks tour seen) | Jest tour.logic.spec + tour.flow.spec; Playwright e2e/onboarding-tour.spec.ts |
| 2026-11-14 | Common app features: dark/system theme, en/ta/hi language picker, global progress bar, offline banner, localized friendly errors, session-expiry notice, Android back, boot splash, About/version, account preferences sync. Shell nav, Settings and Login moved to translation keys. Details: [common-app-features](common-app-features.md) | `core/{theme,theme.service,preferences.service,connectivity.service,api-loading,api-loading-counter,android-back.service,back-action,app-info,error-message,auth.service,auth.interceptor}.ts`, `core/i18n/*`, `app.component.ts`, `app.config.ts`, `shell/shell.component.ts`, `pages/{settings,login}.page.ts`, `styles.scss`, `index.html`, `apps/api/src/preferences/*`, `schema.prisma` (UserPreference) | Jest `core/common-features.spec.ts`, `core/i18n/i18n.spec.ts`, `api/test/preferences.spec.ts`; Playwright `e2e/common-features.spec.ts` (4 profiles, axe, dark theme) |
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
