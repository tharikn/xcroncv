# XCron CV — AI Coding Instructions (AGENTS.md)

> This file is the canonical reference for AI coding assistants (Claude, Gemini, Copilot, Cursor, etc.) working on the XCron CV codebase. Read this file, `PROJECT_CONTEXT.md`, and `IMPLEMENTATION_PLAN.md` before writing or modifying code.

---

## 1. Project Overview & Core Mission

**XCron CV** is an independent, authenticated resume-builder, career portfolio, and career-tools platform. It operates as a distinct microservice ecosystem separate from X Cron's codebase:
- It maintains its own repository, database schema (`xcroncv`), REST API, web SPA, and mobile shells.
- Authentication relies on a cryptographically signed JWT exchange (`POST /auth/exchange`) received from the host or direct auth.
- **Cloud-Based Multi-Device Persistence**: Designed resumes, visual styling configurations, section orderings, overrides, and career profile updates are continuously saved and synchronized to the cloud database. Any user logging in from any desktop, mobile browser, or Capacitor device immediately fetches their saved drafts, profiles, and resume designs right where they left off.

| Layer | Technology |
|---|---|
| Frontend | Angular 17+ (standalone components, signals), Ionic 8 components |
| Mobile | Capacitor 6 wrapping the same Angular build (`apps/android`) |
| Backend | NestJS (modular architecture), Prisma ORM |
| Database | PostgreSQL — dedicated schema `xcroncv` (never `public`, never `xcron`) |
| Monorepo | npm workspaces: `apps/web`, `apps/api`, `apps/android`, `packages/sdk` |

---

## 2. Non-Negotiable Architecture Rules

> [!IMPORTANT]
> These rules are binding. Any code change violating them will be rejected.

### 2.1 Authentication & Authorization
- **Deny-by-default**: Every route requires authentication via `AuthGuard`.
- The only permitted public routes are:
  - `GET /health`
  - `POST /auth/exchange` (host JWT handoff, throttled)
  - `GET /public/portfolios/:token` (read-only public portfolio share)
  - `GET /public/resumes/:token` (read-only public resume share, user-approved via the Share action)
- Never create new `@Public()` routes without documented approval.
- `userId` and `tenantId` are extracted strictly from the validated JWT (`@CurrentUser()`). Never read them from request bodies, headers, or query params.
- Every database query must filter by **both** `tenantId` AND the resource owner (`userId`/`profileId`).

### 2.2 Cloud Persistence & Autosave Mechanics
- **Cloud State Synchronization**: User profiles and resume documents/overrides are stored in PostgreSQL (`xcroncv.CareerProfile`, `xcroncv.Resume`).
- **Autosave & Concurrency Control**:
  - The Visual Editor (`VisualEditorComponent`) debounce-autosaves changes (`saveDraft`) after ~1200ms of user inactivity or on blur/flush.
  - Draft saves enforce optimistic concurrency checks against `updatedAt`. If another device saved newer changes, the server returns a `409 Conflict`, preserving local edits and prompting the user to resolve or reload.
  - Resume versions (`ResumeVersion`) store immutable snapshots on demand.
- **Resume and Profile Fetching Across Devices**:
  - Any client device rehydrates state directly from the REST API (`GET /resumes/:id`, `GET /career-profile`).
  - No critical resume design state is left trapped in local device storage; local storage serves only as an offline cache/recovery mechanism.

### 2.3 Ephemeral File Streams (No Server-Side File Persistence)
- Generated export files (PDF, DOCX, XLSX, HTML) are **never written to disk or stored as BLOBs in the database**.
- Uploaded candidate documents (PDF/DOCX for resume import or JD parsing) are parsed **in-memory only**; memory buffers are zeroed out (`buf.fill(0)`) immediately after extraction.
- Data flows: Client &rarr; API &rarr; In-memory renderer &rarr; HTTP Response stream with `Cache-Control: no-store`.

### 2.4 AI is Optional, Suggestion-Only, and Score-Independent
- AI features require explicit opt-in (`POST /ai/settings` with `enabled: true`).
- AI **never** computes or modifies numeric scores (ATS scores, match percentages, quality metrics).
- AI outputs are pending suggestions; user action is required to commit changes to their profile or resume.
- All AI features must gracefully fall back to deterministic algorithms when AI is disabled, unconfigured, or offline.

### 2.5 Declarative, Immutable Template Catalog
- Templates are declared in `apps/api/src/templates/template.catalog.ts` (3 seed templates) and generated in `template.families.ts` + `template.expansion.ts` (311 generated families).
- **Never mutate an existing template record**. To change a template, increment its version and append a new entry.
- Colors and spacing are token-driven; never hardcode hex values in template definitions.

---

## 3. Code Conventions & Standards

### 3.1 Internationalization (i18n)
- **Zero hardcoded user-facing strings** in component templates, dialogs, toasts, or error displays.
- Use the `| t` pipe with keys defined in `apps/web/src/app/core/i18n/en.ts`.
- When adding any key to `en.ts`, immediately add the identical key to `ta.ts` and `hi.ts` (enforced by automated unit tests).

### 3.2 Design Tokens & Themes
- Use CSS custom properties defined in `apps/web/src/styles.scss`.
- Primary palette: Violet (`--c-primary: #6d4ff0`), Amber (`--c-accent: #f5a524`), and Surface Card tokens.
- Support dark mode natively via `[data-theme="dark"]`.

### 3.3 Angular & Ionic Patterns
- **Standalone components only** (`standalone: true`). No `NgModule`.
- State management via Angular **signals** (`signal()`, `computed()`, `effect()`).
- Dependency injection via `inject()`.
- Control flow syntax: `@if`, `@for`, `@switch`.
- Touch-friendly Ionic components (`ion-item`, `ion-button`, `ion-icon`) with minimum 44px tap targets.
- Lazy-load routes via `loadComponent: () => import(...)`.

### 3.4 Backend NestJS & Prisma Patterns
- Modular services with constructor injection.
- Request validation with `class-validator` and typed DTOs.
- Isolate queries to schema `xcroncv` using the shared `PrismaService`.
- Use relative imports within API packages.

---

## 4. Key Workflows & Cloud Sync Checklist

When adding or modifying resume design features, ensure the following cloud-sync loop is maintained:
1. **Model & Overrides**: Extend `Resume.overrides` or `Resume.sections` in `models.ts` and ensure schema compatibility.
2. **Autosave Trigger**: Visual changes must notify the editor state (`markDirty()`) and execute debounced `saveDraft()`.
3. **Save Indicator**: Reflect live state (`saved`, `saving`, `dirty`, `conflict`, `error`) in the UI.
4. **Cross-Device Fetch**: Verify that navigating to `/resumes/:id` on a fresh session accurately renders all custom colors, typography, block orders, and custom content.
