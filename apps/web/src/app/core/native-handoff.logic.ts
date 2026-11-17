/**
 * Native handoff (`xcroncv://auth/callback?code=...&nonce=...`) parsing, kept pure so it can
 * be unit-tested without Capacitor. The X Cron Jobs app opens this link when the standalone
 * CV APK is installed; the code is single-use, 60 s, and bound to this redirect URI + nonce.
 */
export const NATIVE_HANDOFF_REDIRECT = 'xcroncv://auth/callback';

export interface HandoffLink {
  code: string;
  nonce: string;
}

const NONCE = /^[A-Za-z0-9_-]{16,128}$/;

/** Returns the redeemable code/nonce, or null for anything that is not a well-formed handoff link. */
export function parseHandoffLink(raw: string | null | undefined): HandoffLink | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'xcroncv:' || url.hostname !== 'auth') return null;
  if (url.pathname.replace(/\/+$/, '') !== '/callback') return null;

  const code = url.searchParams.get('code')?.trim() ?? '';
  const nonce = url.searchParams.get('nonce')?.trim() ?? '';
  // Mirrors the API DTO (code 20-100, nonce 16-128) so a bad link fails before a network call.
  if (code.length < 20 || code.length > 100) return null;
  if (!NONCE.test(nonce)) return null;
  return { code, nonce };
}
