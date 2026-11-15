export function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecodeToString(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const bin = atob(input.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return decodeURIComponent(bin.split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
}

export interface TokenClaims { sub?: string; exp?: number; tenant_id?: string; iss?: string; aud?: string | string[] }

/** Decode WITHOUT verifying - for UI display/expiry only. The API is the only verifier. */
export function decodeClaims(token: string): TokenClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(b64urlDecodeToString(parts[1]));
  } catch {
    return null;
  }
}

export function isExpired(claims: TokenClaims | null, nowMs = Date.now(), skewSec = 15): boolean {
  if (!claims?.exp) return true;
  return claims.exp * 1000 <= nowMs + skewSec * 1000;
}

/** Dev-only HS256 signer (mirrors scripts/dev-token.mjs). Used only when environment.devAuth is true. */
export async function signDevToken(opts: {
  secret: string; sub: string; tenant: string; iss: string; aud: string; ttlSec?: number;
}): Promise<string> {
  const enc = new TextEncoder();
  const header = b64urlEncode(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlEncode(enc.encode(JSON.stringify({
    sub: opts.sub, tenant_id: opts.tenant, iss: opts.iss, aud: opts.aud, iat: now, exp: now + (opts.ttlSec ?? 8 * 3600),
  })));
  const key = await crypto.subtle.importKey('raw', enc.encode(opts.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${b64urlEncode(sig)}`;
}

/** Single-use handoff: read #access_token=... from the URL fragment. Caller must strip the fragment. */
export function tokenFromFragment(hash: string): string | null {
  const m = /(?:^#|&)access_token=([^&]+)/.exec(hash);
  return m ? decodeURIComponent(m[1]) : null;
}
