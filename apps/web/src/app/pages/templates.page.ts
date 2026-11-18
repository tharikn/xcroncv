import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { registerFlowIcons } from '../core/flow.icons';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ApiService } from '../core/api.service';
import { TemplateSummary } from '../core/models';
import { errorMessage, NotifyService } from '../core/notify.service';
import { LocaleService } from '../core/i18n/locale.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { ResumeStepperComponent } from '../shared/resume-stepper.component';
import { TemplateLiveCardComponent } from '../shared/template-live-card.component';
import { TemplatePreviewDialogComponent } from '../shared/template-preview-dialog.component';

/** Separate template gallery route (doc 16/19). With ?resumeId it switches that resume's template (content untouched). */
@Component({
  selector: 'app-templates',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, TranslatePipe, ResumeStepperComponent, TemplateLiveCardComponent, TemplatePreviewDialogComponent],
  template: `
    <ion-header><ion-toolbar><ion-title>{{ 'nav.templates' | t }}</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <app-resume-stepper [current]="2" [resumeId]="resumeId" [reached]="resumeId ? 4 : 2" />
        <div class="page-head">
          <div><h1>{{ 'tpl.title' | t }}</h1>
            <p>{{ (resumeId ? 'tpl.leadResume' : 'tpl.leadNew') | t }}</p></div>
        </div>

        <div class="row" role="group" aria-label="Filter by category">
          <button class="chip" [attr.aria-pressed]="category() === ''" (click)="category.set('')" data-testid="cat-all">All</button>
          @for (c of categories(); track c) {
            <button class="chip" [attr.aria-pressed]="category() === c" (click)="category.set(c)">{{ c }}</button>
          }
        </div>
        <div class="field" style="max-width:24rem"><label for="tsearch">Search templates</label>
          <input id="tsearch" data-testid="template-search" type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Name or keyword" /></div>

        <div class="row" role="group" aria-label="More filters" style="align-items:flex-end">
          <div class="field"><label for="f-ats">ATS profile</label>
            <select id="f-ats" data-testid="filter-ats" [ngModel]="ats()" (ngModelChange)="ats.set($event)">
              <option value="">Any</option><option value="ATS_FIRST">ATS first</option><option value="BALANCED">Balanced</option><option value="VISUAL">Visual / portfolio</option></select></div>
          <div class="field"><label for="f-layout">Layout</label>
            <select id="f-layout" data-testid="filter-layout" [ngModel]="layout()" (ngModelChange)="layout.set($event)">
              <option value="">Any</option><option value="single-column">Single column</option><option value="two-column">Two column</option><option value="timeline">Timeline</option></select></div>
          <div class="field"><label for="f-level">Career level</label>
            <select id="f-level" data-testid="filter-level" [ngModel]="level()" (ngModelChange)="level.set($event)">
              <option value="">Any</option><option value="student">Student</option><option value="entry">Entry</option><option value="mid">Mid</option><option value="senior">Senior</option><option value="executive">Executive</option></select></div>
          <div class="field"><label for="f-style">Style</label>
            <select id="f-style" data-testid="filter-style" [ngModel]="style()" (ngModelChange)="style.set($event)">
              <option value="">Any</option><option value="classic">Classic</option><option value="modern">Modern</option><option value="minimal">Minimal</option><option value="formal">Formal</option><option value="creative">Creative</option></select></div>
          <div class="field"><label for="f-page">Page format</label>
            <select id="f-page" data-testid="filter-page" [ngModel]="page()" (ngModelChange)="page.set($event)">
              <option value="">Any</option><option value="A4">A4</option><option value="LETTER">US Letter</option></select></div>
        </div>
        <p class="muted small" role="status" data-testid="template-count">{{ filtered().length }} of {{ templates().length }} templates</p>

        @if (error()) { <div class="banner err" role="alert">{{ error() }}</div> }
        @if (loading()) { <div class="sk-stack" role="status" aria-busy="true"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
        @else if (filtered().length === 0) {
          <div class="empty" data-testid="templates-empty"><h2>No templates match</h2><button class="btn ghost" (click)="reset()">Clear filters</button></div>
        } @else {
          <div class="grid" data-testid="template-grid">
            @for (t of filtered(); track t.id) {
              <article class="card" [attr.data-testid]="'template-' + t.id">
                <div class="thumb">
                  <app-template-live-card [template]="t" />
                  <div class="overlay" role="group" [attr.aria-label]="'tpl.previewOf' | t: { name: t.name }">
                    <button type="button" class="icon-btn" [attr.data-testid]="'preview-' + t.id" (click)="previewing.set(t)" [attr.aria-label]="'tpl.preview' | t"><ion-icon name="eye-outline" aria-hidden="true"></ion-icon></button>
                    <button type="button" class="icon-btn" data-tour="step-template-action" [attr.data-testid]="'use-' + t.id" (click)="use(t)" [disabled]="busy()" [attr.aria-label]="(resumeId ? 'tpl.useResume' : 'tpl.use') | t"><ion-icon name="checkmark-outline" aria-hidden="true"></ion-icon></button>
                  </div>
                </div>
              </article>
            }
          </div>
        }
      </div>
    </ion-content>
    @if (previewing(); as pt) {
      <app-template-preview-dialog [template]="pt" [busy]="busy()" (close)="previewing.set(null)" (use)="use(pt)" />
    }
  `,
  styles: [`
    .card { border: 0; padding: 0; background: transparent; box-shadow: none; }
    .thumb { position: relative; width: 100%; border-radius: var(--radius); overflow: hidden; }
    .overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: var(--space-3); background: rgba(0, 0, 0, 0.35); opacity: 0; transition: opacity 0.15s ease; pointer-events: none; }
    .thumb:hover .overlay, .thumb:focus-within .overlay { opacity: 1; pointer-events: auto; }
    .overlay .icon-btn { display: inline-grid; place-items: center; width: 2.75rem; height: 2.75rem; border: 1px solid var(--c-border); border-radius: 999px; background: var(--c-bg); color: var(--c-text); cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.25); }
    .overlay .icon-btn:disabled { opacity: 0.45; cursor: default; }
    .overlay .icon-btn ion-icon { font-size: 1.25rem; }
  `],
})
export class TemplatesPage implements OnInit {
  templates = signal<TemplateSummary[]>([]);
  category = signal('');
  query = signal('');
  ats = signal('');
  layout = signal('');
  level = signal('');
  style = signal('');
  page = signal('');
  loading = signal(true);
  busy = signal(false);
  previewing = signal<TemplateSummary | null>(null);
  error = signal('');
  resumeId: string | null;

