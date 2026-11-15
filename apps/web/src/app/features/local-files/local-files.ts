/**
 * Pure helpers for the local folder manager (doc 18). No browser/Capacitor APIs here so they are unit-testable.
 * Layout: <root>/XCronCV/Resumes/<Resume-Name>/<Resume-Name>-v001.pdf
 */
export type DocFormat = 'pdf' | 'html' | 'docx' | 'xlsx';
export const ROOT_DIR = 'XCronCV';
export const RESUMES_DIR = 'Resumes';

export interface LocalFileEntry {
  /** Folder (resume) the file lives in. */
  folder: string;
  name: string;
  format: string;
  size: number;
  /** epoch ms, from the filesystem when available */
  modified: number;
  /** false when the index remembers a file the filesystem no longer has */
  available: boolean;
}

export interface IndexEntry { folder: string; name: string; format: string; size: number; savedAt: number }

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Safe single path segment: no separators/reserved characters, bounded length, never empty. */
export function safeSegment(name: string, fallback = 'resume'): string {
  let s = (name ?? '')
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 60);
  if (!s || RESERVED.test(s)) s = fallback;
  return s;
}

/** Next free `<base>-v###.<ext>`; never returns a name already in `existing` (case-insensitive). */
export function nextVersionName(base: string, ext: string, existing: string[]): string {
  const b = safeSegment(base);
  const e = ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const re = new RegExp(`^${escapeRe(b)}-v(\\d+)\\.${escapeRe(e)}$`, 'i');
  let max = 0;
  for (const n of existing) { const m = re.exec(n); if (m) max = Math.max(max, parseInt(m[1], 10)); }
  let v = max + 1;
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  let name = `${b}-v${String(v).padStart(3, '0')}.${e}`;
  while (taken.has(name.toLowerCase())) { v++; name = `${b}-v${String(v).padStart(3, '0')}.${e}`; }
  return name;
}

/** Validate a user-typed rename: same extension kept, safe base, no collision. Returns the new name or an error. */
export function validateRename(oldName: string, input: string, existing: string[]): { ok: true; name: string } | { ok: false; error: string } {
  const dot = oldName.lastIndexOf('.');
  const ext = dot > 0 ? oldName.slice(dot + 1) : '';
  const typed = input.trim().replace(new RegExp(`\\.${escapeRe(ext)}$`, 'i'), '');
  if (!typed) return { ok: false, error: 'Enter a file name.' };
  const base = safeSegment(typed, '');
  if (!base) return { ok: false, error: 'That name has no usable characters.' };
  const name = ext ? `${base}.${ext}` : base;
  if (name.toLowerCase() === oldName.toLowerCase()) return { ok: true, name: oldName };
  if (existing.some((n) => n.toLowerCase() === name.toLowerCase())) return { ok: false, error: 'A file with that name already exists.' };
  return { ok: true, name };
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const keyOf = (folder: string, name: string) => `${folder}/${name}`;

/** Reconcile what the filesystem reports with the on-device index. Files in the index but missing on disk stay listed as unavailable. */
export function reconcile(fsFiles: Array<Omit<LocalFileEntry, 'available'>>, index: IndexEntry[]): LocalFileEntry[] {
  const out: LocalFileEntry[] = fsFiles.map((f) => ({ ...f, available: true }));
  const seen = new Set(out.map((f) => keyOf(f.folder, f.name)));
  for (const i of index) {
    if (!seen.has(keyOf(i.folder, i.name))) out.push({ folder: i.folder, name: i.name, format: i.format, size: i.size, modified: i.savedAt, available: false });
  }
  return out.sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name));
}

export function formatOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
