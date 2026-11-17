import { Injectable, signal } from '@angular/core';
import { safeGet, safeSet } from './safe-storage';
import { THEME_KEY as KEY, THEME_META as META, ThemePreference, ResolvedTheme, isTheme, resolveTheme } from './theme';

export * from './theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePreference>('light');
  readonly resolved = signal<ResolvedTheme>('light');
  private mq: MediaQueryList | null = null;

  /** Call once at startup: applies the stored choice (light by default) and follows the OS while on "system". */
  init() {
    const saved = safeGet('local', KEY);
    if (isTheme(saved)) this.preference.set(saved);
    try {
      this.mq = window.matchMedia('(prefers-color-scheme: dark)');
      this.mq.addEventListener('change', () => { if (this.preference() === 'system') this.apply(); });
    } catch { /* no matchMedia */ }
    this.apply();
  }

  set(pref: ThemePreference) { if (isTheme(pref)) { safeSet('local', KEY, pref); this.preference.set(pref); this.apply(); } }
  adoptRemote(pref: unknown) { if (isTheme(pref) && pref !== this.preference()) this.set(pref); }

  private apply() {
    const r = resolveTheme(this.preference(), !!this.mq?.matches);
    this.resolved.set(r);
    const root = document.documentElement;
    root.dataset['theme'] = r;
    root.style.colorScheme = r;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[r]);
  }
}
