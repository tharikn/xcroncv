/** Accept absolute http(s) URLs or root-relative paths only (blocks javascript:, data:, file: ...). */
export function isValidApiUrl(url: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}
