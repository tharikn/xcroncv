import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { LocalFolderService, SaveOutcome } from '../features/local-files/local-folder.service';
import { errorMessage, NotifyService } from './notify.service';

/** Request export bytes from the API (never stored server-side) and save them on the device (doc 18 s.6). */
@Injectable({ providedIn: 'root' })
export class ExportService {
  constructor(private api: ApiService, private folder: LocalFolderService, private notify: NotifyService) {}

  async exportAndSave(id: string, name: string, format: 'pdf' | 'html' | 'docx' | 'xlsx'): Promise<boolean> {
    try {
      await this.folder.init();
      // First export uses defaults (plain download) and never asks anything; choosing a folder stays available on the Files page.
      if (this.folder.needsFirstRun) this.folder.setDeclined(true);
      const blob = await firstValueFrom(this.api.exportFile(id, format));
      const res = await this.folder.save(name, format, blob);
      await this.notify.toast(this.message(res, format));
      return true;
    } catch (e) {
      await this.notify.toast(errorMessage(e), 'error');
      return false;
    }
  }

  private message(r: SaveOutcome, format: string): string {
    if (r.kind === 'saved') return `Saved ${r.fileName} to ${r.location}`;
    const why = r.reason === 'denied' ? ' (folder permission was not granted)' : '';
    return `${format.toUpperCase()} download started${why}`;
  }
}
