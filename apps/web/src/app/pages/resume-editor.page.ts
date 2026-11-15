import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ApiService } from '../core/api.service';
import { ExportService } from '../core/export.service';
import { registerFlowIcons } from '../core/flow.icons';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import {
  Overrides, RenderModel, Resume, ResumeStatus, ResumeVersion, SECTION_LABELS, SectionConfig, TemplateSummary,
} from '../core/models';
import { errorMessage, NotifyService } from '../core/notify.service';
import { moveItem } from '../core/profile-mapper';
import { ResumeSheetComponent } from '../shared/resume-sheet.component';
import { ResumeStepperComponent, StepId } from '../shared/resume-stepper.component';

@Component({
  selector: 'app-resume-editor',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, RouterLink, DatePipe, TranslatePipe, ResumeSheetComponent, ResumeStepperComponent],
  template: `
    <ion-header><ion-toolbar><ion-title>Edit resume</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="row"><a class="btn ghost sm" routerLink="/resumes"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon> All resumes</a></div>
        <app-resume-stepper [current]="step()" [resumeId]="id" [reached]="4" />
        @if (error()) { <div class="banner err" role="alert" data-testid="editor-error">{{ error() }}</div> }
        @if (conflict()) { <div class="banner warn" role="alert" data-testid="editor-conflict">This resume was changed somewhere else, so your save was not applied. Your edits are still here.
          <button class="btn ghost sm" data-testid="editor-reload" (click)="reloadLatest()">Load the latest (discard my edits)</button></div> }
        @if (!r() && !error()) { <p class="muted">Loading…</p> }

        @if (r(); as res) {
          <div class="page-head">
            <h1 class="wrap">{{ res.name }}</h1>
            <span class="badge" [class.warn]="isDirty()" [class.ok]="!isDirty()" data-testid="save-state" role="status">
              {{ saving() ? 'Saving…' : isDirty() ? 'Unsaved changes' : 'All changes saved' }}</span>
          </div>

          @if (step() === 3) {
          <div class="editor-grid" data-testid="editor-grid">
            <div class="editor-main">
              <section class="card" aria-labelledby="det-h">
                <h2 id="det-h">Details</h2>
                <div class="form-grid">
                  <div class="field" [class.invalid]="!name.trim()"><label for="rn">Resume name *</label><input id="rn" data-testid="editor-name" [(ngModel)]="name" maxlength="100" /></div>
                  <div class="field"><label for="rr">Target role</label><input id="rr" data-testid="editor-role" [(ngModel)]="role" maxlength="100" /></div>
                  <div class="field"><label for="rs">Status</label>
                    <select id="rs" data-testid="editor-status" [(ngModel)]="status"><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></div>
                  <div class="field"><span class="label">Template</span>
                    <div class="row"><span data-testid="editor-template" class="wrap">{{ templateName() }} (v{{ res.templateVersion }})</span>
                      <a class="btn ghost sm" [routerLink]="['/templates']" [queryParams]="{ resumeId: res.id }" data-testid="change-template">Change</a></div></div>
                </div>
              </section>
              <section class="card" aria-label="Preview" data-testid="editor-live-preview" data-tour="editor-canvas">
                <p class="muted small">{{ 'ed.previewNote' | t }}</p>
                @if (model(); as m) { <div class="paper"><app-resume-sheet [model]="m" [fitWidth]="true" /></div> }
                @else { <p class="muted">{{ 'ed.previewLoading' | t }}</p> }
              </section>
            </div>
            @if (panelOpen()) { <div class="sheet-backdrop" (click)="panelOpen.set(false)" data-testid="panel-backdrop"></div> }
            <aside class="side-panel" [class.open]="panelOpen()" [attr.aria-label]="'ed.panelAria' | t" data-testid="side-panel" data-tour="editor-side-panel">
              <div class="panel-head"><strong>{{ 'ed.customize' | t }}</strong>
                <button class="btn ghost sm icon" type="button" (click)="panelOpen.set(false)" [attr.aria-label]="'ed.closePanel' | t" data-testid="panel-close"><ion-icon name="close-outline" aria-hidden="true"></ion-icon></button></div>
              <section class="pcard" aria-labelledby="sec-h">
                <h2 id="sec-h">{{ 'ed.sections' | t }}</h2>
                <p class="muted small">Show, hide and reorder the sections of this resume. Content is edited in your <a routerLink="/profile">career profile</a>.</p>
                <ul class="list" data-testid="section-list">
                  @for (s of sections; track s.type; let i = $index) {
                    <li class="item-card" [attr.data-testid]="'section-' + s.type">
                      <div class="row between">
                        <label class="checkbox grow"><input type="checkbox" [(ngModel)]="s.visible" [attr.data-testid]="'visible-' + s.type" /> {{ label(s.type) }}</label>
                        <div class="row">
                          <button class="btn ghost sm icon" (click)="shift(i, -1)" [disabled]="i === 0" [attr.aria-label]="'Move ' + label(s.type) + ' up'" [attr.data-testid]="'up-' + s.type"><ion-icon name="chevron-up-outline" aria-hidden="true"></ion-icon></button>
                          <button class="btn ghost sm icon" (click)="shift(i, 1)" [disabled]="i === sections.length - 1" [attr.aria-label]="'Move ' + label(s.type) + ' down'" [attr.data-testid]="'down-' + s.type"><ion-icon name="chevron-down-outline" aria-hidden="true"></ion-icon></button>
                        </div>
                      </div>
                    </li>
                  }
                </ul>
              </section>
              <section class="pcard" aria-labelledby="des-h">
                <h2 id="des-h">{{ 'ed.design' | t }}</h2>
                <div class="form-grid">
                  <div class="field"><label for="acc">Accent colour</label>
                    <div class="row"><input id="acc" data-testid="accent" type="color" [ngModel]="accent()" (ngModelChange)="ov.accent = $event" style="width:4rem" />
                      <button class="btn ghost sm" (click)="ov.accent = undefined">Template default</button></div></div>
                  <div class="field"><label for="bs">Base font size: {{ ov.baseSizePt ?? templateSize() }} pt</label>
                    <input id="bs" data-testid="base-size" type="range" min="9" max="12" step="0.5" [ngModel]="ov.baseSizePt ?? templateSize()" (ngModelChange)="ov.baseSizePt = +$event" /></div>
                  <div class="field"><label for="ps">Page size</label>
                    <select id="ps" data-testid="page-size" [ngModel]="ov.pageSize ?? 'A4'" (ngModelChange)="ov.pageSize = $event"><option value="A4">A4</option><option value="LETTER">US Letter</option></select></div>
                </div>
              </section>
              <section class="pcard" aria-labelledby="ver-h">
                <div class="group-title"><h2 id="ver-h">{{ 'ed.versions' | t }}</h2>
                  <button class="btn ghost sm" data-testid="save-version" (click)="saveVersion()" [disabled]="isDirty()" [attr.title]="isDirty() ? 'Save changes first' : null"><ion-icon name="copy-outline" aria-hidden="true"></ion-icon> Save a version</button></div>
                @if (versions().length === 0) { <p class="muted small" data-testid="no-versions">No saved versions yet. A version is an immutable snapshot you can return to.</p> }
                <ul class="list" data-testid="version-list">
                  @for (v of versions(); track v.id) {
                    <li class="row between"><span>Version {{ v.versionNumber }}<span class="muted small"> · {{ v.createdAt | date: 'medium' }}</span></span><span class="muted small wrap">{{ v.changeSummary }}</span></li>
                  }
                </ul>
              </section>
            </aside>
          </div>
          } @else {
          <section class="card" aria-labelledby="exp-h" data-testid="export-step">
            <h2 id="exp-h">{{ 'ed.exportTitle' | t }}</h2>
            <p class="muted">{{ 'ed.exportLead' | t }}</p>
            <div class="row">
              <button class="btn" data-tour="step-export-action" data-testid="export-pdf" (click)="exp('pdf')" [disabled]="exporting() || saving()"><ion-icon name="cloud-download-outline" aria-hidden="true"></ion-icon> {{ 'ed.exportPdf' | t }}</button>
              <button class="btn ghost" data-testid="back-to-edit" (click)="goStep(3)">{{ 'ed.backToEdit' | t }}</button>
            </div>
            <div class="more" data-testid="more-formats">
              <p class="muted small">{{ 'ed.moreFormats' | t }}</p>
              <div class="row">
                <button class="btn ghost" data-testid="export-html" (click)="exp('html')" [disabled]="exporting()"><ion-icon name="cloud-download-outline" aria-hidden="true"></ion-icon> HTML</button>
                <button class="btn ghost" data-testid="export-docx" (click)="exp('docx')" [disabled]="exporting()"><ion-icon name="cloud-download-outline" aria-hidden="true"></ion-icon> DOCX</button>
                <button class="btn ghost" data-testid="export-xlsx" (click)="exp('xlsx')" [disabled]="exporting()"><ion-icon name="cloud-download-outline" aria-hidden="true"></ion-icon> XLSX</button>
                <a class="btn ghost" routerLink="/files" data-testid="export-folder-options">Save location</a>
              </div>
            </div>
          </section>
          }
        }
      </div>
    </ion-content>
    @if (r() && step() === 3) {
      <div class="sticky-actions" data-testid="editor-actions">
        <button class="btn" data-testid="editor-save" (click)="save()" [disabled]="saving() || !isDirty() || !name.trim()"><ion-icon name="save-outline" aria-hidden="true"></ion-icon> Save</button>
        <button class="btn ghost panel-toggle" data-testid="open-panel" (click)="panelOpen.set(true)"><ion-icon name="color-palette-outline" aria-hidden="true"></ion-icon> {{ 'ed.customize' | t }}</button>
        <button class="btn ghost" data-testid="editor-preview" (click)="preview()"><ion-icon name="eye-outline" aria-hidden="true"></ion-icon> Preview</button>
        <span class="grow"></span>
        <button class="btn" data-tour="step-edit-action" data-testid="continue-export" (click)="continueToExport()" [disabled]="saving() || !name.trim()">{{ 'ed.continueExport' | t }} <ion-icon name="arrow-forward-outline" aria-hidden="true"></ion-icon></button>
      </div>
    }
  `,
  styles: [`
    .editor-grid { display: grid; gap: var(--space-4); grid-template-columns: minmax(0, 1fr); align-items: start; }
    .editor-main { display: grid; gap: var(--space-4); min-width: 0; }
    .paper { background: var(--c-surface); padding: var(--space-3); border-radius: var(--radius); }
    .pcard { border-bottom: 1px solid var(--c-border); padding: var(--space-3) 0; }
    .pcard:last-child { border-bottom: 0; }
    .pcard h2 { font-size: 1rem; margin: 0 0 var(--space-2); }
    .panel-head { display: flex; align-items: center; justify-content: space-between; }
    .more { margin-top: var(--space-4); }
    .sheet-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 20; }
    /* Mobile / Android: the panel is a bottom sheet opened by the Customize button. */
    .side-panel { position: fixed; left: 0; right: 0; bottom: 0; max-height: 80vh; overflow: auto; z-index: 21; background: var(--c-bg); border-top: 1px solid var(--c-border); border-radius: var(--radius) var(--radius) 0 0; padding: var(--space-3) var(--page-gutter); padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom)); transform: translateY(100%); visibility: hidden; transition: transform 0.2s ease, visibility 0.2s; }
    .side-panel.open { transform: none; visibility: visible; }
    @media (min-width: 48rem) {
      .editor-grid { grid-template-columns: minmax(0, 1fr) 20rem; }
      .side-panel { position: sticky; top: var(--space-3); max-height: calc(100vh - 8rem); transform: none; visibility: visible; border: 1px solid var(--c-border); border-radius: var(--radius); z-index: auto; padding: var(--space-3) var(--space-4); }
      .panel-head { display: none; }
      .panel-toggle, .sheet-backdrop { display: none; }
    }
    @media (prefers-reduced-motion: reduce) { .side-panel { transition: none; } }
  `],
})
export class ResumeEditorPage implements OnInit, OnDestroy {
  id = '';
  r = signal<Resume | null>(null);
  templates = signal<TemplateSummary[]>([]);
  versions = signal<ResumeVersion[]>([]);
  error = signal('');
  saving = signal(false);
  conflict = signal(false);
  exporting = signal(false);
  /** Flow step: 3 = edit template, 4 = export (selected with ?step=export). */
  step = signal<StepId>(3);
  panelOpen = signal(false);
  model = signal<RenderModel | null>(null);
  private sub?: Subscription;

