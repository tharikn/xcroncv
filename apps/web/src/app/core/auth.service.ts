import { Injectable, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { decodeClaims, isExpired, signDevToken, tokenFromFragment } from './jwt';
import { safeGet, safeRemove, safeSet } from './safe-storage';

const KEY = 'xcroncv.token';

/** Token lives in sessionStorage (cleared with the tab). Verification happens only on the API. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private _token = signal<string | null>(null);
  readonly token = this._token.asReadonly();
  readonly claims = computed(() => (this._token() ? decodeClaims(this._token()!) : null));
  readonly isAuthenticated = computed(() => !!this._token() && !isExpired(this.claims()));
  readonly subject = computed(() => this.claims()?.sub ?? '');
  /** True after the session ended on its own (token expiry or a 401), so the login page can explain why. */
  readonly sessionExpired = signal(false);
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private router: Router) {
    const frag = typeof location !== 'undefined' ? tokenFromFragment(location.hash) : null;
    if (frag) {
      this.setToken(frag);
      history.replaceState(null, '', location.pathname + location.search);
    } else {
      const saved = safeGet('session', KEY);
      if (saved && !isExpired(decodeClaims(saved))) this._token.set(saved);
    }
    this.armExpiry();
  }

  setToken(token: string) { this._token.set(token); safeSet('session', KEY, token); this.sessionExpired.set(false); this.armExpiry(); }

  /** Sign the user out the moment the token expires, instead of on the next failing request. */
  private armExpiry() {
    if (this.expiryTimer) { clearTimeout(this.expiryTimer); this.expiryTimer = null; }
    const exp = this.claims()?.exp;
    if (!exp || !this._token()) return;
    const ms = exp * 1000 - Date.now() - 15_000;
    if (ms > 2_147_000_000) return; // beyond setTimeout range; the guard re-checks on navigation
    this.expiryTimer = setTimeout(() => this.signOut(true, true), Math.max(ms, 0));
  }

  signInWithToken(raw: string): boolean {
    const token = raw.trim();
    const claims = decodeClaims(token);
    if (!claims || isExpired(claims)) return false;
    this.setToken(token);
    return true;
  }

  async devSignIn(secret: string, sub: string, tenant: string): Promise<void> {
    if (!environment.devAuth) throw new Error('Dev sign-in is disabled in this build');
    this.setToken(await signDevToken({
      secret, sub, tenant, iss: environment.devAuthIssuer, aud: environment.devAuthAudience,
    }));
  }

  signOut(redirect = true, expired = false) {
    if (this.expiryTimer) { clearTimeout(this.expiryTimer); this.expiryTimer = null; }
    if (expired && this._token()) this.sessionExpired.set(true);
    this._token.set(null);
    safeRemove('session', KEY);
    if (redirect) void this.router.navigateByUrl('/login');
  }
}
