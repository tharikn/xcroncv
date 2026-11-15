import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { LocalFileService } from '../../core/local-file.service';
import {
  formatOf, IndexEntry, keyOf, LocalFileEntry, nextVersionName, reconcile, RESUMES_DIR, ROOT_DIR, safeSegment, validateRename,
} from './local-files';
import { safeGet, safeSet } from '../../core/safe-storage';

export type StorageMode = 'folder' | 'native' | 'download';
export type FolderPermission = 'granted' | 'prompt' | 'denied' | 'none' | 'unsupported';

/** `saved` is only returned after the filesystem confirmed the write (doc 18 s.3). `downloaded` makes no claim about the location. */
export type SaveOutcome =
  | { kind: 'saved'; fileName: string; folder: string; location: string }
  | { kind: 'downloaded'; fileName: string; reason: 'unsupported' | 'no-folder' | 'denied' };

const INDEX_KEY = 'xcroncv.local-index.v1';
const DECLINED_KEY = 'xcroncv.local-folder-declined';
const DB = 'xcroncv-local';
const STORE = 'handles';
const MAX_INDEX = 500;

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Local folder manager (doc 18). Adapters: web File System Access API, Capacitor Filesystem (Android/iOS), download fallback.
 * Files never leave the device; only a platform folder handle is persisted (IndexedDB) and a small metadata index (localStorage).
 */
@Injectable({ providedIn: 'root' })
export class LocalFolderService {
  readonly mode = signal<StorageMode>(this.detect());
  readonly folderName = signal('');
  readonly permission = signal<FolderPermission>(this.mode() === 'folder' ? 'none' : this.mode() === 'native' ? 'granted' : 'unsupported');
  private root: any = null;

  constructor(private legacy: LocalFileService) {}

  private detect(): StorageMode {
    if (Capacitor.isNativePlatform()) return 'native';
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window ? 'folder' : 'download';
  }

  get declined(): boolean { return safeGet('local', DECLINED_KEY) === '1'; }
  setDeclined(v: boolean) { safeSet('local', DECLINED_KEY, v ? '1' : '0'); }

  /** True when a first-run explanation + folder choice should be offered before the first export. */
  get needsFirstRun(): boolean { return this.mode() === 'folder' && this.permission() === 'none' && !this.declined; }

  async init(): Promise<void> {
    if (this.mode() !== 'folder') return;
    try {
      // The IndexedDB read is async: the user may pick a folder meanwhile (chooseFolder). Never overwrite a handle that
      // was set while we were waiting, or the fresh choice is lost and the first-run prompt reappears.
      if (!this.root) {
        const stored = await idbGet('root');
        if (!this.root) this.root = stored ?? null;
      }
      const root = this.root;
      if (!root) { this.permission.set('none'); this.folderName.set(''); return; }
      this.folderName.set(root.name);
      const p = await root.queryPermission({ mode: 'readwrite' });
      if (this.root === root) this.permission.set(p);
    } catch { this.permission.set('none'); }
  }

  /** Must run from a user gesture. */
  async chooseFolder(): Promise<boolean> {
    if (this.mode() !== 'folder') return false;
    try {
      const h = await (window as any).showDirectoryPicker({ id: 'xcroncv', mode: 'readwrite' });
      this.root = h;
      try { await idbSet('root', h); } catch { /* handle could not be persisted; works for this session only */ }
      this.folderName.set(h.name);
      this.permission.set('granted');
      this.setDeclined(false);
      return true;
    } catch { return false; /* cancelled */ }
  }

  /** Forget the folder (does not delete files). */
  async revoke(): Promise<void> {
    this.root = null; this.folderName.set(''); this.permission.set(this.mode() === 'folder' ? 'none' : 'unsupported');
    try { await idbDelete('root'); } catch { /* ignore */ }
  }

  /** Re-request permission for a remembered handle. Must run from a user gesture. */
  async requestPermission(): Promise<boolean> {
    if (!this.root) return false;
    try {
      const p = await this.root.requestPermission({ mode: 'readwrite' });
      this.permission.set(p);
      return p === 'granted';
    } catch { return false; }
  }

  private async resumesDir(create: boolean): Promise<any | null> {
    try {
      const app = await this.root.getDirectoryHandle(ROOT_DIR, { create });
      return await app.getDirectoryHandle(RESUMES_DIR, { create });
    } catch { return null; }
  }

