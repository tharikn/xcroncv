export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
export const THEMES: ThemePreference[] = ['system', 'light', 'dark'];
export const THEME_KEY = 'xcroncv.theme';
export const THEME_META = { light: '#f7f5fc', dark: '#070412' };

export function isTheme(v: unknown): v is ThemePreference { return v === 'system' || v === 'light' || v === 'dark'; }
export function resolveTheme(pref: ThemePreference, systemDark: boolean): ResolvedTheme { return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref; }
