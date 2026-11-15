import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { LocaleService } from './i18n/locale.service';
import { SettingsService } from './settings.service';
import { ThemeService } from './theme.service';

interface RemotePrefs { theme?: string; locale?: string }

/**
 * Account-level UI preferences (GET/PUT /me/preferences). Local storage is the source for first paint;
 * the account value wins after sign-in. Failures are silent: preferences must never block the app.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  constructor(private http: HttpClient, private settings: SettingsService, private auth: AuthService,
              private theme: ThemeService, private locale: LocaleService) {}

  private url() { return `${this.settings.apiBase}/me/preferences`; }

  /** Pull the account preference once signed in. */
  async hydrate(): Promise<void> {
    if (!this.auth.isAuthenticated()) return;
    try {
      const p = await firstValueFrom(this.http.get<RemotePrefs>(this.url()));
      this.theme.adoptRemote(p.theme);
      this.locale.adoptRemote(p.locale);
    } catch { /* offline or old API: keep local values */ }
  }

  /** Persist a change to the account (fire and forget). */
  async push(change: RemotePrefs): Promise<void> {
    if (!this.auth.isAuthenticated()) return;
    try { await firstValueFrom(this.http.put(this.url(), change)); } catch { /* keep local value */ }
  }

  setTheme(pref: Parameters<ThemeService['set']>[0]) { this.theme.set(pref); return this.push({ theme: pref }); }
  setLocale(code: Parameters<LocaleService['set']>[0]) { this.locale.set(code); return this.push({ locale: code }); }
}
