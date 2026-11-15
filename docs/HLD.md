# XCron CV - High-Level Design

Derived from the X Cron resume-builder design set (docs 01, 02, 12, 15, 25, 39). Companion: [LLD.md](LLD.md). Per-module notes: [modules/](modules/).

## 1. Product
An independent, authenticated resume platform (no guest access). Users keep one **career profile**, create several **resumes** from it, choose a **template**, **preview** it as printed pages and **export** PDF/HTML that is saved **only on their own device**.

## 2. Principles (binding, see CLAUDE.md)
- Independent repo/DB/API; never import X Cron internals or read its DB.
- Deny-by-default auth; userId/tenantId only from the verified token; every query filters tenant AND owner.
- No generated or uploaded document bytes persisted server-side. Stream and discard.
- Preview and export share one render model. Templates are declarative, immutable, versioned (60 predefined, data-driven).
- AI optional, never decides scores. Scores (ATS, match, quality, parsing) stay separate.

## 3. System context
```text
 Web (Angular 17 + Ionic 8)      Android (Capacitor 6 wrapping the same web build)
        \                               /
         +--------- HTTPS /api/v1 -----+        Bearer JWT (OIDC from X Cron; HS256 dev only)
                        |
                 NestJS API (apps/api)  --- Prisma ---> PostgreSQL (resume-owned DB)
                        |
          streams PDF/HTML to the client; client saves to a local folder
```

## 4. Repository layout
| Path | Purpose |
|---|---|
| `apps/api` | NestJS API, Prisma schema, Jest tests |
| `apps/web` | Angular + Ionic app (web and mobile web; also the Capacitor web source) |
| `apps/android` | Capacitor Android project that wraps the `apps/web` build |
| `apps/web/e2e` | Playwright suites (mock API, 4 device profiles) |
| `packages/sdk` | Generated SDK (planned, from `/api/docs-json`) |
| `scripts` | `dev-token.mjs` for local tokens |
| `docs` | HLD, LLD, `modules/*`, `TESTING.md` |

## 5. Client architecture (doc 12, 25)
- One Angular codebase, three delivery targets: desktop web, responsive mobile web, Android via Capacitor.
- Responsive shell: side rail >= 992px, bottom tab bar below; content-driven breakpoints, no horizontal page scroll, safe-area aware, 44px touch targets.
- Routes: `/login`, `/dashboard`, `/profile`, `/resumes`, `/resumes/:id`, `/resumes/:id/preview` (dedicated, outside the shell), `/templates`, `/files`, `/settings`.
- State: component-local signals; token in `sessionStorage`; only per-viewer conveniences (API address, folder choice) in `localStorage`.
- Platform differences isolated behind services (`LocalFolderService`, Capacitor Filesystem/Share).

## 6. Security & privacy
Bearer JWT verified by the API only (the client decodes for UI/expiry). Rendering uses Angular text bindings (no `innerHTML`). Download names sanitised. Open-redirect-safe `?next`. Token handoff via URL fragment is stripped immediately. Logs carry no resume content.

## 7. Module index
HLD.md and LLD.md are the single high-level and low-level documents. Each module owner appends one row here and keeps its detail in `docs/modules/NN-*.md`.

