# Module 16 - Admin usage analytics (doc 16)

## What it does
Privacy-safe, aggregate-only product usage for admin/product roles. No resume content, contacts, JD text, prompts, file paths or per-user rows are ever stored in or returned from this module.

## Authorization
- Every route needs a valid token (deny-by-default AuthGuard). The admin report additionally needs the `analytics_admin` value in the verified token `roles` claim (`AnalyticsAdminGuard`); otherwise 403. Roles are never read from request input.
- Dev token with the role: `node scripts/dev-token.mjs admin-1 xcron-dev analytics_admin`.
- Disable the module with `FEATURES_DISABLED=usage-analytics`.

## API (`/api/v1`)
| Method + path | Who | Purpose |
|---|---|---|
| `POST /analytics/usage/events` | any signed-in user | Record up to 50 allowlisted events (`{ created, duplicates }`), idempotent per `(userId, eventId)` |
| `GET /admin/analytics/usage` | `analytics_admin` | Aggregate report. Query: `from`, `to`, `platform`, `templateId`, `templateVersion`, `exportFormat`, `feature` |

## Event allowlist (`UsageEvent`)
`eventId`, `name` (fixed list in `usage-aggregate.ts`), `occurredAt`, `platform` (WEB/ANDROID), optional `sessionId`, `appVersion`, `templateId`, `templateVersion`, `resumeId` (opaque), `exportFormat`, `status`, `failureCategory` (fixed enum), `durationMs`. Unknown properties are rejected (validation `forbidNonWhitelisted`). Future-dated events are rejected. userId/tenantId come from the token. Raw-event retention target: 400 days.

## Metrics rules
- Active designers = distinct users with meaningful activity (activity, template change, preview, export request); a dashboard/page view alone never counts.
- Export generation (`EXPORT_SUCCEEDED`), `DOWNLOAD_INITIATED` and confirmed `LOCAL_SAVE_SUCCEEDED` are separate metrics.
- Funnel counts distinct users per stage: resume created, previewed, export succeeded, local save confirmed.
- Template popularity is by immutable `templateId@version`; groups with fewer than 3 users are merged into `other`.
- AI usage and estimated cost come from the existing `AiUsageEvent` metadata (feature, status, cost), aggregated only.
- Guest-to-account conversion is intentionally absent (no guest access).

## Not done
Admin page: `/admin/usage` (hidden route, API enforces the role). Emitter: `UsageApi.emit` (fire-and-forget, allowlisted fields); currently only DASHBOARD_OPENED is emitted, wire the other events at their call sites. Daily aggregate tables are computed on read (<= 50,000 events per request, flagged `truncated`).

## Tests
`apps/api/test/usage-analytics.spec.ts`: aggregation, small-group suppression, no user ids in output, admin guard, DTO allowlist, idempotent ingest.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
