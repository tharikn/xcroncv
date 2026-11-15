# Standalone CV APK: "Sign in with X Cron" (not built yet)

Status: **designed, not implemented.** A first host-side draft was written and then reverted on purpose; this file keeps the design and the draft code so it can be built later.

## Why
The standalone XCron CV APK (`com.xcron.cv`, published by `.github/workflows/android-release.yml`) has no way to sign in in production. Production auth exists only through the X Cron handoff, which today starts from X Cron (web or the Jobs app). A user who installs only the CV APK sees the token-paste screen.

## Flow
1. CV APK login screen (native only) shows **Continue with X Cron**.
2. App generates a private `nonce`, stores `{nonce, at}` in localStorage (10 min TTL), opens the system browser at
   `{hostUrl}/resume/connect?redirectUri=xcroncv%3A%2F%2Fauth%2Fcallback&nonce=<nonce>`.
3. X Cron web page `/resume/connect`: signed-out users go to `/sign-in?returnUrl=<this url>` and come back; signed-in users call `POST /v1/handoff/resume {redirectUri, nonce}` and navigate to `xcroncv://auth/callback?code=<code>`.
4. Android opens the CV app (intent filter below). App reads `code`, loads the pending nonce, deletes it (single use), closes the browser, and calls the CV API `POST /auth/exchange {code, nonce, redirectUri: 'xcroncv://auth/callback'}`.
5. CV API exchanges with the host server-to-server (existing), returns the 15 min RS256 JWT; app signs in and opens `/dashboard`.

### Security decision
The **nonce is not echoed in the deep link.** Any app can register `xcroncv://`, so a code alone must be useless: redeeming needs the nonce, which only the real app and the browser page ever saw. Existing web/Jobs flows keep echoing the nonce (their redirect is https). Later hardening: Android App Links on a verified https URL instead of a custom scheme.

## Work items

### X Cron (`D:\Projects\x-cron`)
- `api/src/handoff/handoff.service.ts`: always allow the native redirect regardless of `HANDOFF_REDIRECT_URIS` (Render env is not touched).
  ```ts
  export const NATIVE_CV_REDIRECT = 'xcroncv://auth/callback';
  private get allowedRedirects(): string[] {
    const configured = (process.env.HANDOFF_REDIRECT_URIS ?? 'http://localhost:4300/auth/callback')
      .split(',').map((s) => s.trim()).filter(Boolean);
    return [...configured, NATIVE_CV_REDIRECT];
  }
  ```
  Test in `handoff.service.spec.ts`: createCode + exchange with `NATIVE_CV_REDIRECT` succeeds when `HANDOFF_REDIRECT_URIS` is something else. (Draft passed 4/4 tests.)
- `web/src/app/pages/resume-connect/resume-connect.page.ts` + route `resume/connect` in `app.routes.ts` (before `sign-in`). Component: browser-only `ngOnInit`; accept only `redirectUri === NATIVE_CV_REDIRECT` and a 16 to 128 char nonce; `await auth.ensureSession()`; if not signed in `router.navigate(['/sign-in'], {queryParams: {returnUrl: router.url}})` (sign-in already honors `returnUrl` paths); else POST `${environment.apiUrl}/handoff/resume` with `withCredentials: true, headers: auth.authHeaders()` and `window.location.assign(`${redirectUri}?code=${encodeURIComponent(code)}`)`. Error state with retry button.
- `api/src/i18n/seed-i18n.ts`: keys `resumeConnect.working`, `resumeConnect.failed`, `resumeConnect.retry` in en, ta, hi.

### XCron CV (`D:\Projects\xcroncv`)
- Dependency: `@capacitor/browser@^6` in `apps/web` (Capacitor 6 line).
- `apps/android/app/src/main/AndroidManifest.xml`: add to `MainActivity` (already `singleTask`)
  ```xml
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="xcroncv" android:host="auth" android:pathPrefix="/callback" />
  </intent-filter>
  ```
- `core/native-sign-in.logic.ts` (pure, unit-testable): `NATIVE_REDIRECT`, `newNonce()` (32 hex), `connectUrl(hostUrl, nonce)`, `codeFromCallback(url)` (null unless the URL starts with the redirect and `code` is 20 to 100 chars), `readPending(raw, now)` (TTL check).
- `core/handoff.service.ts`: `exchange(code, nonce, redirectUri)` extracted from `AuthCallbackPage` (POST `${apiBase}/auth/exchange`, `signInWithToken`); `AuthCallbackPage` then reuses it.
- `core/native-sign-in.service.ts`: `available` = `Capacitor.isNativePlatform()`, `start()` (store pending, `Browser.open`), `listen()` (`App.addListener('appUrlOpen')` + `App.getLaunchUrl()` for cold start), `handleUrl()` (delete pending first, `Browser.close()`, exchange, navigate `/dashboard`, `failed` signal on error). Call `listen()` from `AppComponent.ngOnInit`.
- `pages/login.page.ts`: card with button `data-testid="xcron-signin"` shown only when `native.available`; error `data-testid="xcron-signin-error"`.
- i18n (en, ta, hi must stay in parity, a Jest test enforces it): `login.xcronTitle`, `login.xcronLead`, `login.xcronCta`, `login.xcronFailed`.
- Tests: Jest for `native-sign-in.logic` (wrong scheme, short code, expired pending, nonce shape); Playwright cannot run the APK, so manual device check below.
- Docs: change-log row in `docs/modules/12-web-shell-auth-and-layout.md`, line in `docs/CHANGELOG.md`, replace the "Open item" in `docs/INTEGRATION.md`.

## Manual verification (device)
Install both APKs, open CV, tap Continue with X Cron, sign in on X Cron, confirm return to CV on `/dashboard`. Also check: cancel in the browser (nothing breaks), reuse of an old link (rejected), open the deep link by hand without a pending nonce (rejected).

## Related, already done
- Standalone APK build and release workflow, portal download button, in-app WebView launch from X Cron Jobs: see [INTEGRATION.md](INTEGRATION.md) and the common-app-features change log.
