# Module 20 + 31 - Resume Quality and Export Readiness (`quality-review`)

## What it does
Runs a deterministic review of a resume's render model and returns evidence-linked findings, a **quality score** and an **export readiness** state. Separate from job match (module 23/29) and parsing scores. No AI is involved; deterministic checks need no external service.

## Rules
- **Finding shape**: `id` (stable hash of rule + location), `ruleId`, `ruleVersion`, `category`, `severity` (`critical|warning|suggestion|info`), `title`, `explanation`, `evidence {section,itemIndex,itemTitle,field,bulletIndex,text}`, `recommendation`, `confidence`, `source` (`deterministic_rule|render_validator`), `requiresUserConfirmation`.
- **Rules (v1.0.0)**: writing (repeated word, first person, weak phrases, lowercase start, spacing, tense in finished roles); content (few measurable bullets, thin bullet, no summary, summary cliches, unsupported superlatives, duplicate bullets, role without detail, skills without supporting work, large figures to confirm); structure (name, email format, phone, experience, education, skills, role dates, end-before-start, overlap, gaps, duplicate sections); consistency (mixed date formats, inconsistent technology spelling); readability (long bullets/summary, many bullets, no headline, buried experience, skills wall, density); export (nothing to export, glyphs outside the PDF font range, malformed links, page-length estimate).
- Neutral by design: gaps and overlaps are `info` ("not a defect"); no ideal page count is enforced (the estimate only suggests checking the preview); facts are never rewritten or invented, metrics are flagged for confirmation only.
- **Score**: 6 dimensions (writing 20, content 25, structure 15, consistency 15, readability 15, export 10). Each starts at 100; deductions critical 30, warning 10, suggestion 3, info 0, **capped at 2x per rule**. Dimensions that cannot be evaluated (e.g. no bullets) are excluded and weights renormalised, with the limitation disclosed.
- **Readiness** (shown as "Export readiness"): `needs_attention` if any critical, `review_recommended` if any warning, else `ready`. A critical defect shows the warning even when the number is high.
- **Regression check**: each run is stored and diffed with the previous review of the same resume (new/resolved findings by stable id, score delta). If `scoringVersion` differs the scores are **not** compared.
- Honest limits: spelling/grammar are only mechanical checks; PDF/DOCX text extraction and real layout overflow are not measured here (the page estimate is approximate).

## Privacy and security
Stored per review: score, dimension scores, findings with short excerpts (<=140 chars), resume content hash. No documents or full text. Queries filter tenant AND owner (non-disclosing 404). Feature flag `FEATURES_DISABLED=quality-review`.

## API
`POST /resumes/:resumeId/quality-reviews` (optional `resumeVersionId`, returns `comparison`), `GET /resumes/:resumeId/quality-reviews`, `GET|DELETE /quality-reviews/:id`.

## Code map
| Path | Role |
|---|---|
| `apps/api/src/quality-review/quality-engine.ts` | Rules, scoring, readiness, `compareReviews` (pure) |
| `.../quality-review.service.ts`, `controller`, `dto`, `module` | Persistence, ownership, comparison |
| Prisma | `QualityReview` |
| Web | `pages/quality.page.ts` (`/quality`), reached from the Insights hub |
| Mock | `e2e/support/mock-insights.ts` |

## Tests
- API: `apps/api/test/quality-review.spec.ts` (each rule family with evidence location, determinism, immutability, renormalisation, rule cap, critical-with-high-score, regression diff, version change, ownership).
- Playwright: `e2e/insights.spec.ts` (run, severities, filters, clean resume, regression banner, error) on all four profiles.

## Real extraction check (done)
`POST /resumes/:id/quality-reviews/export-check { resumeVersionId? }` renders the PDF and DOCX in memory from the shared render model, reads them back with the module-06 extractors (pdf.js, DOCX XML), and reports per format: word coverage, a short missing-word sample, reading order (name before first section), replacement characters, page count, and findings (`EXTRACT.<FMT>.COVERAGE|READING_ORDER|ENCODING|HEADINGS`). It is **separate from the quality score**, stores nothing (no files, no text), and is labelled as not an employer ATS result. Pure logic in `export-check.ts` (`export-check-1`). UI: **Check PDF and DOCX text extraction** on /quality.

## Known gaps
- No AI-assisted review, job-relevance mode (use module 23/29) or suggested diffs/accept flow yet.
- Real extraction check exists (below); font-embedding validation and synthetic regression fixtures across templates/languages are not built.
- Rule thresholds are heuristics and not calibrated. English-centric wording rules; no locale-aware spelling.
- Reviews keep `resumeId` without a foreign key (orphaned after resume deletion, still owner-filtered).

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
