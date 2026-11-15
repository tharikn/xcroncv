import { randomBytes, scrypt, ScryptOptions, timingSafeEqual } from 'crypto';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60_000;

const KEYLEN = 32;
const OPTS: ScryptOptions = { N: 16384, r: 8, p: 1 };
const derive = (pw: string, salt: Buffer) => new Promise<Buffer>((res, rej) => scrypt(pw.normalize('NFKC'), salt, KEYLEN, OPTS, (e, k) => (e ? rej(e) : res(k))));

/** Salted scrypt. Stored as `s1$<salt>$<hash>` (base64url); the clear password is never stored or logged. */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `s1$${salt.toString('base64url')}$${(await derive(pw, salt)).toString('base64url')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [v, s, h] = stored.split('$');
  if (v !== 's1' || !s || !h) return false;
  const want = Buffer.from(h, 'base64url');
  const got = await derive(pw, Buffer.from(s, 'base64url'));
  return want.length === got.length && timingSafeEqual(want, got);
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (pw.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  return null;
}
