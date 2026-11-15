/** localStorage/sessionStorage can throw (private mode, blocked). Never let that break the app. */
export function safeGet(store: 'local' | 'session', key: string): string | null {
  try { return (store === 'local' ? localStorage : sessionStorage).getItem(key); } catch { return null; }
}
export function safeSet(store: 'local' | 'session', key: string, value: string): void {
  try { (store === 'local' ? localStorage : sessionStorage).setItem(key, value); } catch { /* ignore */ }
}
export function safeRemove(store: 'local' | 'session', key: string): void {
  try { (store === 'local' ? localStorage : sessionStorage).removeItem(key); } catch { /* ignore */ }
}
