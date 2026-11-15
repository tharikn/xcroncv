# Module 34 - Career Readiness and Skill-Gap Guidance (doc 34)

## What it does
Compares a chosen target role (a list of required and nice-to-have skills the user enters) with **confirmed** career-profile evidence and reports, per skill, the strongest *kind* of recorded evidence. It suggests editable learning steps. It never produces a single employability score and never predicts hiring outcomes.

## Rules
- **Evidence levels** (`readiness-logic.ts`, `ANALYSIS_VERSION = readiness-1`): `DEMONSTRATED` (skill appears in an experience title, description or confirmed bullet), `PROJECT`, `CERTIFICATION`, `SELF_REPORTED` (listed skill only), `NONE`. Every level lists its sources (experience/project/certification/skill ids and labels).
- **Gaps are missing evidence, not missing ability:** `NONE` is worded "No recorded evidence ... does not mean you lack it".
- **Transferable skills** come from small related-skill groups (e.g. PostgreSQL to MySQL) and only point at the user's own related evidence with its source; they never upgrade the target skill's level.
- **Summary is counts by kind** plus the required skills without evidence, with an explicit "not a score" note.
- **Recommendations are labelled** (`origin: RECOMMENDATION`) and can be completed, dismissed, reopened or edited; users can add their own steps. Re-checking the profile keeps all existing steps (including dismissals and edits) and only adds new recommendations.
- Only `isUserConfirmed` skills and bullets count. Matching is whole-term and case-insensitive, safe for names like C++, C# and Node.js.
- Tenant AND owner filter on plans and on the profile lookup; owner from the token. Disable with `FEATURES_DISABLED=career-readiness`.

## API (`/api/v1`)
`POST/GET /readiness-plans`, `GET/DELETE /readiness-plans/:id`, `POST /readiness-plans/:id/refresh`, `POST /readiness-plans/:id/milestones`, `PATCH /readiness-plans/:id/milestones/:mid`.

## Import (done)
`GET /readiness-plans/import-sources` lists the owner's saved job descriptions (module 23/29) and the career-path roles (module 44 taxonomy). `POST /readiness-plans/import-preview { source: JOB_DESCRIPTION|CAREER_PATH_ROLE, id }` returns editable target skills (JD: included required/preferred skill requirements, deduplicated with required winning; role: taxonomy skills as required) with a plain-language note. Read-only: no plan is created and nothing is added to the profile until the user presses Compare. Both routes are declared before `:id`; JD lookups filter tenant AND owner. Pure logic in `readiness-import.ts`. UI: "Start from" select and Fill skills on the new-plan form.

## Code map
| File | Role |
|---|---|
| `apps/api/src/readiness/readiness-logic.ts` | Matching, levels, transferable links, milestones (pure, no I/O) |
| `readiness.service.ts`, `readiness.controller.ts`, `dto/readiness.dto.ts`, `readiness.module.ts` | Persistence, routes, validation |
| Prisma: `ReadinessPlan` | Appended to `schema.prisma` (analysis and milestones stored as JSON) |
| `apps/web/src/app/pages/readiness.page.ts` | `/readiness` (hub card "Career readiness") |

## Tests
- Jest: `apps/api/test/readiness.spec.ts` (term matching, strongest-level precedence, gap wording, transferable sources, de-duplication, no score or prediction, refresh keeps edits, unconfirmed facts ignored, tenant/owner, missing profile).
- Playwright: `apps/web/e2e/readiness.spec.ts` (all device profiles): evidence kinds and no score, milestone lifecycle, refresh keeps edits, transferable wording, validation and missing profile, delete/error/overflow, hub link.

## Known gaps
- Skills can be typed or imported (below); imports are always reviewed and edited by the user before a plan exists.
- Related-skill groups are a small static list; synonym handling is limited to whole-term matches.
- No learning-resource catalogue (suggestions are generic practice steps, by design, to avoid unvetted links).
- Prisma migration not generated: run `npm run db:migrate` once.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
