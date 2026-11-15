import { Component, OnInit, ViewChild, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ApiService } from '../../core/api.service';
import { ExportService } from '../../core/export.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Resume } from '../../core/models';
import { errorMessage } from '../../core/notify.service';
import { VisualEditorComponent } from './visual-editor.component';

/**
 * Route `resumes/:id/design`: full-height host for the visual editor (Step 3). Pages that embed the editor themselves
 * can use `<app-visual-editor>` directly; this route keeps it reachable on its own and is what the e2e suite drives.
 */
@Component({
  selector: 'app-visual-editor-page',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, RouterLink, VisualEditorComponent, TranslatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>{{ 've.title' | t }}</ion-title></ion-toolbar></ion-header>
    <ion-content [scrollY]="false">
      <div class="host">
        <div class="row actions" role="toolbar" [attr.aria-label]="'ve.pageActions' | t">
          <a class="btn ghost sm" [routerLink]="['/resumes', id]" data-testid="ve-back"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon> {{ 've.back' | t }}</a>
          <span class="grow"></span>
          <button class="btn ghost sm" (click)="preview()" [disabled]="!r()" data-testid="ve-preview"><ion-icon name="eye-outline" aria-hidden="true"></ion-icon> {{ 've.preview' | t }}</button>
          <button class="btn sm" (click)="exp('pdf')" [disabled]="!r() || exporting()" data-testid="ve-export-pdf"><ion-icon name="cloud-download-outline" aria-hidden="true"></ion-icon> PDF</button>
          <button class="btn ghost sm" (click)="exp('html')" [disabled]="!r() || exporting()" data-testid="ve-export-html">HTML</button>
        </div>
        @if (error()) { <div class="banner err" role="alert">{{ error() }}</div> }
        @if (r(); as res) { <app-visual-editor #ed [resume]="res" (saved)="r.set($event)"></app-visual-editor> }
        @else if (!error()) { <p class="muted" style="padding:var(--space-4)">{{ 'common.loading' | t }}</p> }
      </div>
    </ion-content>
  `,
  styles: [`.host { height: 100%; display: flex; flex-direction: column; min-height: 0; } .actions { padding: var(--space-2) var(--space-3); gap: var(--space-2); align-items: center; }`],
})
export class VisualEditorPage implements OnInit {
  id = '';
  r = signal<Resume | null>(null);
  error = signal('');
  exporting = signal(false);
  @ViewChild('ed') ed?: VisualEditorComponent;

  constructor(private api: ApiService, private route: ActivatedRoute, private router: Router, private exporter: ExportService) {}

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.api.getResume(this.id).subscribe({ next: (res) => this.r.set(res), error: (e) => this.error.set(e.status === 404 ? 'Resume not found.' : errorMessage(e)) });
  }
  /** Exports and preview always see the latest edits: flush the autosave first. */
  async preview() { if (await (this.ed?.flush() ?? Promise.resolve(true))) void this.router.navigate(['/resumes', this.id, 'preview']); }
  async exp(format: 'pdf' | 'html') {
    if (!(await (this.ed?.flush() ?? Promise.resolve(true)))) return;
    this.exporting.set(true);
    await this.exporter.exportAndSave(this.id, this.r()?.name || 'resume', format);
    this.exporting.set(false);
  }
}
