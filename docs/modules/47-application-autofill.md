# Module 47 - Application Autofill Assistant (doc 47)

## What it does
A user-started, user-reviewed assistant that releases a **chosen subset of confirmed profile facts** for one application, as copyable values (P0) and as selector mappings a future browser extension could fill (P1). It never submits a form and never handles passwords.

Flow: start a session (explicit button, 15-minute lifetime, optional hostname) -> field-by-field review (nothing pre-selected, masked previews) -> release selected fields (needs "I reviewed" confirmation, plus per-session consent for sensitive fields) -> copy values yourself -> clear values / revoke.

## Rules
- **Closed field catalogue** (`fields.ts`): name parts, headline, email, phone, location, website, LinkedIn, current employer/title, latest education, and one `certification:<id>` reference per profile certification (name + issuer only). Anything else is rejected: keys matching passwords, tokens, OTP/MFA, identity numbers, eligibility/visa/work authorisation, demographics, salary, date of birth get a specific "never filled" error; other unknown keys get "Unknown field". No free-text or inferred answers exist.
- **Sensitive by default:** phone and location are sensitive; selecting them without `sensitiveConsent: true` is a 400. Consent is per session and cleared on revoke.
- **Only confirmed facts:** values come from the saved career profile; a field the profile lacks is returned in `skipped` and stays blank. Name parts are split from the full name (documented derivation).
- **Credential references only:** certifications surface as "Name (Issuer)". There is no credential identifier, secret, or password anywhere in the catalogue.
- **No profile dump:** `field-options` returns labels and masked previews (`a***@example.com`); real values are released only by `authorize-fields`, only for the selected keys.
- **Adapters** (`site-adapters.ts`) are frozen, versioned, declarative allowlists. `manual-copy` (verified, any host) is the default. `html-autocomplete` and `greenhouse-boards` are marked experimental/unverified and hold no submit selectors. Hosts are normalised to a bare hostname (no URL, path, query, port or credentials) and checked against the adapter's host patterns (exact or subdomain).
- **Session lifecycle:** `ACTIVE -> AUTHORIZED -> REVOKED`, `EXPIRED` derived. Revoked is 409, expired is 410. Revoke is idempotent and clears consent.
- **Audit:** `AutofillAuditEvent` records STARTED/AUTHORIZED/REVOKED with field **keys only**; values and the selectors' page content are never stored or logged.
- Every lookup filters tenant AND owner from the token; foreign sessions 404. Disable with `FEATURES_DISABLED=autofill`.

## API (`/api/v1`)
`GET /autofill/site-adapters`, `POST/GET /autofill/sessions`, `GET /autofill/sessions/:id/field-options`, `POST /autofill/sessions/:id/authorize-fields`, `POST /autofill/sessions/:id/revoke`. Responses include `submit: "never"`.

## Code map
| File | Role |
|---|---|
| `apps/api/src/autofill/fields.ts` | Field catalogue, value resolution, masking, forbidden-key pattern |
| `site-adapters.ts` | Frozen adapter allowlist, hostname normalisation/matching |
| `autofill.service.ts` | Sessions, consent gates, release, revoke, audit |
| `autofill.controller.ts`, `dto/autofill.dto.ts` | Routes and validation |
| Prisma: `AutofillSession`, `AutofillAuditEvent` | Appended to `schema.prisma` |
| `apps/web/src/app/pages/autofill.page.ts` | `/autofill` (hub card under Career tools) |

## Tests
- Jest: `apps/api/test/autofill.spec.ts` (catalogue, masking, forbidden keys, adapters never carry submit selectors, host rules, confirmation and sensitive-consent gates, selectors only for FILL adapters, skipped fields, revoked/expired, key-only audit, ownership).
- Playwright: `apps/web/e2e/autofill.spec.ts` (all device profiles): profile-missing state, nothing pre-selected, review gating, sensitive consent, only selected fields released and "nothing submitted" notice, clear values, bad hostname, revoke, API error, no overflow.
- Run: `npm run api:test`; `npm run e2e -w apps/web -- e2e/autofill.spec.ts`.

## Known gaps
- No browser extension exists yet (doc 45). The "short-lived scoped session token" is not implemented: `authorize-fields` uses the user's normal bearer token. A dedicated one-session token should be added with the extension.
- Adapters other than manual copy are unverified against live sites; they must be tested before being labelled verified.
- No per-site terms/anti-bot registry and no detection of hidden fields (extension concern).
- Idempotency keys and a separate rate limit for `authorize-fields` are not added (global throttler applies).
- Prisma migration not generated: run `npm run db:migrate` once.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
