# Module 04 - Career profile and resumes (docs 04, 05, 12, 28)

## What it does
- **Career profile** (`/profile`): one source of truth - basics, links, experience (+bullets), skills, education, projects, certifications, languages. Single `PUT /career-profile` (full replace in a transaction).
- **Resumes** (`/resumes`, `/resumes/:id`): create (name, target role, template), edit details/status, show/hide and reorder sections, design overrides (accent, 9-12pt base size, A4/Letter), save immutable versions, delete (confirmed).

## Behaviour rules
- Dates are `YYYY-MM`. End date is dropped for current jobs; end before start is rejected.
- Client validation is for usability only; the API is authoritative. The client sends exactly the DTO (server fields `id/profileId/displayOrder` and nulls are stripped).
- Save state is always visible: "Unsaved changes" / "Saving..." / "All changes saved".
- Creating a resume without a profile shows a prompt (API 409).
- Changing template never touches content. Versions can only be saved with no unsaved edits.
- Reordering uses up/down buttons (accessible, not drag-only).

## Code map
`pages/profile.page.ts`, `pages/resumes.page.ts`, `pages/resume-editor.page.ts`, `core/profile-mapper.ts`, `core/api.service.ts`. API: `apps/api/src/career-profile`, `resumes`.

## Tests
- Unit: `core/core.spec.ts` (mapper, validation, moveItem).
- Playwright: `e2e/profile.spec.ts`, `e2e/resumes-templates.spec.ts` (list/create/delete), `e2e/editor-preview.spec.ts` (editor).

## Known gaps
Version restore/compare UI (doc 28), multi-resume duplication, conflicting-edit detection.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
