# Module 22 - Recruiter View (`recruiter-view`)

## What it does
A **read-only** reading mode of a resume as a reviewer may scan it. It has its own route (`/recruiter-view/:id`, outside the shell like Preview), shows no score, creates no public link and cannot change the resume.

## Rules
- **Projection** (`recruiter-projection.ts`, pure): built from the same render model as preview/export; never mutates its input (tests deep-freeze it).
- **Modes**: `quick` collapses to the 3 most recent experience/project entries, 3 bullets per role and 12 skills, but collapsed entries keep their title/dates and the response states exactly what was collapsed (`collapsedSummary`). `full` shows everything. Nothing is dropped because an algorithm thinks it is less relevant, and source order is never changed.
- **Overview** from stated facts only: current role, years computed from explicit dates (null with a note when there are none), level only when the title states one, top skills.
- **Highlights**: bullets with figures and optional target-role keywords (`POST .../preview` with `targetRole`, `keywords`).
- **Anonymise**: contacts become `[email hidden]/[phone hidden]/[location hidden]`, links lose their URLs, and emails/phones/URLs inside free text are scrubbed (date ranges are preserved). Annotation evidence text is removed when anonymised. The name is kept.
- **Annotations** (optional, hideable): existing quality-review findings (writing, content, readability, consistency) attached by section/item/bullet with their finding id. No second review engine, no score.
- Private by default: authenticated, owner-checked, `Cache-Control: no-store`. Sharing, if added later, needs explicit action, scope, expiry and revocation.

## API (all read-only)
`GET /resumes/:id/recruiter-view?mode=quick|full&anonymize=&annotations=&versionId=`, `POST /resumes/:id/recruiter-view/preview` (returns a projection, stores nothing), `GET /resumes/:id/recruiter-view/annotations`. Feature flag `FEATURES_DISABLED=recruiter-view`.

## Code map
| Path | Role |
|---|---|
| `apps/api/src/recruiter-view/recruiter-projection.ts` | Projection, scrub, quick/full, annotations |
| `.../recruiter-view.service.ts`, `controller`, `dto`, `module` | Owner-checked loading via `resume-source` |
| Web | `pages/recruiter-view.page.ts` (mode chips, anonymise, notes, print, section navigation, landmarks) |
| Mock | `e2e/support/mock-insights.ts` |

## Tests
- API: `apps/api/test/recruiter-view.spec.ts` (immutability, quick vs full, collapsed disclosure, highlights, overview, anonymisation incl. text and annotations, annotation linking, no score, ownership, flag).
- Playwright: `e2e/insights.spec.ts` (quick/full, anonymise toggle, notes, read-only: no write requests and no score, keyboard navigation, unknown resume, a11y/overflow) on all four profiles.

## Known gaps
- Print uses the browser print dialog with a print stylesheet; there is no side-by-side toggle with the formatted preview and no PDF of the recruiter layout.
- Level and years are only shown when the resume states them; no "role family" detection.
- No sharing links (by design for this release).

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
