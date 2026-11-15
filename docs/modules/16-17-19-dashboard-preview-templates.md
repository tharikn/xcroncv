# Modules 16, 17, 19 - Dashboard, dedicated Preview, Template gallery

## Dashboard (doc 16) - `/dashboard`
Navigation overview only: resume/template counts, profile readiness, local save location, three most recent resumes (name, role, date - never document content). No embedded preview or file browser. Pull-to-refresh and refresh on every entry. Admin analytics dashboard is not built yet.

## Preview (doc 17) - `/resumes/:id/preview`
Separate route outside the shell. Fetches `GET /resumes/:id/render-model` (the same model the export uses) and renders it with text bindings only (no `innerHTML`) on real A4/Letter dimensions: zoom +/-, fit width, fit page, page count, dashed page guides, overflow warning above 2 pages, PDF/HTML export, back to editor (editor saves pending edits first). Exact pixel parity with the PDF engine is not guaranteed (doc 17 s.5).

## Template gallery (doc 19) - `/templates`
**Catalogue: all 100 templates** (doc 19 s2 family counts 10/8/8/6/5/5/5/4/4/5 plus four 10-template style families: Bold & colorful, Elegant & editorial, Minimal & airy, Structured & sidebar). 3 hand-written seed packages in `template.catalog.ts` + 97 generated from one data table (`template.families.ts`: a family supplies defaults, each row overrides). No per-template layout code; renderers interpret declarative tokens: `layout` (single-column | two-column + `sideSections` | timeline), `theme.density` (compact/normal/relaxed: margins, spacing), `theme.headerBand`, `theme.headingStyle` (plain/bar/tint/short), `theme.nameScale`, `headerAlign` (left/center/right), font/size/accent/heading transform/alignment/rule, `sectionOrder`, plus gallery metadata `careerLevels` and `style`. Published versions stay immutable: change a look by shipping `version: 2`.

Gallery: category chips, text search (name/description/tags/category), selects for ATS profile, layout, career level, style and page format (filters combine), result count, empty state + clear, CSS thumbnails driven by the manifest (band, columns, timeline, rules, density), ATS label per card and a parser-reliability warning for every non-ATS-first template (never promises a pass). "Use template" starts a new resume with it preselected; with `?resumeId=` it switches that resume's template (content untouched).

Rendering: preview (Angular), PDF (pdfkit), HTML and DOCX all read the shared render model (`layout`, `sideSections`, `theme`). Preview/HTML/PDF render two-column rails, timeline rails and header bands; DOCX stays a single editable flow (header band becomes shaded paragraphs) - a deliberate parser-friendly limitation. ATS rules enforced in tests: ATS-first is always single-column with no band; every accent has >= 4.5:1 contrast on white.

## Tests
`e2e/dashboard-settings.spec.ts`, `e2e/editor-preview.spec.ts` (preview describe), `e2e/resumes-templates.spec.ts` (gallery describe), `e2e/template-gallery.spec.ts` (100-template gallery filters/search/thumbnails/warnings + two-column/band preview), API `test/template-catalog.spec.ts` (catalogue validity, ATS/contrast/uniqueness rules, every template x A4/Letter through HTML, DOCX and PDF), `core/core.spec.ts` (preview layout maths).

## Known gaps
Server-side page-break diagnostics, glyph checks, "final export preview" using the real PDF, per-template thumbnail images and visual-regression snapshots, DOCX multi-column, language/script filter (PDF uses standard Latin fonts only), gallery "Preview" action on cards (preview needs a resume).

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | 40 new templates (v1) in 4 style families; new optional design tokens `headingStyle`, `nameScale`, right header alignment rendered in HTML/PDF/DOCX, preview and thumbnails. Existing 60 unchanged (tokens absent = defaults). | `templates/template.{types,families,catalog}.ts`, `export/{html,pdf}.renderer.ts`, `import-export/docx.renderer.ts`, `web core/models.ts`, `pages/preview.page.ts`, `shared/template-thumb.component.ts`, `styles.scss` | `test/template-catalog.spec.ts` (100 templates x A4/Letter), `e2e/template-gallery.spec.ts` |
| 2026-11-14 | Dashboard page strings moved to translation keys (en/ta/hi); no layout or data change | `pages/dashboard.page.ts`, `core/i18n/*.ts` | `e2e/common-features.spec.ts` (Hindi dashboard), existing `e2e/dashboard-settings.spec.ts` |
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
