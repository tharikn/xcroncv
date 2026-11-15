# Module 05 - Local folder manager and export (docs 08, 09, 18)

## What it does
Exports (PDF/HTML) are streamed from the API, never stored server-side, and saved on the device:
- **Web (Chrome/Edge)**: File System Access API. User picks a parent folder; files go to `<folder>/XCronCV/Resumes/<Resume-Name>/<Resume-Name>-v001.pdf`.
- **Android/iOS (Capacitor)**: `Documents/XCronCV/Resumes/<Resume-Name>/...` via Capacitor Filesystem.
- **Other browsers / permission denied / no folder**: plain browser download. The UI never claims a location it cannot confirm.

## Behaviour rules
- First export (web, folder supported): dialog explains local-only storage; "Choose folder" or "Just download" (remembered).
- Success is reported only after read-back verification (`size === blob.size`); otherwise an error is shown.
- Never overwrites: `nextVersionName` picks the next free `-v###` per resume and format.
- Local Files screen (`/files`, nav "Files"): folder name + permission state, change/forget folder, list grouped by resume, open, share, rename (collision-checked, extension kept), delete (confirmed). Files in the index but missing on disk show "Missing from folder"; they are never recreated or uploaded.
- Only a folder handle (IndexedDB) and a metadata index (localStorage; names/format/size/time) are kept. No paths/bytes/text go to analytics or logs.

## Code map (apps/web/src/app)
| File | Role |
|---|---|
| `features/local-files/local-files.ts` | Pure helpers: `safeSegment`, `nextVersionName`, `validateRename`, `reconcile`, `formatBytes` |
| `features/local-files/local-folder.service.ts` | Adapters (FSA / Capacitor / download), index, save/list/rename/remove/open/share |
| `features/local-files/local-files.page.ts` | `/files` screen |
| `core/export.service.ts` | Calls API, first-run prompt, saves via the folder service |
| hooks in shared files | route `files` (app.routes), nav item (shell), icons (app.component), `firstRunPrompt` option in e2e `setup.ts` |

## Tests
- Unit: `features/local-files/local-files.spec.ts` (14 tests).
- Playwright: `e2e/local-files.spec.ts` - fake in-memory directory handle; runs on desktop, tablet, phone-web; folder tests skipped on the `android` profile (picker is a desktop feature; native adapter needs a device/emulator run).
- Run: `npm run web:test` and `npm run e2e -w apps/web -- e2e/local-files.spec.ts`.

## Known gaps
- Capacitor adapter is implemented but untested on a device/emulator.
- Android Storage Access Framework visible-folder picker (doc 18 s.4) not done; app Documents folder used instead.
- DOCX/XLSX export arrive with Module 06.

## Change log
Newest first. Every change to this module adds a row: date, change, files, tests (see [CHANGELOG](../CHANGELOG.md)).

| Date | Change | Files | Tests |
|---|---|---|---|
| 2026-11-14 | Change log section introduced (convention, see docs/CHANGELOG.md). No functional change. | - | - |