  async save(resumeName: string, ext: string, blob: Blob): Promise<SaveOutcome> {
    const folder = safeSegment(resumeName);
    if (this.mode() === 'native') return this.saveNative(folder, ext, blob);
    if (this.mode() === 'folder') {
      if (!this.root) return this.fallback(folder, ext, blob, 'no-folder');
      if (this.permission() !== 'granted') {
        if (!(await this.requestPermission())) return this.fallback(folder, ext, blob, 'denied');
      }
      return this.saveFolder(folder, ext, blob);
    }
    return this.fallback(folder, ext, blob, 'unsupported');
  }

  private async fallback(folder: string, ext: string, blob: Blob, reason: 'unsupported' | 'no-folder' | 'denied'): Promise<SaveOutcome> {
    const fileName = `${folder}.${ext}`;
    await this.legacy.save(blob, fileName); // standard browser download; we do not claim where it went
    return { kind: 'downloaded', fileName, reason };
  }

  private async saveFolder(folder: string, ext: string, blob: Blob): Promise<SaveOutcome> {
    const resumes = await this.resumesDir(true);
    if (!resumes) throw new Error('Could not open the chosen folder. Choose it again in Local files.');
    const dir = await resumes.getDirectoryHandle(folder, { create: true });
    const existing: string[] = [];
    for await (const [name] of dir.entries()) existing.push(name);
    const fileName = nextVersionName(folder, ext, existing);
    const fh = await dir.getFileHandle(fileName, { create: true });
    const w = await fh.createWritable(); // writes to a swap file, committed on close
    try { await w.write(blob); await w.close(); } catch (e) { try { await w.abort(); } catch { /* ignore */ } throw e; }
    const written = await (await dir.getFileHandle(fileName)).getFile();
    if (written.size !== blob.size) throw new Error('The file was not written completely. Nothing was saved.');
    this.indexAdd({ folder, name: fileName, format: ext, size: written.size, savedAt: Date.now() });
    return { kind: 'saved', fileName, folder, location: `${this.folderName()}/${ROOT_DIR}/${RESUMES_DIR}/${folder}` };
  }

  private async saveNative(folder: string, ext: string, blob: Blob): Promise<SaveOutcome> {
    const dirPath = `${ROOT_DIR}/${RESUMES_DIR}/${folder}`;
    let existing: string[] = [];
    try { existing = (await Filesystem.readdir({ path: dirPath, directory: Directory.Documents })).files.map((f) => f.name); } catch { /* new folder */ }
    const fileName = nextVersionName(folder, ext, existing);
    const data = await toBase64(blob);
    await Filesystem.writeFile({ path: `${dirPath}/${fileName}`, data, directory: Directory.Documents, recursive: true });
    const st = await Filesystem.stat({ path: `${dirPath}/${fileName}`, directory: Directory.Documents });
    if (st.size !== blob.size) throw new Error('The file was not written completely. Nothing was saved.');
    this.indexAdd({ folder, name: fileName, format: ext, size: st.size, savedAt: Date.now() });
    return { kind: 'saved', fileName, folder, location: `Documents/${dirPath}` };
  }

  /* ---------- listing & actions ---------- */

  async list(): Promise<LocalFileEntry[]> {
    const fs: Array<Omit<LocalFileEntry, 'available'>> = [];
    if (this.mode() === 'folder' && this.root && this.permission() === 'granted') {
      const resumes = await this.resumesDir(false);
      if (resumes) {
        for await (const [folder, h] of resumes.entries()) {
          if (h.kind !== 'directory') continue;
          for await (const [name, fh] of h.entries()) {
            if (fh.kind !== 'file') continue;
            const f = await fh.getFile();
            fs.push({ folder, name, format: formatOf(name), size: f.size, modified: f.lastModified });
          }
        }
      }
    } else if (this.mode() === 'native') {
      try {
        const top = await Filesystem.readdir({ path: `${ROOT_DIR}/${RESUMES_DIR}`, directory: Directory.Documents });
        for (const d of top.files.filter((x) => x.type === 'directory')) {
          const inner = await Filesystem.readdir({ path: `${ROOT_DIR}/${RESUMES_DIR}/${d.name}`, directory: Directory.Documents });
          for (const f of inner.files.filter((x) => x.type === 'file')) {
            fs.push({ folder: d.name, name: f.name, format: formatOf(f.name), size: f.size ?? 0, modified: f.mtime ?? 0 });
          }
        }
      } catch { /* nothing saved yet */ }
    } else {
      return []; // download mode: no folder to list; the index would only show phantom files
    }
    return reconcile(fs, this.indexRead());
  }

