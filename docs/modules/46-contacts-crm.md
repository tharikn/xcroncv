# Module 46 - Application CRM and Contact Network (doc 46)

## What it does
A private contact and activity workspace linked to host-owned jobs/applications through **opaque references** (no competing application tracker, no mirrored host status).
- Contacts: name, organization, role, relationship (`RECRUITER`, `REFERRER`, `HIRING_MANAGER`, `PEER`, `MENTOR`, `OTHER`), user-entered channels (email/phone/linkedin/other), tags, **encrypted notes**.
- Links: `JOB` / `APPLICATION` + opaque `externalRef`. A ref never grants access to a host record.
- Timeline of activities (`OUTREACH`, `REFERRAL_REQUEST`, `RECRUITER_CALL`, `INTERVIEW_FOLLOW_UP`, `THANK_YOU`, `MEETING`, `NOTE`).
- In-app follow-up reminders (`OPEN`/`DONE`/`CANCELLED`), overdue badge, completion timestamp.
- Deduplication, search, full JSON export, delete (cascades links, activities, tasks).
- Non-goals honoured: no enrichment, no contact harvesting, no automatic messages, no calendar/email sync.

## Behaviour rules
- **Dedup**: normalised `name|organization` is unique per user; a contact sharing any channel (email lowercased, phone digits only) is also a duplicate. API returns `409 { existingId }`; the UI tells the user to open the existing contact.
- **Notes** are AES-256-GCM encrypted (`notes-crypto.ts`, key from `NOTES_ENCRYPTION_KEY`; required in production, fixed dev key otherwise). Notes are returned only by `GET /contacts/:id` and create/update responses to the owner; lists omit them. `notesEnc`/`nameKey` never leave the API.
- Activity/task `contactId` must belong to the caller (404 otherwise, non-disclosing).
- Export is streamed JSON (`Cache-Control: no-store`), saved to the device by the client.

## API (`/api/v1`, all authenticated, owner = tenant AND user)
| Method + path | Purpose |
|---|---|
| `GET/POST /contacts` | List (`q`, `tag`, `page`) / create |
| `GET /contacts/export` | Full export of contacts, activities, tasks |
| `GET/PATCH/DELETE /contacts/:id` | Detail (links, timeline, tasks) / update / delete |
| `POST /contacts/:id/links`, `DELETE /contacts/:id/links/:linkId` | Add / remove an opaque reference |
| `GET/POST /job-activities`, `PATCH/DELETE /job-activities/:id` | Timeline |
| `GET/POST /follow-up-tasks`, `PATCH/DELETE /follow-up-tasks/:id` | Reminders (`status` filter) |

## Data
`CareerContact` (unique `(userId, nameKey)`), `ContactLink`, `JobActivity`, `FollowUpTask`. `ContactOrganization` is a plain field for now. `ContactImportBatch`/`ContactConsent` (P2 import) are not created.

## Code map
| Path | Role |
|---|---|
| `apps/api/src/crm/notes-crypto.ts` | AES-GCM helpers |
| `.../contact.util.ts` | Name/channel normalisation and duplicate search |
| `.../crm.service.ts`, `crm.controller.ts` (3 controllers), `crm.module.ts`, `dto/` | Ownership, CRUD, export, `taskStats` (consumed by module 48 via the exported service) |
| `apps/web/src/app/pages/contacts.page.ts` | List, search, create, detail (links, timeline, reminders), export, delete |

## Config
`FEATURES_DISABLED=crm` removes the module (module 48 imports `CrmModule` for follow-up counts, so disabling `crm` while keeping analytics still loads the CRM routes; disable both to remove them). `NOTES_ENCRYPTION_KEY` (>= 32 random chars).

## Tests
- API unit: `apps/api/test/crm.spec.ts` (encryption round-trip/tamper, dedup helpers, cross-user isolation, task completion, stats, export scoping) using an in-memory Prisma fake.
- Playwright: `e2e/contacts.spec.ts` (create/validate/dedup/search/timeline/links/reminders/delete/export/error) on all four device profiles; `career-tools-a11y.spec.ts` for overflow + axe.

## CSV import (done)
`POST /contacts/import/preview` and `POST /contacts/import/commit` take `{ csv, consent: true }` (consent is required; max ~90 KB / 500 rows). Pure analysis in `crm/contact-import.ts`: RFC 4180 parsing, LinkedIn-export header detection, column aliases, control-character stripping, email validation. Rows are NEW / DUPLICATE (against existing contacts and earlier rows, by name+organisation or shared channel) / INVALID. Preview writes nothing; commit re-analyses server-side and saves only NEW rows (duplicates are skipped, never merged). The file is never stored, nothing is enriched or messaged. No batch table is created (stateless). UI: **Import CSV** panel on /contacts (file or paste, consent checkbox, preview, commit).

## Known gaps
- Key rotation for notes is not implemented (ciphertext has no key id).
- No calendar/email sync (import is CSV only: see below), push reminders, or audit log of note access.
- Pagination controls in the UI are absent (API supports `page`).
- Run `prisma migrate dev` for the new tables.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
