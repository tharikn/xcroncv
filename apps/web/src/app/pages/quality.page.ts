import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { playOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { ExportCheckReport, InsightsApi, QualityReview, QualityRow, Severity } from '../core/insights.api';
import { deltaText, findingLocation, READINESS_LABEL, scoreBand, SEVERITY_LABEL } from '../core/insights.format';
import { ResumeSummary, ResumeVersion } from '../core/models';
import { errorMessage } from '../core/notify.service';

type SevFilter = 'all' | Severity;

/** Resume quality and export readiness (docs 20, 31). Deterministic rules; separate from job match. */
@Component({
  selector: 'app-quality',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, RouterLink, DatePipe, DecimalPipe],
  template: `
    <ion-header><ion-toolbar><ion-title>Quality check</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <a class="btn ghost sm" routerLink="/insights" style="align-self:flex-start"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon> Insights</a>
        <div class="page-head"><div><h1>Quality and export check</h1><p>Rule-based review of your resume with the exact place of every finding. It is not a job match score or an employer ATS result.</p></div></div>

        @if (error()) { <div class="banner err" role="alert" data-testid="quality-error">{{ error() }}</div> }
        @if (loading()) { <div class="sk-stack" role="status" aria-busy="true" data-testid="quality-loading"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
        @else if (resumes().length === 0) {
          <div class="empty" data-testid="quality-no-resumes"><h2>You need a resume first</h2><a class="btn" routerLink="/resumes">Go to resumes</a></div>
        } @else {
          <section class="card">
            <div class="form-grid">
              <div class="field"><label for="q-resume">Resume</label>
                <select id="q-resume" data-testid="quality-resume" [ngModel]="resumeId()" (ngModelChange)="onResume($event)">
                  @for (r of resumes(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }
                </select></div>
              <div class="field"><label for="q-version">Version</label>
                <select id="q-version" data-testid="quality-version" [ngModel]="versionId()" (ngModelChange)="versionId.set($event)">
                  <option value="">Working draft (current content)</option>
                  @for (v of versions(); track v.id) { <option [value]="v.id">Version {{ v.versionNumber }}{{ v.changeSummary ? ' - ' + v.changeSummary : '' }}</option> }
                </select></div>
            </div>
            <div class="row"><button class="btn" (click)="run()" [disabled]="busy()" data-testid="run-review"><ion-icon name="play-outline" aria-hidden="true"></ion-icon> {{ busy() ? 'Reviewing…' : 'Run review' }}</button>
              <button class="btn ghost" (click)="runExportCheck()" [disabled]="busy()" data-testid="run-export-check">Check PDF and DOCX text extraction</button></div>
            @if (exportCheck(); as ec) {
              <section class="card" aria-labelledby="ec-h" data-testid="export-check">
                <h2 id="ec-h">Export extraction check</h2>
                <p class="muted small">{{ ec.note }}</p>
                @for (c of ec.checks; track c.format) {
                  <div [attr.data-testid]="'extract-' + c.format">
                    <h3>{{ c.format.toUpperCase() }}: {{ c.ok ? 'text read back cleanly' : 'needs attention' }}</h3>
                    <p class="small">{{ c.wordCoverage * 100 | number: '1.0-1' }}% of words recovered{{ c.pages ? ', ' + c.pages + ' page' + (c.pages === 1 ? '' : 's') : '' }}.</p>
                    @for (f of c.findings; track f.id) { <p class="small wrap" data-testid="extract-finding"><strong>{{ f.title }}.</strong> {{ f.explanation }} {{ f.recommendation }}</p> }
                  </div>
                }
              </section>
            }
          </section>

          @if (review(); as q) {
            <section class="card hero" aria-labelledby="q-h">
              <div [class]="'score ' + band()" role="img" [attr.aria-label]="'Quality score ' + q.score + ' out of 100'"><span class="num" data-testid="quality-score">{{ q.score }}</span><span class="of">/ 100</span></div>
              <div class="grow stack">
                <h2 id="q-h">Quality score</h2>
                <p class="muted small">{{ q.resumeName || 'Resume' }} · {{ q.resumeVersionNumber ? 'version ' + q.resumeVersionNumber : 'working draft' }} · rules {{ q.scoringVersion }} · {{ q.createdAt | date: 'medium' }}</p>
                <div class="banner" [class.warn]="q.readiness !== 'ready'" [class.err]="q.readiness === 'needs_attention'" role="status" data-testid="readiness" [attr.data-readiness]="q.readiness"><strong>Export readiness:</strong> {{ readiness(q.readiness) }}</div>
                <div class="row" data-testid="counts">
                  @for (s of severities; track s) { <span class="badge" [class.warn]="s === 'critical' || s === 'warning'" [attr.data-testid]="'count-' + s">{{ q.counts[s] }} {{ sevLabel(s) }}</span> }
                </div>
              </div>
            </section>

            @if (q.comparison; as c) {
              <section class="banner" role="status" data-testid="comparison" [class.warn]="(c.scoreDelta ?? 0) < 0">
                <strong>Since the previous review:</strong> {{ c.message }} (score change: {{ delta(c.scoreDelta) }})
                @if (c.newFindings.length) { <details><summary>{{ c.newFindings.length }} new</summary><ul>@for (f of c.newFindings; track f.id) { <li>{{ f.title }}</li> }</ul></details> }
                @if (c.resolvedFindings.length) { <details><summary>{{ c.resolvedFindings.length }} resolved</summary><ul>@for (f of c.resolvedFindings; track f.id) { <li>{{ f.title }}</li> }</ul></details> }
              </section>
            }
            @for (l of q.coverage.limitations; track l) { <div class="banner small" data-testid="q-limitation">{{ l }}</div> }

            <section class="card" aria-labelledby="qd-h">
              <h2 id="qd-h">Score by area</h2>
              <ul class="list" data-testid="q-dimensions">
                @for (d of q.dimensions; track d.id) {
                  <li class="dim" [class.na]="!d.applicable" [attr.data-testid]="'qdim-' + d.id">
                    <div class="row between"><strong>{{ d.label }}</strong><span class="small muted">weight {{ d.weight }}%{{ d.applicable ? ' · used ' + d.effectiveWeight + '%' : '' }}</span></div>
                    <div class="bar" role="img" [attr.aria-label]="d.applicable ? d.label + ' ' + d.score : d.label + ' not evaluated'"><span [style.width.%]="d.score ?? 0"></span></div>
                    <div class="row between"><span class="small">{{ d.note }}</span><strong>{{ d.applicable ? d.score : 'N/A' }}</strong></div>
                  </li>
                }
              </ul>
            </section>

            <section class="card" aria-labelledby="qf-h">
              <h2 id="qf-h">Findings</h2>
              <div class="row" role="group" aria-label="Filter findings by severity">
                <button class="chip" [attr.aria-pressed]="sev() === 'all'" (click)="sev.set('all')" data-testid="sev-all">All ({{ q.findings.length }})</button>
                @for (s of severities; track s) { <button class="chip" [attr.aria-pressed]="sev() === s" (click)="sev.set(s)" [attr.data-testid]="'sev-' + s">{{ sevLabel(s) }} ({{ q.counts[s] }})</button> }
              </div>
              @if (q.findings.length === 0) { <div class="banner" data-testid="no-findings">No findings. The rules found nothing to flag. Proofread yourself as well: spelling and grammar are only checked mechanically.</div> }
              @else if (shown().length === 0) { <p class="muted" data-testid="no-shown">No findings at this level.</p> }
              <ul class="list" data-testid="findings">
                @for (f of shown(); track f.id) {
                  <li class="item-card" [attr.data-testid]="'finding-' + f.ruleId" [attr.data-severity]="f.severity">
                    <div class="row between">
                      <strong class="wrap grow">{{ f.title }}</strong>
                      <span class="badge" [class.err]="f.severity === 'critical'" [class.warn]="f.severity === 'warning'" data-testid="finding-severity">{{ sevLabel(f.severity) }}</span>
                    </div>
                    <p class="small muted">{{ location(f) }} · {{ f.category }}</p>
                    @if (f.evidence.text) { <blockquote class="evidence" data-testid="finding-evidence">{{ f.evidence.text }}</blockquote> }
                    <p>{{ f.explanation }}</p>
                    <p class="small">Fix: {{ f.recommendation }}</p>
                    @if (f.requiresUserConfirmation) { <span class="badge" data-testid="confirm-badge">Needs your confirmation. Never change facts you cannot verify.</span> }
                  </li>
                }
              </ul>
            </section>
          }

          <section class="card" aria-labelledby="qh-h">
            <h2 id="qh-h">Review history</h2>
            @if (!historyLoaded()) { <p class="muted" data-testid="q-history-loading">Loading history…</p> }
            @else if (history().length === 0) { <p class="muted" data-testid="q-history-empty">No reviews yet. Run one above.</p> }
            @else {
              <ul class="list" data-testid="q-history">
                @for (h of history(); track h.id) {
                  <li class="row between item-card" [attr.data-testid]="'qh-' + h.id">
                    <span class="grow small">{{ h.createdAt | date: 'medium' }} · {{ h.resumeVersionNumber ? 'version ' + h.resumeVersionNumber : 'working draft' }} · rules {{ h.scoringVersion }}</span>
                    <strong>{{ h.score }}</strong>
                    <button class="btn ghost sm" (click)="open(h.id)" data-testid="open-review">Open</button>
                  </li>
                }
              </ul>
            }
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
    .badge.err { color: var(--c-danger); border-color: var(--c-danger); background: transparent; }
    @media (max-width: 480px) { .score { width: 6.5rem; height: 6.5rem; } .score .num { font-size: 2rem; } }
  `],
})
export class QualityPage implements OnInit {
  resumes = signal<ResumeSummary[]>([]);
  versions = signal<ResumeVersion[]>([]);
  resumeId = signal('');
  versionId = signal('');
  review = signal<QualityReview | null>(null);
  history = signal<QualityRow[]>([]);
  historyLoaded = signal(false);
  loading = signal(true);
  busy = signal(false);
  exportCheck = signal<ExportCheckReport | null>(null);
  error = signal('');
  sev = signal<SevFilter>('all');
  severities: Severity[] = ['critical', 'warning', 'suggestion', 'info'];
  band = computed(() => scoreBand(this.review()?.score ?? 0));
  shown = computed(() => (this.review()?.findings ?? []).filter((f) => this.sev() === 'all' || f.severity === this.sev()));

