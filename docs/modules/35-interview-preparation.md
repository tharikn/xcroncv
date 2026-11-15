# Module 35 - Resume-Grounded Interview Preparation (doc 35)

## What it does
Generates practice questions from the resume (a chosen saved version, or the working draft), lets the user type answers, and gives **text-only rubric feedback**. Fully deterministic; no AI provider is needed, so provider failure cannot block practice.

## Rules
- **Question grounding** (`interview-logic.ts`, generator `deterministic-1`): `grounding: RESUME` questions quote the exact resume text with a stable evidence reference (`experience[0].bullets[1]`, `projects[0]`). `GENERAL` questions are labelled "General knowledge" and never imply the candidate did the work. Skills listed but not shown in use, and job-emphasised skills missing from the resume, become `notOnResume` / `GAP_PREPARATION` questions with honesty hints.
- **Categories:** resume walkthrough, behavioural (STAR; strongest bullets first), technical (work use vs project use vs general knowledge), job specific (role and company), gaps to prepare for. Max 24 questions.
- **Feedback rubric** (no numeric score): relevance, structure (STAR coverage), clarity, specificity and evidence alignment, each `strong | ok | improve` with a tip. Names of technologies in the answer that are absent from the resume version are flagged ("only say it if it is true"). Voice, accent, appearance and personality are never assessed; the response says so.
- **Private and deletable:** sessions are owner-only, text-first (no audio/video), and deleting a session deletes answers and feedback. The resume is loaded through the owner-checked `ResumeSourceService` (same render model as preview/export).
- Editing an answer clears stale feedback. Tenant AND owner filter everywhere. Disable with `FEATURES_DISABLED=interview-prep`.

## API (`/api/v1`)
`POST/GET /interview-preps`, `GET/DELETE /interview-preps/:id`, `PATCH /interview-preps/:id/questions/:qid` (answer, practiced), `POST /interview-preps/:id/questions/:qid/feedback`.

## Code map
| File | Role |
|---|---|
| `apps/api/src/interview-prep/interview-logic.ts` | Question builder and answer rubric (pure) |
| `interview.service.ts`, `interview.controller.ts`, `dto/interview.dto.ts`, `interview-prep.module.ts` | Persistence, routes, validation |
| Prisma: `InterviewPrepSession` | Appended to `schema.prisma` (questions as JSON) |
| `apps/web/src/app/pages/interview-prep.page.ts` | `/interview-prep` (hub card "Interview preparation") |

## Tests
- Jest: `apps/api/test/interview-prep.spec.ts` (grounded vs general vs gap questions, evidence excerpts exist in the resume, determinism, empty resume, rubric strong/weak cases, unsupported-term warning, no score or protected-trait wording, owner filter, stale feedback cleared).
- Playwright: `apps/web/e2e/interview-prep.spec.ts` (all device profiles): labelled questions, gap questions, feedback and practised state, saved-version choice, no-resume guidance, reopen/delete, error banner, hub link, overflow.

## Known gaps
- No turn-based mock interview, answer coaching is available through the AI gateway task **COACH_ANSWER** (deterministic adapter; opt-in, suggestion-only); optional AI question refinement and a real LLM adapter are **externally blocked** (vendor, key, evaluation gates). The deterministic path is complete on its own.
- No audio/video (needs separate consent design). Job context is role, company and focus skills typed by the user, not an imported job description.
- Prisma migration not generated: run `npm run db:migrate` once.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
