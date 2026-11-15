import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import { BlockList, isIP } from 'net';
import { sanitizeJdText } from './jd-analyzer';

/**
 * Safe public-URL retrieval for job postings (doc 23 s2.2, s11). Guards:
 *  - only http(s) on ports 80/443, no credentials, no IP-literal or internal hostnames
 *  - every resolved address must be public (SSRF); the connection is PINNED to the validated IP (no DNS rebinding)
 *  - redirects are followed manually (max 3) and every hop is re-validated
 *  - timeout, response size cap, text content types only, no cookies / auth headers / compression
 *  - robots.txt is honoured; sign-in/captcha/blocked pages fall back to paste-in; no access control is bypassed
 */

export type ImportStatus = 'imported' | 'manual_paste_required' | 'unsupported_source' | 'retrieval_failed';
export interface ImportOutcome { status: ImportStatus; reason: string; sourceDomain?: string; canonicalUrl?: string; title?: string; company?: string; location?: string; text?: string }

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as Array<[string, number]>) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as Array<[string, number]>) blocked.addSubnet(net, prefix, 'ipv6');

export function isPublicIp(ip: string): boolean {
  const v = isIP(ip);
  if (!v) return false;
  return !blocked.check(ip, v === 4 ? 'ipv4' : 'ipv6');
}

export class UrlRejected extends Error {
  constructor(public readonly status: ImportStatus, message: string) { super(message); }
}

const RESTRICTED = /(^|\.)(linkedin\.com|naukri\.com|indeed\.[a-z.]+|glassdoor\.[a-z.]+|monster\.com)$/i;
export const USER_AGENT = 'XCronCV-JobFetcher/1.0 (+user-initiated single page; honours robots.txt)';

/** Validates the URL shape only (no network). Throws UrlRejected with a user-facing reason. */
export function validateUrl(raw: string): URL {
  if (raw.length > 2048) throw new UrlRejected('unsupported_source', 'That address is too long.');
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new UrlRejected('unsupported_source', 'That is not a valid web address.'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new UrlRejected('unsupported_source', 'Only http and https addresses are supported.');
  if (u.username || u.password) throw new UrlRejected('unsupported_source', 'Addresses containing credentials are not accepted.');
  if (u.port && !['80', '443'].includes(u.port)) throw new UrlRejected('unsupported_source', 'Only the standard web ports are allowed.');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(host)) { if (!isPublicIp(host)) throw new UrlRejected('unsupported_source', 'That address points to a private network.'); }
  else if (!host.includes('.') || /(^|\.)(localhost|local|internal|intranet|localdomain|home|lan|corp)$/.test(host)) {
    throw new UrlRejected('unsupported_source', 'That address points to a private or internal host.');
  }
  return u;
}

export const isRestrictedSource = (host: string) => RESTRICTED.test(host);

export interface HttpResult { status: number; headers: Record<string, string>; body: Buffer }
export interface FetchDeps {
  resolve(host: string): Promise<string[]>;
  /** Performs ONE request to the already-validated `ip`. Must enforce timeout and `maxBytes` (reject with Error('too_large') / Error('timeout')). */
  request(url: URL, ip: string, opts: { timeoutMs: number; maxBytes: number }): Promise<HttpResult>;
}

export const defaultDeps: FetchDeps = {
  async resolve(host) {
    const r = await dns.promises.lookup(host, { all: true, verbatim: true });
    return r.map((x) => x.address);
  },
  request(url, ip, { timeoutMs, maxBytes }) {
    return new Promise((resolve, reject) => {
      const lib = url.protocol === 'https:' ? https : http;
      const hostname = url.hostname.replace(/^\[|\]$/g, '');
      const req = lib.request({
        host: ip, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: `${url.pathname}${url.search}`, method: 'GET',
        servername: isIP(hostname) ? undefined : hostname, // SNI + certificate check against the real host name
        headers: { Host: url.host, 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9', 'Accept-Encoding': 'identity' },
        timeout: timeoutMs,
      }, (res) => {
        const chunks: Buffer[] = []; let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) { req.destroy(new Error('too_large')); return; }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v ?? '')])), body: Buffer.concat(chunks) }));
        res.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.end();
    });
  },
};

