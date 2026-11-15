# Module 27 - Resume truth verification and evidence provenance (doc 27)

Answers "which statements in this resume can be traced to evidence I confirmed?" without calling AI, changing data, or presenting a missing link as an accusation.

## Evidence
Confirmed `CareerFact` achievements plus the user's own career profile (roles, bullets, skills, education, certifications, projects). Unconfirmed profile bullets and skills give only `partial` support and are labelled.

## Claims and support levels
`extractClaims(renderModel)` finds titles, employers, dates, bullets, skills, credentials, project text and summary sentences, each with a stable key (hash of section, item, kind, text).

Origin classes: USER_ENTERED, IMPORTED, AI_REWRITTEN, EXTERNALLY_VERIFIED (never produced here: no provider).

Support levels (`assess`, deterministic):
- **direct**: same statement, same figures, confirmed source.
- **partial**: only part is backed, a figure is not found, or the source is unconfirmed.
- **ambiguous**: several sources partly match and disagree.
- **absent**: no evidence linked. This does not mean the statement is false.
- **contradictory**: same activity but a different figure, or dates that differ from the profile role of the same employer.

A user-made link (`ProvenanceLink`) to a *confirmed* fact upgrades absent/partial to direct and is shown as "linked by you". It never overrides a contradiction.

## Rewrite guard (AI or manual rewording)
`POST /provenance/rewrites {original, proposed}` returns a word diff, a verdict (`unchanged`, `safe`, `needs-approval`) and the unsupported additions (new numbers, taxonomy skills, credentials, leadership or ownership claims, names) with reasons. `POST .../approve` requires **every** unsupported item to be acknowledged individually (400 with the missing list otherwise). The server records the approval and returns `finalText`; the client saves it. Approved and rejected proposals are final (409). The AI module can route its suggestions through this endpoint; nothing here applies text by itself.

## API
`GET /resumes/:id/provenance/compare?from=&to=` returns the evidence-level difference between two versions (see module 28). `POST /resumes/:id/provenance/check` (working draft or `versionNumber`), `GET/POST /resumes/:id/provenance/links`, `DELETE .../links/:linkId`, `POST/GET /provenance/rewrites`, `GET /provenance/rewrites/:id`, `POST .../approve|reject`. Tables: `ProvenanceLink`, `RewriteProposal` (owner and tenant filtered, plain id references).

## Web (`features/provenance`, route `/evidence-check`, Career tools hub card)
Resume picker, summary chips that filter by support level (wording, not colour alone), claim list with evidence excerpts and issues, link-a-fact control, rewrite comparer with an accessible diff (screen-reader "added:" / "removed:" labels), acknowledgement checkboxes that gate Approve, and a final text field.

## Tests
- `apps/api/test/provenance.spec.ts` (23): every support level, skills/dates/credentials, link rules, claim extraction, rewrite guard, acknowledgements, HTTP flows, isolation.
- `apps/web/e2e/provenance.spec.ts` (7 tests x 4 device profiles).

## Known gaps
- Matching is lexical (token overlap plus figures), so a paraphrase can show as partial or absent; the user can link evidence manually.
- New tables: run `npm run db:migrate`.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
