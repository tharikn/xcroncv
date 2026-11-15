import { activeLocale, translate } from './i18n/translate';

/** Duck-typed HttpErrorResponse (keeps this file free of Angular imports so Jest can load it). */
function isHttpError(e: unknown): e is { status: number; error?: { message?: string | string[] } | null } {
  return typeof e === 'object' && e !== null && typeof (e as { status?: unknown }).status === 'number' && 'error' in e;
}

/** Map an error to user-facing text in the active language. A server-provided message is kept (validation text), except where a generic status has better copy. */
export function errorMessage(e: unknown): string {
  const t = (k: string) => translate(activeLocale(), k);
  if (isHttpError(e)) {
    if (e.status === 0) return t('err.network');
    if (e.status === 401) return t('err.unauthorized');
    if (e.status === 403) return t('err.forbidden');
    if (e.status === 429) return t('err.rateLimited');
    const m = (e.error && (e.error as { message?: string | string[] }).message) ?? '';
    const text = Array.isArray(m) ? m.join('; ') : String(m);
    if (text.trim()) return text;
    return e.status >= 500 ? t('err.server') : t('err.generic');
  }
  return e instanceof Error && e.message ? e.message : t('err.generic');
}
