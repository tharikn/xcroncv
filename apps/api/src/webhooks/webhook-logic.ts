import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { lookup as dnsLookup } from 'dns';
import { isIP } from 'net';
import https from 'https';

/** Minimal, versioned event catalog (doc 37). Payloads carry ids and timestamps only, never resume content. */
export const EVENT_TYPES = ['test.ping', 'resume.created', 'resume.updated', 'resume.exported', 'import.completed'] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const API_VERSION = '1';
export const MAX_ENDPOINTS = 5;
export const MAX_ATTEMPTS = 5;
export const BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000];
export const SIGNATURE_TOLERANCE_SEC = 300;

// ---- secrets ---------------------------------------------------------------------------------
const DEV_SECRET = 'xcroncv-dev-only-webhook-key';
function key(secret = process.env.WEBHOOK_ENCRYPTION_KEY): Buffer {
  if (!secret) {
    if (process.env.NODE_ENV === 'production') throw new Error('WEBHOOK_ENCRYPTION_KEY must be set in production');
    secret = DEV_SECRET;
  }
  return scryptSync(secret, 'xcroncv-webhook-secrets', 32);
}
/** AES-256-GCM. Output: base64(iv[12] | tag[16] | ciphertext). The signing secret must be recoverable to sign deliveries. */
export function encryptSecret(plain: string, secret?: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(secret), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
export function decryptSecret(payload: string, secret?: string): string {
  const raw = Buffer.from(payload, 'base64');
  const d = createDecipheriv('aes-256-gcm', key(secret), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}
export const newSecret = () => `whsec_${randomBytes(32).toString('base64url')}`;

// ---- signing and replay protection -----------------------------------------------------------
export function sign(secret: string, timestampSec: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestampSec}.${body}`).digest('hex');
}
export const signatureHeader = (secret: string, timestampSec: number, body: string) => `t=${timestampSec},v1=${sign(secret, timestampSec, body)}`;

/** Receiver-side check (mirrored in the SDK): constant-time compare and a freshness window against replay. */
export function verifySignature(secret: string, header: string, body: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = SIGNATURE_TOLERANCE_SEC): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=') as [string, string]));
  const t = Number(parts['t']);
  const v1 = parts['v1'];
  if (!Number.isFinite(t) || !v1 || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = Buffer.from(sign(secret, t, body), 'hex');
  const got = Buffer.from(v1, 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

// ---- SSRF-safe targets -----------------------------------------------------------------------
const ALLOWED_PORTS = new Set(['', '443', '8443']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.lan', '.home', '.corp', '.intranet'];

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (/^::ffff:[0-9a-f]+:[0-9a-f]+$/.test(x)) return true; // hex-form mapped addresses: refuse rather than parse
    return x === '::' || x === '::1' || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith('64:ff9b:') || x.startsWith('2001:db8') || x.startsWith('ff');
  }
  return true; // not an IP: callers only pass literals or resolved addresses; unknown is unsafe
}

/** Static checks on a target URL. DNS is re-checked at delivery time by `safeLookup`. Returns an error message or null. */
export function targetUrlProblem(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return 'Enter a valid URL.'; }
  if (u.protocol !== 'https:') return 'Webhook targets must use https.';
  if (u.username || u.password) return 'The URL must not contain credentials.';
  if (!ALLOWED_PORTS.has(u.port)) return 'Only ports 443 and 8443 are allowed.';
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return 'Enter a valid URL.';
  if (host === 'localhost' || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return 'Local and internal hostnames are not allowed.';
  if (isIP(host)) return isPrivateAddress(host) ? 'Private, loopback and link-local addresses are not allowed.' : null;
  if (!host.includes('.')) return 'Use a fully qualified public hostname.';
  if (raw.length > 500) return 'The URL is too long.';
  return null;
}

/** DNS lookup that refuses private results, closing the rebinding gap between validation and delivery. */
export function safeLookup(hostname: string, options: unknown, cb: (err: Error | null, address?: unknown, family?: number) => void) {
  const opts = (typeof options === 'object' && options ? options : {}) as { all?: boolean };
  dnsLookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) return cb(new Error('Target resolves to a private address'));
    if (opts.all) return cb(null, addrs);
    return cb(null, addrs[0].address, addrs[0].family);
  });
}

// ---- delivery transport ----------------------------------------------------------------------
export interface SendRequest { url: string; headers: Record<string, string>; body: string; timeoutMs: number }
export interface SendResult { status: number }
export interface WebhookSender { send(r: SendRequest): Promise<SendResult> }
export const WEBHOOK_SENDER = Symbol('WEBHOOK_SENDER');

/** Real transport: https only, guarded DNS, no redirects, bounded time, response body discarded. */
export class HttpsSender implements WebhookSender {
  send(r: SendRequest): Promise<SendResult> {
    return new Promise((resolve, reject) => {
      const u = new URL(r.url);
      const problem = targetUrlProblem(r.url);
      if (problem) return reject(new Error(problem));
      const req = https.request({
        method: 'POST', hostname: u.hostname, port: u.port || 443, path: `${u.pathname}${u.search}`, headers: { ...r.headers, 'content-length': Buffer.byteLength(r.body) },
        lookup: safeLookup as never, timeout: r.timeoutMs,
      }, (res) => { res.resume(); res.on('end', () => resolve({ status: res.statusCode ?? 0 })); });
      req.on('timeout', () => req.destroy(new Error('Timed out')));
      req.on('error', reject);
      req.end(r.body);
    });
  }
}

export const nextAttemptDelay = (attempts: number) => BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