const MAX_REDIRECTS = 3;
const TEXT_TYPES = /^(text\/html|application\/xhtml\+xml|text\/plain)\b/i;

/** Fetch one page safely. Returns the final URL and body, or throws UrlRejected. */
export async function safeGet(startUrl: URL, deps: FetchDeps, opts: { maxBytes: number; timeoutMs: number } = { maxBytes: 1_500_000, timeoutMs: 8000 }): Promise<{ url: URL; res: HttpResult }> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    url = validateUrl(url.toString());
    const host = url.hostname.replace(/^\[|\]$/g, '');
    let ips: string[];
    try { ips = isIP(host) ? [host] : await deps.resolve(host); } catch { throw new UrlRejected('retrieval_failed', 'The address could not be resolved.'); }
    if (!ips.length) throw new UrlRejected('retrieval_failed', 'The address could not be resolved.');
    if (ips.some((ip) => !isPublicIp(ip))) throw new UrlRejected('unsupported_source', 'That address points to a private network.');
    let res: HttpResult;
    try { res = await deps.request(url, ips[0], opts); } catch (e) {
      const m = (e as Error).message;
      throw new UrlRejected('retrieval_failed', m === 'too_large' ? 'The page is too large to import.' : m === 'timeout' ? 'The site took too long to respond.' : 'The page could not be retrieved.');
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers['location'];
      if (!loc) throw new UrlRejected('retrieval_failed', 'The site redirected without a destination.');
      try { url = new URL(loc, url); } catch { throw new UrlRejected('retrieval_failed', 'The site redirected to an invalid address.'); }
      continue;
    }
    return { url, res };
  }
  throw new UrlRejected('retrieval_failed', 'The site redirected too many times.');
}

/** Minimal RFC 9309 matcher: longest matching rule wins, Allow beats Disallow on ties. */
export function robotsAllows(robots: string, path: string): boolean {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let cur: (typeof groups)[number] | null = null; let lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(); const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase()); lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && cur) { cur.rules.push({ allow: key === 'allow', path: val }); lastWasAgent = false; }
    else lastWasAgent = false;
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && 'xcroncv-jobfetcher'.includes(a)));
  const use = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  let best: { len: number; allow: boolean } | null = null;
  for (const g of use) for (const r of g.rules) {
    if (!r.path) continue;
    const re = new RegExp('^' + r.path.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'));
    if (re.test(path) && (!best || r.path.length > best.len || (r.path.length === best.len && r.allow))) best = { len: r.path.length, allow: r.allow };
  }
  return best ? best.allow : true;
}

const decode = (s: string) => s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'");

export function htmlToText(html: string): string {
  return sanitizeJdText(decode(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\s*(script|style|noscript|svg|nav|header|footer|aside|form|iframe)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
      .replace(/<\s*li[^>]*>/gi, '\n- ')
      .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr|ul|ol|section|article)\s*>|<\s*br\s*\/?>/gi, '\n'),
  ));
}

interface Ld { '@type'?: unknown; title?: string; description?: string; hiringOrganization?: { name?: string } | string; jobLocation?: unknown; '@graph'?: unknown[] }

function findJobPosting(node: unknown): Ld | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const n of node) { const f = findJobPosting(n); if (f) return f; } return null; }
  const o = node as Ld;
  const t = o['@type'];
  if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) return o;
  return o['@graph'] ? findJobPosting(o['@graph']) : null;
}

