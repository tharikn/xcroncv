# Module 49 - Credential and Evidence Wallet (doc 49)

## What it does
Stores **metadata and references** about credentials (issuer, name, dates, identifier, verification link), shows an honest verification status, links evidence by reference, and lets the owner grant purpose-bound, expiring, revocable disclosure of selected fields. **No credential documents or uploaded files are stored**, and nothing is public by default.

## Rules
- **Status semantics** (`credential-logic.ts`): `SELF_REPORTED` (default, always set at creation, never client supplied), `DOCUMENT_REVIEWED` (the owner states they reviewed the original; source `USER`, labelled "Document reviewed by you"), `ISSUER_VERIFIED` (only from a provider adapter), `EXPIRED` (also derived from `expiresOn`; valid through the end of the expiry month/day), `REVOKED` (wins over everything), `UNABLE_TO_VERIFY`. Every status carries source and timestamp; verified standings get a recheck date (365 days self-review, 180 days provider, capped by provider validity) and `recheckDue` is flagged.
- **No upgrade beyond what is attested:** `normalizeProviderResult` maps VALID -> ISSUER_VERIFIED, REVOKED/EXPIRED -> those, anything else -> UNABLE_TO_VERIFY; a provider can never yield DOCUMENT_REVIEWED. A failed attempt is kept in history but never downgrades a standing already earned.
- **Consent:** verification requests need `consent: true`. With no provider connected (current state) a PROVIDER request records "unable to verify" and explains why; manual workflows are unaffected. Provider errors degrade the same way.
- **Edits invalidate verification:** changing name, issuer, dates or identifier on a verified credential resets it to self-reported.
- **Identifier protection:** the credential ID is AES-256-GCM encrypted (`CREDENTIAL_ENCRYPTION_KEY`, required in production), only the last four characters are stored in clear for masking, and the full value is never returned by any endpoint, never placed in URLs, and only decrypted to pass to a consented provider call.
- **Evidence references** (`LINK` with http(s) URL, `PROFILE_ITEM` validated to belong to the caller's profile, `LOCAL_NOTE` describing where a file lives on the user's own device). No binaries. Profile saves recreate items, so a profile link can go stale; the UI flags "Item no longer in profile".
- **Disclosure grants:** purpose `RESUME | PORTFOLIO | RECRUITER_SHARE`, allowlisted fields (`name`, `issuer`, `issuedOn`, `expiresOn`, `status`, `verificationUrl`, `credentialIdMasked`), 1-365 day expiry, `confirm: true` required. The projection contains only granted fields; a disclosed `status` always includes `statusSource` and `statusAsOf`; the full identifier is never disclosable. Expired/revoked grants return 410 and disclose nothing.
- Tenant AND owner filter on every lookup (credentials and grants); foreign ids 404. Deleting a credential cascades evidence, verification history and grants. Disable with `FEATURES_DISABLED=evidence-wallet`.

## API (`/api/v1`)
`GET/POST /credentials`, `GET/PATCH/DELETE /credentials/:id`, `POST/DELETE /credentials/:id/evidence[/:evidenceId]`, `POST /credentials/:id/verification-requests`, `GET /credentials/:id/verification`, `POST/GET /credentials/:id/disclosure-grants`, `GET /credential-disclosures/:id/projection`, `POST /credential-disclosures/:id/revoke`.

## Code map
| File | Role |
|---|---|
| `apps/api/src/evidence-wallet/credential-logic.ts` | Statuses, effective status, encryption, provider normalisation, projection |
| `evidence-wallet.service.ts` | Ownership, CRUD, evidence, verification, grants |
| `evidence-wallet.controller.ts`, `dto/credential.dto.ts` | Routes and validation |
| `evidence-wallet.module.ts` | Registers the (empty) `VERIFICATION_PROVIDERS` list; add adapters here |
| Prisma: `CredentialRecord`, `EvidenceReference`, `CredentialVerification`, `CredentialDisclosureGrant` | Appended to `schema.prisma` |
| `apps/web/src/app/pages/evidence-wallet.page.ts` | `/wallet` (hub card under Career tools) |

## Tests
- Jest: `apps/api/test/evidence-wallet.spec.ts` (encryption round trip/tamper, status rules, provider normalisation, masked views, minimal projection, ownership, verification consent and honesty, edit-resets-standing, evidence ownership, grants expiry/revoke).
- Playwright: `apps/web/e2e/evidence-wallet.spec.ts` (all device profiles): empty state, masked ID, validation, expired status, self-review labelling and no downgrade, edit reset, evidence by reference only, minimal revocable disclosure, delete confirmation, API error, no overflow.
- Run: `npm run api:test`; `npm run e2e -w apps/web -- e2e/evidence-wallet.spec.ts`.

## Known gaps
- No provider integrations (doc 49 P2 needs provider and legal review); `VerificationProviderConnection` and `CredentialIssuer` entities are not modelled (issuer is a free-text string).
- Disclosure is owner-side only: grants and projections exist, but recipients (resume, portfolio, recruiter share) do not consume them yet. Portfolio (41) shows profile certifications, not wallet credentials.
- The identifier cannot be revealed after saving (re-enter to change). Key rotation tooling is not built.
- No audit event table beyond verification history; no idempotency keys; recheck reminders are flags, not notifications.
- Prisma migration not generated: run `npm run db:migrate` once.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
