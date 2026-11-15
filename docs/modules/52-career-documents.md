# Module 52 - Career document suite

## What it does
Drafts seven related career documents from the confirmed career profile, keeps them as **immutable versions**, labels every statement as evidenced or user-written, and exports on request without keeping the file. Works with no AI (a deterministic template per type).

Types: professional bio, project profile, reference-request email, thank-you note, resignation letter, promotion case, internal role profile. Tone: formal or friendly.

## Rules
- **Facts come from the profile only** (`doc-logic.ts`): confirmed skills, experience, bullets and projects, each linked as evidence (`experience`, `skill`, `project`, `bullet` ids). Anything the profile cannot provide (recipient, occasion, outcomes, last working day) is a visible `[add ...]` placeholder in a `USER` section, never invented text. Optional inputs (recipient, manager, last day, target role, occasion) fill placeholders.
- **Labels:** each claim is `EVIDENCED` (with an evidence link) or `USER_AUTHORED` (unverified). Editing a section makes it `USER` and drops its evidence link; untouched sections keep theirs.
- **Immutable versions:** `POST /career-documents/:id/versions` appends a new version (max 50), requires a real change and known section ids; `GET /:id?version=n` views any version; `GET /:id/diff?from=&to=` returns per-section ADDED/REMOVED/CHANGED/UNCHANGED.
- **Evidence check:** `POST /:id/claims/validate` reports links that no longer resolve (profile saves recreate rows) and unfilled placeholders; it never blocks saving.
- **Export:** `POST /:id/export/txt|md|docx|pdf` streams the current version with `no-store` and a sanitised filename; nothing about the file is stored. Only structured sections and claims are persisted.
- **Neutral drafting:** the resignation type carries a notice that it is not legal or employment-rights advice. No document is shared with anyone; there is no share route.
- Tenant AND owner on every lookup; foreign ids 404. Limit 100 documents. Disable with `FEATURES_DISABLED=career-documents`.

## API (`/api/v1`)
`GET /career-documents/types`, `GET/POST /career-documents`, `GET/DELETE /career-documents/:id`, `POST /:id/versions`, `POST /:id/claims/validate`, `GET /:id/diff`, `POST /:id/export/:format`.

## Code map
| File | Role |
|---|---|
| `apps/api/src/career-documents/doc-logic.ts` | Type catalogue, deterministic drafts, claim validation, diff, text rendering |
| `career-documents.service.ts`, `.controller.ts`, `dto/doc.dto.ts`, `.module.ts` | Ownership, versions, export, routes |
| Prisma: `CareerDocument`, `CareerDocumentVersion` | appended to `schema.prisma` |
| `apps/web/src/app/pages/career-documents.page.ts`, `core/documents.api.ts` | `/documents` (hub card) |

## Tests
- Jest `apps/api/test/career-documents.spec.ts` (all types, confirmed-only facts, placeholders, stale evidence, diff, rendering, version immutability and label changes, ownership, sanitised export).
- Playwright `apps/web/e2e/career-documents.spec.ts` (all device profiles): bio with evidence labels, placeholders and check, disclaimer, new version + diff + read-only old version, clean check and download, delete confirmation, error banner and overflow.

## Known gaps
- AI assistance for this module goes through the shared gateway (module 06/38): opt-in, redacted, quota-limited, suggestion-only. Task **POLISH_TEXT** is implemented by the deterministic adapter; a real LLM adapter is **externally blocked** (needs a vendor, key and evaluation gates) and plugs in behind the same `TextGenerationProvider` interface. The deterministic draft is complete without it; no reusable-section library or per-type length control beyond tone.
- DOCX (Title/Heading 1/Normal, no tables or images) and PDF (selectable text, standard fonts) are built in memory by `doc-export.ts` and streamed; tests round-trip them through the module-06 extractors. Real Word/Acrobat openability still to be checked manually. No export audit event.
- The experience and project pickers are not in the form (the latest experience / first project is used); inputs are free text with no address-book integration.
- Prisma migration not generated: run `npm run db:migrate` once.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