export function extractJob(html: string): { title?: string; company?: string; location?: string; text: string } {
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const jp = findJobPosting(JSON.parse(m[1]));
      if (jp?.description) {
        const org = typeof jp.hiringOrganization === 'string' ? jp.hiringOrganization : jp.hiringOrganization?.name;
        const loc = (Array.isArray(jp.jobLocation) ? jp.jobLocation[0] : jp.jobLocation) as { address?: { addressLocality?: string; addressCountry?: string } | string } | undefined;
        const addr = typeof loc?.address === 'string' ? loc.address : [loc?.address?.addressLocality, loc?.address?.addressCountry].filter((x) => typeof x === 'string').join(', ');
        return { title: jp.title ? htmlToText(String(jp.title)).slice(0, 120) : undefined, company: org?.slice(0, 120), location: addr || undefined, text: htmlToText(String(jp.description)) };
      }
    } catch { /* malformed JSON-LD: fall through to text extraction */ }
  }
  const title = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i.exec(html)?.[1] ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const body = /<(main|article)[^>]*>([\s\S]*?)<\/\1>/i.exec(html)?.[2] ?? /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html;
  return { title: title ? htmlToText(title).slice(0, 120) : undefined, text: htmlToText(body) };
}

const WALL = /(sign in to (continue|view|see)|log ?in to (continue|view|see)|captcha|verify (that )?you are (a )?human|are you a robot|access denied|enable javascript|unusual traffic|please sign in|create an account to)/i;

/** Full import flow with a status that never claims success unless validated content was actually retrieved. */
export async function importJobFromUrl(rawUrl: string, deps: FetchDeps = defaultDeps, env = process.env): Promise<ImportOutcome> {
  let url: URL;
  try { url = validateUrl(rawUrl); } catch (e) { return { status: (e as UrlRejected).status, reason: (e as Error).message }; }
  const sourceDomain = url.hostname.toLowerCase();
  const canonicalUrl = `${url.origin}${url.pathname}`;
  const fallback = (status: ImportStatus, reason: string): ImportOutcome => ({ status, reason: `${reason} Paste the job description instead.`, sourceDomain, canonicalUrl });

  if (isRestrictedSource(sourceDomain) && env.JD_FETCH_RESTRICTED_SOURCES !== 'allow') {
    return fallback('manual_paste_required', `${sourceDomain} requires sign-in or does not permit automated retrieval, so the page was not fetched.`);
  }
  try {
    // robots.txt: honoured. 4xx = no restrictions; 5xx = treated as disallowed (RFC 9309).
    const robotsUrl = new URL('/robots.txt', url.origin);
    const robots = await safeGet(robotsUrl, deps, { maxBytes: 200_000, timeoutMs: 5000 });
    if (robots.res.status >= 500) return fallback('manual_paste_required', 'The site\'s robots.txt could not be read, so automated retrieval is not permitted.');
    if (robots.res.status === 200 && !robotsAllows(robots.res.body.toString('utf8'), `${url.pathname}${url.search}`)) {
      return fallback('manual_paste_required', 'The site\'s robots.txt does not allow automated retrieval of this page.');
    }
    const { url: finalUrl, res } = await safeGet(url, deps);
    if ([401, 403, 407, 429].includes(res.status) || res.status === 999) return fallback('manual_paste_required', 'The site blocked automated access or needs you to sign in.');
    if (res.status === 404 || res.status === 410) return fallback('retrieval_failed', 'The posting was not found (it may have been removed).');
    if (res.status < 200 || res.status >= 300) return fallback('retrieval_failed', `The site responded with status ${res.status}.`);
    if (!TEXT_TYPES.test(res.headers['content-type'] ?? '')) return fallback('unsupported_source', 'That address is not a web page or text document.');
    if (isRestrictedSource(finalUrl.hostname) && env.JD_FETCH_RESTRICTED_SOURCES !== 'allow') return fallback('manual_paste_required', 'The page redirected to a site that requires sign-in.');
    const job = extractJob(res.body.toString('utf8'));
    if (job.text.length < 200 || (job.text.length < 1500 && WALL.test(job.text))) {
      return fallback('manual_paste_required', 'The page did not contain a readable job description (it may need sign-in or JavaScript).');
    }
    return { status: 'imported', reason: 'Imported from the public page. Review the extracted requirements before scoring.', sourceDomain, canonicalUrl, title: job.title, company: job.company, location: job.location, text: job.text.slice(0, 30000) };
  } catch (e) {
    if (e instanceof UrlRejected) return fallback(e.status === 'unsupported_source' ? 'unsupported_source' : 'retrieval_failed', e.message);
    return fallback('retrieval_failed', 'The page could not be retrieved.');
  }
}