  categories = computed(() => [...new Set(this.templates().map((t) => t.category))].sort());
  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.templates().filter((t) => (!this.category() || t.category === this.category())
      && (!this.ats() || t.atsProfile === this.ats())
      && (!this.layout() || t.layout === this.layout())
      && (!this.level() || !!t.careerLevels?.includes(this.level()))
      && (!this.style() || t.style === this.style())
      && (!this.page() || t.pageSizes.includes(this.page()))
      && (!q || `${t.name} ${t.description} ${t.tags.join(' ')} ${t.category}`.toLowerCase().includes(q)));
  });

  constructor(private api: ApiService, private route: ActivatedRoute, private router: Router, private notify: NotifyService, private locale: LocaleService) {
    registerFlowIcons();
    this.resumeId = this.route.snapshot.queryParamMap.get('resumeId');
  }

  ngOnInit() {
    this.api.listTemplates().subscribe({
      next: (t) => { this.templates.set(t); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  reset() {
    this.category.set(''); this.query.set(''); this.ats.set(''); this.layout.set('');
    this.level.set(''); this.style.set(''); this.page.set('');
  }

  atsLabel(p: string) { return p === 'ATS_FIRST' ? 'ATS-first' : p === 'BALANCED' ? 'Balanced' : 'Visual / portfolio'; }
  /** Doc 19 s5: warn for layouts that may parse less reliably; never promise a pass. */
  atsWarning(t: TemplateSummary) {
    const why = t.layout === 'two-column' ? 'two columns' : t.theme?.headerBand ? 'a coloured header band' : t.layout === 'timeline' ? 'a timeline layout' : 'extra styling';
    return t.atsProfile === 'VISUAL'
      ? `Presentation-focused: ${why} may parse less reliably in some ATS.`
      : `Balanced: ${why} may parse differently in some ATS.`;
  }

  /** Choosing a template goes straight to Step 3: switch the resume's template, or create the user's CV and open it in the editor. */
  use(t: TemplateSummary) {
    if (this.busy()) return;
    this.busy.set(true);
    if (!this.resumeId) {
      this.api.createResume({ name: this.locale.t('tpl.defaultName', { name: t.name }), templateId: t.id }).subscribe({
        next: (r) => { this.busy.set(false); this.previewing.set(null); void this.router.navigate(['/resumes', r.id]); },
        error: (e) => {
          this.busy.set(false);
          if (e.status === 409) { void this.notify.toast(this.locale.t('tpl.needProfile'), 'error'); void this.router.navigate(['/profile']); return; }
          void this.notify.toast(errorMessage(e), 'error');
        },
      });
      return;
    }
    this.api.updateResume(this.resumeId, { templateId: t.id }).subscribe({
      next: () => { this.busy.set(false); this.previewing.set(null); void this.notify.toast(this.locale.t('tpl.changed', { name: t.name })); void this.router.navigate(['/resumes', this.resumeId]); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }
}
