/** Safe download/save file name: no path separators, no control or unusual characters, bounded length. */
export function safeFileName(name: string, ext: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .slice(0, 80) || 'resume';
  return `${base}.${ext}`;
}
