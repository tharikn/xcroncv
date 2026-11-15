import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { LocalFolderService } from './local-folder.service';
import { formatBytes, LocalFileEntry } from './local-files';
import { errorMessage, NotifyService } from '../../core/notify.service';

/** Dedicated Local Files screen (doc 18 s.3): folder status, change/revoke, list/open/share/rename/delete. Separate from the dashboard. */
@Component({
  selector: 'app-local-files',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, DatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>Local files</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head"><div><h1>Local files</h1><p>Exported resumes saved on this device. The server never keeps them.</p></div></div>

        <section class="card" aria-labelledby="loc-h" data-testid="storage-card">
          <h2 id="loc-h">Save location</h2>
          @switch (store.mode()) {
            @case ('folder') {
              @if (store.permission() === 'none') {
                <p data-testid="folder-status">No folder chosen. Exports use normal browser downloads until you choose one.</p>
              } @else {
                <p data-testid="folder-status"><strong>{{ store.folderName() }}</strong> / XCronCV / Resumes
                  <span class="badge" [class.ok]="store.permission() === 'granted'" data-testid="folder-permission">{{ permissionLabel() }}</span></p>
              }
              <div class="row">
                <button class="btn" data-testid="choose-folder" (click)="choose()">
                  <ion-icon name="folder-open-outline" aria-hidden="true"></ion-icon> {{ store.permission() === 'none' ? 'Choose folder' : 'Change folder' }}</button>
                @if (store.permission() === 'prompt') { <button class="btn ghost" data-testid="regrant" (click)="regrant()">Allow access again</button> }
                @if (store.permission() !== 'none') { <button class="btn ghost" data-testid="forget-folder" (click)="forgetFolder()">Stop using this folder</button> }
              </div>
            }
            @case ('native') {
              <p data-testid="folder-status"><strong>Documents / XCronCV / Resumes</strong> <span class="badge ok">App folder</span></p>
              <p class="muted small">Stored in your device's Documents. Uninstalling the app may remove them.</p>
            }
            @default {
              <p data-testid="folder-status">This browser cannot save to a folder, so exports use your browser's normal downloads. Open this app in Chrome or Edge to choose a folder.</p>
            }
          }
          <p class="muted small" data-testid="loss-warning">Local files can be lost if the device is lost or reset, the app is uninstalled, or browser data is cleared. There is no cloud backup.</p>
        </section>

        @if (error()) { <div class="banner err" role="alert" data-testid="files-error">{{ error() }}</div> }

        @if (store.mode() !== 'download') {
          @if (loading()) { <div class="sk-stack" role="status" aria-busy="true"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
          @else if (store.mode() === 'folder' && store.permission() !== 'granted') {
            <div class="empty" data-testid="files-locked"><h2>Folder access needed</h2><p class="muted">Choose a folder or allow access again to see your saved resumes.</p></div>
          } @else if (files().length === 0) {
            <div class="empty" data-testid="files-empty"><h2>No saved resumes yet</h2><p class="muted">Export a PDF or HTML from the editor or preview to save it here.</p></div>
          } @else {
            @for (g of groups(); track g.folder) {
              <section class="card" [attr.data-testid]="'group-' + g.folder">
                <h2 class="wrap">{{ g.folder }}</h2>
                <ul class="list">
                  @for (f of g.files; track f.name) {
                    <li class="item-card" [attr.data-testid]="'file-' + f.name">
                      <div class="row between">
                        <div class="grow">
                          @if (renaming()?.name === f.name && renaming()?.folder === f.folder) {
                            <div class="field" [class.invalid]="!!renameError()">
                              <label [for]="'rn-' + f.name" class="sr-only">New file name</label>
                              <input [id]="'rn-' + f.name" data-testid="rename-input" [(ngModel)]="renameValue" (keydown.enter)="commitRename(f)" (keydown.escape)="renaming.set(null)" />
                              @if (renameError()) { <span class="error" role="alert" data-testid="rename-error">{{ renameError() }}</span> }
                            </div>
                          } @else {
                            <strong class="wrap" data-testid="file-name">{{ f.name }}</strong>
                          }
                          <p class="muted small">
                            <span class="badge">{{ f.format.toUpperCase() || 'FILE' }}</span>
                            {{ size(f.size) }} · {{ f.modified | date: 'medium' }}
                            @if (!f.available) { <span class="badge warn" data-testid="missing-badge">Missing from folder</span> }
                          </p>
                        </div>
                      </div>
                      <div class="row">
                        @if (f.available) {
                          @if (renaming()?.name === f.name && renaming()?.folder === f.folder) {
                            <button class="btn sm" data-testid="rename-save" (click)="commitRename(f)">Save name</button>
                            <button class="btn ghost sm" (click)="renaming.set(null)">Cancel</button>
                          } @else {
                            <button class="btn ghost sm" data-testid="open-file" (click)="act('open', f)"><ion-icon name="open-outline" aria-hidden="true"></ion-icon> Open</button>
                            <button class="btn ghost sm" data-testid="share-file" (click)="act('share', f)"><ion-icon name="share-outline" aria-hidden="true"></ion-icon> Share</button>
                            <button class="btn ghost sm" data-testid="rename-file" (click)="startRename(f)"><ion-icon name="create-outline" aria-hidden="true"></ion-icon> Rename</button>
                            <button class="btn danger sm" data-testid="delete-file" (click)="del(f)"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Delete</button>
                          }
                        } @else {
                          <button class="btn ghost sm" data-testid="forget-file" (click)="forget(f)">Remove from list</button>
                        }
                      </div>
                    </li>
                  }
                </ul>
              </section>
            }
          }
        }
      </div>
    </ion-content>
  `,
})
export class LocalFilesPage implements OnInit {
  files = signal<LocalFileEntry[]>([]);
  loading = signal(true);
  error = signal('');
  renaming = signal<LocalFileEntry | null>(null);
  renameError = signal('');
  renameValue = '';

  groups = computed(() => {
    const m = new Map<string, LocalFileEntry[]>();
    for (const f of this.files()) m.set(f.folder, [...(m.get(f.folder) ?? []), f]);
    return [...m].map(([folder, files]) => ({ folder, files }));
  });

  constructor(public store: LocalFolderService, private notify: NotifyService) {}

  async ngOnInit() { await this.store.init(); await this.reload(); }

  permissionLabel() {
    return ({ granted: 'Access granted', prompt: 'Access needs approval', denied: 'Access denied', none: '', unsupported: '' } as const)[this.store.permission()];
  }
  size(n: number) { return formatBytes(n); }

  async reload() {
    this.loading.set(true); this.error.set('');
    try { this.files.set(await this.store.list()); } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  async choose() { if (await this.store.chooseFolder()) { await this.reload(); await this.notify.toast('Folder selected'); } }
  async regrant() { if (await this.store.requestPermission()) await this.reload(); }
  async forgetFolder() {
    if (!(await this.notify.confirm('Stop using this folder?', 'Your files stay where they are. Exports will use normal downloads until you choose a folder again.', 'Stop using'))) return;
    await this.store.revoke(); await this.reload();
  }

  async act(kind: 'open' | 'share', f: LocalFileEntry) {
    try { await (kind === 'open' ? this.store.open(f) : this.store.share(f)); }
    catch (e) { if ((e as Error)?.name !== 'AbortError') await this.notify.toast(errorMessage(e), 'error'); }
  }

  startRename(f: LocalFileEntry) { this.renaming.set(f); this.renameValue = f.name; this.renameError.set(''); }
  async commitRename(f: LocalFileEntry) {
    try { const n = await this.store.rename(f, this.renameValue); this.renaming.set(null); await this.reload(); await this.notify.toast(`Renamed to ${n}`); }
    catch (e) { this.renameError.set(errorMessage(e)); }
  }

  async del(f: LocalFileEntry) {
    if (!(await this.notify.confirm('Delete this file?', `${f.name} will be deleted from this device. This cannot be undone.`))) return;
    try { await this.store.remove(f); await this.reload(); await this.notify.toast('File deleted'); }
    catch (e) { await this.notify.toast(errorMessage(e), 'error'); }
  }

  async forget(f: LocalFileEntry) { this.store.forget(f); await this.reload(); }
}
