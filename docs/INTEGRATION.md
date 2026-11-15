# Host integration: X Cron -> XCron CV

XCron CV runs on its own origin (for example `https://resume.xcron.in`). X Cron (web, mobile web and the Android app) opens it through a one-time-code handoff. No token is ever placed in a URL. Design source: x-cron `docs/resume-builder/39` section 6.

## Flow
1. The signed-in X Cron client calls `POST {HOST}/v1/handoff/resume` with `{ redirectUri, nonce }` and receives `{ code }` (60 s, single use, bound to user, redirect URI and nonce).
2. The client opens `{CV_ORIGIN}/auth/callback?code=...&nonce=...` (full navigation on web, in-app browser on Android).
3. The CV web app removes the code from the URL and calls `POST /api/v1/auth/exchange` with `{ code, nonce, redirectUri }`.
4. The CV API calls `POST {HOST}/v1/handoff/exchange` with header `x-handoff-secret`. The host returns an RS256 JWT (15 min, `aud=xcroncv`, `scope=resume`, `tenant_id=xcron`).
5. The CV web app keeps the token for the session and opens `/dashboard`. The CV API verifies it against `{HOST}/.well-known/jwks.json`.

## Configuration
| Side | Variable | Value |
|---|---|---|
| Host (x-cron api) | `HANDOFF_PRIVATE_KEY_PEM` | RSA private key (required in production) |
| Host | `HANDOFF_ISSUER`, `HANDOFF_AUDIENCE`, `HANDOFF_KEY_ID` | issuer URL, `xcroncv`, key id |
| Host | `HANDOFF_REDIRECT_URIS` | comma list, exactly `{CV_ORIGIN}/auth/callback` |
| Host | `HANDOFF_EXCHANGE_SECRET` | shared secret |
| CV api | `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URL` | match the host values |
| CV api | `HOST_HANDOFF_URL`, `HOST_HANDOFF_SECRET` | host API base, same shared secret |
| CV api | `CORS_ORIGINS` | include the CV origin |

## Limits
Codes are held in host memory, so the host must run one API instance until they move to Redis.
