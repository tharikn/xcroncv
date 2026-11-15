# Module 50 - Expert review (consent-based, scoped)

## What it does
A candidate asks a reviewer for feedback on **one saved resume version**, chooses which sections and contact details are shared, gives an explicit consent, and sets an expiry (1 to 30 days). Access can be revoked at any time. Feedback the candidate receives is recorded as entries that the candidate **accepts or declines**; accepting never edits the resume. Entirely optional: core resume features do not depend on it.

This release is **owner-side only**: there is no reviewer login, token link or public route. The "reviewer view" is a read-only preview of exactly what a reviewer would be given, and the candidate records the feedback they receive.

## Rules
- **Consent:** `consent: true` is required to create or extend access; nothing is shared by default. The consent time, scope and expiry are stored on the request.
- **Scope:** sections (allowlist of 7), contact kinds (email/phone/location hidden unless chosen) and links. The preview uses the shared allowlist projection (`projectShare`, doc 36) of the pinned immutable version, never the profile or other versions. A package caps the number of sections.
- **Version only:** the working draft cannot be reviewed; the latest saved version is pinned (id plus number).
- **Expiry and revoke:** status is derived (ACTIVE / EXPIRED / REVOKED). Preview and new feedback return 410 once not active. Revoke is immediate and idempotent and keeps recorded feedback. Extending (`/grant`) needs fresh consent and never revives a revoked request.
- **Feedback:** optional section (must be in scope), optional 1-5 ratings (clarity, relevance, evidence, presentation), comment up to 2000 chars; at least one of rating or comment.
- **Decisions:** `PATCH /feedback/:fid` with ACCEPTED or DECLINED. Recording only: the API has no code path that edits a resume or creates a version.
- **Audit:** `ExpertReviewEvent` rows (REQUESTED, GRANTED, PREVIEWED, FEEDBACK_RECORDED, ACCEPTED, DECLINED, REVOKED) hold kind, time and an id only, never resume text, comments or contact values.
- **Directory:** reviewers and packages are code-managed catalogues (`expert-review-logic.ts`), shown with vetting status, expertise, service level and conflict policy. The seeded entries are **illustrative samples, marked "Not vetted"**; no real identity or vetting exists. Admin management means shipping a new catalogue.
- **Payment:** `PaymentProvider` interface (`checkout`) with an injectable token; the default `NotConfiguredPaymentProvider` returns `NOT_CONFIGURED` with no reference. The UI states that nothing is charged and payment, refunds and disputes are unavailable. Only an opaque reference would ever be stored.
- **No bytes:** no document, export or upload is stored. Deleting a request cascades to feedback and audit.
- Tenant AND owner on every lookup (foreign ids 404); limit 50 requests per user. Disable with `FEATURES_DISABLED=expert-review`.

## API (`/api/v1`)
`GET /reviewers`, `GET /review-packages`, `GET/POST /expert-reviews`, `GET/DELETE /expert-reviews/:id`, `POST /:id/grant`, `POST /:id/revoke`, `GET /:id/preview`, `GET/POST /:id/feedback`, `PATCH /:id/feedback/:fid`, `GET /:id/audit`.

## Code map
| File | Role |
|---|---|
| `apps/api/src/expert-review/expert-review-logic.ts` | Reviewer and package catalogues, status, payment adapter interface and default |
| `expert-review.service.ts`, `.controller.ts`, `dto/expert-review.dto.ts`, `.module.ts` | Consent, scope, gates, audit, routes |
| Prisma: `ExpertReviewRequest`, `ExpertReviewFeedback`, `ExpertReviewEvent` | appended to `schema.prisma` |
| `apps/web/src/app/pages/expert-review.page.ts`, `core/expert-review.api.ts` | `/expert-review` (hub card) |
| `apps/web/e2e/support/mock-expert-review.ts` | Fake API, wired by one block before the 404 in `mock-api.ts` |

## Tests
- Jest `apps/api/test/expert-review.spec.ts` (directory and payment default, consent, scope, saved-version pin, tenant+owner filtering, preview projection, expiry/revoke gates, feedback scope, accept/decline, audit without content, delete).
- Playwright `apps/web/e2e/expert-review.spec.ts` on all four device profiles (consent gate, payment note, scoped preview and audit, revoke, expiry and extend, section feedback and decisions, no saved version, delete, error banner, overflow, axe). Private run: `apps/web/playwright.expert-review.config.ts` (own port and output folder; build with `ng build --configuration development --output-path <dir>`).

## Known gaps
- No reviewer sign-in or reviewer-side submission; feedback is entered by the candidate. No real vetting, identity or credential checks.
- No real payment, refund or dispute flow (the `disputes` route in doc 50 is not implemented); no reviewer removal workflow; no retention scheduler beyond manual delete.
- Accepted feedback does not create a new resume version; the candidate edits in the editor.
- No webhook or SDK additions; no rate limit beyond the global throttler.
- Prisma migration not generated: run `npm run db:migrate` once.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
