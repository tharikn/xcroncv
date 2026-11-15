# Module 43 - External profile and career data import (doc 43)

Brings career data from files into a **review queue**. Nothing becomes part of the career profile until the user includes it, decides any conflict, and confirms the merge. A confirmed merge can be undone.

## Sources
- **PDF / DOCX**: same content sniffing, zip-bomb/macro checks and deterministic parser as module 06 (`resume-parser.ts`), confidence `medium` or lower.
- **JSON** (max 1 MB): the platform profile shape or the open **JSON Resume** schema (`basics`, `work`, `education`, `skills`, `projects`, `certificates`, `languages`). Confidence `high`.
- **CSV** (max 1 MB, 2000 rows): a `type` column (`profile`, `experience`, `education`, `skill`, `project`, `certification`, `language`, `link`) plus columns such as `employerName`, `jobTitle`, `startDate`, `endDate`, `bullets` (pipe-separated), `institution`, `degree`, `name`, `url`. Row problems are reported as "Row N: ..." without echoing content.
- Dates are normalised to `YYYY-MM`; ISO full dates are accepted; anything not understood is left blank with a warning. Links must be http(s). Lists are capped to the profile limits.
- **No provider connections.** `POST /provider-connections/:provider/authorize` returns an honest 501 ("export your data as a file and import it here"). There is no scraping, no logged-in access and no claim of an official LinkedIn integration. Official providers (P2) need terms, scopes and consent review first.

## Staging model
`CareerImportJob` (tenant + owner filtered) holds the staged fields as JSON; each field carries `section`, `label`, `value`, `confidence`, `sourceKind`, `sourceRef` (e.g. "Experience #2"), `parserVersion`, `importedAt`, `status` (pending / accepted / rejected / merged). Raw bytes are parsed in memory and zeroed; **file names are not stored**. Jobs expire after 7 days and are purged on the next read or list. `ImportAuditEvent` records received / review_ready / conflicts_resolved / confirmed / undone / discarded with **counts only**.

## Duplicates and conflicts (`staging.ts`, pure)
Classification is recomputed against the *current* profile on every read:
- **new**: nothing similar. **duplicate**: same item (employer + title + start, institution + degree, skill name, project, certification, language, link URL, equal profile value) - skipped on merge.
- **conflict**: same item with different details (end date, title, start date, field, issuer, level, URL, or a different profile value). A conflict needs an explicit choice: keep existing, use imported, or keep both (not offered for single profile fields). A merge with unresolved conflicts is refused (409).
- Imported bullets become confirmed only because the user included the item.

## State machine
`review_ready` -> `confirmed` (via confirm) -> `review_ready` (via undo). Processing is synchronous for P0 sizes; the states in doc 43 s7 (received/scanning/parsing) are recorded as audit events. No worker queue is needed at these limits.

## API (all authenticated, owner-checked, `Cache-Control: no-store` on job reads)
`POST /career-imports` (multipart `file`, optional `Idempotency-Key`: a repeat returns the same job with 200), `GET /career-imports` (paged), `GET /career-imports/audit`, `GET /career-imports/:id`, `POST :id/preview` (`{accept, reject}` review selection), `POST :id/merge-preview` (what confirming would do; writes nothing), `POST :id/resolve-conflicts`, `POST :id/confirm` (`{confirm: true}`), `POST :id/undo`, `DELETE :id`.

Undo stores the pre-merge profile snapshot and the post-merge `updatedAt`; it is refused (409) if the profile changed since, and removes a profile the import created.

## Web (`features/career-imports`, route `/career-imports`, Career tools hub card)
Upload (client checks type and size), recent staged imports with Open/Delete, review grouped by section with checkboxes (none ticked by default, "Select all new items"), badges worded in words not colour only, source/confidence/parser per item, conflict groups with differences and radio choices, preview-then-confirm with live summary, merged state with undo, two-step discard.

## Feature flag
`career-imports` (`FEATURES_DISABLED=career-imports`) removes the module; resume workflows are unaffected.

## Tests
- `apps/api/test/career-imports.spec.ts` (16): JSON/JSON Resume/CSV parsing and limits, classification, merge planning, HTTP flows (staging leaves the profile untouched, idempotency, DOCX by content, rejection cases, confirm/undo, undo guard, profile creation, isolation, expiry, content-free audit, 501 provider).
- `apps/web/e2e/career-imports.spec.ts` (8 tests x 4 device profiles). Mock: `e2e/support/mock-m43.ts`.

## Known gaps
- Provider OAuth connections (P2) are not implemented by design.
- Duplicate detection is exact after normalisation (case, punctuation); fuzzy matching of renamed employers is not attempted.
- Duplicate experiences are skipped whole: extra bullets in a duplicate are not offered.
- No malware scanner or OCR (same as module 06); the metrics in doc 43 s12 are not emitted yet.
- New tables `CareerImportJob`, `ImportAuditEvent`: run `npm run db:migrate`.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
