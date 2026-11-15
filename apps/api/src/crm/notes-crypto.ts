import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const DEV_SECRET = 'xcroncv-dev-only-notes-key';

function key(secret = process.env.NOTES_ENCRYPTION_KEY): Buffer {
  if (!secret) {
    if (process.env.NODE_ENV === 'production') throw new Error('NOTES_ENCRYPTION_KEY must be set in production');
    secret = DEV_SECRET;
  }
  return scryptSync(secret, 'xcroncv-contact-notes', 32);
}

/** AES-256-GCM. Output: base64(iv[12] | tag[16] | ciphertext). Contact notes are personal data. */
export function encryptNote(plain: string, secret?: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(secret), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}

export function decryptNote(payload: string, secret?: string): string {
  const raw = Buffer.from(payload, 'base64');
  const d = createDecipheriv('aes-256-gcm', key(secret), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}
