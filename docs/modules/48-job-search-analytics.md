# Module 48 - Job Search Analytics (doc 48)

## What it does
Privacy-safe, **descriptive** analytics over events the candidate records (and, later, authorised host-portal events).
- Overview: saved / applied / responses / interviews / offers / rejections, open + overdue follow-ups (from the CRM module), median time to first response, source coverage and freshness.
- Funnel: every stage shows numerator, denominator, sample size, window.
- Resume-version insights: applications and response/interview rates per bound resume version.
- Weekly activity buckets (Monday start, UTC).
- Filters: date window, role family, geography, seniority, source.
- Export (JSON, streamed, not stored) and delete all events.

## Behaviour rules
- Missing data is labelled: manual-only coverage shows "No authorised job portal is connected"; responses without an Applied event are counted in `quality.missingAppliedEvent` and excluded from rates; time-to-response only uses applications with both events and states its sample size.
- **No causal claims**: funnel and version responses carry fixed "descriptive only / correlations" text.
- **Small cohorts are hidden**: a resume version needs >= 5 applications (`MIN_COHORT`) before rates are returned; below that `responseRate`/`interviewRate` are `null` with an explanatory note.
- Rates are `null` (shown "n/a"), never `0`/`NaN`, when the denominator is 0.
- Events store only: type, date, opaque `applicationRef`, attributes (role family, location, seniority, source name), optional resume-version id, `source` (`MANUAL`/`HOST`), `idempotencyKey`. **No resume text, contacts, prompts or JD text.**
- Ingest is idempotent per `(userId, idempotencyKey)`; future-dated events are rejected; identity comes from the token only.
- Filters apply per application (attributes on any one of its events apply to all of them).

## API (`/api/v1`, all authenticated, owner = tenant AND user)
| Method + path | Purpose |
|---|---|
| `POST /analytics/job-search/events` | Record up to 100 events (`{ created, duplicates }`) |
| `GET /analytics/job-search/overview` / `funnel` / `resume-versions` / `activity` | Aggregates (query: `from`, `to`, `roleFamily`, `geography`, `seniority`, `sourceName`) |
| `POST /analytics/exports` | Streamed JSON export (events + aggregates) |
| `DELETE /analytics/events?confirm=true[&applicationRef=]` | Delete caller's events |

`AnalyticsExportJob` is synchronous (no stored job). `ApplicationMetricSnapshot` is computed on read (<= 5000 events/user); materialised snapshots are a scaling step.

## Code map
| Path | Role |
|---|---|
| `apps/api/src/job-analytics/aggregate.ts` | Pure maths: `funnel`, `overview`, `resumeVersions`, `activity`, `applyFilters` |
| `.../job-analytics.service.ts`, `.controller.ts`, `.module.ts`, `dto/` | Ingest, idempotency, queries, export, delete |
| `apps/web/src/app/pages/job-analytics.page.ts` | Dashboard, record form, filters, export, delete |
| `apps/web/src/app/core/career-tools.format.ts` | `formatRate` (always "x% (n of d)"), `windowLabel`, `barWidth` |

## Config
`FEATURES_DISABLED=job-analytics`. Depends on module 46 for follow-up counts.

## Tests
- API unit: `apps/api/test/job-analytics.spec.ts` (funnel maths, zero denominators, missing-Applied label, time-to-response, coverage, filters, cohort threshold, weeks, idempotency, minimal event shape, owner-scoped delete).
- Web unit: `core/career-tools.format.spec.ts`.
- Playwright: `e2e/job-analytics.spec.ts` on all four profiles; mock aggregation is a compact stand-in, the real maths is covered by the API tests.

## Ingestion (done)
`POST /analytics/job-search/ingest/vault { confirm: true }` derives events from the owner's application vault (module 33): APPLIED at the applied date, plus RESPONSE/INTERVIEW/OFFER/REJECTED/WITHDRAWN implied by the stage (dated at the last update, clamped to between the application date and now, because the vault keeps no stage history). Keys are `vault:<entry>:<TYPE>` so it is idempotent and a later stage change only adds the new event. Events stay `MANUAL` (candidate-recorded, not employer-verified). UI: **Build from application vault** with a confirmation. Pure logic in `ingest.ts`.

## Known gaps
- Host-portal ingestion has its provider boundary (`HostEventConnector`, token `HOST_EVENT_CONNECTOR`, default not-configured; `POST /analytics/job-search/ingest/host` returns `available:false`). **Externally blocked** on a real portal connector and host auth. No consented cohort comparisons beyond own data.
- No retention job for old events; no outbox/worker (not needed at current volume).
- Weekly activity is a table, not a chart. Seniority/source filters exist in the API but only role/location/date are in the UI.
- Run `prisma migrate dev` for `JobSearchEvent`.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
