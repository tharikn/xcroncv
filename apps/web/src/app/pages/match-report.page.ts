import { DatePipe } from '@angular/common';
import { Component, computed, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, downloadOutline, refreshOutline, trashOutline } from 'ionicons/icons';
import { InsightsApi, MatchItem, MatchReport, MatchStatus } from '../core/insights.api';
import { CONFIDENCE_LABEL, evidenceLocation, reportToText, scoreBand, STATUS_LABEL, TYPE_LABEL } from '../core/insights.format';
import { LocalFileService } from '../core/local-file.service';
import { errorMessage, NotifyService } from '../core/notify.service';

type Filter = 'all' | MatchStatus;

/** Match report (docs 23, 29): score, per-dimension breakdown with weights, and evidence for every requirement. */
@Component({
  selector: 'app-match-report',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, RouterLink, DatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>Match report</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <a class="btn ghost sm" routerLink="/match" style="align-self:flex-start"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon> All matches</a>
        @if (error()) { <div class="banner err" role="alert" data-testid="report-error">{{ error() }}</div> }
        @if (loading()) { <div class="sk-stack" role="status" aria-busy="true" data-testid="report-loading"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
        @if (!loading() && report(); as r) {
          <section class="card hero" aria-labelledby="rep-h">
            <div class="score" [class]="'score ' + band()" role="img" [attr.aria-label]="'Match score ' + r.totalScore + ' out of 100'">
              <span class="num" data-testid="match-score">{{ r.totalScore }}</span><span class="of">/ 100</span>
            </div>
            <div class="grow stack">
              <h1 id="rep-h" class="wrap" data-testid="report-title">{{ r.job.title }}{{ r.job.company ? ' · ' + r.job.company : '' }}</h1>
              <p class="muted">{{ r.resumeName || 'Resume' }} ·
                <span data-testid="report-version">{{ r.resumeVersionNumber ? 'version ' + r.resumeVersionNumber : 'working draft at the time' }}</span>
                · job revision {{ r.jdRevision }} · scoring {{ r.scoringVersion }} · {{ r.createdAt | date: 'medium' }}</p>
              <p class="small muted">Source: {{ r.job.sourceType === 'URL' ? (r.job.sourceDomain || 'public link') : 'pasted text' }} · Requirements {{ r.job.confirmationStatus === 'CONFIRMED' ? 'confirmed by you' : 'not confirmed' }}</p>
              <div class="row">
                <span class="badge" [class.ok]="r.coverage.confidence === 'high'" [class.warn]="r.coverage.confidence !== 'high'" data-testid="coverage-badge">{{ confidence(r.coverage.confidence) }}</span>
                <span class="badge">{{ r.coverage.requirementsEvaluated }} of {{ r.coverage.requirementsIncluded }} requirements evaluated</span>
                <span class="badge">{{ r.coverage.dimensionsApplicable }} of {{ r.coverage.dimensionsTotal }} dimensions applicable</span>
              </div>
            </div>
          </section>

          @if (r.stale) {
            <div class="banner warn" role="status" data-testid="stale-banner">The job requirements were edited after this report. <button class="btn sm" (click)="recalc()" [disabled]="busy()" data-testid="recalc-inline">Recalculate</button></div>
          }
          @for (l of r.coverage.limitations; track l) { <div class="banner" role="status" data-testid="limitation">{{ l }}</div> }
          <p class="banner" data-testid="disclaimer">{{ r.summary.disclaimer }}</p>

          <div class="row">
            <button class="btn ghost sm" (click)="recalc()" [disabled]="busy()" data-testid="recalculate"><ion-icon name="refresh-outline" aria-hidden="true"></ion-icon> Recalculate</button>
            <button class="btn ghost sm" (click)="download()" data-testid="download-summary"><ion-icon name="download-outline" aria-hidden="true"></ion-icon> Save summary</button>
            <a class="btn ghost sm" [routerLink]="['/match']" [queryParams]="{ resumeId: r.resumeId, jd: r.jobDescriptionId }" data-testid="edit-reqs">Edit requirements</a>
            <button class="btn danger sm" (click)="remove()" data-testid="delete-report"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Delete report</button>
          </div>

          <section class="card" aria-labelledby="dim-h">
            <h2 id="dim-h">How the score is built</h2>
            <p class="muted small">Fixed weights. If the job gave nothing to evaluate for a dimension, its weight is shared out among the others (shown as "used weight").</p>
            <ul class="list" data-testid="dimensions">
              @for (d of r.dimensions; track d.id) {
                <li class="dim" [attr.data-testid]="'dim-' + d.id" [class.na]="!d.applicable">
                  <div class="row between"><strong>{{ d.label }}</strong>
                    <span class="small muted">weight {{ d.weight }}%{{ d.applicable ? ' · used ' + d.effectiveWeight + '%' : '' }}</span></div>
                  <div class="bar" role="img" [attr.aria-label]="d.applicable ? d.label + ' ' + d.score + ' out of 100' : d.label + ' not applicable'"><span [style.width.%]="d.score ?? 0"></span></div>
                  <div class="row between"><span class="small">{{ d.explanation }}</span><strong [attr.data-testid]="'dim-score-' + d.id">{{ d.applicable ? d.score : 'N/A' }}</strong></div>
                </li>
              }
            </ul>
          </section>

          @if (r.summary.nextActions.length) {
            <section class="card" aria-labelledby="next-h" data-testid="next-actions"><h2 id="next-h">Suggested next steps</h2>
              <p class="muted small">Only add what is true. "Not found" means not found in this resume, not that you lack the skill.</p>
              <ul>@for (a of r.summary.nextActions; track a) { <li>{{ a }}</li> }</ul></section>
          }

          <section class="card" aria-labelledby="ev-h">
            <h2 id="ev-h">Requirements and evidence</h2>
            <div class="row" role="group" aria-label="Filter by evidence">
              @for (f of filters; track f.id) {
                <button class="chip" [attr.aria-pressed]="filter() === f.id" (click)="filter.set(f.id)" [attr.data-testid]="'filter-' + f.id">{{ f.label }} ({{ count(f.id) }})</button>
              }
            </div>
            @if (shown().length === 0) { <p class="muted" data-testid="no-items">Nothing in this group.</p> }
            <ul class="list" data-testid="items">
              @for (i of shown(); track i.requirementId) {
                <li class="item-card" [attr.data-testid]="'item-' + i.requirementId" [attr.data-status]="i.status">
                  <div class="row between">
                    <strong class="wrap grow">{{ i.label }}</strong>
                    <span class="badge" [class.ok]="i.status === 'exact'" [class.warn]="i.status === 'missing' || i.status === 'partial'" data-testid="item-status">{{ statusLabel(i.status) }}</span>
                  </div>
                  <p class="small muted">{{ typeLabel(i.type) }} · method: {{ i.method.replace('_', ' ') }} · confidence {{ (i.confidence * 100).toFixed(0) }}%</p>
                  <p>{{ i.explanation }}</p>
                  @if (i.sourceText && i.type !== 'derived') { <p class="small muted wrap">From the job: "{{ i.sourceText }}"</p> }
                  @for (e of i.evidence; track $index) {
                    <blockquote class="evidence" data-testid="evidence"><span class="small muted">{{ location(e) }}</span><br />{{ e.excerpt }}</blockquote>
                  }
                  @if (i.action) { <p class="small" data-testid="item-action">Next: {{ i.action }}</p> }
                </li>
              }
            </ul>
          </section>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    .hero { flex-direction: row; flex-wrap: wrap; align-items: center; gap: var(--space-4); }
    .score { display: grid; place-items: center; width: 8rem; height: 8rem; border-radius: 50%; border: 8px solid var(--c-border); flex: none; text-align: center; align-content: center; }
    .score.strong { border-color: var(--c-ok); } .score.fair { border-color: var(--c-warn); } .score.weak { border-color: var(--c-danger); }
    .score .num { font-size: 2.5rem; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; } .score .of { font-size: .8rem; color: var(--c-muted); }
    .dim { display: flex; flex-direction: column; gap: .25rem; }
    .bar { height: .6rem; background: var(--c-surface); border-radius: 999px; overflow: hidden; border: 1px solid var(--c-border); }
    .bar span { display: block; height: 100%; background: var(--c-primary); }
    .evidence { margin: 0; padding: var(--space-2) var(--space-3); border-left: 3px solid var(--c-border); background: var(--c-bg); border-radius: 4px; overflow-wrap: anywhere; }
    @media (max-width: 480px) { .score { width: 6.5rem; height: 6.5rem; } .score .num { font-size: 2rem; } }
  `],
})
export class MatchReportPage implements OnInit {
  report = signal<MatchReport | null>(null);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  filter = signal<Filter>('all');
  id = '';
  filters: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: 'All' }, { id: 'exact', label: 'Strong' }, { id: 'partial', label: 'Partial' }, { id: 'related', label: 'Related' }, { id: 'missing', label: 'Not found' }, { id: 'not_evaluated', label: 'Not evaluated' },
  ];
  band = computed(() => scoreBand(this.report()?.totalScore ?? 0));
  /** Requirement items only count in the filter chips; derived checks show under "All". */
  shown = computed(() => (this.report()?.items ?? []).filter((i) => this.filter() === 'all' || i.status === this.filter()));

  constructor(private api: InsightsApi, private route: ActivatedRoute, private router: Router, private notify: NotifyService, private files: LocalFileService) {
    addIcons({ arrowBackOutline, downloadOutline, refreshOutline, trashOutline });
  }

  ngOnInit() { this.id = this.route.snapshot.paramMap.get('id')!; this.load(); }

  statusLabel(s: MatchStatus) { return STATUS_LABEL[s]; }
  typeLabel(t: MatchItem['type']) { return TYPE_LABEL[t]; }
  confidence(c: string) { return CONFIDENCE_LABEL[c] ?? c; }
  location = evidenceLocation;
  count(f: Filter) { const items = this.report()?.items ?? []; return f === 'all' ? items.length : items.filter((i) => i.status === f).length; }

  load() {
    this.api.getReport(this.id).subscribe({
      next: (r) => { this.report.set(r); this.loading.set(false); },
      error: (e) => { this.error.set(e.status === 404 ? 'This report was not found.' : errorMessage(e)); this.loading.set(false); },
    });
  }

  recalc() {
    this.busy.set(true);
    this.api.recalculate(this.id).subscribe({
      next: (r) => { this.busy.set(false); void this.notify.toast('Recalculated. The earlier report stays in your history.'); void this.router.navigate(['/match/reports', r.id]).then(() => { this.id = r.id; this.report.set(r); }); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  async download() {
    const r = this.report(); if (!r) return;
    try {
      const res = await this.files.save(new Blob([reportToText(r)], { type: 'text/plain' }), `match-${r.job.title}.txt`);
      void this.notify.toast(res.mode === 'native-file' ? 'Saved to your device' : 'Summary downloaded');
    } catch (e) { void this.notify.toast(errorMessage(e), 'error'); }
  }

  async remove() {
    if (!(await this.notify.confirm('Delete this report?', 'The report is permanently deleted. Your resume and the job requirements are not affected.'))) return;
    this.api.deleteReport(this.id).subscribe({
      next: () => { void this.notify.toast('Report deleted'); void this.router.navigate(['/match']); },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }
}
