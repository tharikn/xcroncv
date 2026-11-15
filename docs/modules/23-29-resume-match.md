# Module 23 + 29 - Resume Match Score and JD Intelligence (`resume-match`)

## What it does
Compares ONE saved resume version (or the working draft) with ONE job description and explains how well the resume's evidence lines up with that posting. Flow: pick resume version -> paste (or import a public link) -> **review and confirm the extracted requirements** -> deterministic, evidence-linked score -> history per resume.

No LLM touches the score. Extraction, normalisation, evidence mapping and arithmetic are rule-based and versioned (`EXTRACTION_VERSION`, `SCORING_VERSION` = 1.0.0, taxonomy 1.0.0). Same input gives the same output.

## Rules
- **Requirements** (`jd-analyzer.ts`): required/preferred skills, responsibilities, explicit "N years", degrees/certifications. Each has a source sentence, confidence, `included`, origin (`EXTRACTED`/`USER`). Years and degree levels are only taken when explicit; "X or Y" is one requirement satisfied by either.
- **User control**: `PATCH /job-descriptions/:id` replaces the requirement list (server re-normalises labels to taxonomy ids; client `normalized` is never trusted), bumps `revision`, resets confirmation. `confirm: true` marks it confirmed. Unconfirmed JDs can be scored but coverage says so.
- **Evidence status** (`matcher.ts`): `exact` (found where work is described: experience, projects, certifications; synonyms count as exact), `partial` (only in skills list/summary/headline, i.e. listed not demonstrated), `related` (taxonomy-adjacent skill present), `missing` ("not found in this resume", never "you lack it"), `not_evaluated` (e.g. no job dates for a years requirement, degree level not stated, seniority not stated). Points: exact 1, partial 0.5, related 0.4, missing 0.
- **Dimensions and weights**: required skills 25, experience 20, role/seniority 15, responsibilities 15, preferred skills 10, education/certs 5, domain/tools/keywords 5, language similarity 5 (lexical cosine, supporting only, no model). A dimension with nothing to evaluate is **N/A** and its weight is redistributed proportionally: `total = sum(w*score) / sum(w of applicable)`. Effective weights are returned and shown.
- **Coverage/confidence**: high/medium/low from applicable weight, extraction confidence, share of requirements evaluated, confirmation; limitations are listed in plain words.
- **Reproducibility**: each report stores resume version id/number, resume content hash, JD revision, scoring version, dimension scores, evidence items. Reports go **stale** when the JD revision changes; `recalculate` adds a new history row.
- **Never claims** hiring probability, chance of selection or ATS pass; the disclaimer is part of every report.

## URL import and SSRF guard (`jd-fetch.ts`)
`POST /job-descriptions/import-url` returns `imported | manual_paste_required | unsupported_source | retrieval_failed` and a reason; it never claims success without real content.
- Only http/https on ports 80/443; no credentials; no IP literals/localhost/internal names; length cap.
- DNS is resolved by the server and **every** address must be public (private, loopback, link-local, CGNAT, multicast, reserved, IPv6 ULA/mapped/NAT64 all refused); the socket is **pinned** to the validated IP (no rebinding), SNI/cert checked against the real host.
- Redirects followed manually (max 3), each hop re-validated. 8 s timeout, 1.5 MB cap, `text/html|xhtml|plain` only, no cookies/auth/compression. Rate limit 10/min.
- `robots.txt` honoured (5xx = disallow). LinkedIn, Naukri, Indeed, Glassdoor, Monster are accepted as input but **not fetched** (sign-in/terms): `manual_paste_required` (override only with `JD_FETCH_RESTRICTED_SOURCES=allow`, still robots-checked). Login walls, 401/403/429, empty/gated pages also fall back to paste. No credentials or sessions are ever requested.
- schema.org `JobPosting` JSON-LD is preferred; otherwise main text. Output is sanitised (markup/control characters stripped); JD text is untrusted.

## Privacy
Raw JD text is stored **only** when the user ticks "keep the original text" (`retainRawText`, default off); it is never returned by the API (`hasRawText` only). Resume files are never stored; evidence excerpts are short (<=160 chars). Logs carry no JD/resume text. All queries filter tenant AND owner (non-disclosing 404). Feature flag: `FEATURES_DISABLED=resume-match`.

## API
`POST /job-descriptions`, `POST /job-descriptions/import-url`, `GET /job-descriptions[/:id]`, `PATCH /job-descriptions/:id`, `DELETE /job-descriptions/:id`; `POST|GET /resumes/:resumeId/match-reports[?jobDescriptionId]`; `GET|DELETE /resume-match-reports/:id`, `POST /resume-match-reports/:id/recalculate`.

## Code map
| Path | Role |
|---|---|
| `apps/api/src/resume-match/taxonomy.ts` | Skill taxonomy: aliases (exact) and related (adjacent), token-boundary matching |
| `.../jd-analyzer.ts` | Sanitise, extract, normalise user edits |
| `.../matcher.ts` | Evidence mapper, statuses, weighted scoring, N/A redistribution, coverage |
| `.../jd-fetch.ts` | URL validation, SSRF guard, safe GET, robots, JSON-LD/HTML extraction |
| `.../resume-match.service.ts`, `controller`, `dto`, `module` | Orchestration, ownership, persistence |
| `apps/api/src/resume-source/` | Shared owner-checked loader of the render model (live or saved version) |
| Prisma | `JobDescription`, `ResumeMatchReport` |
| Web | `pages/match.page.ts` (`/match`), `pages/match-report.page.ts` (`/match/reports/:id`), `pages/insights.page.ts` (hub, nav "Insights"), `core/insights.api.ts`, `core/insights.format.ts` |
| Mock | `e2e/support/mock-insights.ts` (wired under `// module 23/29...` in `mock-api.ts`) |

## Tests
- API: `apps/api/test/resume-match.spec.ts` (extraction, statuses, scoring maths incl. N/A redistribution, determinism, SSRF/redirects/robots/fallbacks with injected network, ownership, retention, staleness).
- Web unit: `core/insights.format.spec.ts`.
- Playwright: `e2e/insights.spec.ts` (match flow, version binding, URL fallbacks, stale/recalc/history, validation, empty/error, a11y + overflow) on desktop, tablet, phone-web, android.

## Known gaps
- Taxonomy is ~85 technology/practice skills; non-tech roles fall back to exact phrase matching. No synonym learning.
- Responsibility matching is word overlap (no semantic model); optional semantic/AI adapter is not wired. Weights are not yet calibrated on a consented evaluation set.
- Reports keep `resumeId` without a foreign key: deleting a resume leaves its reports orphaned (they stay owner-filtered and unreachable from the UI).
- Official platform integrations (doc 23 phase 5) and JD analysis history policy settings are not built. Experience years count only dated roles that mention the skill.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
