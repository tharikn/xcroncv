# Low-Level Design - Phase 0/1 (derived from docs 04, 05, 08, 17, 18, 19)
> No LLD was supplied; this is inferred. Docs 20-25, 39, 40 were not available, so identity handoff,
> repo layout and expansion modules follow doc 15's summary only.

## Module map (apps/api/src)
| Module | Responsibility |
|---|---|
| common/auth | `AuthGuard` (global, deny-by-default), `TokenVerifier` (OIDC JWKS; dev HS256 outside prod), `@CurrentUser`, `@Public` |
| prisma | `PrismaService` (global) |
| career-profile | `PUT/GET/DELETE /career-profile`; full replace in one transaction, ordered children |
| templates | Read-only catalogue + immutable versions (`GET /templates`, `/:id`, `/:id/versions/:v`); 3 seed packages + 57 generated from `template.families.ts` (family defaults + per-row overrides) |
| render-model | Pure `buildRenderModel(profile, template, sections, overrides)`; allowlisted overrides. `resume-doc.ts` is the visual-editor document layer (`overrides.doc`: header, sections/items with ids, per-element styles, small image data URIs), validated by `sanitizeDoc` and applied by `applyDoc`; `mergeOverridesOnWrite` preserves it across classic-editor saves. Web: `features/visual-editor` (pure `doc.ops`, `history`, `geometry`, `image-process`; components `ve-sheet`, `ve-image-crop`, `app-visual-editor`) |
| resumes | CRUD, section config, template switch (content untouched), versions, `GET :id/render-model` |
| export | `renderHtml` (escaped, script-free), `renderPdf` (pdfkit, selectable text), `safeFilename` |
| health | `/health/live`, `/health/ready` (public) |
| cover-letters | Drafts from confirmed profile facts, deterministic claim validation, immutable versions, local export, opaque application binding (module 42) |
| crm | Contacts, links, timeline, follow-up tasks, dedup, AES-GCM notes, export/delete (module 46) |
| job-analytics | Idempotent event ingest, funnel/overview/version/activity aggregates, cohort threshold, export/delete (module 48) |
| common/features | `FEATURES_DISABLED` flag for optional modules |

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
Resume import/parse, DOCX/XLSX export, JD analysis + match score, recruiter view, quality review, parsing test, AI adapters, analytics, Google Docs, preview-validate endpoint, Angular web app, SDK generation, Prisma migrations (run `prisma migrate dev` once).

---

## Web app (apps/web) - Angular 17 standalone + Ionic 8 + Capacitor 6

### Source map (`src/app`)
| Path | Responsibility |
|---|---|
| `core/auth.service.ts`, `auth.guard.ts`, `auth.interceptor.ts` | Token in sessionStorage; guard redirects to `/login?next=`; interceptor adds Bearer and signs out on 401; fragment handoff stripped in the guard |
| `core/jwt.ts` | base64url, claim decode (UI only), expiry with skew, dev HS256 signer (dev builds only) |
| `core/api.service.ts` | Typed client for `/api/v1`; blob export errors decoded to the server message |
| `core/profile-mapper.ts` | `toProfileInput` (strip server-only fields; API uses forbidNonWhitelisted), `validateProfile`, `moveItem` |
| `core/preview-layout.ts` | Page px sizes, page count, fit scale, overflow warning |
| `core/settings.service.ts`, `url.ts` | API base override (Android emulator uses `http://10.0.2.2:3100/api/v1`) |
| `core/notify.service.ts` | Toasts, confirm alerts, HTTP error text |
| `shell/` | Responsive shell (rail/bottom bar) |
| `pages/` | login, dashboard, profile, resumes, resume-editor, preview, templates, settings, local-files |
| `shared/template-thumb.component.ts` | CSS layout thumbnail from template theme |
| `features/local-files/` | Module 05 (see its doc) |

### Conventions
- Ionic caches pages in its stack: pages that show server data refresh in `ionViewWillEnter`, not only `ngOnInit`. Route params are read from `ActivatedRoute` (input binding is not applied by `ion-router-outlet`).
- Forms are native inputs with real `<label for>`; `data-testid` on interactive elements used by Playwright.
- Reordering uses explicit up/down buttons (never drag-only).
- `ng serve` needs a native Rollup binary that some Windows policies block; use `npm run web:dev` (`ng build --watch` + `scripts/serve.mjs`).

