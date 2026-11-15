import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

export const KINDS = ['CERTIFICATION', 'LICENSE', 'DEGREE', 'BADGE', 'PUBLICATION', 'OTHER'] as const;
/** EXPIRED is also derived from the expiry date at read time. ISSUER_VERIFIED can only come from a provider adapter. */
export const STATUSES = ['SELF_REPORTED', 'DOCUMENT_REVIEWED', 'ISSUER_VERIFIED', 'EXPIRED', 'REVOKED', 'UNABLE_TO_VERIFY'] as const;
export type CredentialStatus = (typeof STATUSES)[number];
export const PURPOSES = ['RESUME', 'PORTFOLIO', 'RECRUITER_SHARE'] as const;
export const DISCLOSURE_FIELDS = ['name', 'issuer', 'issuedOn', 'expiresOn', 'status', 'verificationUrl', 'credentialIdMasked'] as const;
export const PROFILE_ITEM_TYPES = ['EXPERIENCE', 'PROJECT', 'SKILL', 'EDUCATION', 'CERTIFICATION'] as const;
export const DEFAULT_RECHECK_DAYS = 365;
export const PROVIDER_RECHECK_DAYS = 180;

// ---- identifier encryption (AES-256-GCM) -------------------------------------------------
const DEV_SECRET = 'xcroncv-dev-only-credential-key';
function key(secret = process.env.CREDENTIAL_ENCRYPTION_KEY): Buffer {
  if (!secret) {
    if (process.env.NODE_ENV === 'production') throw new Error('CREDENTIAL_ENCRYPTION_KEY must be set in production');
    secret = DEV_SECRET;
  }
  return scryptSync(secret, 'xcroncv-credential-ids', 32);
}
/** Output: base64(iv[12] | tag[16] | ciphertext). */
export function encryptId(plain: string, secret?: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(secret), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
export function decryptId(payload: string, secret?: string): string {
  const raw = Buffer.from(payload, 'base64');
  const d = createDecipheriv('aes-256-gcm', key(secret), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}
export const maskedId = (last4?: string | null) => (last4 ? `••••${last4}` : null);

// ---- status rules ------------------------------------------------------------------------
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** YYYY-MM or YYYY-MM-DD -> end of that month/day (UTC) so a credential is valid through its expiry date. */
export function endOfDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2];
  if (mo < 1 || mo > 12) return null;
  const d = m[3] ? new Date(Date.UTC(y, mo - 1, +m[3], 23, 59, 59)) : new Date(Date.UTC(y, mo, 0, 23, 59, 59));
  return isNaN(d.getTime()) || (m[3] && d.getUTCDate() !== +m[3]) ? null : d;
}

export interface StatusInput { status: string; expiresOn?: string | null; recheckAfter?: Date | null }
/** Revoked always wins; otherwise a passed expiry date shows EXPIRED regardless of earlier verification. */
export function effectiveStatus(c: StatusInput, now = new Date()): string {
  if (c.status === 'REVOKED') return 'REVOKED';
  const end = c.expiresOn ? endOfDate(c.expiresOn) : null;
  if (end && end < now) return 'EXPIRED';
  return c.status;
}
export const recheckDue = (c: StatusInput, now = new Date()) =>
  !!c.recheckAfter && c.recheckAfter <= now && ['DOCUMENT_REVIEWED', 'ISSUER_VERIFIED'].includes(c.status);

// ---- provider adapters -------------------------------------------------------------------
export type ProviderOutcome = 'VALID' | 'REVOKED' | 'EXPIRED' | 'NOT_FOUND' | 'ERROR';
export interface ProviderResult { outcome: ProviderOutcome; validUntil?: Date }
export interface VerificationProvider {
  id: string;
  verify(input: { name: string; issuer: string; credentialId?: string; verificationUrl?: string }): Promise<ProviderResult>;
}
export const VERIFICATION_PROVIDERS = 'VERIFICATION_PROVIDERS';

/** Maps what a provider actually attested; never upgrades beyond it and never yields DOCUMENT_REVIEWED. */
export function normalizeProviderResult(r: ProviderResult, now = new Date()): { status: CredentialStatus; recheckAfter: Date | null } {
  switch (r.outcome) {
    case 'VALID': {
      const cap = addDays(now, PROVIDER_RECHECK_DAYS);
      return { status: 'ISSUER_VERIFIED', recheckAfter: r.validUntil && r.validUntil < cap ? r.validUntil : cap };
    }
    case 'REVOKED': return { status: 'REVOKED', recheckAfter: null };
    case 'EXPIRED': return { status: 'EXPIRED', recheckAfter: null };
    default: return { status: 'UNABLE_TO_VERIFY', recheckAfter: null };
  }
}
export const recheckFromNow = (now = new Date()) => addDays(now, DEFAULT_RECHECK_DAYS);

// ---- disclosure projection ---------------------------------------------------------------
export interface ProjectableCredential {
  name: string; issuer: string; issuedOn?: string | null; expiresOn?: string | null; credentialIdLast4?: string | null;
  verificationUrl?: string | null; status: string; statusSource: string; statusAt: Date; recheckAfter?: Date | null;
}
/**
 * Minimal scoped projection. Only granted fields are copied; the full credential identifier is never part of it, and a
 * disclosed status always carries its source and timestamp so it can be traced.
 */
export function projectCredential(c: ProjectableCredential, fields: string[], now = new Date()): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    switch (f) {
      case 'name': out['name'] = c.name; break;
      case 'issuer': out['issuer'] = c.issuer; break;
      case 'issuedOn': if (c.issuedOn) out['issuedOn'] = c.issuedOn; break;
      case 'expiresOn': if (c.expiresOn) out['expiresOn'] = c.expiresOn; break;
      case 'verificationUrl': if (c.verificationUrl) out['verificationUrl'] = c.verificationUrl; break;
      case 'credentialIdMasked': { const m = maskedId(c.credentialIdLast4); if (m) out['credentialIdMasked'] = m; break; }
      case 'status':
        out['status'] = effectiveStatus(c, now);
        out['statusSource'] = c.statusSource;
        out['statusAsOf'] = c.statusAt.toISOString();
        break;
    }
  }
  return out;
}
