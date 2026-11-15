// The unit config only transforms plain TS, so Angular/Capacitor are replaced by minimal stand-ins.
jest.mock('@angular/core', () => ({
  Injectable: () => () => undefined,
  signal: (v: unknown) => { let x = v; const f: any = () => x; f.set = (n: unknown) => { x = n; }; return f; },
}));
jest.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
jest.mock('@capacitor/filesystem', () => ({ Directory: {}, Filesystem: {} }));
jest.mock('@capacitor/share', () => ({ Share: {} }));
import { LocalFolderService } from './local-folder.service';

/**
 * Regression (flaky "rename collision" e2e): init() reads the stored folder handle from IndexedDB asynchronously.
 * If the user picks a folder while that read is pending, init() must not overwrite the new handle with the empty result.
 */
describe('LocalFolderService init vs chooseFolder race', () => {
  const g = globalThis as any;
  let releaseGet: () => void;

  beforeEach(() => {
    const gate = new Promise<void>((r) => { releaseGet = r; });
    g.window = g;
    g.indexedDB = {
      open: () => {
        const db = {
          close: () => undefined,
          transaction: () => ({
            objectStore: () => ({
              get: () => {
                const rq: any = { result: undefined };
                gate.then(() => rq.onsuccess?.()); // stored handle: none, delivered late
                return rq;
              },
              put: () => { const rq: any = {}; Promise.resolve().then(() => rq.onsuccess?.()); return rq; },
            }),
          }),
        };
        const r: any = { result: db };
        Promise.resolve().then(() => r.onsuccess?.());
        return r;
      },
    };
    g.localStorage = { getItem: () => null, setItem: () => undefined };
    g.showDirectoryPicker = async () => ({ name: 'MyDocs', queryPermission: async () => 'granted' });
  });
  afterEach(() => { delete g.indexedDB; delete g.showDirectoryPicker; delete g.window; });

  it('keeps a folder chosen while the stored handle is still loading', async () => {
    const svc = new LocalFolderService({} as never);
    const init = svc.init();
    await new Promise((r) => setTimeout(r, 0)); // init is now waiting on IndexedDB
    expect(await svc.chooseFolder()).toBe(true);
    releaseGet(); // late, empty result
    await init;
    expect(svc.permission()).toBe('granted');
    expect(svc.folderName()).toBe('MyDocs');
    expect(svc.needsFirstRun).toBe(false);
  });
});