| Source doc | Module | Detail |
|---|---|---|
| 04 | Career profile and resumes | [modules/04-career-profile-and-resumes.md](modules/04-career-profile-and-resumes.md) |
| 12, 25 | Web shell, auth, responsive layout, Android | [modules/12-web-shell-auth-and-layout.md](modules/12-web-shell-auth-and-layout.md) |
| 16, 17, 19 | Dashboard, preview, template gallery | [modules/16-17-19-dashboard-preview-templates.md](modules/16-17-19-dashboard-preview-templates.md) |
| 18 | Local folder manager | [modules/05-local-folder-export.md](modules/05-local-folder-export.md) |
| 42 | Cover Letter Intelligence | [modules/42-cover-letters.md](modules/42-cover-letters.md) |
| 05, 08, 10 | Resume import and DOCX/XLSX export | [modules/06-import-and-office-export.md](modules/06-import-and-office-export.md) |
| 21, 30 | Resume parsing test and multi-parser lab | [modules/07-parsing-test.md](modules/07-parsing-test.md) |
| 07 | ATS compatibility engine | [modules/07-ats-engine.md](modules/07-ats-engine.md) |
| 26 | Career facts and achievement bank | [modules/26-career-facts.md](modules/26-career-facts.md) |
| 27 | Truth verification and evidence provenance | [modules/27-provenance.md](modules/27-provenance.md) |
| 28 | Multi-resume variants and immutable versions | [modules/28-resume-versions.md](modules/28-resume-versions.md) |
| 43 | External profile and career data import | [modules/43-career-imports.md](modules/43-career-imports.md) |
| 46 | Application CRM and Contact Network | [modules/46-contacts-crm.md](modules/46-contacts-crm.md) |
| 48 | Job Search Analytics | [modules/48-job-search-analytics.md](modules/48-job-search-analytics.md) |
| 41 | Career Portfolio Website | [modules/41-career-portfolio.md](modules/41-career-portfolio.md) |
| 47 | Application Autofill Assistant | [modules/47-application-autofill.md](modules/47-application-autofill.md) |
| 49 | Credential and Evidence Wallet | [modules/49-evidence-wallet.md](modules/49-evidence-wallet.md) |
| 33 | Application Resume Vault | [modules/33-application-resume-vault.md](modules/33-application-resume-vault.md) |
| 34 | Career Readiness and Skill-Gap Guidance | [modules/34-career-readiness.md](modules/34-career-readiness.md) |
| 35 | Resume-Grounded Interview Preparation | [modules/35-interview-preparation.md](modules/35-interview-preparation.md) |
| 36 | Consent-Based Recruiter Feedback and Sharing | [modules/36-feedback-sharing.md](modules/36-feedback-sharing.md) |
| 06, 38 | AI gateway, governance and cost control | [modules/06-38-ai-gateway.md](modules/06-38-ai-gateway.md) |
| 23, 29 | Resume match score and JD intelligence | [modules/23-29-resume-match.md](modules/23-29-resume-match.md) |
| 20, 31 | Resume quality and export readiness | [modules/20-31-quality-review.md](modules/20-31-quality-review.md) |
| 22 | Recruiter view | [modules/22-recruiter-view.md](modules/22-recruiter-view.md) |
| 37 | Integration webhooks and SDK | [modules/37-webhooks-and-sdk.md](modules/37-webhooks-and-sdk.md) |
| 44 | Career path and compensation intelligence | [modules/44-career-path.md](modules/44-career-path.md) |
| 45 | Job clipper and browser extension | [modules/45-job-clipper.md](modules/45-job-clipper.md) |
| 32 | Job portal and application intelligence integration | [modules/32-job-portal-integration.md](modules/32-job-portal-integration.md) |
| 51 | Interview copilot (text practice) | [modules/51-interview-copilot.md](modules/51-interview-copilot.md) |
| 52 | Career document suite | [modules/52-career-documents.md](modules/52-career-documents.md) |
| 50 | Expert review (consent-based, scoped) | [modules/50-expert-review.md](modules/50-expert-review.md) |

