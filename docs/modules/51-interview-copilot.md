# Module 51 - Interview copilot (text practice)

## What it does
Asynchronous **text-only** practice sessions grounded in one saved resume version and an optional job description. Questions are built deterministically from confirmed profile facts and requirement terms, each with a "why this question" explanation. Feedback comments on the content of an answer on five aspects. It is separate from module 35 (interview preparation, `/interview-prep`).

## Rules
- **Practice only:** `confirmPracticeOnly: true` is required and the UI states it throughout; there is no covert or live-assist mode, no voice, no audio or video.
- **Grounded and honest:** questions come from the latest experience, requirement terms that appear in confirmed bullets (experience questions) or the skills list, and requirements with no resume evidence become `GAP` questions labelled "possible weak spot" so the user can prepare an honest answer. Max 8 questions.
- **Feedback on answers, not people:** `relevance`, `structure` (situation/task/action/result signals), `specificity`, `evidence` (resume names referenced), `clarity` (length and sentence size), each `STRONG` or `COULD_IMPROVE` with an observation. No numeric score, no tone, accent, emotion, personality or employability judgement. The session summary only counts aspects across answers and states it is not a rating of the user.
- **Data minimisation and retention:** the job description is used once to extract terms and is not stored. Answer text is stored only when `retainAnswers` is on (off by default); feedback never quotes the answer. Turning retention off wipes stored text immediately; deleting a session cascades its answers.
- Needs an owned resume (tenant AND profile owner) and an existing immutable `ResumeVersion`. Limit 50 sessions. Tenant AND owner on every lookup; foreign ids 404. Disable with `FEATURES_DISABLED=interview-copilot`.

## API (`/api/v1`)
`POST/GET /interview-copilot/sessions`, `GET/DELETE /interview-copilot/sessions/:id`, `POST .../:id/answers`, `POST .../:id/feedback` (summary), `POST .../:id/consent`.

## Code map
| File | Role |
|---|---|
| `apps/api/src/interview-copilot/copilot-logic.ts` | Question builder, feedback dimensions |
| `interview-copilot.service.ts`, `.controller.ts`, `dto/copilot.dto.ts`, `.module.ts` | Ownership, retention rules, routes |
| Prisma: `CopilotSession`, `CopilotAnswer` | appended to `schema.prisma` |
| `apps/web/src/app/pages/interview-copilot.page.ts`, `core/copilot.api.ts` | `/interview-copilot` (hub card) |

## Tests
- Jest `apps/api/test/interview-copilot.spec.ts` (grounded questions and reasons, gap honesty, unconfirmed data, feedback wording with no scores, practice confirmation, ownership, JD not stored, retention default and wipe, summary).
- Playwright `apps/web/e2e/interview-copilot.spec.ts` (all device profiles): prerequisites and validation, question explanations, feedback and summary wording, opt-in retention and wipe, delete confirmation, error banner and overflow.

## Known gaps
- Voice practice, transcription providers and transcript encryption are not built (text only, by design for P0). Answer-structure coaching is available through the AI gateway (task **COACH_ANSWER**, deterministic adapter; a real LLM adapter is **externally blocked**), but the built-in questions and feedback use no AI; the rules are heuristic and English-oriented.
- No accessibility pacing controls beyond the plain text alternative; no multilingual support.
- Prisma migration not generated: run `npm run db:migrate` once.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
