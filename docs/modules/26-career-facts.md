# Module 26 - Career facts and achievement bank (doc 26)

Canonical, reusable, user-confirmed facts kept separate from resume content. Editing a resume never changes a fact; reusing a fact is an explicit "Add to my profile" action.

## Model (`CareerFact`, `CareerFactRevision`)
- `kind`: ACHIEVEMENT (context, action, outcome, scope, skills, optional metric, partial-date period, role/employer reference), PREFERENCE (roles, locations, work modes), CAREER_BREAK (partial dates plus a neutral note; never scored or flagged).
- `origin` (source / creation method): USER_ENTERED, IMPORTED, AI_REWRITTEN. EXTERNALLY_VERIFIED exists in the model but the API refuses it: it needs a trusted verification provider plus consent, and none is wired.
- `status`: DRAFT -> CONFIRMED -> ARCHIVED. Imported and AI facts always start as drafts; `confirmNow` is accepted only for USER_ENTERED facts.
- **Metrics** are optional. A fact with an unconfirmed metric cannot be confirmed until the user explicitly confirms the number (`confirmMetric`). Changing a metric on a confirmed fact resets the metric to unconfirmed and the fact to DRAFT.
- **Revision history**: every create, edit, confirm, archive and restore appends a revision snapshot. Restoring appends a new revision with the old content; nothing is rewritten.
- Dates accept `YYYY` or `YYYY-MM`; periods are validated (end not before start). Facts are not tied to a timeline, so concurrent roles and gaps need no special handling.

## API
`POST/GET /career-facts`, `GET/PATCH/DELETE /career-facts/:id`, `POST :id/confirm|archive|restore`, `GET :id/revisions`, `GET /career-facts/export` (JSON including revisions), `DELETE /career-facts?confirm=all`, `POST/GET /achievement-drafts`, `GET /skill-taxonomy`, `POST /skill-taxonomy/normalize|detect` (reuses the taxonomy from modules 23/29; unknown names stay unmatched, never guessed).

Achievement drafts are deterministic: the rough text becomes "what you did"; a number found in it becomes an *unconfirmed* metric candidate; skills are only those named in the text; missing parts (context, outcome, role) are listed. No AI, nothing invented.

## Web (`features/career-facts`, route `/career-facts`, Career tools hub card)
Quick draft, add form (skills normalised to standard names), status filters, confirm box (metric checkbox), inline edit, revision history with restore, archive, delete with confirmation, "Add to my profile" (copies the text as a confirmed bullet into a chosen role through the existing profile PUT), preferences, export download, delete-all with confirmation. A **Career breaks** card records time away (YYYY or YYYY-MM dates, optional neutral note) with add, edit and delete-with-confirmation; breaks are never scored, flagged or added to a resume automatically.

## Tests
- `apps/api/test/career-facts.spec.ts` (13): validation, drafts never invent, metric rules, revisions and restore, filters, taxonomy, isolation, export, delete-all.
- `apps/web/e2e/career-facts.spec.ts` (11 tests x 4 device profiles, including career breaks). Mock: `e2e/support/mock-m26-28.ts`.

## Known gaps
- Preferences hold a single record.
- Facts are not suggested while editing a resume; reuse is manual.
- New tables `CareerFact`, `CareerFactRevision`: run `npm run db:migrate`.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
