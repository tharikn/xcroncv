# Common app features (ported from X Cron Jobs)

Audit of `D:\Projects\x-cron\mobile` (Ionic/Capacitor/Angular) and `api/` against xcroncv. Owner of: theme, i18n, global loading, offline banner, friendly errors, Android back, boot splash, about, server-synced preferences.

## Gap table

| # | Feature in X Cron Jobs | xcroncv before | Decision |
|---|---|---|---|
| 1 | Theme preference system/light/dark(/warm), persisted, synced to account (`theme.service.ts`, `PATCH preferences`) | none (light only) | **Ported**: system/light/dark, `data-theme`, `color-scheme`, `theme-color` meta, synced to account |
| 2 | Multilingual i18n: `LocaleService` + `t` pipe, language picker, persisted, `html lang` (en/ta/hi, server catalog) | none | **Ported**: en, ta (Tamil), hi (Hindi) bundled in app (no catalog endpoint); picker in Settings and login; persisted + synced |
| 3 | Account preferences API (`interfaceLocale`, `theme`) | none | **Ported**: `GET/PUT /me/preferences` (tenant + owner scoped) |
| 4 | Global API loading overlay + skeleton (`api-loading.interceptor`) | per-page "Loading…" only | **Ported as non-blocking top progress bar** (delayed 200 ms, `pointer-events:none`, `role=status`); a blocking overlay would intercept clicks |
| 5 | Offline banner (`ConnectivityService`) | none | **Ported** (`role=status`, Capacitor app resume re-check) |
| 6 | Friendly HTTP errors (`friendly-http-message.ts`) | `errorMessage()` raw | **Ported**: localized network/401/403/429/5xx copy, validation message pass-through |
| 7 | Session expiry handling (auth interceptor sign-out) | 401 signs out silently | **Ported**: expiry timer + "session expired" notice on login page; return path kept via `?next=` |
| 8 | Android hardware back button (`android-back.service.ts`) | none | **Ported** (history back, exit on root) |
| 9 | Boot splash dismissed after hydrate | blank until bootstrap | **Ported** (HTML splash in `index.html`, removed after theme/locale ready) |
| 10 | App version / about | hard-coded string in Settings | **Ported**: version from one constant, Capacitor `App.getInfo()` when native |
| 11 | Toast/alert service | `NotifyService` | already present; **localized** button labels |
| 12 | Pull-to-refresh | dashboard only | present where lists exist; not extended (no new behavior needed) |
| 13 | Settings page: language, theme, account, about | API address, sign-out only | **Extended** |
| 14 | `X-Request-Id` correlation interceptor | none | **Skipped**: every Playwright mock and the CORS allow-list would need the new header; API has no request-id logging to correlate with. Revisit with an API logger |
| 15 | App self-update from GitHub Releases (`app-update.service.ts`) | none | **Skipped**: xcroncv has no release channel/APK hosting |
| 16 | Push/local notifications, device registration, FCM | none | **Skipped**: no notification product requirement |
| 17 | Google sign-in, token vault | OIDC token paste/dev sign-in | **Skipped**: xcroncv auth is host-issued tokens (CLAUDE.md) |
| 18 | Deep links (`deep-link.service.ts`) | none | **Skipped**: only the token portfolio URL, already a web route |
| 19 | Ads, payments, tracking events | n/a | **Skipped**: out of scope for a resume product; no third-party tracking (privacy) |
| 20 | Help chat widget | AI assistant page exists | **Skipped** |
| 21 | Haptics | none | **Skipped**: `@capacitor/haptics` not installed; purely cosmetic |
| 22 | Onboarding theme prompt, warm theme | none | **Skipped** (theme is a Settings choice; warm theme not part of xcroncv's neutral design) |

## i18n coverage
Translated to keys (en/ta/hi): shell nav, settings, login, dashboard, offline/loading/session notices, error messages, toasts. Other pages still contain English literals and are listed in **Pending** below. Key catalogs: `apps/web/src/app/core/i18n/{en,ta,hi}.ts`; a Jest test fails if `ta`/`hi` miss a key present in `en`.

Tamil/Hindi strings are first-pass machine-assisted translations and should be reviewed by a native speaker.

## Pending
- Move remaining ~30 pages' literals to translation keys (follow-up per page; add keys to the three catalogs).
- Native-speaker review of ta/hi.
- Request-id correlation (item 14).

## Change log
| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Initial audit and port of theme, i18n, loading bar, offline banner, friendly errors, session expiry notice, Android back, boot splash, about, preferences API | see sections above | `core/i18n/i18n.spec.ts`, `core/common-features.spec.ts`, `api/test/preferences.spec.ts`, `e2e/common-features.spec.ts` |
| 2026-11-15 | Loading redesign: page-level "Loading…" text replaced by layout skeletons (`.sk-stack`/`.sk`, sr-only text kept); boot splash fades out and never waits on HTTP; Android launch splash uses theme-matched solid color (light `#F7F5FC`, night `#070412`) instead of the image; top progress bar unchanged (no overlay/spinner). | `apps/web/src/styles.scss`, `app.component.ts`, ~34 `*.page.ts`, `android/.../values/{styles,colors}.xml`, `values-night/colors.xml` | `jest` (113 pass), `ng build` |
