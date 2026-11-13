# XCron CV
Independent Resume Builder platform (NestJS API + PostgreSQL), consumed by the X Cron app through a secure identity handoff.

## Run locally
```bash
docker compose up -d db
cp .env.example apps/api/.env
npm install
npm run db:migrate -- --name init      # creates the first migration
npm run api:dev                        # http://localhost:3100/api/v1, docs at /api/docs
TOKEN=$(node scripts/dev-token.mjs)
curl -H "Authorization: Bearer $TOKEN" localhost:3100/api/v1/templates
```
Smoke test:
```bash
curl -X PUT localhost:3100/api/v1/career-profile -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"fullName":"Ada Lovelace","summary":"Engineer","skills":[{"name":"TypeScript"}]}'
curl -X POST localhost:3100/api/v1/resumes -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"My Resume","templateId":"tech-compact"}'
curl -X POST localhost:3100/api/v1/resumes/<id>/export/pdf -H "Authorization: Bearer $TOKEN" -o resume.pdf
```
See `docs/LLD.md` and `CLAUDE.md`.
