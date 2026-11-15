# Module 41 - Career Portfolio Website (doc 41)

## What it does
Lets a signed-in user publish a role-specific portfolio page built **only from facts they select**. It is private by default: a portfolio is created as a private draft, previewed privately, and published only after an explicit confirmation. Publishing returns an unguessable link; the link can expire and be revoked at once.

## Rules
- **Positive allowlist.** `buildSnapshot` (`snapshot.ts`) copies a field only if the selection names it, and each item exposes a fixed set of fields. No ids, grades, employment descriptions, unconfirmed bullets or internal flags. Hidden fields never enter the stored snapshot, so they cannot leak through the page, JSON or logs.
- **Visibility per header field:** `public`, `masked` (email/phone only: `a***@example.com`, `********00`) or `hidden` (default). Masking any other field is rejected (400). "Share-only" is not implemented (see gaps).
- **Immutable snapshots.** Creating a version re-snapshots the current profile; versions are never edited. Facts added to the profile later are not exposed until a new version is created **and** published. A new version never changes the live page.
- **Publish** needs `confirm: true`, at least one disclosed field, and an optional expiry (future, max 365 days). The raw token is returned **once**; only its SHA-256 hash is stored. Publishing again rotates the token (the old link stops working).
- **Revoke** removes the token hash immediately; the link 404s on the next request. The portfolio can be published again with a new link.
- **Public view** `GET /api/v1/public/portfolios/:token` is the **only anonymous route in the product besides /health** (CLAUDE.md records the exception). It is read-only, throttled (30/min/IP), `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` unless the owner allowed indexing, and returns one uniform 404 for malformed, unknown, revoked, expired and unpublished tokens. It serves the stored snapshot and never calls the authenticated profile serializer.
- Tenant AND owner filter on every authenticated lookup; foreign ids return 404. userId/tenantId come from the verified token only.
- Rendering uses Angular text bindings (no `innerHTML`); only http(s) links render as anchors (`rel="noopener noreferrer nofollow"`).
- Visits are counted (`VIEWED` events) with no visitor data. A failed event write never breaks the visitor response.
- Disable with `FEATURES_DISABLED=portfolio` (routes vanish; resume workflows unaffected).

- **Password protection (done).** Optional visitor password set via `PATCH /portfolios/:id/share-policy { password }` (8-128 chars; `null`/empty removes). Stored only as a salted scrypt hash (`portfolio/password.ts`), never returned (lists show `passwordProtected`). It is enforced on the SAME public route (no new route): the visitor sends `X-Portfolio-Password`; missing or wrong gives 401 `{ passwordRequired: true }` before any snapshot is read; 5 wrong guesses lock the link for 15 minutes (429), on top of the per-IP throttle. Expired/unknown/revoked links stay a uniform 404. The web gate (`password-gate`) keeps the password in memory only, never in the URL, and the HTTP interceptor no longer attaches the session token to, or signs out on a 401 from, `/public/` calls. Publishing again keeps the password; rotating the link does not.

## API (`/api/v1`)
`POST/GET /portfolios`, `GET/DELETE /portfolios/:id`, `POST /portfolios/:id/versions`, `POST /portfolios/:id/preview` (a saved version, or an ad-hoc `selection`, nothing stored), `POST /portfolios/:id/publish`, `POST /portfolios/:id/revoke`, `PATCH /portfolios/:id/share-policy` (`expiresAt`, `noIndex`), `GET /public/portfolios/:token`.

## Code map
| File | Role |
|---|---|
| `apps/api/src/portfolio/snapshot.ts` | Pure allowlist projection, masking, selection validation |
| `portfolio.service.ts` | Ownership, versions, publish/revoke, token hashing, public view |
| `portfolio.controller.ts` | Authenticated controller + the narrow `@Public` controller |
| `dto/portfolio.dto.ts` | Validated DTOs (unknown fields rejected by the global pipe) |
| Prisma: `Portfolio`, `PortfolioVersion`, `PortfolioEvent` | Appended to `schema.prisma` |
| `apps/web/src/app/pages/portfolio.page.ts` | Editor: selection, private preview, versions, publish, revoke, expiry |
| `pages/public-portfolio.page.ts` (route `/p/:token`, no auth guard) | Anonymous view |
| `shared/portfolio-render.component.ts` | One renderer for preview and public page |
| `core/profile-tools.api.ts` | Typed client (shared with modules 47 and 49) |

## Tests
- Jest: `apps/api/test/portfolio.spec.ts` (allowlist, masking, token, ownership, publish/revoke/expiry, uniform 404) and `portfolio.http.spec.ts` (real `AuthGuard`: all authenticated routes 401 without a token; public route works without one with correct headers; only one public route).
- Playwright: `apps/web/e2e/portfolio.spec.ts` (all four device profiles): empty/profile-missing states, hidden-by-default preview with no leakage, validation, publish confirmation, anonymous page shows only selected fields and noindex, revoke, versions do not change live page, error banner, no horizontal overflow. Mock handlers: `e2e/support/mock-profile-tools.ts` (module 41 section), wired in `mock-api.ts`.
- Run: `npm run api:test`; `npm run e2e -w apps/web -- e2e/portfolio.spec.ts`.

## Known gaps
- Custom domains (doc 41 P2) are not built. "Share-only" visibility is not offered (it would equal hidden on the public page).
- No admin abuse-report/takedown flow (`PortfolioAbuseReport`), no signed webhooks, no static pre-rendering or CDN cache; the public read hits the database (fine at current scale).
- Public route is rate limited per IP by the global throttler; a dedicated WAF/enumeration alert is a deployment concern.
- The share link uses the web origin; inside the Android shell this is the Capacitor origin, so copy-and-share from a desktop browser for now.
- Social metadata/JSON-LD pages are not generated (the page is client rendered), which also means nothing hidden can reach them.
- Prisma migration not generated: run `npm run db:migrate` once.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