### API change
`GET /templates` now also returns `layout` and `theme` (needed by the gallery thumbnails).


## Module 06 - Import and DOCX/XLSX export (apps/api/src/import-export, apps/web/src/app/features/import)
Detail: [modules/06-import-and-office-export.md](modules/06-import-and-office-export.md).

Import flow: `file -> multer memoryStorage (5 MB, 1 file) -> sniff(content) -> assertSafeDocx | pdfjs (10 pages, 15 s) -> text lines -> parseResumeText -> suggestion JSON; buffer zeroed in finally`. The web client shows suggestions, the user ticks items, `mergeIntoProfile` appends confirmed items (deduplicated, never deleting) and the result is saved with the existing `PUT /career-profile`.
Export flow: `ResumesService.renderModel -> renderDocx | renderXlsx (fflate zip of minimal OOXML parts) -> attachment stream, no-store`.
No new tables. New dependencies: `fflate`, `pdfjs-dist@3.11.174`, `@types/multer`.

## Modules 41, 47, 49 - Portfolio, Autofill, Evidence wallet (apps/api/src/{portfolio,autofill,evidence-wallet})
Details: [modules/41-career-portfolio.md](modules/41-career-portfolio.md), [modules/47-application-autofill.md](modules/47-application-autofill.md), [modules/49-evidence-wallet.md](modules/49-evidence-wallet.md). Each is a feature-flagged Nest module (`FEATURES_DISABLED=portfolio,autofill,evidence-wallet`) over `PrismaService`, reading the profile through `CareerProfileService` (portfolio, autofill). Web: lazy routes `/portfolio`, `/autofill`, `/wallet` (hub cards on `/career-tools`) and the unauthenticated `/p/:token`; one typed client `core/profile-tools.api.ts`.

Data (appended to `schema.prisma`, all rows carry `tenantId` + `userId`, filtered on every query):
- `Portfolio` (status DRAFT|PUBLISHED|REVOKED, `tokenHash` unique, `expiresAt`, `noIndex`), `PortfolioVersion` (immutable `selection` + allowlisted `snapshot`), `PortfolioEvent` (CREATED/VERSIONED/PUBLISHED/REVOKED/POLICY_CHANGED/VIEWED).
- `AutofillSession` (adapter, hostname, consented field keys, expiry), `AutofillAuditEvent` (keys only).
- `CredentialRecord` (encrypted id + last4, status/source/timestamp, recheck), `EvidenceReference`, `CredentialVerification` (history), `CredentialDisclosureGrant` (allowlisted fields, expiry, revoke).

Flows:
- Portfolio publish: `selection -> buildSnapshot(profile) -> PortfolioVersion(snapshot)`; `publish(confirm) -> token = random 256-bit, store sha256 -> return token once`. Public read: `token -> format check -> sha256 -> published + unexpired -> stored snapshot` (uniform 404 otherwise; `no-store`, `X-Robots-Tag`, throttled). Revoke deletes the hash.
- Autofill: `start(confirm) -> field-options (masked previews) -> authorize-fields (known keys, forbidden pattern, sensitive consent) -> fills[] (values only for selected keys) -> revoke`.
- Wallet: `create (SELF_REPORTED) -> verification-requests (consent; self review or provider adapter, normalised) -> effectiveStatus (derived expiry) -> disclosure grant (allowlisted projection, expiry, revoke)`.

Security notes: the only new `@Public` route is `GET /public/portfolios/:token` (CLAUDE.md updated); everything else is behind the deny-by-default guard. New env: `CREDENTIAL_ENCRYPTION_KEY` (required in production). No uploaded or generated document bytes are stored by any of these modules.

## Modules 06 and 38 - AI gateway (apps/api/src/ai, apps/web pages/ai-assistant.page.ts)
Detail: [modules/06-38-ai-gateway.md](modules/06-38-ai-gateway.md). Feature-flagged Nest module (`FEATURES_DISABLED=ai`) exporting `AiService`. Web: lazy route `/ai`, hub card on `/career-tools`, client `core/ai.api.ts`.

