import { Catalog, EN } from './en';
import { HI } from './hi';
import { TA } from './ta';

export type LocaleCode = 'en' | 'ta' | 'hi';
export interface LanguageOption { code: LocaleCode; name: string; nativeName: string }

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
];
const CATALOGS: Record<LocaleCode, Catalog> = { en: EN as Catalog, ta: TA, hi: HI };
export const LOCALE_KEY = 'xcroncv.locale';
let active: LocaleCode = 'en';
export function setActiveLocale(c: LocaleCode) { active = c; }
/** Current language for code that runs outside Angular DI (plain functions such as errorMessage). */
export function activeLocale(): LocaleCode { return active; }

export function isLocale(v: unknown): v is LocaleCode { return v === 'en' || v === 'ta' || v === 'hi'; }

/** Pick the first supported language from a browser language list ("ta-IN" -> "ta"). */
export function detectLocale(langs: readonly string[]): LocaleCode {
  for (const l of langs) { const base = l.toLowerCase().split('-')[0]; if (isLocale(base)) return base; }
  return 'en';
}

/** Replace {name} placeholders. Unknown placeholders are left visible so gaps are noticed. */
export function interpolate(text: string, params?: Record<string, string | number | null>): string {
  return params ? text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k] ?? '') : m)) : text;
}

export function translate(code: LocaleCode, key: string, params?: Record<string, string | number | null>): string {
  const text = (CATALOGS[code] as Record<string, string>)[key] ?? (EN as Record<string, string>)[key] ?? key;
  return interpolate(text, params);
}

