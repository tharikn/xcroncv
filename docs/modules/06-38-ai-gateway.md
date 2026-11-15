# Modules 06 and 38 - AI gateway, governance and cost control

## Tasks added for modules 42, 35, 51, 52
`POLISH_TEXT` (cover letters and career documents: spacing, repeated words, intensifiers; never adds facts or numbers; asks to fill placeholders) and `COACH_ANSWER` (interview answers: structure questions about personal contribution, a real number and the result; no rewrite, no score; the interview question travels as `context.title`). Both are in `AI_TASKS`, validated like the others, shown on /ai, and use the same consent, redaction, quota and metering. A vendor adapter is externally blocked.

## What it does
An **optional, opt-in** AI layer behind a provider interface. Business modules and the web page depend on `TextGenerationProvider`, never on a vendor SDK. The default adapter is **deterministic** (fixed rules, offline, no external calls); `AI_PROVIDER=none` selects a no-op adapter that reports itself unavailable. Every AI path degrades to the manual workflow, and the whole module can be removed with `FEATURES_DISABLED=ai`.

## Rules (the gateway, `ai.service.ts`)
Request flow: `consent -> provider available -> input validation -> quota -> redaction -> timeout race -> strict output validation -> numeric provenance check -> PENDING suggestion`.
- **Opt-in:** `AiSetting.enabled` defaults to false; turning it on is the consent. No setting, no call (403).
- **Redaction:** emails and phone numbers are replaced before text reaches a provider; the stored preview is the redacted text (160 chars).
- **Prompt injection:** source text is data. Instruction-like text (`ignore previous instructions`, `system prompt`, ...) is flagged in `provenance.injectionFlagged` and shown to the user; it never changes behaviour.
- **Quota:** `AI_DAILY_LIMIT` requests per user per rolling 24 h (default 20, 429 beyond). `UNAVAILABLE` attempts do not count.
- **Timeout:** `AI_TIMEOUT_MS` (default 8000). Timeout, provider error, malformed output all return a recoverable 5xx with "your text is unchanged".
- **Output is untrusted:** `parseOutput` enforces the schema (`text`, `notes[]`, `questions[]`, size limits) and rejects markup/SQL-looking text. Any number in the output that is not in the input or confirmed context is treated as invented and the suggestion is discarded (`INVALID_OUTPUT`).
- **Approval:** a suggestion is `PENDING`. `POST /ai/suggestions/:id/decision` with `ACCEPT` requires `confirm: true`. Accepting only records the decision (`applied: false`); the user copies the text into the profile through the normal validated endpoints. AI never decides a score and never persists an unconfirmed fact.
- **Metering:** `AiUsageEvent` stores feature, provider, model, prompt version, estimated tokens, micro-cost, latency, status. **No prompt, resume text or output is stored in usage.** `GET /ai/usage` aggregates 30 days by feature plus accepted/rejected/pending counts (the user-correction signal from doc 38).
- Tenant AND owner filter on every query; foreign ids 404. `DELETE /ai/suggestions` purges stored suggestions.

## Deterministic tasks
`REWRITE_BULLET` (drops filler openings, capitalises, never adds a verb, number or claim, asks for a real metric), `SUMMARY_DRAFT` (title/years/skills the user typed only), `KEYWORD_GAPS` (JD terms absent from the supplied skills, advisory).

## API (`/api/v1`)
`GET /ai/status`, `PUT /ai/settings`, `GET /ai/usage`, `POST/GET/DELETE /ai/suggestions`, `POST /ai/suggestions/:id/decision`.

## Code map
| File | Role |
|---|---|
| `apps/api/src/ai/ai.types.ts` | `TextGenerationProvider`, request/output contracts |
| `ai/providers.ts` | `DeterministicProvider`, `NoopProvider`, `providerFromEnv` |
| `ai/ai-policy.ts` | redaction, injection flag, output schema, numeric provenance |
| `ai/ai.service.ts`, `ai.controller.ts`, `dto/ai.dto.ts`, `ai.module.ts` | gateway, routes, validation (module exports `AiService`) |
| Prisma: `AiSetting`, `AiUsageEvent`, `AiSuggestion` | appended to `schema.prisma` |
| `apps/web/src/app/pages/ai-assistant.page.ts`, `core/ai.api.ts` | `/ai` (hub card) |

## Tests
- Jest `apps/api/test/ai.spec.ts`: redaction, injection flag, invented-number detection, output schema/unsafe markup, deterministic tasks, provider selection, gateway consent, unavailable provider, quota, malformed/invalid/slow provider, approval and ownership, feature flag.
- Playwright `apps/web/e2e/ai-assistant.spec.ts` (all device profiles): off by default, review + confirm + no profile write, reject, injection flag, summary rules, no provider, failed call keeps input, error banner and overflow, purge confirmation.

## Known gaps
- No external LLM adapter is shipped (by design for this phase); add one in `providers.ts` behind the same interface and mark `external` so the UI discloses data leaving the platform.
- The versioned synthetic evaluation set and release gates of doc 38 are only represented by the unit tests (factuality of numbers, injection flag); no bias or multilingual set.
- No result cache or debounce beyond the quota; cost is tracked, not budgeted per tenant.
- Prisma migration not generated: run `npm run db:migrate` once.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
