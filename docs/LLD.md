# Low-Level Design - Phase 0/1 (derived from docs 04, 05, 08, 17, 18, 19)
> No LLD was supplied; this is inferred. Docs 20-25, 39, 40 were not available, so identity handoff,
> repo layout and expansion modules follow doc 15's summary only.

## Module map (apps/api/src)
| Module | Responsibility |
|---|---|
| common/auth | `AuthGuard` (global, deny-by-default), `TokenVerifier` (OIDC JWKS; dev HS256 outside prod), `@CurrentUser`, `@Public` |
| prisma | `PrismaService` (global) |
| career-profile | `PUT/GET/DELETE /career-profile`; full replace in one transaction, ordered children |
| templates | Read-only catalogue + immutable versions (`GET /templates`, `/:id`, `/:id/versions/:v`) |
| render-model | Pure `buildRenderModel(profile, template, sections, overrides)`; allowlisted overrides |
| resumes | CRUD, section config, template switch (content untouched), versions, `GET :id/render-model` |
| export | `renderHtml` (escaped, script-free), `renderPdf` (pdfkit, selectable text), `safeFilename` |
| health | `/health/live`, `/health/ready` (public) |

## Request flow (export)
`Bearer token -> AuthGuard (verify iss/aud/exp, upsert User by issuer+subject) -> ResumesService.owned (tenant+owner) -> buildRenderModel -> renderer -> stream (Cache-Control: no-store)`. The client saves the bytes locally.

## Data
See `prisma/schema.prisma`. Deviations from doc 04: resume sections/overrides are JSON columns on `Resume` instead of a `ResumeSection` table (simpler; sections are a small ordered list); `ResumeVersion.structuredSnapshot` holds the render model.

## Key decisions
- Dates stored as `YYYY-MM` strings (avoids timezone drift).
- Skill categories group into one render item each; empty sections are omitted.
- Overrides limited to accent colour (#RRGGBB), base size 9-12pt, page size A4/LETTER.
- PDF uses PDF standard fonts (no embedded font assets yet); non-Latin scripts need font embedding (open item).

## Not yet implemented (next)
Resume import/parse, DOCX/XLSX export, JD analysis + match score, recruiter view, quality review, parsing test, AI adapters, analytics, Google Docs, remaining 57 templates, preview-validate endpoint, Angular web app, SDK generation, Prisma migrations (run `prisma migrate dev` once).
