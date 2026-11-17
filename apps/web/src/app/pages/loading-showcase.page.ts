import { Component, DestroyRef, inject, signal } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { LoadingOverlayService } from '../shared/loading/loading-overlay.service';
import { ProgressBarComponent } from '../shared/loading/progress-bar.component';
import { SkeletonComponent } from '../shared/loading/skeleton.component';
import { SpinnerComponent } from '../shared/loading/spinner.component';

/** Live catalogue of the reusable loading indicators; also serves as a visual regression surface. */
@Component({
  selector: 'app-loading-showcase',
  standalone: true,
  imports: [IonContent, IonHeader, IonTitle, IonToolbar, TranslatePipe, SpinnerComponent, ProgressBarComponent, SkeletonComponent],
  styles: [`
    .demo-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4); }
    .demo-box { display: inline-flex; padding: var(--space-2); border-radius: 8px; background: var(--c-primary); }
    .demo-progress-stack { display: flex; flex-direction: column; gap: var(--space-5); padding-block: var(--space-2); }
    .demo-stage { position: relative; overflow: hidden; min-height: 8rem; margin-top: var(--space-3); padding: var(--space-4); border: 1px dashed var(--c-border); border-radius: var(--radius); background: var(--c-surface); display: flex; flex-direction: column; gap: var(--space-3); }
    .demo-stage > .grid { align-self: stretch; }
    h3 { margin-top: var(--space-2); }
  `],
  template: `
    <ion-header><ion-toolbar><ion-title>{{ 'load.title' | t }}</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head"><div><h1>{{ 'load.title' | t }}</h1><p>{{ 'load.lead' | t }}</p></div></div>

        <section class="card" aria-labelledby="load-spin-h">
          <h2 id="load-spin-h">{{ 'load.spinners' | t }}</h2>
          <p class="muted small">{{ 'load.spinnersLead' | t }}</p>

          <h3>{{ 'load.sizes' | t }}</h3>
          <div class="demo-row">
            <app-spinner size="sm" [showLabel]="false" />
            <app-spinner size="md" [showLabel]="false" />
            <app-spinner size="lg" [showLabel]="false" />
            <app-spinner size="xl" [showLabel]="false" />
          </div>

          <h3>{{ 'load.tones' | t }}</h3>
          <div class="demo-row">
            <app-spinner tone="primary" [showLabel]="false" />
            <app-spinner tone="brand" [showLabel]="false" />
            <span class="demo-box"><app-spinner tone="light" [showLabel]="false" /></span>
          </div>

          <h3>{{ 'load.inline' | t }}</h3>
          <div class="demo-row">
            <app-spinner labelKey="common.loading" />
            <app-spinner tone="brand" labelKey="common.working" [stack]="true" />
          </div>

          <h3>{{ 'load.inButton' | t }}</h3>
          <div class="demo-row">
            <button class="btn" type="button" disabled><app-spinner size="sm" tone="light" [showLabel]="false" /> {{ 'common.working' | t }}</button>
          </div>
        </section>

        <section class="card" aria-labelledby="load-overlay-h">
          <h2 id="load-overlay-h">{{ 'load.overlay' | t }}</h2>
          <p class="muted small">{{ 'load.overlayLead' | t }}</p>
          <div class="demo-row">
            <button class="btn" type="button" (click)="showGlobal()" data-testid="load-global">{{ 'load.showGlobal' | t }}</button>
            <button class="btn ghost" type="button" (click)="toggleLocal()" data-testid="load-local">{{ 'load.showLocal' | t }}</button>
          </div>
          <div class="demo-stage">
            <p class="muted small">{{ 'load.localTitle' | t }}</p>
            <div class="grid stats">
              <div class="card flat"><span class="muted small">{{ 'dash.resumes' | t }}</span><span class="stat">12</span></div>
              <div class="card flat"><span class="muted small">{{ 'dash.templates' | t }}</span><span class="stat">100</span></div>
            </div>
            @if (localOverlay()) { <app-spinner overlay tone="brand" size="lg" labelKey="load.uploading" /> }
          </div>
        </section>

        <section class="card" aria-labelledby="load-progress-h">
          <h2 id="load-progress-h">{{ 'load.progressBars' | t }}</h2>
          <p class="muted small">{{ 'load.progressLead' | t }}</p>
          <div class="demo-progress-stack">
            <app-progress-bar [value]="42" labelKey="load.uploading" />
            <app-progress-bar [value]="78" labelKey="load.exporting" variant="primary" size="sm" />
            <app-progress-bar [value]="null" labelKey="load.uploading" />
            <app-progress-bar [value]="progress()" labelKey="load.uploading" />
          </div>
          <div class="demo-row">
            <button class="btn" type="button" (click)="toggleUpload()" data-testid="load-upload">{{ (running() ? 'load.stop' : 'load.simulate') | t }}</button>
            <button class="btn ghost" type="button" (click)="reset()" data-testid="load-reset">{{ 'load.reset' | t }}</button>
          </div>
        </section>

        <section class="card" aria-labelledby="load-skel-h">
          <h2 id="load-skel-h">{{ 'load.skeletons' | t }}</h2>
          <p class="muted small">{{ 'load.skeletonsLead' | t }}</p>

          <h3>{{ 'load.textLines' | t }}</h3>
          <app-skeleton variant="text" [lines]="4" [heading]="true" />

          <h3>{{ 'load.cardShape' | t }}</h3>
          <div class="grid"><app-skeleton variant="card" /><app-skeleton variant="card" /></div>

          <h3>{{ 'load.shapes' | t }}</h3>
          <div class="demo-row">
            <app-skeleton variant="avatar" />
            <app-skeleton variant="circle" />
            <app-skeleton variant="button" />
            <app-skeleton variant="title" width="10rem" />
            <app-skeleton variant="block" width="8rem" height="3rem" />
          </div>

          <h3>{{ 'load.static' | t }}</h3>
          <app-skeleton variant="text" [lines]="2" [animated]="false" />
        </section>

        <section class="card flat" aria-labelledby="load-when-h">
          <h2 id="load-when-h">{{ 'load.usageTitle' | t }}</h2>
          <ul class="list">
            <li>{{ 'load.usage.spinner' | t }}</li>
            <li>{{ 'load.usage.progress' | t }}</li>
            <li>{{ 'load.usage.skeleton' | t }}</li>
          </ul>
        </section>
      </div>
    </ion-content>
  `,
})
export class LoadingShowcasePage {
  private readonly overlay = inject(LoadingOverlayService);
  private readonly destroyRef = inject(DestroyRef);

