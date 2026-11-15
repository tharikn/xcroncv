import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WebhookEvent } from './types';

/**
 * Verify a delivery on the receiving side. Pass the RAW request body (not re-serialised JSON) and the `X-XCronCV-Signature` header.
 * Rejects tampered bodies and replays older than `toleranceSec`. De-duplicate on `event.id` (deliveries are retried with the same id).
 */
export function verifyWebhook(secret: string, signatureHeader: string, rawBody: string, opts: { toleranceSec?: number; nowSec?: number } = {}): WebhookEvent | null {
  const tolerance = opts.toleranceSec ?? 300;
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const parts = Object.fromEntries(signatureHeader.split(',').map((p) => p.trim().split('=') as [string, string]));
  const t = Number(parts['t']);
  const v1 = parts['v1'];
  if (!Number.isFinite(t) || !v1 || Math.abs(now - t) > tolerance) return null;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  const got = Buffer.from(v1, 'hex');
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try { return JSON.parse(rawBody) as WebhookEvent; } catch { return null; }
}