  async rename(file: LocalFileEntry, input: string): Promise<string> {
    const siblings = (await this.list()).filter((f) => f.folder === file.folder).map((f) => f.name);
    const v = validateRename(file.name, input, siblings);
    if (!v.ok) throw new Error(v.error);
    if (v.name === file.name) return file.name;
    if (this.mode() === 'native') {
      const base = `${ROOT_DIR}/${RESUMES_DIR}/${file.folder}`;
      await Filesystem.rename({ from: `${base}/${file.name}`, to: `${base}/${v.name}`, directory: Directory.Documents });
    } else {
      const dir = await (await this.resumesDir(false))!.getDirectoryHandle(file.folder);
      const src = await (await dir.getFileHandle(file.name)).getFile();
      const dst = await dir.getFileHandle(v.name, { create: true });
      const w = await dst.createWritable(); await w.write(src); await w.close();
      await dir.removeEntry(file.name);
    }
    this.indexRemove(file.folder, file.name);
    this.indexAdd({ folder: file.folder, name: v.name, format: file.format, size: file.size, savedAt: Date.now() });
    return v.name;
  }

  async remove(file: LocalFileEntry): Promise<void> {
    if (file.available) {
      if (this.mode() === 'native') {
        await Filesystem.deleteFile({ path: `${ROOT_DIR}/${RESUMES_DIR}/${file.folder}/${file.name}`, directory: Directory.Documents });
      } else {
        const dir = await (await this.resumesDir(false))!.getDirectoryHandle(file.folder);
        await dir.removeEntry(file.name);
      }
    }
    this.indexRemove(file.folder, file.name);
  }

  /** Forget an unavailable (missing) file from the index without touching the filesystem. */
  forget(file: LocalFileEntry) { this.indexRemove(file.folder, file.name); }

  async open(file: LocalFileEntry): Promise<void> {
    if (this.mode() === 'native') { await this.share(file); return; }
    const dir = await (await this.resumesDir(false))!.getDirectoryHandle(file.folder);
    const f: File = await (await dir.getFileHandle(file.name)).getFile();
    const url = URL.createObjectURL(f);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async share(file: LocalFileEntry): Promise<void> {
    if (this.mode() === 'native') {
      const u = await Filesystem.getUri({ path: `${ROOT_DIR}/${RESUMES_DIR}/${file.folder}/${file.name}`, directory: Directory.Documents });
      await Share.share({ title: file.name, url: u.uri });
      return;
    }
    const dir = await (await this.resumesDir(false))!.getDirectoryHandle(file.folder);
    const f: File = await (await dir.getFileHandle(file.name)).getFile();
    const nav = navigator as any;
    if (nav.canShare?.({ files: [f] })) { await nav.share({ files: [f], title: file.name }); return; }
    await this.legacy.share(f, file.name); // plain download when the Web Share API cannot share files
  }

  /* ---------- on-device index (metadata only) ---------- */

  private indexRead(): IndexEntry[] {
    try { const v = JSON.parse(safeGet('local', INDEX_KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  private indexWrite(list: IndexEntry[]) { safeSet('local', INDEX_KEY, JSON.stringify(list.slice(-MAX_INDEX))); }
  private indexAdd(e: IndexEntry) { this.indexWrite([...this.indexRead().filter((i) => keyOf(i.folder, i.name) !== keyOf(e.folder, e.name)), e]); }
  private indexRemove(folder: string, name: string) { this.indexWrite(this.indexRead().filter((i) => keyOf(i.folder, i.name) !== keyOf(folder, name))); }
}

/* ---------- tiny IndexedDB key/value for the directory handle ---------- */
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbOp<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  return new Promise((res, rej) => {
    const rq = fn(db.transaction(STORE, mode).objectStore(STORE));
    rq.onsuccess = () => { db.close(); res(rq.result); };
    rq.onerror = () => { db.close(); rej(rq.error); };
  });
}
const idbGet = (k: string) => idbOp<any>('readonly', (s) => s.get(k));
const idbSet = (k: string, v: unknown) => idbOp('readwrite', (s) => s.put(v, k));
const idbDelete = (k: string) => idbOp('readwrite', (s) => s.delete(k));

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