  readonly progress = signal(0);
  readonly running = signal(false);
  readonly localOverlay = signal(false);

  private uploadTimer: ReturnType<typeof setInterval> | null = null;
  private globalTimer: ReturnType<typeof setTimeout> | null = null;
  private localTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => { this.stopUpload(); this.clearTimers(); });
  }

  toggleUpload() { this.running() ? this.stopUpload() : this.startUpload(); }

  reset() { this.stopUpload(); this.progress.set(0); }

  showGlobal() {
    if (this.globalTimer) clearTimeout(this.globalTimer);
    this.overlay.show('load.uploading');
    this.globalTimer = setTimeout(() => { this.overlay.hide(); this.globalTimer = null; }, 2000);
  }

  toggleLocal() {
    if (this.localTimer) {
      clearTimeout(this.localTimer); this.localTimer = null; this.localOverlay.set(false); return;
    }
    this.localOverlay.set(true);
    this.localTimer = setTimeout(() => { this.localOverlay.set(false); this.localTimer = null; }, 2000);
  }

  private startUpload() {
    this.stopUpload();
    this.progress.set(0);
    this.running.set(true);
    this.uploadTimer = setInterval(() => {
      const next = this.progress() + 6 + Math.floor(Math.random() * 10);
      if (next >= 100) { this.progress.set(100); this.stopUpload(); } else { this.progress.set(next); }
    }, 320);
  }

  private stopUpload() {
    if (this.uploadTimer) clearInterval(this.uploadTimer);
    this.uploadTimer = null;
    this.running.set(false);
  }

  private clearTimers() {
    if (this.globalTimer) clearTimeout(this.globalTimer);
    if (this.localTimer) clearTimeout(this.localTimer);
  }
}
