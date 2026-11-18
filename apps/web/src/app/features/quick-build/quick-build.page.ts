import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  arrowBackOutline,
  checkmarkCircleOutline,
  downloadOutline,
  layersOutline,
  optionsOutline,
  sparklesOutline,
} from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ExportService } from '../../core/export.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TemplateSummary } from '../../core/models';
import { errorMessage, NotifyService } from '../../core/notify.service';
import { QuickBuildApi, QuickBuildCreated, QuickBuildDecision, QuickBuildPreview } from './quick-build.api';

/** Below this the server rejects the job description, so the form says so first. */
const MIN_JD_LENGTH = 50;

/**
 * Smart Quick Resume Builder.
 *
 * Saved profile + job description + template → one click → an auto-balanced, auto-paginated,
 * ATS-friendly PDF. Every layout decision is deterministic and shown to the user afterwards; AI is
 * an optional text layer for the summary and never touches placement, scores or page breaks.
 */
@Component({
  selector: 'app-quick-build',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonButton, TranslatePipe],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ 'qb.title' | t }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="page-shell qb">
        <a class="back" routerLink="/dashboard" data-testid="qb-back">
          <ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon>
          {{ 'nav.home' | t }}
        </a>

        <header class="head">
          <span class="badge">
            <ion-icon name="sparkles-outline" aria-hidden="true"></ion-icon>
            {{ 'qb.badge' | t }}
          </span>
          <h1>{{ 'qb.title' | t }}</h1>
          <p>{{ 'qb.sub' | t }}</p>
        </header>

        @if (error()) {
          <div class="banner" role="alert" data-testid="qb-error">
            <ion-icon name="alert-circle-outline" aria-hidden="true"></ion-icon>
            <span>{{ error() | t }}</span>
          </div>
        }

        <section class="card" aria-labelledby="qb-form-title">
          <h2 id="qb-form-title">{{ 'qb.jdLabel' | t }}</h2>
          <textarea
            class="jd"
            rows="9"
            data-testid="qb-jd"
            [placeholder]="'qb.jdPlaceholder' | t"
            [ngModel]="jdText()"
            (ngModelChange)="jdText.set($event)"
            [attr.aria-label]="'qb.jdLabel' | t"
          ></textarea>

          <div class="grid">
            <label>
              <span>{{ 'qb.jobTitleLabel' | t }}</span>
              <input
                type="text"
                data-testid="qb-job-title"
                [placeholder]="'qb.jobTitlePlaceholder' | t"
                [ngModel]="jobTitle()"
                (ngModelChange)="jobTitle.set($event)"
              />
            </label>

            <label>
              <span>{{ 'qb.templateLabel' | t }}</span>
              <select data-testid="qb-template" [ngModel]="templateId()" (ngModelChange)="templateId.set($event)">
                <option value="">{{ 'qb.templateAuto' | t }}</option>
                @for (tpl of templates(); track tpl.id) {
                  <option [value]="tpl.id">{{ tpl.name }}</option>
                }
              </select>
            </label>

            <label>
              <span>{{ 'qb.pagesLabel' | t }}</span>
              <select data-testid="qb-pages" [ngModel]="maxPages()" (ngModelChange)="maxPages.set(+$event)">
                <option [ngValue]="1">{{ 'qb.pagesOption' | t: { n: 1 } }}</option>
                <option [ngValue]="2">{{ 'qb.pagesOption' | t: { n: 2 } }}</option>
                <option [ngValue]="3">{{ 'qb.pagesOption' | t: { n: 3 } }}</option>
              </select>
            </label>
          </div>

          <label class="toggle">
            <input type="checkbox" data-testid="qb-use-ai" [ngModel]="useAi()" (ngModelChange)="useAi.set($event)" />
            <span>
              <strong>{{ 'qb.useAiLabel' | t }}</strong>
              <em>{{ 'qb.useAiHint' | t }}</em>
            </span>
          </label>

          <div class="actions">
            <ion-button expand="block" data-testid="qb-preview" [disabled]="busy()" (click)="preview()">
              <ion-icon slot="start" name="options-outline" aria-hidden="true"></ion-icon>
              {{ busy() ? ('qb.busy' | t) : ('qb.preview' | t) }}
            </ion-button>
          </div>
        </section>

        @if (result(); as r) {
          <section class="card result" data-testid="qb-result" aria-live="polite">
            <h2>{{ 'qb.resultTitle' | t }}</h2>

            <div class="chips">
              <span class="chip">
                <ion-icon name="layers-outline" aria-hidden="true"></ion-icon>
                {{ 'qb.metricPages' | t: { n: r.plan.metrics.pageCount } }}
              </span>
              <span class="chip">{{ 'qb.metricFill' | t: { n: fillPercent() } }}</span>
              <span class="chip">{{ 'qb.metricRepairs' | t: { n: r.plan.metrics.repairs } }}</span>
              <span class="chip ok">
                <ion-icon name="checkmark-circle-outline" aria-hidden="true"></ion-icon>
                {{ (r.plan.columns.length > 1 ? 'qb.metricBalance' : 'qb.metricAts') | t }}
              </span>
              <span class="chip">{{ (r.report.summarySource === 'ai' ? 'qb.summaryAi' : 'qb.summaryRule') | t }}</span>
            </div>

            @if (warnings().length) {
              <h3>{{ 'qb.warningsTitle' | t }}</h3>
              <ul class="notes">
                @for (w of warnings(); track w) {
                  <li>{{ w }}</li>
                }
              </ul>
            }

            <h3>{{ 'qb.decisionsTitle' | t }}</h3>
            @if (decisions().length) {
              <ol class="decisions">
                @for (d of decisions(); track $index) {
                  <li>
                    <strong>{{ d.action }}</strong>
                    <span>{{ d.reason }}</span>
                  </li>
                }
              </ol>
            } @else {
              <p class="muted">{{ 'qb.decisionsEmpty' | t }}</p>
            }

            <div class="actions row">
              @if (created(); as c) {
                <ion-button data-testid="qb-download" [disabled]="downloading()" (click)="download()">
                  <ion-icon slot="start" name="download-outline" aria-hidden="true"></ion-icon>
                  {{ 'qb.download' | t }}
                </ion-button>
                <a class="link" [routerLink]="['/resumes', c.resume.id]">{{ 'qb.openEditor' | t }}</a>
              } @else {
                <ion-button data-testid="qb-create" [disabled]="busy()" (click)="create()">
                  <ion-icon slot="start" name="checkmark-circle-outline" aria-hidden="true"></ion-icon>
                  {{ 'qb.create' | t }}
                </ion-button>
              }
              <button type="button" class="ghost" data-testid="qb-reset" (click)="reset()">{{ 'qb.newBuild' | t }}</button>
            </div>
          </section>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    .qb { padding-bottom: 48px; }
    .back { display: inline-flex; align-items: center; gap: 6px; margin: 12px 0 4px; color: var(--c-primary); text-decoration: none; font-weight: 600; min-height: 44px; }
    .head h1 { margin: 8px 0 6px; font-size: 1.7rem; }
    .head p { margin: 0 0 16px; color: var(--c-text-muted, #5b5b6b); max-width: 62ch; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: color-mix(in srgb, var(--c-primary) 12%, transparent); color: var(--c-primary); font-weight: 700; font-size: .8rem; }
    .banner { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-radius: 10px; background: #fdecec; color: #8a1f1f; margin-bottom: 12px; }
    .card { background: var(--c-surface, #fff); border: 1px solid var(--c-border, #e6e4f0); border-radius: 16px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(20, 12, 60, .04); }
    .card h2 { margin: 0 0 10px; font-size: 1.05rem; }
    .card h3 { margin: 16px 0 6px; font-size: .92rem; text-transform: uppercase; letter-spacing: .04em; color: var(--c-text-muted, #5b5b6b); }
    .jd, .grid input, .grid select { width: 100%; border: 1px solid var(--c-border, #d8d5e6); border-radius: 10px; padding: 10px 12px; font: inherit; background: var(--c-bg, #fff); color: inherit; }
    .jd { resize: vertical; min-height: 160px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 12px; }
    .grid label { display: flex; flex-direction: column; gap: 6px; font-weight: 600; font-size: .85rem; }
    .grid input, .grid select { min-height: 44px; }
    .toggle { display: flex; gap: 10px; align-items: flex-start; margin-top: 14px; font-size: .9rem; }
    .toggle input { width: 20px; height: 20px; margin-top: 2px; }
    .toggle em { display: block; font-style: normal; color: var(--c-text-muted, #5b5b6b); font-size: .82rem; }
    .actions { margin-top: 14px; }
    .actions.row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .ghost { background: none; border: 1px solid var(--c-border, #d8d5e6); border-radius: 10px; min-height: 44px; padding: 0 16px; font: inherit; cursor: pointer; }
    .link { color: var(--c-primary); font-weight: 600; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: #f3f1fb; color: #3c3268; font-size: .82rem; font-weight: 600; }
    .chip.ok { background: #e8f7ee; color: #17663a; }
    .decisions { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
    .decisions li span { display: block; color: var(--c-text-muted, #5b5b6b); font-size: .86rem; }
    .notes { margin: 0; padding-left: 18px; color: var(--c-text-muted, #5b5b6b); font-size: .86rem; }
    .muted { color: var(--c-text-muted, #5b5b6b); margin: 0; }
  `],
})
export class QuickBuildPage {
  private readonly api = inject(QuickBuildApi);
  private readonly core = inject(ApiService);
  private readonly exporter = inject(ExportService);
  private readonly notify = inject(NotifyService);

  readonly jdText = signal('');
  readonly jobTitle = signal('');
  readonly templateId = signal('');
  readonly maxPages = signal(2);
  readonly useAi = signal(false);
  readonly templates = signal<TemplateSummary[]>([]);
  readonly busy = signal(false);
  readonly downloading = signal(false);
  readonly error = signal('');
  readonly result = signal<QuickBuildPreview | null>(null);
  readonly created = signal<QuickBuildCreated | null>(null);

  readonly decisions = computed<QuickBuildDecision[]>(() => (this.result()?.plan.decisions ?? []).slice(0, 12));
  readonly warnings = computed<string[]>(() => this.result()?.plan.warnings ?? []);
  readonly fillPercent = computed(() => Math.round((this.result()?.plan.metrics.lastPageFill ?? 0) * 100));

  constructor() {
    addIcons({ alertCircleOutline, arrowBackOutline, checkmarkCircleOutline, downloadOutline, layersOutline, optionsOutline, sparklesOutline });
    void this.loadTemplates();
  }

  private async loadTemplates() {
    try {
      this.templates.set(await firstValueFrom(this.core.listTemplates()));
    } catch {
      // The template picker is optional: Quick Build auto-selects when the list is unavailable.
    }
  }

  private request() {
    return {
      jdText: this.jdText().trim(),
      jobTitle: this.jobTitle().trim() || undefined,
      templateId: this.templateId() || undefined,
      maxPages: this.maxPages(),
      useAi: this.useAi(),
    };
  }

  async preview() {
    if (this.busy()) return;
    this.error.set('');
    this.created.set(null);
    if (this.jdText().trim().length < MIN_JD_LENGTH) {
      this.error.set('qb.errorJd');
      return;
    }
    this.busy.set(true);
    try {
      const preview = await firstValueFrom(this.api.preview(this.request()));
      this.result.set(preview);
    } catch (err) {
      this.report(err);
    } finally {
      this.busy.set(false);
    }
  }

  async create() {
    if (this.busy()) return;
    this.error.set('');
    this.busy.set(true);
    try {
      const created = await firstValueFrom(this.api.create(this.request()));
      this.created.set(created);
      // One click means one click: the PDF is produced from the frozen plan and saved immediately.
      await this.download();
    } catch (err) {
      this.report(err);
    } finally {
      this.busy.set(false);
    }
  }

  async download() {
    const created = this.created();
    if (!created || this.downloading()) return;
    this.downloading.set(true);
    try {
      await this.exporter.exportAndSave(created.resume.id, created.resume.name, 'pdf');
    } finally {
      this.downloading.set(false);
    }
  }

  reset() {
    this.result.set(null);
    this.created.set(null);
    this.error.set('');
    this.jdText.set('');
    this.jobTitle.set('');
  }

  /** 409 means "no career profile yet"; everything else is reported generically. */
  private report(err: unknown) {
    if (err instanceof HttpErrorResponse && err.status === 409) {
      this.error.set('qb.errorProfile');
    } else {
      this.error.set('qb.errorGeneric');
      void this.notify.toast(errorMessage(err), 'error');
    }
  }
}
