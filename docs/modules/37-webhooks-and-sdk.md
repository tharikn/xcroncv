# Module 37 - Integration webhooks and SDK

## What it does
Lets a signed-in user register up to five **HTTPS** endpoints that receive **minimal, signed, versioned event notices**, with a delivery log, retry and secret rotation. `packages/sdk` is a typed client plus a receiver-side signature verifier. Service credentials never replace the user token: every API call (and every endpoint) belongs to one tenant and one owner taken from the verified token.

## Rules
- **Targets are SSRF-safe** (`webhook-logic.ts`): https only, no credentials in the URL, ports 443/8443 only, no `localhost`/`.local`/`.internal`/single-label hosts, no private, loopback, link-local, CGNAT, multicast or unique-local addresses (decimal/hex IP forms are normalised by the URL parser first; hex IPv4-mapped IPv6 is refused). At delivery time the transport uses a guarded `lookup` that resolves the name and refuses any private answer (closes DNS rebinding), never follows redirects, times out at 5 s and discards the response body.
- **Signing:** `X-XCronCV-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`. Receivers verify with a constant-time compare and reject timestamps outside a 5 minute window (replay protection). Headers `X-XCronCV-Event-Id` / `-Event-Type` allow idempotent consumers; retries reuse the same event id.
- **Secrets:** `whsec_` + 256 random bits, encrypted at rest (AES-256-GCM, `WEBHOOK_ENCRYPTION_KEY`, required in production) because signing needs the value. The clear secret is returned **once**, at creation or rotation; lists show only `••••` plus the last four characters. Rotation invalidates the previous secret immediately and bumps `secretVersion`.
- **Payloads are minimal:** `{ id, type, apiVersion, createdAt, data }` with ids and counts only. Event catalog: `test.ping`, `resume.created`, `resume.updated`, `resume.exported`, `import.completed`. `WebhooksService.emit(user, type, data)` is exported for producers; only `test.ping` is emitted today (see gaps).
- **Delivery log:** `WebhookDelivery` rows record status (PENDING/SUCCESS/FAILED), attempts, HTTP status, error and `nextAttemptAt` (backoff 1 min, 5 min, 30 min, 2 h, max 5 attempts). Permanent 4xx answers (except 408/429) are not scheduled for retry. A user can retry a failed delivery manually. Failures never throw to the caller and never affect core resume flows.
- Tenant AND owner filter on every lookup; foreign ids 404. Deleting an endpoint cascades its deliveries. Disable with `FEATURES_DISABLED=webhooks`.

## API (`/api/v1`)
`GET /webhooks/event-types`, `GET/POST /webhooks`, `PATCH/DELETE /webhooks/:id`, `POST /webhooks/:id/rotate-secret`, `POST /webhooks/:id/test`, `GET /webhooks/:id/deliveries`, `GET /webhooks/deliveries`, `POST /webhook-deliveries/:id/retry`.

## SDK (`packages/sdk`)
`XCronCvClient` (`ai.*`, `webhooks.*`, generic `request`), `XCronCvError`, `verifyWebhook(secret, header, rawBody)` and generated-style `types.ts` (to be regenerated from `/api/docs-json`). It has no `package.json` yet on purpose: adding a workspace needs a lockfile update; type-check with `npx tsc -p packages/sdk --noEmit`.

## Code map
| File | Role |
|---|---|
| `apps/api/src/webhooks/webhook-logic.ts` | Catalog, secret crypto, signing/verification, SSRF checks, guarded lookup, `HttpsSender` |
| `webhooks.service.ts`, `webhooks.controller.ts`, `dto/webhook.dto.ts`, `webhooks.module.ts` | Ownership, delivery, retry, rotation, routes (module exports the service) |
| Prisma: `WebhookEndpoint`, `WebhookDelivery` | appended to `schema.prisma` |
| `apps/web/src/app/pages/integrations.page.ts`, `core/webhooks.api.ts` | `/integrations` (hub card) |
| `packages/sdk/src/*` | client, types, receiver verifier |

## Tests
- Jest `apps/api/test/webhooks.spec.ts` (21 unsafe URLs rejected, public accepted, private ranges, rebinding guard, sign/verify/tamper/replay, secret encryption, ownership, minimal envelope, failure and retry rules, fan-out, rotation) and `apps/api/test/sdk.spec.ts` (SDK verifier accepts API signatures, client errors).
- Playwright `apps/web/e2e/integrations.spec.ts` (all device profiles): empty state, secret shown once, six unsafe URLs blocked client-side, event required, test + failure + retry, pause/rotate/delete confirmations, error banner, long-URL overflow.

## Known gaps
- ~~No background worker~~ Done: `WebhookWorker` (in-process timer, `WEBHOOK_WORKER=off` disables, `WEBHOOK_WORKER_INTERVAL_MS`, default 15 s) drains due PENDING outbox rows and scheduled FAILED retries via `WebhooksService.processDue`. Producers publish to the in-process `DomainEvents` bus (`common/domain-events.ts`); the worker subscribes and `enqueue`s one PENDING `WebhookDelivery` per subscribed endpoint (the outbox; no new table). Paused or removed endpoints are never called. Still open: a separate worker process / BullMQ for multi-instance scale (the in-process worker may double-fire across replicas).
- Producers wired: `resume.created`, `resume.updated` (ResumesService), `resume.exported` (html/pdf/docx/xlsx controllers), `import.completed` (parse: kind, pages, warning count). All emits are best-effort and ids/counts only.
- No OAuth client credentials or delegated-consent flow for third-party backends, no per-endpoint quotas, no OpenAPI-driven generator in CI, no secret overlap window on rotation.
- Prisma migration not generated: run `npm run db:migrate` once.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
