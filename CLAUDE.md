# XCron CV - working conventions
- Independent platform (own repo, DB, API). Never import X Cron internals or read its DB.
- Local source folder reference: `D:\Projects\x-cron` (host app). Resume docs live in `D:\Projects\x-cron\docs\resume-builder`.
- Every route needs auth (deny-by-default AuthGuard). `@Public()` is for /health only.
- userId/tenantId come from the verified token, never from request bodies. Every resume query filters by tenant AND owner.
- No generated PDF/HTML/DOCX/XLSX bytes or uploaded source files are ever persisted server-side. Stream and discard.
- Preview and export share one render model (`src/render-model`). No separate layout logic.
- Templates are declarative, immutable, versioned (`src/templates/template.catalog.ts`). Ship a new `version`, never edit one.
- AI is optional, never decides numeric scores, never persists unconfirmed facts.
- Scores (ATS, match, quality, parsing) stay separate and versioned.
