# Module 32 - Job portal and application intelligence integration

## What it does
A versioned, host-neutral contract for a job portal (X Cron Jobs or any other) to put a **normalized job context** into the signed-in user's own account, plus evidence-mapped **tailoring suggestions** and a record of the **exact saved resume version** used for each application. The host keeps ownership of jobs and the application lifecycle; nothing here applies, scrapes or logs in anywhere.

## Rules
- **Contract:** `PUT /portal/job-contexts` upserts by opaque `(hostId, externalId)` for the token's tenant and user. Host ids identify a record and never authorize anything; there is no portal-specific schema. Requires `consent: true`; text is sanitised (shared with the clipper), `applyUrl` must be http(s) without credentials and is never fetched. Pasting a job by hand uses the same endpoint, so the portal is optional. Limit 300 jobs.
- **Requirements:** host-listed requirements merged with known terms found in the description (fixed vocabulary), capped at 30.
- **Tailoring proposal:** `POST /portal/job-contexts/:id/proposals {resumeId}` compares each requirement with the user's **confirmed** profile: `EMPHASISE_SKILL`, `LEAD_WITH_EXPERIENCE` (both with references to existing items) or `NO_RECORDED_EVIDENCE` (informational, "add only if true", no action offered). Fixed wording, no generated text, nothing applied; each item is accepted or rejected individually (`POST /portal/proposals/:id/decisions`). The user edits the resume themselves and saves a version.
- **Exact version recorded:** `POST /portal/applications` needs `confirm: true`, an owned job context, an owned resume (tenant AND profile owner) and an existing immutable `ResumeVersion`; duplicates return the existing record. `hostStatus` is a free label the user mirrors from the portal, which stays the source of truth.
- Tenant AND owner on every lookup; foreign ids 404. Deleting a job removes its proposals and recorded applications. Disable with `FEATURES_DISABLED=job-portal`.

## API (`/api/v1`)
`PUT/GET /portal/job-contexts`, `GET/DELETE /portal/job-contexts/:id`, `POST/GET /portal/job-contexts/:id/proposals`, `POST /portal/proposals/:id/decisions`, `POST/GET /portal/applications`, `PATCH/DELETE /portal/applications/:id`.

## Code map
| File | Role |
|---|---|
| `apps/api/src/job-portal/tailoring.ts` | Requirement terms and evidence-mapped proposal builder |
| `job-portal.service.ts`, `.controller.ts`, `dto/portal.dto.ts`, `.module.ts` | Contract, ownership, proposals, application records |
| Prisma: `PortalJobContext`, `TailoringProposal`, `PortalApplication` | appended to `schema.prisma` |
| `apps/web/src/app/pages/portal-jobs.page.ts`, `core/portal.api.ts` | `/portal-jobs` (hub card) |

## Tests
- Jest `apps/api/test/job-portal.spec.ts` (term merge and cap, proposals reference only confirmed facts, consent and sanitising, host-ref keying, ownership, pending proposals, per-item decisions, exact-version rules, cascade).
- Playwright `apps/web/e2e/job-portal.spec.ts` (all device profiles): validation and consent, no invented suggestions, accept/reject, version recording with confirmation and exact version shown, delete confirmation, error banner and overflow.

## Known gaps
- No machine-to-machine host authentication or OAuth delegation: the contract accepts the user's own bearer token (a host acts through a user-delegated token once the platform issues them).
- Proposals do not create a tailored resume version or a diff automatically (the user edits and saves a version); URL ingestion is not offered by design.
- Overlaps conceptually with the application vault (module 33): `PortalApplication` holds the host reference and version; a future change should link both ledgers.
- Prisma migration not generated: run `npm run db:migrate` once.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