  name = ''; role = ''; status: ResumeStatus = 'DRAFT';
  sections: SectionConfig[] = [];
  ov: Overrides = {};
  private snapshot = '';

  constructor(private api: ApiService, private notify: NotifyService, private exporter: ExportService, private router: Router, private route: ActivatedRoute) {}

  ngOnInit() {
    registerFlowIcons();
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.sub = this.route.queryParamMap.subscribe((q) => { this.step.set(q.get('step') === 'export' ? 4 : 3); this.panelOpen.set(false); });
  }
  ngOnDestroy() { this.sub?.unsubscribe(); }

  goStep(n: 3 | 4) { void this.router.navigate(['/resumes', this.id], { queryParams: n === 4 ? { step: 'export' } : {} }); }

  /** Step 3 -> 4: saves pending edits first so the export matches what the user sees. */
  async continueToExport() {
    if (this.isDirty() && this.name.trim()) {
      const ok = await new Promise<boolean>((resolve) => {
        this.saving.set(true);
        this.persist().subscribe({ next: (res) => { this.apply(res); this.saving.set(false); resolve(true); }, error: (e) => { this.failed(e); resolve(false); } });
      });
      if (!ok) return;
    }
    this.goStep(4);
  }

  private loadModel() { this.api.renderModel(this.id).subscribe({ next: (m) => this.model.set(m), error: () => this.model.set(null) }); }