Data (appended to `schema.prisma`, tenant + owner on every query): `AiSetting` (opt-in, unique per user), `AiUsageEvent` (metadata only, no prompt text), `AiSuggestion` (validated output, provenance, PENDING|ACCEPTED|REJECTED).

Flow: `suggest -> consent -> provider.info.available -> validate -> quota (AI_DAILY_LIMIT) -> redact -> provider.generateStructured raced against AI_TIMEOUT_MS -> parseOutput (schema, no markup) -> unsupportedNumbers -> AiSuggestion(PENDING) + AiUsageEvent`. `decision(ACCEPT, confirm)` records the decision only; nothing is written to the profile. Provider is chosen by `AI_PROVIDER` (`deterministic` default, `none`). New env: `AI_PROVIDER`, `AI_DAILY_LIMIT`, `AI_TIMEOUT_MS`.

## Modules 20/31, 22, 23/29 - Quality review, Recruiter view, Resume match (apps/api/src/{quality-review,recruiter-view,resume-match,resume-source})
Details: [modules/20-31-quality-review.md](modules/20-31-quality-review.md), [modules/22-recruiter-view.md](modules/22-recruiter-view.md), [modules/23-29-resume-match.md](modules/23-29-resume-match.md). Three feature-flagged Nest modules (`FEATURES_DISABLED=resume-match,quality-review,recruiter-view`) sharing `resume-source` (not flagged): `ResumeSourceService.load(user, resumeId, versionId?)` returns the SAME render model as preview/export, live or from an immutable `ResumeVersion`, after a tenant + owner check, plus a content hash. Web: lazy routes `/insights` (hub, nav "Insights"), `/match`, `/match/reports/:id`, `/quality`, and `/recruiter-view/:id` outside the shell; `core/insights.api.ts` typed client; per-module mock in `e2e/support/mock-insights.ts`.

Data (appended to `schema.prisma`; every row carries `tenantId` + `userId`, filtered on every query): `JobDescription` (normalized `requirements` JSON, `revision`, `confirmationStatus`, optional opt-in `rawText`, `contentHash`), `ResumeMatchReport` (resume version id/number + content hash, JD revision, `scoringVersion`, dimension scores, coverage, evidence items; cascades with its JD), `QualityReview` (score, readiness, findings with short excerpts). Reports and reviews keep a plain `resumeId` (no FK, to avoid editing the Resume model). Recruiter view has no tables.

Flows:
- Match: `paste | import-url -> sanitise -> analyzeJd (rules) -> JobDescription (UNCONFIRMED) -> user edits/confirms (re-normalised server-side, revision++) -> computeMatch(model, requirements) -> ResumeMatchReport`. `import-url` = `validateUrl -> DNS resolve -> every IP public -> pinned request (timeout, 1.5 MB, text types) -> manual redirects re-validated -> robots.txt -> JSON-LD/HTML extract`; restricted sources and any block fall back to `manual_paste_required`.
- Scoring: item points (exact 1, partial 0.5, related 0.4, missing 0, not_evaluated excluded) -> dimension mean -> `sum(w*score)/sum(w applicable)`; weights 25/20/15/15/10/5/5/5; coverage and limitations returned. Deterministic, versioned (`SCORING_VERSION`), no LLM.
- Quality: `runQualityRules(model)` -> findings (stable ids) -> `scoreFindings` (6 dimensions, deductions capped per rule, N/A renormalised, readiness from severities) -> stored -> `compareReviews` with the previous review (never across scoring versions).
- Recruiter view: `buildProjection(model, {mode, anonymize, keywords, annotations})`; pure and read-only; annotations are quality findings by id.

Security notes: no new `@Public` routes. `POST /job-descriptions/import-url` is throttled to 10/min. Raw JD text is not stored unless the user opts in and is never returned. No generated documents are stored by these modules. Scores (match, quality) are separate and carry their own versions.

## Module 37 - Webhooks and SDK (apps/api/src/webhooks, packages/sdk, apps/web pages/integrations.page.ts)
Detail: [modules/37-webhooks-and-sdk.md](modules/37-webhooks-and-sdk.md). Feature-flagged Nest module (`FEATURES_DISABLED=webhooks`) exporting `WebhooksService.emit`. Web: lazy route `/integrations`, hub card, client `core/webhooks.api.ts`.

