# Module 44 - Career path and compensation intelligence

## What it does
Explainable next-role options computed **on demand** from the user's confirmed career profile against a versioned, deterministic role taxonomy (10 role families), plus saved development plans with editable milestones, plus a compensation endpoint that refuses to show numbers without a licensed, attributed source. No AI, no market data and no score is involved.

## Rules
- **Evidence, not gaps** (`analysis.ts`): each typical requirement is `RECORDED_SKILL` (confirmed skills list), `RECORDED_IN_EXPERIENCE` (confirmed bullet/description/project text) or `NO_RECORDED_EVIDENCE`. The UI and notes state that the last one means nothing is recorded, not that the skill is absent. Unconfirmed skills and bullets are ignored. Matching is whole-token (`go` does not match `google`).
- **Explainable:** every option carries `why[]`, coverage as counts (`n of m requirements have recorded evidence`), and per-requirement evidence references (skill/experience/project ids and labels). No probability, no employability label, no protected-trait input.
- **Explore vs target:** explore lists up to five roles, natural next steps (taxonomy adjacency from the latest job title) first; a target returns that role first then its neighbours.
- **Plans:** `CareerPlan` stores the role id, taxonomy version and a `basis` snapshot; `CareerMilestone` rows are user-editable (status NOT_STARTED/IN_PROGRESS/DONE, `YYYY-MM-DD` date). Starter milestones read "Record or build evidence for: X". Limits: 20 plans, 30 milestones per plan. Analysing saves nothing.
- **Compensation:** `COMPENSATION_PROVIDERS` is empty (doc 44 P2 needs licensing review), so `GET /compensation-insights` returns `available:false` with an explanation. `normalizeObservations` drops any observation lacking source, geography, ISO currency, a past date, licensed-use flag, or with implausible numbers. Only role and country/region text (max 80 chars) would ever go to a provider; provider failure degrades to "unavailable".
- Tenant AND owner filter on all plan reads/writes; foreign ids and milestones 404. Disable with `FEATURES_DISABLED=career-path`.

## API (`/api/v1`)
`GET /career-paths/roles`, `POST /career-paths/analyze`, `GET/POST /career-paths`, `GET/PATCH/DELETE /career-paths/:id`, `POST /career-paths/:id/milestones`, `PATCH/DELETE /career-paths/:id/milestones/:milestoneId`, `GET /compensation-insights?role=&location=&currency=`.

## Code map
| File | Role |
|---|---|
| `apps/api/src/career-path/role-taxonomy.ts` | Versioned roles, requirements, adjacency |
| `analysis.ts` | Pure evidence assessment, options, milestone suggestions |
| `compensation.ts` | Provider interface and attribution rules |
| `career-path.service.ts`, `.controller.ts`, `dto/`, `.module.ts` | Plans, ownership, routes |
| Prisma: `CareerPlan`, `CareerMilestone` | appended to `schema.prisma` |
| `apps/web/src/app/pages/career-path.page.ts`, `core/career-path.api.ts` | `/career-path` (hub card) |

## Tests
- Jest `apps/api/test/career-path.spec.ts` (taxonomy integrity, token matching, evidence statuses, unconfirmed data ignored, options and wording, empty profile, milestones, observation attribution, ownership, plan limits, no-source compensation, provider failure).
- Playwright `apps/web/e2e/career-path.spec.ts` (all device profiles): options with counts and caution wording, target role, no-profile state, plan and milestone editing, delete confirmation, compensation with and without a source, error banner and overflow.

## Known gaps
- Taxonomy is small and generic (10 roles); no seniority levels, no user-stated goals beyond the target role, no learning-resource catalogue.
- Compensation observations are never persisted (no `CompensationObservation` table) and no provider exists.
- No JD-intelligence (29) or skill-gap (34) integration; no audit events or webhooks for plan changes.
- Prisma migration not generated: run `npm run db:migrate` once.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
