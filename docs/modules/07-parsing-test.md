# Module 07 - Resume Parsing Test and Multi-Parser Lab (docs 21, 30)

Separate route (`/parsing-test`, card on the Career tools hub), service, report history and score. Not part of import, quality review or match score.

## What it does
- **Generated resume** (`POST /resumes/:id/parsing-tests`, `{ format: 'pdf'|'docx', parserProfiles? }`): renders a fresh export in memory, runs the test parsers, compares the result with the resume's own render model (known ground truth), returns a **Parsing Test Score**.
- **External file** (`POST /parsing-tests/upload`, multipart): same parsers, **diagnostics only**. No ground truth, so no score and no `expected`/`extracted` values are produced.
- History: `GET /resumes/:id/parsing-tests`, `GET /parsing-tests/uploads`, `GET /parsing-tests/:id`, `DELETE /parsing-tests/:id` (owner + tenant filtered; foreign ids give 404).

## Parser adapters (doc 30 contract: id, name, version, formats, capabilities, normalised output)
| id | Reads | Notes |
|---|---|---|
| `pdf-geometric-v1` | PDF | layout-aware: groups text by position, top-to-bottom then left-to-right |
| `pdf-stream-v1` | PDF | file (content-stream) order, like simple extractors |
| `docx-xml-v1` | DOCX | body paragraphs; detects tables, text boxes, drawings, columns, header/footer text, hyperlinks |

Adapters report layout facts (columns, tables, text boxes, images, header/footer contact details, blank/image-only pages) and U+FFFD counts. Disagreement between the two PDF readers (LCS line ratio) is reported as `PT-AGR-001`. These are internal test adapters; no claim is made to emulate any named ATS. Adding an adapter = implement `ParserAdapter` and add it to `ADAPTERS` in `adapters.ts`.

## Score (only with a known source) - `parsing-score-1`
Text coverage 25%, section recognition 20%, field recognition 20%, reading order 15%, dates 10%, links+Unicode 5%, layout 5% (`engine.ts` `WEIGHTS`). Per-adapter scores are averaged. Bump `SCORE_VERSION` when weights/rules change. Never blended with quality or match scores; the report states parser versions, suite version and limits.

## Findings
Stable ids (`PT-TEXT-001`, `PT-SEC-001`, `PT-FLD-00x`, `PT-ORD-001`, `PT-DATE-001`, `PT-LNK-001`, `PT-UNI-001/002`, `PT-LAY-001..006`, `PT-PAG-001/002`, `PT-AGR-001`, `PT-RUN-001`), each with category, severity, adapter, plain-language message ("This parser did not detect your Skills heading"), suggestion, and capped expected/extracted values only for generated resumes.

## Privacy
- Uploads: memory only (5 MB, content sniffing, zip-bomb/macro checks, 10 pages, 15 s), zeroed in `finally`; file name never read or stored.
- Stored (`ParsingTestReport`): ids, format, suite version, score, findings/indicators. **Not stored**: document bytes, file names/paths, extracted text. The text preview is returned once in the run response and is not retrievable later (UI says so).
- No resume FK (plain reference like the other report tables); reports of a deleted resume remain until the owner deletes them.

## Web
`features/parsing-test/` (page, types, icons). Score or "No score" badge, four status indicators with words (not colour only), per-parser cards with capabilities and score breakdown, findings list, one-time preview, limits, history with confirm-before-delete. Responsive with no horizontal overflow.

## Tests
- `apps/api/test/parsing-test.spec.ts` (15): scored PDF/DOCX round trips, damaged-export findings, no-score uploads, scan-like and failing files, layout fixtures (tables/text boxes/columns/images/header contacts), reading-order, adapter contract, privacy.
- `apps/api/test/parsing-test.http.spec.ts` (6): multipart + JSON over HTTP, validation, 400/404/413/415, owner/tenant isolation, delete, no text persisted.
- `apps/web/e2e/parsing-test.spec.ts` (8 x 4 device profiles). Mock handlers under `// module 07` in `e2e/support/mock-api.ts`.

## Known gaps
- Heuristic column/table detection for PDFs (no table detection in PDF). Highlighting the preview region for a finding needs coordinates; not implemented.
- Only built-in adapters; third-party/licensed parsers need an agreement and an adapter (doc 21 phase 5).
- Fixtures are generated in tests, not a corpus of real-world resumes. Calibrate weights with real fixtures before relying on score thresholds.
- Prisma: new table `ParsingTestReport`; run `npm run db:migrate`.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