  constructor(private api: InsightsApi, private core: ApiService, private route: ActivatedRoute) {
    addIcons({ playOutline, shieldCheckmarkOutline });
    // Ionic may reuse a cached instance of this page: follow ?resumeId changes.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((q) => {
      const id = q.get('resumeId');
      if (!this.loading() && id && id !== this.resumeId() && this.resumes().some((r) => r.id === id)) this.onResume(id);
    });
  }

  ngOnInit() { void this.init(); }
  readiness(r: string) { return READINESS_LABEL[r] ?? r; }
  sevLabel(s: Severity) { return SEVERITY_LABEL[s]; }
  delta = deltaText;
  location = findingLocation;

  private async init() {
    try {
      const resumes = await firstValueFrom(this.core.listResumes());
      this.resumes.set(resumes);
      const rid = resumes.find((r) => r.id === this.route.snapshot.queryParamMap.get('resumeId'))?.id ?? resumes[0]?.id ?? '';
      this.resumeId.set(rid); this.loading.set(false);
      if (rid) await this.loadResume(rid);
    } catch (e) { this.error.set(errorMessage(e)); this.loading.set(false); }
  }

  private async loadResume(id: string) {
    this.review.set(null); this.versionId.set(''); this.error.set(''); this.historyLoaded.set(false);
    try { this.versions.set(await firstValueFrom(this.core.listVersions(id))); } catch { this.versions.set([]); }
    await this.loadHistory();
  }
  private async loadHistory() { try { this.history.set(await firstValueFrom(this.api.listQuality(this.resumeId()))); } catch (e) { this.error.set(errorMessage(e)); } finally { this.historyLoaded.set(true); } }

  onResume(id: string) { this.resumeId.set(id); void this.loadResume(id); }

  runExportCheck() {
    this.busy.set(true); this.error.set('');
    this.api.exportCheck(this.resumeId(), this.versionId() || undefined).subscribe({
      next: (r) => { this.busy.set(false); this.exportCheck.set(r); },
      error: (e) => { this.busy.set(false); this.error.set(errorMessage(e)); },
    });
  }

  run() {
    this.busy.set(true); this.error.set('');
    this.api.runQuality(this.resumeId(), this.versionId() || undefined).subscribe({
      next: (r) => { this.busy.set(false); this.review.set(r); this.sev.set('all'); void this.loadHistory(); },
      error: (e) => { this.busy.set(false); this.error.set(errorMessage(e)); },
    });
  }

  open(id: string) {
    this.api.getQuality(id).subscribe({ next: (r) => { this.review.set({ ...r, comparison: null }); this.sev.set('all'); }, error: (e) => this.error.set(errorMessage(e)) });
  }
}
