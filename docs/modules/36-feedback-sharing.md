# Module 36 - Consent-Based Recruiter Feedback and Sharing (doc 36)

## What it does
The candidate creates a **share**: one saved resume version, one recipient label, an explicit permission set (sections, contact fields, links) and an expiry. They can preview exactly what the recipient would receive, revoke immediately, record structured feedback they received (clarity, relevance, evidence, presentation, comment) and decide whether to accept it. Everything is private by default.

## Rules
- **Explicit consent:** creating a share needs `consent: true`; contact fields and links default to `hidden`. Expiry is 1-90 days.
- **Version-scoped:** only an immutable saved version can be shared (never the working draft, never other versions). The preview loads exactly that version through the owner-checked `ResumeSourceService`.
- **Allowlist projection** (`projectShare`): only granted sections and visible contact kinds (email / phone / location, classified from the render-model contacts); links only if enabled. No profile id or other-version data. Preview sets `Cache-Control: no-store`.
- **Revocation and expiry:** `status` is derived (`ACTIVE | EXPIRED | REVOKED`, revoked wins). A non-active share returns 410 for preview and for new feedback; revoke is idempotent; existing feedback is kept.
- **The candidate decides:** accept/decline per feedback entry. Accepting never edits the resume; it may only record `appliedVersionNumber`, which must be newer than the shared version and must exist for the caller. The summary shows per-dimension averages and warns when the sample is small.
- **No public route in this release** (CLAUDE.md allows only the portfolio token route). So there is no recipient login, token link, access log or rate-limited recipient endpoint; feedback is recorded by the owner. See gaps.
- Tenant AND owner filter on shares and feedback entries; foreign ids 404. Disable with `FEATURES_DISABLED=feedback-sharing`.

## API (`/api/v1`)
`POST/GET /feedback-shares`, `GET/DELETE /feedback-shares/:id`, `POST /feedback-shares/:id/revoke`, `GET /feedback-shares/:id/preview`, `POST/GET /feedback-shares/:id/feedback`, `PATCH /feedback-shares/:id/feedback/:fid`, `GET /feedback-shares/:id/summary`.

## Code map
| File | Role |
|---|---|
| `apps/api/src/feedback-sharing/feedback-logic.ts` | Status, contact classification, projection, summary (pure) |
| `feedback.service.ts`, `feedback.controller.ts`, `dto/feedback.dto.ts`, `feedback-sharing.module.ts` | Persistence, routes, validation |
| Prisma: `FeedbackShare`, `FeedbackEntry` | Appended to `schema.prisma` |
| `apps/web/src/app/pages/feedback-shares.page.ts` | `/feedback-shares` (hub card "Feedback and sharing") |

## Tests
- Jest: `apps/api/test/feedback-sharing.spec.ts` (projection allowlist, contact classification, status precedence, summary, consent, version scoping, tenant/owner, preview 410 after revoke/expiry, idempotent revoke, feedback gating, decision rules, DTO validation).
- Playwright: `apps/web/e2e/feedback-sharing.spec.ts` (all device profiles): private by default and consent gate, minimal preview, immediate revoke, expiry display, feedback validation and accept, no-version guidance, delete, error banner, overflow.

## Known gaps
- No recipient-facing access: token links (high-entropy, hashed), recipient-submitted feedback, access logs and per-token rate limiting need a second public route and a CLAUDE.md change; not built.
- No notification to the recipient, no resume-version creation from accepted feedback (the user edits and saves a version in the editor, then may record its number).
- Prisma migration not generated: run `npm run db:migrate` once.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
