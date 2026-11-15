import { Component, ElementRef, HostListener, OnInit, ViewChild, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ApiService } from '../core/api.service';
import { ExportService } from '../core/export.service';
import { RenderModel } from '../core/models';
import { errorMessage } from '../core/notify.service';
import { clamp, FitMode, fitScale, overflowWarning, pageCount } from '../core/preview-layout';
import { ResumeSheetComponent } from '../shared/resume-sheet.component';

/**
 * Dedicated preview route (doc 17). Renders the SAME render model the export uses (GET /resumes/:id/render-model),
 * as text nodes only (no innerHTML), on realistic page dimensions with page guides and overflow warnings.
 */
@Component({
  selector: 'app-preview',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, RouterLink, ResumeSheetComponent],
  template: `
    <ion-header><ion-toolbar><ion-title>Preview</ion-title></ion-toolbar></ion-header>
    <div class="preview-bar row" style="padding:var(--space-2) var(--page-gutter);border-bottom:1px solid var(--c-border)" role="toolbar" aria-label="Preview controls">
      <a class="btn ghost sm" [routerLink]="['/resumes', id]" data-testid="back-to-editor"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon> Editor</a>
      <button class="btn ghost sm icon" (click)="zoom(-0.1)" aria-label="Zoom out" data-testid="zoom-out"><ion-icon name="remove-outline" aria-hidden="true"></ion-icon></button>
      <span data-testid="zoom-level" class="small" style="min-width:3rem;text-align:center" aria-live="polite">{{ (scale() * 100).toFixed(0) }}%</span>
      <button class="btn ghost sm icon" (click)="zoom(0.1)" aria-label="Zoom in" data-testid="zoom-in"><ion-icon name="add-outline" aria-hidden="true"></ion-icon></button>
      <button class="btn ghost sm" (click)="setFit('width')" data-testid="fit-width" [attr.aria-pressed]="mode() === 'width'">Fit width</button>
      <button class="btn ghost sm" (click)="setFit('page')" data-testid="fit-page" [attr.aria-pressed]="mode() === 'page'">Fit page</button>
      <span class="badge" data-testid="page-count">{{ pages() }} {{ pages() === 1 ? 'page' : 'pages' }} · {{ model()?.page?.size }}</span>
      <span class="grow"></span>
      <button class="btn sm" (click)="exp('pdf')" [disabled]="exporting() || !model()" data-testid="preview-export-pdf"><ion-icon name="cloud-download-outline" aria-hidden="true"></ion-icon> PDF</button>
      <button class="btn ghost sm" (click)="exp('html')" [disabled]="exporting() || !model()" data-testid="preview-export-html">HTML</button>
      <button class="btn ghost sm" (click)="exp('docx')" [disabled]="exporting() || !model()" data-testid="preview-export-docx">DOCX</button>
      <button class="btn ghost sm" (click)="exp('xlsx')" [disabled]="exporting() || !model()" data-testid="preview-export-xlsx">XLSX</button>
    </div>
    @if (warning()) { <div class="banner warn" role="status" data-testid="overflow-warning" style="margin:var(--space-2) var(--page-gutter)">{{ warning() }}</div> }
    @if (error()) { <div class="banner err" role="alert" style="margin:var(--space-2) var(--page-gutter)" data-testid="preview-error">{{ error() }}</div> }

    <div class="preview-viewport" #viewport data-testid="preview-viewport" style="flex:1 1 auto;min-height:0">
      @if (model(); as m) {
        <app-resume-sheet [model]="m" [scale]="scale()" [pages]="pages()" (contentHeight)="onHeight($event)" />
      } @else if (!error()) { <p class="muted">Rendering…</p> }
    </div>
  `,
})
export class PreviewPage implements OnInit {
  id = '';
  model = signal<RenderModel | null>(null);
  error = signal('');
  exporting = signal(false);
  mode = signal<FitMode>('width');
  manual = signal(1);
  scale = signal(1);
  pages = signal(1);
  contentH = signal(0);
  @ViewChild('viewport') viewport?: ElementRef<HTMLElement>;

  constructor(private api: ApiService, private exporter: ExportService, private route: ActivatedRoute) {}

  size() { return this.model()?.page.size ?? 'A4'; }
  warning() { return overflowWarning(this.pages()); }

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.api.renderModel(this.id).subscribe({
      next: (m) => { this.model.set(m); },
      error: (e) => this.error.set(e.status === 404 ? 'Resume not found.' : errorMessage(e)),
    });
  }

  onHeight(h: number) { this.contentH.set(h); this.pages.set(pageCount(h, this.size())); this.refit(); }

  @HostListener('window:resize') refit() {
    const v = this.viewport?.nativeElement;
    if (!v) return;
    this.scale.set(fitScale(this.mode(), this.size(), { w: v.clientWidth, h: v.clientHeight }, this.manual()));
  }

  setFit(m: FitMode) { this.mode.set(m); this.refit(); }
  zoom(d: number) { this.manual.set(clamp(+(this.scale() + d).toFixed(2), 0.25, 2)); this.mode.set('manual'); this.refit(); }

  async exp(format: 'pdf' | 'html' | 'docx' | 'xlsx') {
    this.exporting.set(true);
    await this.exporter.exportAndSave(this.id, this.model()?.header.name || 'resume', format);
    this.exporting.set(false);
  }
}
