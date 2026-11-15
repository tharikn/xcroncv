import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { CareerToolsApi, Claim, CoverLetterDetail, LetterSection } from '../core/career-tools.api';
import { hasUnsupported, unsupportedClaims, wordCount } from '../core/career-tools.format';
import { LocalFileService } from '../core/local-file.service';
import { errorMessage, NotifyService } from '../core/notify.service';

const STATUS_LABEL: Record<string, string> = { SUPPORTED: 'Backed by your profile', USER_AUTHORED: 'Written by you', UNSUPPORTED: 'Not backed by your profile' };

/** Section-level editor with evidence chips and unsupported-claim warnings (doc 42). */
@Component({
  selector: 'app-cover-letter-editor',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, RouterLink, DatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>Cover letter</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <a class="btn ghost sm" routerLink="/cover-letters" style="align-self:flex-start"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon> All cover letters</a>
        @if (error()) { <div class="banner err" role="alert" data-testid="editor-error">{{ error() }}</div> }
        @if (loading()) { <p class="muted">Loading…</p> }
        @if (!loading() && letter(); as l) {
          <div class="page-head">
            <div><h1 class="wrap" data-testid="letter-heading">{{ l.title }}</h1>
              <p>{{ l.jobTitle || 'No job title' }}{{ l.company ? ' · ' + l.company : '' }} · version {{ l.currentVersion }} · {{ words() }} words</p></div>
            <div class="row">
              <button class="btn ghost sm" (click)="check()" [disabled]="busy()" data-testid="check-claims"><ion-icon name="shield-checkmark-outline" aria-hidden="true"></ion-icon> Check claims</button>
              <button class="btn sm" (click)="save()" [disabled]="busy() || !dirty()" data-testid="save-version"><ion-icon name="save-outline" aria-hidden="true"></ion-icon> Save new version</button>
            </div>
          </div>

          @if (dirty()) { <div class="banner warn" role="status" data-testid="unsaved">You have unsaved edits. Saving creates a new immutable version.</div> }

          <section class="banner" [class.warn]="unsupportedTotal() > 0" role="status" data-testid="claims-summary" aria-live="polite">
            @if (unsupportedTotal() > 0) { <strong>{{ unsupportedTotal() }} claim(s) are not backed by your profile.</strong> Edit or remove them, or mark them as written by you if they are true. }
            @else { No unsupported claims found. Each fact below is backed by your profile or marked as yours. }
          </section>

          <div class="stack">
            @for (s of sections(); track s.id) {
              <section class="card" [attr.data-testid]="'section-' + s.id">
                <div class="row between">
                  <label class="grow" [for]="'sec-' + s.id"><h2>{{ s.heading }}</h2></label>
                  <span class="badge">{{ s.origin === 'USER' ? 'Edited by you' : 'Draft' }}</span>
                </div>
                <div class="field"><textarea [id]="'sec-' + s.id" [attr.data-testid]="'text-' + s.id" rows="6" maxlength="5000" [ngModel]="s.text" (ngModelChange)="edit(s.id, $event)"></textarea></div>
                <ul class="row" [attr.aria-label]="'Claims in ' + s.heading" style="list-style:none;padding:0;margin:0">
                  @for (c of claimsFor(s.id); track $index) {
                    <li class="badge" [class.ok]="c.status === 'SUPPORTED'" [class.warn]="c.status === 'UNSUPPORTED'" [attr.data-testid]="'claim-' + c.status.toLowerCase()"
                      [title]="c.evidence || statusLabel(c.status)">{{ c.text }} · {{ statusLabel(c.status) }}</li>
                  }
                </ul>
                @for (c of unsupportedIn(s.id); track $index) {
                  <div class="row" role="alert" data-testid="unsupported-warning">
                    <span class="error grow">"{{ c.text }}" cannot be traced to your career profile ({{ c.kind }}).</span>
                    <button class="btn ghost sm" (click)="markMine(c)" data-testid="mark-mine">I wrote this, it is true</button>
                  </div>
                }
              </section>
            }
          </div>

          <section class="card" aria-labelledby="export-h">
            <h2 id="export-h">Export</h2>
            <p class="muted small">Files are created on request and saved on this device. The server keeps only the structured text.</p>
            <div class="row">
              <button class="btn ghost sm" (click)="exportAs('pdf')" data-testid="export-pdf">PDF</button>
              <button class="btn ghost sm" (click)="exportAs('html')" data-testid="export-html">HTML</button>
              <button class="btn ghost sm" (click)="exportAs('txt')" data-testid="export-txt">Plain text</button>
            </div>
          </section>

          <section class="card" aria-labelledby="bind-h">
            <h2 id="bind-h">Attach to an application</h2>
            <p class="muted small">Binds version {{ l.currentVersion }} to a job application reference from your job portal. Nothing is sent anywhere.</p>
            <div class="form-grid">
              <div class="field"><label for="appref">Application reference</label><input id="appref" data-testid="bind-ref" [(ngModel)]="appRef" maxlength="120" placeholder="e.g. app-1042" /></div>
            </div>
            <label class="checkbox"><input type="checkbox" data-testid="bind-confirm" [(ngModel)]="bindConfirm" /> I approve attaching version {{ l.currentVersion }} to this application</label>
            <div class="row"><button class="btn sm" (click)="bind()" [disabled]="!appRef.trim() || !bindConfirm || dirty()" data-testid="bind-submit">Attach</button>
              @if (dirty()) { <span class="hint">Save your edits first so the exact version is bound.</span> }</div>
            @if (bound()) { <p class="small" role="status" data-testid="bind-done">Attached version {{ bound() }}.</p> }
          </section>

          <section class="card" aria-labelledby="ver-h">
            <h2 id="ver-h">Versions</h2>
            <ul class="list" data-testid="version-list">
              @for (v of l.versions; track v.id) {
                <li class="row between"><span>v{{ v.versionNumber }} · {{ v.changeSummary || 'No note' }}</span><span class="muted small">{{ v.createdAt | date: 'medium' }}</span></li>
              }
            </ul>
          </section>
        }
      </div>
    </ion-content>
  `,
})
export class CoverLetterEditorPage implements OnInit {
  letter = signal<CoverLetterDetail | null>(null);
  sections = signal<LetterSection[]>([]);
  claims = signal<Claim[]>([]);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  dirty = signal(false);
  bound = signal<number | null>(null);
  appRef = '';
  bindConfirm = false;
  private userAuthored: string[] = [];
  private id = '';

  constructor(private api: CareerToolsApi, private route: ActivatedRoute, private notify: NotifyService, private files: LocalFileService) {}

  ngOnInit() { this.id = this.route.snapshot.paramMap.get('id')!; this.load(); }

  load() {
    this.api.getLetter(this.id).subscribe({
      next: (l) => { this.letter.set(l); this.sections.set(l.version?.sections ?? []); this.claims.set(l.version?.claims ?? []); this.dirty.set(false); this.loading.set(false); },
      error: (e) => { this.error.set(e.status === 404 ? 'This cover letter was not found.' : errorMessage(e)); this.loading.set(false); },
    });
  }

  words() { return wordCount(this.sections()); }
  statusLabel(s: string) { return STATUS_LABEL[s] ?? s; }
  claimsFor(id: string) { return this.claims().filter((c) => c.sectionId === id); }
  unsupportedIn(id: string) { return unsupportedClaims(this.claims(), id); }
  unsupportedTotal() { return unsupportedClaims(this.claims()).length; }

  edit(id: string, text: string) {
    this.sections.update((l) => l.map((s) => (s.id === id ? { ...s, text, origin: 'USER' as const } : s)));
    this.dirty.set(true);
  }

  markMine(c: Claim) { this.userAuthored = [...new Set([...this.userAuthored, c.text])]; this.check(); }

  check() {
    this.busy.set(true);
    this.api.validateClaims(this.id, { sections: this.sections(), userAuthored: this.userAuthored }).subscribe({
      next: (r) => { this.claims.set(r.claims); this.busy.set(false); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  async save() {
    if (hasUnsupported(this.claims()) && !(await this.notify.confirm('Save with unsupported claims?', 'Some statements are not backed by your career profile. You can still save, but double-check they are true before sending.', 'Save anyway'))) return;
    this.busy.set(true);
    this.api.saveLetterVersion(this.id, { sections: this.sections(), userAuthored: this.userAuthored, changeSummary: 'Edited by you' }).subscribe({
      next: (v) => { this.busy.set(false); this.claims.set(v.claims); void this.notify.toast(`Saved version ${v.versionNumber}`); this.load(); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  async exportAs(format: 'pdf' | 'html' | 'txt') {
    if (this.dirty()) { void this.notify.toast('Save your edits first so the export matches a saved version.', 'error'); return; }
    try {
      const blob = await firstValueFrom(this.api.exportLetter(this.id, format));
      const name = (this.letter()?.title ?? 'cover-letter').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'cover-letter';
      await this.files.save(blob, `${name}.${format}`);
      void this.notify.toast(`${format.toUpperCase()} saved on this device`);
    } catch (e) { void this.notify.toast(errorMessage(e), 'error'); }
  }

  bind() {
    const l = this.letter()!;
    this.api.bindLetter(this.appRef.trim(), { coverLetterId: l.id, versionNumber: l.currentVersion, confirm: this.bindConfirm }).subscribe({
      next: (b) => { this.bound.set(b.versionNumber); this.bindConfirm = false; },
      error: (e) => void this.notify.toast(e.status === 409 ? 'This cover letter is already attached to that application.' : errorMessage(e), 'error'),
    });
  }
}
