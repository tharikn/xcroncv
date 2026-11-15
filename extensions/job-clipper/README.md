# XCron CV Job Clipper (extension stub)

Optional Manifest V3 extension for doc 45. It is a **stub**: it demonstrates the protocol, it is not store-ready.

## Least privilege
- Permissions: `activeTab` and `scripting` only. **No host permissions**, no `tabs`, no `history`, no background page. The page is read only after the user clicks the toolbar button, and only for that tab.
- Nothing is sent until the user edits/reviews the fields and ticks "I reviewed this". The API rejects clips without `reviewed: true` and sanitises all text server-side.
- No long-lived secret is embedded. The token lives in `chrome.storage.session` only.

## Protocol
`POST /api/v1/clipped-jobs` with `{ title, company, url?, description, source: "EXTENSION", reviewed: true, idempotencyKey, sessionId? }`. A session started on the web app (`/clips`, 30 minutes, revocable) can be passed as `sessionId`; the API refuses expired or revoked sessions.

## Not done yet
- Scoped extension token / OAuth flow (the API accepts the user's normal bearer token today).
- Tested site adapters (use manual correction instead), icons, store listing, privacy review, Firefox/Edge builds.
- Pasting a job in the web app (`/clips`) remains the first-class fallback.
