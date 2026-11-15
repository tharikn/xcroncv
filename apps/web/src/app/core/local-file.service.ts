import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
export { safeFileName } from './file-name';

export interface SaveResult { mode: 'native-file' | 'download'; path?: string }


/**
 * Device-local save. Documents never leave the device except through the user's chosen save/share action.
 * Android: writes to Documents/XCronCV and offers the share sheet. Web: standard download (File System Access API is an enhancement).
 */
@Injectable({ providedIn: 'root' })
export class LocalFileService {
  get isNative() { return Capacitor.isNativePlatform(); }

  async save(blob: Blob, fileName: string): Promise<SaveResult> {
    if (this.isNative) {
      const data = await this.toBase64(blob);
      const res = await Filesystem.writeFile({
        path: `XCronCV/${fileName}`, data, directory: Directory.Documents, recursive: true,
      });
      return { mode: 'native-file', path: res.uri };
    }
    this.download(blob, fileName);
    return { mode: 'download' };
  }

  async share(blob: Blob, fileName: string): Promise<void> {
    if (!this.isNative) { this.download(blob, fileName); return; }
    const data = await this.toBase64(blob);
    const written = await Filesystem.writeFile({ path: `XCronCV/${fileName}`, data, directory: Directory.Cache, recursive: true });
    await Share.share({ title: fileName, url: written.uri });
  }

  private download(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  private toBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
}