Data: `WebhookEndpoint` (url, events, encrypted secret + hint, active, secretVersion), `WebhookDelivery` (envelope payload, status, attempts, responseCode, nextAttemptAt). Tenant + owner on every query.

Flow: `create -> targetUrlProblem -> encrypt secret -> return clear secret once`; `deliver -> envelope {id,type,apiVersion,createdAt,data} -> HMAC(t.body) -> HttpsSender (guarded DNS lookup, no redirects, 5 s) -> WebhookDelivery(status, nextAttemptAt)`. New env: `WEBHOOK_ENCRYPTION_KEY` (required in production). No outbound call is made at request time except explicit test/retry/emit.


## Module 44 - Career path and compensation (apps/api/src/career-path, apps/web pages/career-path.page.ts)
Detail: [modules/44-career-path.md](modules/44-career-path.md). Feature-flagged (`FEATURES_DISABLED=career-path`), imports `CareerProfileModule`. Web: lazy route `/career-path`, hub card, client `core/career-path.api.ts`.

Data: `CareerPlan` + `CareerMilestone` (tenant + owner). Flow: `analyze -> CareerProfileService.get -> assess(requirements vs confirmed skills/bullets/projects) -> options (counts + evidence refs, no score)`; `create plan -> basis snapshot + starter milestones`; `compensation -> providers[] (none) -> normalizeObservations or available:false`.

## Modules 33-36 - Application vault, career readiness, interview preparation, feedback sharing (apps/api/src/{application-vault,readiness,interview-prep,feedback-sharing}, apps/web pages)
Details: [modules/33-application-resume-vault.md](modules/33-application-resume-vault.md), [34](modules/34-career-readiness.md), [35](modules/35-interview-preparation.md), [36](modules/36-feedback-sharing.md). Each is feature-flagged (`FEATURES_DISABLED=resume-vault,career-readiness,interview-prep,feedback-sharing`); no new public routes; owner and tenant always from the token.