  /** Ionic caches pages in its stack, so reload on every entry (e.g. returning from the template gallery). */
  ionViewWillEnter() {
    this.api.listTemplates().subscribe((t) => this.templates.set(t));
    this.api.getResume(this.id).subscribe({
      next: (res) => {
        if (!this.r() || !this.isDirty()) { this.apply(res); this.loadVersions(); }
        else this.r.update((cur) => (cur ? { ...cur, templateId: res.templateId, templateVersion: res.templateVersion, updatedAt: res.updatedAt } : cur)); // keep unsaved edits; adopt the template change's updatedAt so the next save is not a false conflict
      },
      error: (e) => this.error.set(e.status === 404 ? 'Resume not found.' : errorMessage(e)),
    });
  }

  private apply(res: Resume) {
    this.r.set(res); this.name = res.name; this.role = res.targetRole ?? ''; this.status = res.status;
    this.sections = res.sections.map((s) => ({ ...s })); this.ov = { ...res.overrides };
    this.snapshot = this.json();
    this.loadModel();
  }
  private cleanOv(): Overrides {
    const o: Overrides = {};
    if (this.ov.accent) o.accent = this.ov.accent;
    if (this.ov.baseSizePt) o.baseSizePt = this.ov.baseSizePt;
    if (this.ov.pageSize) o.pageSize = this.ov.pageSize;
    return o;
  }
  private json() { return JSON.stringify({ n: this.name.trim(), r: this.role.trim(), s: this.status, sec: this.sections, o: this.cleanOv() }); }
  isDirty() { return !!this.r() && this.json() !== this.snapshot; }

