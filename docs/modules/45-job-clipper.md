# Module 45 - Job clipper and browser extension

## What it does
Lets a user save a job posting for later analysis by **pasting it in the web app** (P0) or through an optional extension (stub in `extensions/job-clipper`). Every capture goes through an explicit **review and confirm** step; the server never fetches the job URL and stores only sanitised plain text.

## Rules
- **Explicit consent:** `POST /clipped-jobs` requires `reviewed: true`; the web page shows exactly the cleaned text that will be stored and keeps Save disabled until the box is ticked.
- **Untrusted input:** HTML/script tags, entities and control characters are stripped (`sanitizeText`), text capped at 20 000 characters. URLs must be http(s), no credentials; fragments and tracking parameters are removed. The URL is a reference only (no SSRF surface).
- **Idempotent and deduplicated:** `idempotencyKey` (unique per user) and a content hash (title + company + description) return the existing clip with `duplicate: true`. Limit 500 clips per user.
- **Analysis is deterministic and offline:** `POST /clipped-jobs/:id/analyze` matches a fixed skill vocabulary (the career-path taxonomy) and compares with the user's **confirmed** skills: "recorded" vs "not recorded", never a score, works without AI. Use the Job match module for evidence-based reports.
- **Extension sessions:** `POST /extension/sessions` creates a 30-minute, user-scoped, revocable session (max 5 active). A clip that names a session is refused (403) if it is expired, revoked or not the caller's. Sessions and clips are listable and deletable by the owner.
- **Audit:** `CaptureAuditEvent` records action and ids only (never page content).
- Tenant AND owner filter on every lookup; foreign ids 404. Disable with `FEATURES_DISABLED=job-clipper`.

## API (`/api/v1`)
`POST/GET /clipped-jobs`, `GET/PATCH/DELETE /clipped-jobs/:id`, `POST /clipped-jobs/:id/analyze`, `POST/GET /extension/sessions`, `POST /extension/sessions/:id/revoke`.

## Code map
| File | Role |
|---|---|
| `apps/api/src/job-clipper/clip-logic.ts` | Sanitising, URL normalisation, hashing, posting analysis |
| `job-clipper.service.ts`, `.controller.ts`, `dto/clip.dto.ts`, `.module.ts` | Ownership, idempotency, sessions, audit, routes |
| Prisma: `ClippedJob`, `ExtensionSession`, `CaptureAuditEvent` | appended to `schema.prisma` |
| `apps/web/src/app/pages/job-clipper.page.ts`, `core/clipper.api.ts` | `/clips` (hub card) |
| `extensions/job-clipper/` | MV3 stub: `activeTab` + `scripting` only, no host permissions, README with protocol |

## Tests
- Jest `apps/api/test/job-clipper.spec.ts` (sanitising, URL rejection, analysis wording, review gate, idempotency, session expiry/revoke, ownership).
- Playwright `apps/web/e2e/job-clipper.spec.ts` (all device profiles): no request before confirmation, HTML stripped, validation, back-and-edit and duplicate handling, analysis wording, archive/delete, session revoke, error banner and overflow.

## Known gaps
- The extension is a stub: no scoped extension token (the API accepts the normal user bearer token), no tested site adapters, no store packaging or privacy review.
- URL-only capture stores a reference; there is no best-effort server-side fetch by design.
- Clips do not yet feed Job match or the application vault directly; users copy text across.
- Prisma migration not generated: run `npm run db:migrate` once.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