Data (all appended to `schema.prisma`, tenant + owner indexed): `ApplicationResumeEntry` (plain reference to a `ResumeVersion` id, number and content hash, no FK so history survives resume deletes), `ReadinessPlan` (analysis and milestones JSON), `InterviewPrepSession` (questions JSON including the user's answers and feedback), `FeedbackShare` + `FeedbackEntry` (cascade).

Flow: vault `create -> ResumeVersion (tenant+owner) -> hashModel(snapshot) -> entry`; readiness `create -> CareerProfile (confirmed facts) -> analyse -> suggestMilestones`; interview `create -> ResumeSourceService.load (owner-checked render model) -> buildQuestions`, `feedback -> evaluateAnswer (rubric, no score)`; sharing `create(consent) -> version lookup -> permissions`, `preview -> ResumeSourceService.load(versionId) -> projectShare`, non-active shares return 410.

Web: one typed client `core/readiness-tools.api.ts`, four lazy pages under the career-tools hub, mocks in `e2e/support/mock-readiness-tools.ts` (imported by `mock-api.ts`), specs `application-vault`, `readiness`, `interview-prep`, `feedback-sharing`, `readiness-tools-a11y`.


## Module 07 - Parsing test and parser lab (apps/api/src/parsing-test, apps/web/src/app/features/parsing-test)
Detail: [modules/07-parsing-test.md](modules/07-parsing-test.md).

Flow: `resume -> renderModel -> export bytes (memory) -> adapters (pdf-geometric, pdf-stream, docx-xml) -> lines + layout facts -> parseResumeText (module 06 parser) -> compare with expectedFrom(renderModel) -> findings + weighted score -> ParsingTestReport (metadata only)`. Uploads follow the same path without ground truth (diagnostics, no score).
New table: `ParsingTestReport` (no document text/bytes/file names). Depends on module 06 (`resume-parser.ts`, `file-validate.ts`, `docx.renderer.ts`) and `ResumesService.renderModel`.


## Module 45 - Job clipper (apps/api/src/job-clipper, apps/web pages/job-clipper.page.ts, extensions/job-clipper)
Detail: [modules/45-job-clipper.md](modules/45-job-clipper.md). Feature-flagged (`FEATURES_DISABLED=job-clipper`), imports `CareerProfileModule`. Web: lazy route `/clips`, hub card, client `core/clipper.api.ts`.

Data: `ClippedJob` (sanitised text, content hash, idempotency key), `ExtensionSession` (30 min, revocable), `CaptureAuditEvent` (ids only). Flow: `create(reviewed) -> sanitizeText + normalizeUrl -> idempotency/hash dedupe -> session check -> ClippedJob + audit`; `analyze -> posting terms vs confirmed skills`.


## Module 32 - Job portal integration (apps/api/src/job-portal, apps/web pages/portal-jobs.page.ts)
Detail: [modules/32-job-portal-integration.md](modules/32-job-portal-integration.md). Feature-flagged (`FEATURES_DISABLED=job-portal`), imports `CareerProfileModule`. Web: lazy route `/portal-jobs`, hub card, client `core/portal.api.ts`.

Data: `PortalJobContext` (unique per tenant, user, hostId, externalId), `TailoringProposal` (items + per-item decisions), `PortalApplication` (resume id + exact version number). Flow: `PUT job-context(consent) -> sanitise -> requirementTerms`; `propose -> buildProposal(confirmed profile, terms)`; `record(confirm) -> owned resume + existing ResumeVersion -> PortalApplication`.


## Module 51 - Interview copilot (apps/api/src/interview-copilot, apps/web pages/interview-copilot.page.ts)
Detail: [modules/51-interview-copilot.md](modules/51-interview-copilot.md). Feature-flagged (`FEATURES_DISABLED=interview-copilot`), imports `CareerProfileModule`. Web: lazy route `/interview-copilot`, hub card, client `core/copilot.api.ts`.

Data: `CopilotSession` (terms, questions, retainAnswers), `CopilotAnswer` (text only when retained, feedback). Flow: `create(confirmPracticeOnly) -> owned resume + ResumeVersion -> requirementTerms(JD, not stored) -> buildQuestions`; `answer -> giveFeedback (5 aspects) -> store feedback, text only if retained`; `consent(false) -> wipe text`.


## Module 52 - Career document suite (apps/api/src/career-documents, apps/web pages/career-documents.page.ts)
Detail: [modules/52-career-documents.md](modules/52-career-documents.md). Feature-flagged (`FEATURES_DISABLED=career-documents`), imports `CareerProfileModule`. Web: lazy route `/documents`, hub card, client `core/documents.api.ts`.

Data: `CareerDocument` + immutable `CareerDocumentVersion` (sections, claims). Flow: `create -> buildDraft(type, confirmed profile, inputs) -> v1`; `version(edits) -> changed sections become USER, claims relinked -> vN+1`; `validate -> evidence links vs profile + placeholders`; `export -> stream txt/md, store nothing`.

## Module 50 - Expert review (apps/api/src/expert-review, apps/web pages/expert-review.page.ts)
Detail: [modules/50-expert-review.md](modules/50-expert-review.md). Feature-flagged (`FEATURES_DISABLED=expert-review`), imports `ResumeSourceModule`. Web: lazy route `/expert-review`, hub card, client `core/expert-review.api.ts`.

Data: `ExpertReviewRequest` (version pin, scope, consentAt, expiresAt, revokedAt, paymentStatus/paymentRef), `ExpertReviewFeedback` (optional section, ratings, comment, NEW/ACCEPTED/DECLINED), `ExpertReviewEvent` (kind + id only). Reviewers and packages are code catalogues (`expert-review-logic.ts`). Flow: `create(consent) -> owned saved ResumeVersion -> PaymentProvider.checkout (default not configured) -> request + REQUESTED/GRANTED events`; `preview -> active gate -> ResumeSource.load -> projectShare(scope) + PREVIEWED event`; `feedback -> active gate + scope check`; `decide -> record only, resume untouched`; `revoke -> immediate, idempotent`; `delete -> cascade`.


## Modules 26-28 - Facts, provenance, versions (apps/api/src/{career-facts,provenance,resume-versions}, apps/web/src/app/features/{career-facts,provenance,resume-versions})
Details: [26](modules/26-career-facts.md), [27](modules/27-provenance.md), [28](modules/28-resume-versions.md).

- 26: `CareerFact` and append-only `CareerFactRevision`; pure validation in `facts.logic.ts`; taxonomy reused from `resume-match/taxonomy.ts`.
- 27: pure engine `provenance.logic.ts` (claims, support levels, rewrite guard); evidence = confirmed facts + profile; tables `ProvenanceLink`, `RewriteProposal`.
- 28: pure `version-diff.ts` (canonical hash, diff, layout restore); tables `ResumeVariant`, `ResumeVersionMeta`; `ResumeVersion` is only ever appended to, through `ResumesService` for ownership.
New tables need `npm run db:migrate`. Feature flags: `career-facts`, `provenance`, `resume-versions`.


## Module 43 - External career data import (apps/api/src/career-imports, apps/web/src/app/features/career-imports)
Details: [43](modules/43-career-imports.md).

- Pure `staging.ts`: JSON/JSON Resume/CSV -> suggestion -> staged fields; `classify` (new/duplicate/conflict) and `planMerge` never mutate input.
- `career-imports.module.ts`: controller + service; writes the profile only through `CareerProfileService.upsert` on confirm; undo snapshot guarded by `updatedAt`.
- Tables `CareerImportJob` (7-day expiry), `ImportAuditEvent` (counts only). Flag: `career-imports`. New tables need `npm run db:migrate`.

## Module 07 - ATS compatibility engine (apps/api/src/ats-engine, apps/web/src/app/features/ats-engine)
Detail: [modules/07-ats-engine.md](modules/07-ats-engine.md). Feature-flagged (`FEATURES_DISABLED=ats-engine`), imports `ResumesModule` and `ResumeSourceModule`. Web: lazy route `/ats`, hub card.

Flow: `POST /resumes/:id/ats-reports -> JobDescription (tenant+owner) + ResumeSourceService.load (owned render model, live or version) -> computeAts -> AtsReport (versions, evidence excerpts only)`. `computeAts` = pure; runs `computeMatch` for requirement items, regroups them into the 8 ATS dimensions (20/10/20/10/10/10/10/10), counts keywords once, adds own structure and clarity rules, redistributes N/A weight. Separate `ATS_VERSION`; never combined with `SCORING_VERSION` (match), quality or parsing versions.
New table `AtsReport` (no FK to resume or JD; no document text or contact data). New tables need `npm run db:migrate`.

Template summaries also return `careerLevels` and `style`. Render model gains `layout` and `sideSections`; `theme` gains optional `density` and `headerBand` (absent on the 3 seed v1 packages = defaults).

## Common app features (apps/web/src/app/core, apps/api/src/preferences)
- **API**: `UserPreference {tenantId, userId, theme?, locale?}` unique on (tenantId,userId). `GET /me/preferences` returns `{theme,locale}` (null if never chosen). `PUT` accepts partial `theme in system|light|dark`, `locale in en|ta|hi` (ValidationPipe whitelist rejects other fields). Identity only from the token.
- **i18n**: `core/i18n/en.ts` is the key contract (`MessageKey`); `ta.ts`/`hi.ts` are typed `Catalog` so a missing key fails the build; `translate.ts` is Angular-free (Jest). `LocaleService` stores `xcroncv.locale`, sets `<html lang>`, `adoptRemote()` after sign-in. `activeLocale()` lets plain functions (`errorMessage`) localize.
- **Theme**: `ThemeService` stores `xcroncv.theme`, writes `data-theme`, `color-scheme` and `theme-color`; `styles.scss` overrides tokens under `:root[data-theme='dark']`.
- **Loading**: `apiLoadingInterceptor` counts requests to the configured API base (skips `/me/preferences`, usage and analytics event posts) via `LoadingCounter`; the bar shows after 200 ms, is `pointer-events:none`, announced as `role=status`.
- **Session**: `AuthService` arms a timer at `exp - 15 s`; 401 or timer sets `sessionExpired` and signs out; Login shows the notice.
- **Native**: `AndroidBackService` (`backAction` pure rule), `ConnectivityService` re-checks on app resume, `resolveAppVersion` uses `App.getInfo()`.