  label(t: string) { return SECTION_LABELS[t as keyof typeof SECTION_LABELS] ?? t; }
  tpl() { return this.templates().find((t) => t.id === this.r()?.templateId); }
  templateName() { return this.tpl()?.name ?? this.r()?.templateId ?? ''; }
  accent() { return this.ov.accent ?? this.tpl()?.theme?.accent ?? '#000000'; }
  templateSize() { return this.tpl()?.theme?.baseSizePt ?? 10.5; }
  shift(i: number, d: number) { this.sections = moveItem(this.sections, i, i + d); }

  /** Saves through the concurrency-checked draft endpoint (a stale editor gets a 409 instead of overwriting newer work). */
  private persist() {
    return this.api.saveDraft(this.id, { name: this.name.trim(), targetRole: this.role.trim(), status: this.status, sections: this.sections, overrides: this.cleanOv() }, this.r()!.updatedAt);
  }
  private failed(e: { status?: number }) {
    this.saving.set(false);
    if (e.status === 409) { this.conflict.set(true); return; }
    void this.notify.toast(errorMessage(e), 'error');
  }
  reloadLatest() { this.conflict.set(false); this.api.getResume(this.id).subscribe((res) => { this.apply(res); this.loadVersions(); }); }

  save() {
    if (!this.name.trim()) return;
    this.saving.set(true); this.conflict.set(false);
    this.persist().subscribe({
      next: (res) => { this.apply(res); this.saving.set(false); void this.notify.toast('Resume saved'); },
      error: (e) => this.failed(e),
    });
  }

  private loadVersions() { this.api.listVersions(this.id).subscribe((v) => this.versions.set(v)); }

  saveVersion() {
    this.api.createVersion(this.id).subscribe({
      next: () => { void this.notify.toast('Version saved'); this.loadVersions(); },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }

  async preview() {
    let blocked = false;
    if (this.isDirty() && this.name.trim()) await new Promise<void>((resolve) => {
      this.saving.set(true);
      this.persist().subscribe({ next: (res) => { this.apply(res); this.saving.set(false); resolve(); }, error: (e) => { this.failed(e); blocked = e.status === 409; resolve(); } });
    });
    if (blocked) return; // never preview a version that was not saved because of a conflict
    void this.router.navigate(['/resumes', this.id, 'preview']);
  }

  async exp(format: 'pdf' | 'html' | 'docx' | 'xlsx') {
    this.exporting.set(true);
    await this.exporter.exportAndSave(this.id, this.name || 'resume', format);
    this.exporting.set(false);
  }
}
