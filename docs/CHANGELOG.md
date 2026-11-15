# Change log index

Every module doc in `docs/modules` ends with a **Change log** table (date, change, files, tests). This file is the index and the rule.

## Rule
Every change to code, schema, config or behavior must, in the same change:
1. Add a row to the **Change log** of the module doc that owns the code (create the module doc if none does).
2. Name the files touched and the tests that cover the change (Jest and/or Playwright).
3. If it changes architecture, update `HLD.md` / `LLD.md`; if it changes how to run or test, update `TESTING.md`.
4. Add a line below under the date when the change spans modules.

Row format: `| YYYY-MM-DD | what changed and why (one or two sentences) | files | tests |`. Newest first. Never edit past rows; add a new one.

## Recent cross-module changes
- 2026-11-15: first-time guided onboarding tour (shared/tour), Replay tour in Settings, data-tour hooks (nav-*, editor-canvas), e2e signIn marks tour seen - owner [12-web-shell-auth-and-layout](modules/12-web-shell-auth-and-layout.md).
- 2026-11-15: first-time guided onboarding tour (shared/tour), Replay tour in Settings, data-tour hooks (nav-*, editor-canvas), e2e signIn marks tour seen - owner [12-web-shell-auth-and-layout](modules/12-web-shell-auth-and-layout.md).
- 2026-11-14: template catalogue grown 60 -> 100 with new heading/name-size/right-align design tokens - owner [16-17-19-dashboard-preview-templates](modules/16-17-19-dashboard-preview-templates.md).
- 2026-11-14: common app features (theme, language en/ta/hi, loading bar, offline banner, friendly errors, session expiry, Android back, boot splash, About, account preferences) - owner [12-web-shell-auth-and-layout](modules/12-web-shell-auth-and-layout.md), audit in [common-app-features](modules/common-app-features.md). Also: change-log convention added to all module docs.

## Module docs (latest entry date; "-" = convention row only)
| Module | Latest functional entry |
|---|---|
| [04-career-profile-and-resumes](modules/04-career-profile-and-resumes.md) | - |
| [05-local-folder-export](modules/05-local-folder-export.md) | - |
| [06-38-ai-gateway](modules/06-38-ai-gateway.md) | - |
| [06-import-and-office-export](modules/06-import-and-office-export.md) | - |
| [07-ats-engine](modules/07-ats-engine.md) | - |
| [07-parsing-test](modules/07-parsing-test.md) | - |
| [12-web-shell-auth-and-layout](modules/12-web-shell-auth-and-layout.md) | 2026-11-14 |
| [16-17-19-dashboard-preview-templates](modules/16-17-19-dashboard-preview-templates.md) | 2026-11-14 |
| [16-admin-usage-analytics](modules/16-admin-usage-analytics.md) | - |
| [20-31-quality-review](modules/20-31-quality-review.md) | - |
| [22-recruiter-view](modules/22-recruiter-view.md) | - |
| [23-29-resume-match](modules/23-29-resume-match.md) | - |
| [26-career-facts](modules/26-career-facts.md) | - |
| [27-provenance](modules/27-provenance.md) | - |
| [28-resume-versions](modules/28-resume-versions.md) | - |
| [32-job-portal-integration](modules/32-job-portal-integration.md) | - |
| [33-application-resume-vault](modules/33-application-resume-vault.md) | - |
| [34-career-readiness](modules/34-career-readiness.md) | - |
| [35-interview-preparation](modules/35-interview-preparation.md) | - |
| [36-feedback-sharing](modules/36-feedback-sharing.md) | - |
| [37-webhooks-and-sdk](modules/37-webhooks-and-sdk.md) | - |
| [41-career-portfolio](modules/41-career-portfolio.md) | - |
| [42-cover-letters](modules/42-cover-letters.md) | - |
| [43-career-imports](modules/43-career-imports.md) | - |
| [44-career-path](modules/44-career-path.md) | - |
| [45-job-clipper](modules/45-job-clipper.md) | - |
| [46-contacts-crm](modules/46-contacts-crm.md) | - |
| [47-application-autofill](modules/47-application-autofill.md) | - |
| [48-job-search-analytics](modules/48-job-search-analytics.md) | - |
| [49-evidence-wallet](modules/49-evidence-wallet.md) | - |
| [50-expert-review](modules/50-expert-review.md) | - |
| [51-interview-copilot](modules/51-interview-copilot.md) | - |
| [52-career-documents](modules/52-career-documents.md) | - |
| [common-app-features](modules/common-app-features.md) | 2026-11-14 |
