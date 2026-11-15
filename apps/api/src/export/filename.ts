/** Safe download filename: no path separators or reserved characters. */
export function safeFilename(name: string, ext: string): string {
  const base = name.normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'resume';
  return `${base}.${ext}`;
}
