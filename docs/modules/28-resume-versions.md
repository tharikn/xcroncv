# Module 28 - Multi-resume variants and immutable version management (doc 28)

## Variants
`ResumeVariant`: kind MASTER (at most one per user, else 409), ROLE or JOB, with company, job title, notes and `parentResumeId`. `POST /resumes/:id/variants` copies the resume's template and layout into a new resume and records the parent. Content stays in the shared career profile. `GET /resume-variants` lists the family.

## Immutable snapshots
`POST /resumes/:id/snapshots` appends a `ResumeVersion` (structured render-model snapshot, never file bytes) plus `ResumeVersionMeta`: sha256 over canonical JSON, template id and version, the source profile's `updatedAt` (its "version"), and an optional label. No code path updates or deletes versions.

`GET :n` returns the snapshot and an integrity check (stored hash vs recomputed hash; versions saved before this module report "unknown"). `POST :n/export/pdf|docx` renders an old version exactly as saved.

Proven in tests: editing the profile or layout after saving leaves the saved snapshot identical with a valid hash, and tampering is detected.

## Compare
`GET /resumes/:id/snapshots/compare?from=1&to=2|draft` reports header, sections (added/removed/moved), items (added/removed/changed with field diffs), bullets, skills, dates and design (template, page, theme).

## Evidence-level compare
`GET /resumes/:id/provenance/compare?from=1&to=2|draft` (served by module 27 so versions do not depend on it; the page hides the section if it is unavailable). Both versions are assessed against the **same current** confirmed facts, profile and user links, then statements are matched by kind + normalised text. Reports statements **added** and **removed** (with support level and evidence labels), **changed** support, an unchanged count, both summaries, `addedNeedingEvidence` and `removedWithoutEvidence`. Read-only; wording keeps "no evidence linked" distinct from "false". The versions page shows it under the structural diff.

## Restore
`POST :n/restore` appends a **new** version with the old content (`restoredFrom`). `applyLayout: true` also re-applies that snapshot's template, section order/visibility and overrides to the working resume. Content is never written back into the profile.

## Optimistic concurrency
`PUT /resumes/:id/draft` requires `expectedUpdatedAt`; a stale value returns 409 with the current resume. This is the autosave-safe write path and **the resume editor now saves through it** (`ApiService.saveDraft`, sending the `updatedAt` it last saw). A 409 keeps the user's edits, shows a banner with "Load the latest (discard my edits)" and blocks opening the preview of an unsaved version. If the endpoint is not deployed (feature off) the client falls back to PATCH. Returning from the template gallery adopts the new `updatedAt` so a template change is not a false conflict.

## Web (`features/resume-versions`, route `/resumes/:id/versions`, "Versions" link on each resume)
Resume type and copy creation, save version (label, summary), history with verify, compare, export and restore (confirmation and layout option), two-version and version-vs-current compare with screen-reader friendly diff text.

## Tests
- `apps/api/test/resume-versions.spec.ts` (14).
- `apps/api/test/provenance.spec.ts` covers the evidence diff (24 tests in total).
- `apps/web/e2e/resume-versions.spec.ts` (10 tests x 4 device profiles); the editor conflict flow is in `e2e/editor-preview.spec.ts`.

## Known gaps
- Evidence comparison uses current evidence for both sides (it does not reconstruct what was confirmed at save time). Binding applications to exact resume and cover-letter versions is covered by the application vault (module 33); cover-letter versions are not part of this module.
- New tables `ResumeVariant`, `ResumeVersionMeta`: run `npm run db:migrate`.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
