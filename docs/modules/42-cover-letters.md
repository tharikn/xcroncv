# Module 42 - Cover Letter Intelligence (doc 42)

## What it does
Evidence-grounded, role-specific cover letters that stay versioned and can be bound to one exact application.
- Draft from the **confirmed career profile only** (employers, titles, skills, achievement bullets). A pasted job description is used once for keyword matching and is **never stored or logged**.
- Four immutable, versioned templates: `concise`, `standard`, `career-change`, `referral` (`cover-letter.templates.ts`; ship a new `version`, never edit one).
- **Claim validation** (deterministic, no AI): employers/skills found in the profile are `SUPPORTED`; metrics (`40%`, `5 engineers`, `$2m`, `N years`) must appear in profile bullets or experience dates; invented referrals ("referred by X") and employer-research phrases ("I have long admired...") are `UNSUPPORTED` unless the user typed them (`USER_AUTHORED`).
- Section-level editing, tone/length controls, every save creates a **new immutable version** (claims re-validated on the server).
- Local export (PDF/HTML/TXT) streamed and never stored. Manual path works with no AI.
- Bind an exact version to an **opaque** host application reference; requires `confirm: true` (explicit user approval).

## Behaviour rules
- A `referral` draft needs a `referrerName` the user supplies; referrals are never invented.
- The editor shows evidence chips per claim and an alert for each unsupported one; the user can mark a claim "I wrote this, it is true" (becomes `USER_AUTHORED`) or edit it. Saving with unsupported claims asks for confirmation.
- Export is blocked while edits are unsaved so the file always matches a saved version. Binding is blocked while dirty for the same reason.
- No claim about ATS ranking or hiring probability anywhere.

## API (`/api/v1`, all authenticated, owner = tenant AND user)
| Method + path | Purpose |
|---|---|
| `GET /cover-letters/templates` | Template catalogue |
| `POST /cover-letters/drafts` | Create letter + version 1 (`title`, `kind`, `tone`, `length`, `company`, `jobTitle`, `resumeId?`, `referrerName?`, `jdText?`) |
| `GET /cover-letters`, `GET/PATCH/DELETE /cover-letters/:id` | List (paged), read (current version + version list), rename, delete (cascade) |
| `POST /cover-letters/:id/versions` | Save sections as a new version; returns annotated claims |
| `POST /cover-letters/:id/claims/validate` | Check claims without saving |
| `POST /cover-letters/:id/export/{pdf,html,txt}` | Stream a file; `Cache-Control: no-store` |
| `POST/GET /applications/:ref/cover-letter-bindings` | Bind / list bindings for an opaque application ref |

## Data (`prisma/schema.prisma`)
`CoverLetter`, `CoverLetterVersion` (sections + claims JSON, unique `(coverLetterId, versionNumber)`), `CoverLetterApplicationBinding` (opaque `applicationRef`, unique per user+ref+letter). Doc entity `CoverLetterClaim` is stored as JSON inside the version; `CoverLetterTemplate` is the in-code catalogue; resume binding is `resumeId` / `resumeVersionId` on the letter and binding.

## Code map
| Path | Role |
|---|---|
| `apps/api/src/cover-letters/claim-validator.ts` | Pure claim validation |
| `.../draft-builder.ts` | Pure deterministic draft |
| `.../cover-letter.render.ts` | Escaped HTML / PDF / text |
| `.../cover-letters.service.ts`, `.controller.ts`, `.module.ts`, `dto/` | Ownership checks, versioning, binding, routes |
| `apps/web/src/app/pages/cover-letters.page.ts`, `cover-letter-editor.page.ts` | List + draft form; editor |
| `apps/web/src/app/core/career-tools.api.ts`, `career-tools.format.ts` | Typed client (shared by modules 42/46/48); pure helpers |
| hooks in shared files | routes (`app.routes.ts`), hub nav item (`shell`), icons (`app.component`), `app.module.ts` (feature flag) |

## Config
`FEATURES_DISABLED=cover-letters` removes the module; resume workflows are unaffected.

## Tests
- API unit: `apps/api/test/cover-letters.spec.ts` (claims, draft builder, HTML escaping, tenant/owner filtering, bind confirmation, feature flag).
- Web unit: `core/career-tools.format.spec.ts`.
- Playwright: `e2e/cover-letters.spec.ts` (+ `career-tools-a11y.spec.ts` for overflow/axe) on desktop, tablet, phone-web, android profiles; fake API in `e2e/support/mock-career-tools.ts`.

## Known gaps
- Assistance goes through the shared AI gateway (module 06/38, opt-in, redacted, suggestion-only): task **POLISH_TEXT (tidy a letter paragraph)** works with the deterministic adapter; a real LLM adapter is **externally blocked** (vendor, key, evaluation gates) behind the same provider interface. The seam for generated drafts is `buildDraft`; any AI output must still pass `validateClaims`. Diff view between versions and per-section regeneration are not built.
- Binding reuses `resumeVersionId` as an opaque string; it is not yet checked against Resume versions of the caller.
- Application outcome analytics (P2) not built. Webhooks/SDK generation pending (docs 37).
- Migrations: run `prisma migrate dev` to create the new tables.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