## 8. Delivery status
| Doc | Module | Status |
|---|---|---|
| 04/05/08 | Profile, resumes, templates (100 of 100), render model, PDF/HTML export API | Done (API, Phase 0/1) |
| 12/25 | Web shell, auth, responsive layout, Android shell | Done; debug APK builds (7.4 MB, verified 2026-11-14; needs JDK 17, see TESTING.md). Not run on an emulator/device here |
| 16 | Dashboard (user) | Done; admin usage analytics API done (`modules/16-admin-usage-analytics.md`), admin page at `/admin/usage` done; `UsageApi.emit` wired only to DASHBOARD_OPENED, other events pending; Prisma migration not generated |
| 17 | Dedicated preview | Done |
| 18 | Local folder manager | Done (module 05 doc) |
| 19 | Template gallery | Done: all 100 templates (declarative, data-driven), filters/search/thumbnails, ATS warnings |
| 42 | Cover letters | Done P0/P1 without AI (deterministic draft + claim validation, versions, export, binding); tidy suggestions via the AI gateway (POLISH_TEXT, deterministic adapter); real LLM drafting externally blocked |
| 46 | Contacts / CRM | Done P0/P1 (contacts, timeline, links, reminders, dedup, encrypted notes, export/delete, consent-gated CSV import with preview and duplicate skipping); calendar/email sync pending |
| 48 | Job search analytics | Done P0 (manual events, funnel, versions, coverage labels, export/delete, idempotent ingestion from the application vault); host ingestion has a connector interface only (externally blocked) |
| 41 | Career portfolio | Done P0/P1 (selected-field snapshots, private preview, publish by hashed token, expiry, revoke, narrow public route, optional visitor password with lockout); custom domains, abuse reports pending |
| 47 | Autofill assistant | Done P0 (user-started sessions, consented field release for copy, sensitive/forbidden field rules, revoke, key-only audit); browser extension and scoped session token pending |
| 49 | Evidence wallet | Done P0/P1 (credential metadata, encrypted IDs, honest status model, evidence references, expiring disclosure grants); provider verification and recipient consumption pending |
| 33 | Application resume vault | Done P0 (immutable version reference plus content hash per application, stage/notes/follow-up, newer-version and deleted-version flags, snapshot view, in-app reminders with snooze and labelled suggestions); host-portal sync pending (externally blocked) |
| 34 | Career readiness | Done P0 (evidence level per target skill, transferable links, editable labelled recommendations, no score, review-first import of target skills from saved job descriptions and career-path roles) |
| 35 | Interview preparation | Done P0 (deterministic resume-grounded, general and gap questions, text-only rubric feedback, private sessions); answer coaching via the AI gateway (COACH_ANSWER, deterministic adapter); mock turns and a real LLM adapter pending (LLM externally blocked) |
| 36 | Feedback and sharing | Done P0 (consented, version-scoped, expiring, revocable shares with allowlist preview; owner-recorded feedback with accept/decline); recipient token access, access log and rate limiting pending (needs a second public route) |
| 26 | Career facts / achievement bank (confirm-gated metrics, revisions, export, delete) | Done (module 26 doc) |
| 27 | Evidence check + rewrite guard (5 support levels, explicit acknowledgement) | Done (module 27 doc); lexical matching |
| 28 | Variants, hashed immutable snapshots, compare, restore, concurrency API | Done (module 28 doc); editor saves via PUT draft; evidence-level compare |
| 43 | Staged import (PDF/DOCX/JSON/CSV), field provenance, conflicts, merge preview, undo | Done (module 43 doc); no provider OAuth by design |
| 21/30 | Parsing test (3 test parsers, scored vs generated source, diagnostics for uploads) | Done (module 07 doc); weights need calibration on real fixtures |
| 07 | ATS compatibility engine | Done P0 (own versioned score `ats-1.0.0`, 8 weighted dimensions with N/A redistribution, evidence + honest actions, structure and clarity rules, history; separate from match/quality/parsing); weight calibration, semantic adapter pending |
| 05/08/10 | Import (PDF/DOCX -> review -> profile), DOCX + XLSX export | Done (module 06 doc); real Word/Excel openability to be checked manually |
| 06, 38 | AI gateway | Done P0 (provider interface, deterministic + no-op adapters, opt-in, redaction, quota, metering, approval-required suggestions); external LLM adapter and evaluation gates pending |
| 23, 29 | Resume match score | Done P0-P3 (paste or safe public URL, confirmable requirements, deterministic evidence mapping, weighted score with N/A redistribution, coverage, history per version); official integrations, semantic adapter and weight calibration pending |
| 20, 31 | Resume quality and export readiness | Done P0 (deterministic evidence-linked rules, separate score, readiness, regression diff, real PDF/DOCX extraction read-back check kept separate from the score); AI review and multi-language fixtures pending |
| 22 | Recruiter view | Done P0-P2 (read-only quick/full projection, anonymise, optional review notes, print); sharing links intentionally not built |
| 21, 24, 26-28, 30, 32-37, 40, 43-45, 50-52 | Parsing lab, achievement bank, truth verification and other expansion modules | Pending, one module per session/commit |
| 37 | Webhooks and SDK | Done P0 + worker (SSRF-safe HTTPS targets, HMAC signing with replay window, encrypted secrets shown once, rotation, delivery log, manual retry, typed SDK client and receiver verifier; in-process retry worker, outbox rows and producers for resume.created/updated/exported and import.completed); multi-instance worker (BullMQ) pending |
| 44 | Career path | Done P0/P1 (deterministic taxonomy, evidence-vs-gap wording, saved plans and milestones); compensation adapter boundary only, no licensed source (P2 pending) |
| 45 | Job clipper | Done P0 (review-gated paste capture, sanitising, dedupe, deterministic analysis, revocable sessions); extension is a stub (scoped token, adapters, store review pending) |
| 32 | Job portal integration | Done P0 (normalized job-context contract, evidence-mapped tailoring suggestions, exact resume version recorded); host authentication/delegation and auto-versioning pending |
| 51 | Interview copilot | Done P0 (text practice, grounded questions with reasons, answer-level feedback, opt-in retention, delete); answer coaching via the AI gateway (COACH_ANSWER); voice and a real LLM adapter pending (externally blocked) |
| 52 | Career documents | Done P0/P1 (7 types, evidence labels, placeholders, immutable versions, diff, txt/md/docx/pdf export); tidy suggestions via the AI gateway (POLISH_TEXT); real LLM drafting externally blocked |
| 50 | Expert review | Done P1-style, owner-side (one saved version, scope, consent record, expiry, revoke, seeded reviewer directory, feedback accept/decline, content-free audit, payment adapter with not-configured default); reviewer login, real payments/refunds/disputes, vetting operations pending |

## Cross-cutting app features (common-app-features)
Theme (system/light/dark via `data-theme` + CSS tokens), language (en/ta/hi bundled catalogs, `| t` pipe), global non-blocking request indicator, offline banner, localized error mapping, session-expiry handling, Android back, boot splash, About. Theme and language persist locally and sync to the account through `GET/PUT /me/preferences` (per user, tenant + owner scoped, values nullable until chosen; local value wins until the account has one). Preferences never block the app: failures are silent. See [modules/common-app-features.md](modules/common-app-features.md).
