# Module 33 - Application Resume Vault (doc 33)

## What it does
A private history of which **saved resume version** was sent to which employer and when. It stores a reference (`resumeVersionId`, version number, content hash) to an immutable `ResumeVersion`, never a mutable link to the working resume and never document bytes.

## Rules
- **History cannot be altered by later edits.** The record pins `resumeVersionId`, `resumeVersionNumber` and a SHA-256-based `resumeContentHash` of the structured snapshot at log time. `UpdateVaultEntryDto` has no resume fields, so the reference is fixed after creation. The list flags `newerVersionExists` ("still points to version N") and `versionAvailable: false` if the resume or version was later deleted (the reference and hash are kept).
- **Only saved versions.** A working draft cannot be recorded; with no version the API returns 400 ("Save a version first"). Omitting `resumeVersionId` uses the latest saved version.
- **The portal stays the source of truth.** `stage` (Applied ... Withdrawn), notes and follow-up date/done are the candidate's own record, labelled as such in the UI.
- **Optional links:** external job id, employer label (free text), cover-letter version reference (plain string; no cross-module dependency).
- Tenant AND owner filter on every lookup and on the resume/version ownership check; foreign ids 404. Owner and tenant come from the verified token. Disable with `FEATURES_DISABLED=resume-vault`.

## API (`/api/v1`)
`POST/GET /application-vault` (filters `employer`, `stage`, `resumeId`), `GET/PATCH/DELETE /application-vault/:id`, `GET /application-vault/:id/snapshot` (the exact structured version that was sent).

## Reminders (done)
`GET /application-vault/reminders` (declared before `:id`) returns open applications needing attention, ordered by urgency: **OVERDUE**, **DUE_TODAY**, **UPCOMING** (next 7 days) from the candidate's own follow-up dates, plus **SUGGESTED** prompts for `APPLIED` entries older than 14 days with no follow-up date (labelled "Suggestion only"). OFFER/REJECTED/WITHDRAWN and done follow-ups are excluded. `POST /application-vault/:id/snooze { days: 1-60 }` moves the follow-up forward (from today, or from an existing future date) and reopens it. Pure logic in `reminders.ts`; tenant + owner on every query. UI: Reminders card on /application-vault with In 3 days / Done.

## Code map
| File | Role |
|---|---|
| `apps/api/src/application-vault/vault.service.ts` | Ownership, version pinning, views (`entryView`) |
| `vault.controller.ts`, `dto/vault.dto.ts`, `application-vault.module.ts` | Routes, validation, module |
| Prisma: `ApplicationResumeEntry` | Appended to `schema.prisma` (no FK to resume on purpose) |
| `apps/web/src/app/pages/application-vault.page.ts` | `/application-vault` (hub card "Application vault") |
| `apps/web/src/app/core/readiness-tools.api.ts` | Typed client shared with modules 34-36 |

## Tests
- Jest: `apps/api/test/application-vault.spec.ts` (version pinning and hash, no-version refusal, tenant+owner filters, update cannot touch the reference, newer/deleted version flags, overdue follow-up, snapshot, DTO validation, feature flag).
- Playwright: `apps/web/e2e/application-vault.spec.ts` (all device profiles) plus `readiness-tools-a11y.spec.ts`: empty state, pinned latest version, later version leaves record unchanged, no-version guidance, validation, stage/filter/delete, API error, hub link, no overflow, axe.

## Known gaps
- In-app reminders only (no push, email or calendar notification); no host-portal sync or import of application status (externally blocked: needs host portal auth).
- Cover letter reference is a free-text label, not a verified link to module 42.
- Prisma migration not generated: run `npm run db:migrate` once.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
