# Module 06 - Resume import and DOCX/XLSX export (docs 05, 08, 10, 18)

## Scope
- **Import**: transient PDF/DOCX parsing -> structured *suggestions* -> user review -> confirmed items merged into the career profile.
- **Export**: editable DOCX and structured XLSX, streamed from the shared render model (same model as preview/PDF/HTML).

## Rules (all enforced in code and tests)
- Uploaded bytes live only in request memory (multer `memoryStorage`) and are zeroed in a `finally` block; never written to disk, DB or logs.
- Type is decided from content (`%PDF-` / `PK\x03\x04`), not file name or MIME. Max 5 MB, one file, no extra form fields, 10 requests/min.
- DOCX: header-only inspection first; rejects >300 entries or >20 MB uncompressed (zip bomb), missing `word/document.xml`, macro (`vbaProject.bin`) packages. Only `word/document.xml` is decompressed; XML is read with regexes (no entity expansion/XXE).
- PDF: pdfjs-dist 3.11 legacy build, `isEvalSupported:false`, first 10 pages, 15 s timeout. Scanned/image PDFs yield a "very little text" warning (no OCR).
- The parser is rule-based and deterministic; it never calls AI and never invents data. Output is suggestions with a confidence level and warnings. Nothing is saved server-side.
- Web: nothing reaches the profile until the user ticks it and presses "Add to my profile". Values that would overwrite existing profile fields are NOT pre-selected; low-confidence roles/education are not pre-selected; projects are not pre-selected. Duplicates (employer+title+start, skill name, ...) are skipped; existing data is never deleted. Imported bullets get `isUserConfirmed: true` only because the user ticked them.
- XLSX: text-only inline strings (no formulas); values starting with `= + - @ TAB CR` get a leading apostrophe; empty values show `(not provided)`; cells capped at 32,767 chars; valid unique sheet names.
- DOCX: Title/Heading 1 styles, real bullet numbering, no tables/images (ATS/parser friendly), page size/margins/font/accent from the template. XML special and control characters escaped/stripped.

## API (apps/api/src/import-export)
| Method | Path | Notes |
|---|---|---|
| POST | `/resume-imports/parse` | multipart `file`; returns `{ kind, pages, suggestion }`, `Cache-Control: no-store` |
| POST | `/resumes/:id/export/docx` | attachment, streamed |
| POST | `/resumes/:id/export/xlsx` | attachment, streamed |

Errors: 400 invalid/empty/bomb/macro, 413 too large, 415 wrong type, 429 throttled.
Files: `file-validate.ts`, `text-extract.ts`, `resume-parser.ts`, `docx.renderer.ts`, `xlsx.renderer.ts`, `ooxml.ts` (zip packing via fflate), `import-export.module.ts` (controller + module). `ResumesModule` now exports `ResumesService`.

## Web (apps/web/src/app/features/import)
`/import` route (entry link on the Profile page), `import-merge.ts` (pure merge + client pre-checks), `import.page.ts` (upload -> review -> confirm). DOCX/XLSX buttons added to the editor and preview export bars; saved through the Module 05 folder manager.

## Tests
- API: `test/import-export.spec.ts` (validation, zip bomb, macros, DOCX/XLSX structure, escaping, formula injection, parser layouts, DOCX and PDF round trips), `test/import-export.http.spec.ts` (real multipart over HTTP: 201/400/413/415, headers, extra fields).
- Web unit: `features/import/import-merge.spec.ts`.
- Playwright: `e2e/import-export.spec.ts` (upload checks, review, no-overwrite defaults, merge payload, new-profile import, validation, overflow at device widths, DOCX/XLSX downloads, failure toast). Mock handlers: `// module 06` in `e2e/support/mock-api.ts`.
- Run: `npm run test -w apps/api`, `npm run test -w apps/web`, `npm run e2e -w apps/web -- e2e/import-export.spec.ts`.

## Known gaps
- Parser quality is heuristic (typical single-column resumes); multi-column or heavily designed PDFs lose structure. The Parsing Test (module 07) is the place to measure this.
- No OCR; no legacy `.doc`.
- DOCX/XLSX openability in real Word/Excel/Google Docs is not machine-verified here; packages follow the OOXML minimum parts. Open one manually before release.
- Antivirus scanning (doc 10) is not integrated; validation is structural only.
- Android Capacitor file picker uses the standard `<input type=file>` (works in the WebView); not device-tested.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
