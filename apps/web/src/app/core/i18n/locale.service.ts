import { Injectable, signal } from '@angular/core';
import { safeGet, safeSet } from '../safe-storage';
import { MessageKey } from './en';
import { LANGUAGES, LOCALE_KEY, LocaleCode, detectLocale, isLocale, setActiveLocale, translate } from './translate';

export * from './translate';

@Injectable({ providedIn: 'root' })
export class LocaleService {
  readonly languages = LANGUAGES;
  readonly locale = signal<LocaleCode>('en');

  constructor() {
    const saved = safeGet('local', LOCALE_KEY);
    const nav = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language ?? 'en']) : ['en'];
    this.apply(isLocale(saved) ? saved : detectLocale(nav));
  }

  /** User choice: persisted locally; the caller syncs it to the account. */
  set(code: LocaleCode) { if (isLocale(code)) { safeSet('local', LOCALE_KEY, code); this.apply(code); } }

  /** Account preference arrived after sign-in. */
  adoptRemote(code: unknown) { if (isLocale(code) && code !== this.locale()) this.set(code); }

  t(key: MessageKey | string, params?: Record<string, string | number | null>): string { return translate(this.locale(), key, params); }

  private apply(code: LocaleCode) {
    setActiveLocale(code);
    this.locale.set(code);
    if (typeof document !== 'undefined') document.documentElement.lang = code;
  }
}
