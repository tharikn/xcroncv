import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ResumeSummary, ResumeVersion } from '../../core/models';
import { errorMessage, NotifyService } from '../../core/notify.service';
import { FeatureApi } from '../common/feature-api';
import { band, bandText, Dimension, HistoryRow, JobRow, ModelInfo, Report, sortItems, statusText } from './ats-engine.format';

/**
 * ATS compatibility score (doc 07). Own score, own version. Separate from Job match (doc 23), Quality (doc 20) and Parsing test (doc 21).
 * Every number is explained: weight, items, evidence from the resume and honest "not found in this resume" wording.
 */
@Component({
  selector: 'app-ats-engine',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, FormsModule, DatePipe, RouterLink],
  template: `
    <ion-header><ion-toolbar><ion-title>ATS score</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head"><div><h1>ATS score</h1>
          <p>An estimate of how readable and relevant this resume is for a job posting. It is separate from your job match, quality and parsing scores.</p></div></div>

        <section class="card" aria-labelledby="ats-src-h" data-testid="ats-source">
          <h2 id="ats-src-h">What do you want to check?</h2>
          @if (loading()) { <p role="status">Loading…</p> }
          @else if (!resumes().length) { <p class="muted" data-testid="ats-no-resumes">You have no resumes yet. <a routerLink="/resumes">Create one</a> first.</p> }
          @else if (!jobs().length) {
            <p class="muted" data-testid="ats-no-jobs">You have no job postings yet. Add one on the <a routerLink="/match" data-testid="ats-add-job">Job match</a> page, review its requirements, then come back.</p>
          } @else {
            <div class="form-grid">
              <div class="field"><label for="ats-resume">Resume</label>
                <select id="ats-resume" [(ngModel)]="resumeId" (ngModelChange)="onResume()" data-testid="ats-resume">
                  @for (r of resumes(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }
                </select></div>
              <div class="field"><label for="ats-version">Version</label>
                <select id="ats-version" [(ngModel)]="versionId" data-testid="ats-version">
                  <option value="">Current working draft</option>
                  @for (v of versions(); track v.id) { <option [value]="v.id">Saved version {{ v.versionNumber }}</option> }
                </select></div>
              <div class="field"><label for="ats-job">Job posting</label>
                <select id="ats-job" [(ngModel)]="jobId" data-testid="ats-job">
                  @for (j of jobs(); track j.id) { <option [value]="j.id">{{ j.title }}{{ j.company ? ' - ' + j.company : '' }}{{ j.confirmationStatus === 'CONFIRMED' ? '' : ' (requirements not confirmed)' }}</option> }
                </select></div>
            </div>
            <p class="muted small">Scored by fixed rules on your resume text. No AI decides the number, and nothing is stored beyond short evidence excerpts.</p>
            <button class="btn" (click)="run()" [disabled]="busy() || !resumeId || !jobId" data-testid="ats-run">Check ATS score</button>
          }
          @if (error()) { <p class="error" role="alert" data-testid="ats-error">{{ error() }}</p> }
          @if (busy()) { <p role="status" data-testid="ats-busy">Scoring…</p> }
        </section>

        @if (report(); as r) {
          <section class="card" aria-labelledby="ats-rep-h" data-testid="ats-report">
            <div class="row between">
              <h2 id="ats-rep-h">{{ r.job.title }}{{ r.job.company ? ' - ' + r.job.company : '' }}</h2>
              <span class="badge" data-testid="ats-version-badge">{{ r.atsVersion }} · taxonomy {{ r.taxonomyVersion }}</span>
            </div>
            <p class="stat" data-testid="ats-score"><strong>{{ r.score }}</strong><span class="muted"> / 100 ATS compatibility estimate</span></p>
            <p class="small"><span class="badge" [class.ok]="r.coverage.confidence === 'high'" [class.warn]="r.coverage.confidence !== 'high'" data-testid="ats-confidence">Confidence: {{ r.coverage.confidence }}</span>
              <span class="muted"> {{ r.resumeVersionNumber ? 'Saved version ' + r.resumeVersionNumber : 'Working draft' }} · {{ r.createdAt | date: 'medium' }}</span></p>
            <p class="muted small" data-testid="ats-disclaimer">{{ r.disclaimer }}</p>
            @if (r.coverage.limitations.length) {
              <details data-testid="ats-limits"><summary>Limits of this score ({{ r.coverage.limitations.length }})</summary>
                <ul>@for (l of r.coverage.limitations; track l) { <li class="small">{{ l }}</li> }</ul></details>
            }
          </section>

          <section class="card" aria-labelledby="ats-dim-h" data-testid="ats-dimensions">
            <h2 id="ats-dim-h">How the score is made</h2>
            <ul class="list">
              @for (d of r.dimensions; track d.id) {
                <li class="item-card" [attr.data-testid]="'dim-' + d.id">
                  <div class="row between"><strong>{{ d.label }}</strong>
                    <span data-testid="dim-score">{{ d.applicable ? d.score + ' / ' + d.maxScore : 'Not applicable' }}</span></div>
                  @if (d.applicable) {
                    <div class="meter" role="img" [attr.aria-label]="d.label + ' ' + d.score + ' out of 100'"><span [style.width.%]="d.score" [class]="'band-' + band(d.score!)"></span></div>
                    <p class="small"><span class="badge" [class.ok]="band(d.score!) === 'good'" [class.warn]="band(d.score!) !== 'good'">{{ bandText(d.score!) }}</span>
                      Weight {{ d.weight }}%{{ d.effectiveWeight !== d.weight ? ' (counts as ' + d.effectiveWeight + '% after redistribution)' : '' }}</p>
                  } @else { <p class="small muted" data-testid="dim-na">{{ d.explanation }}</p> }
                  @if (d.applicable) {
                    <p class="small muted">{{ d.explanation }}</p>
                    <details (toggle)="noop()"><summary>Show {{ d.itemCount }} check{{ d.itemCount === 1 ? '' : 's' }}</summary>
                      <ul>
                        @for (i of itemsOf(r, d); track i.key) {
                          <li class="small" [attr.data-testid]="'item-' + i.key">
                            <span class="badge" [class.ok]="i.points >= 0.8" [class.warn]="i.points < 0.8">{{ statusText(i.status) }}</span> <strong>{{ i.label }}</strong> - {{ i.explanation }}
                            @for (e of i.evidence; track $index) { <div class="muted">Resume evidence ({{ e.section }}{{ e.itemTitle ? ', ' + e.itemTitle : '' }}): "{{ e.excerpt }}"</div> }
                            @if (i.action) { <div>Suggestion: {{ i.action }}</div> }
                          </li>
                        }
                      </ul>
                    </details>
                  }
                </li>
              }
            </ul>
          </section>

          <section class="card" aria-labelledby="ats-sum-h">
            <h2 id="ats-sum-h">Summary</h2>
            <div class="form-grid">
              <div data-testid="ats-strong"><h3>Strong matches</h3>
                @if (r.strongMatches.length) { <ul>@for (s of r.strongMatches; track s) { <li>{{ s }}</li> }</ul> } @else { <p class="muted small">None found yet.</p> }</div>
              <div data-testid="ats-weak"><h3>Weak or not found in this resume</h3>
                @if (r.weakOrMissing.length) { <ul>@for (s of r.weakOrMissing; track s) { <li>{{ s }}</li> }</ul> } @else { <p class="muted small">Nothing weak found.</p> }</div>
            </div>
            <h3>Suggested improvements</h3>
            @if (r.improvements.length) { <ol data-testid="ats-improvements">@for (s of r.improvements; track s) { <li class="small">{{ s }}</li> }</ol> }
            @else { <p class="muted small">No improvements suggested.</p> }
            <p class="muted small">Add a skill only if you really have it. "Not found" is not proof that you lack it.</p>
          </section>
        }

        @if (history().length) {
          <section class="card" aria-labelledby="ats-hi-h" data-testid="ats-history">
            <h2 id="ats-hi-h">Earlier checks for this resume</h2>
            <ul class="list">
              @for (h of history(); track h.id) {
                <li class="row between" [attr.data-testid]="'hist-' + h.id">
                  <span>{{ h.createdAt | date: 'medium' }} · {{ h.jdTitle }} · {{ h.score }}/100 · {{ h.atsVersion }}</span>
                  <span class="row"><button class="btn ghost sm" (click)="open(h)" data-testid="hist-open">Open</button>
                    <button class="btn danger sm" (click)="del(h)" data-testid="hist-delete">Delete</button></span>
                </li>
              }
            </ul>
          </section>
        }

        @if (model(); as m) {
          <section class="card" aria-labelledby="ats-m-h" data-testid="ats-model">
            <h2 id="ats-m-h">About this score ({{ m.atsVersion }})</h2>
            <ul>@for (d of m.dimensions; track d.id) { <li class="small"><strong>{{ d.label }}</strong> ({{ d.weight }}%): {{ d.what }}</li> }</ul>
            <p class="muted small">Weights are initial values and will be tuned with test data. Each report keeps the version it was made with, so old reports never change meaning.</p>
          </section>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    .meter { height: 8px; border-radius: 999px; background: var(--c-surface); border: 1px solid var(--c-border); overflow: hidden; margin: 0.35rem 0; }
    .meter span { display: block; height: 100%; background: var(--c-warn); }
    .meter span.band-good { background: var(--c-ok); }
    .meter span.band-low { background: var(--c-danger); }
  `],
})
export class AtsEnginePage implements OnInit {
  resumes = signal<ResumeSummary[]>([]);
  versions = signal<ResumeVersion[]>([]);
  jobs = signal<JobRow[]>([]);
  history = signal<HistoryRow[]>([]);
  report = signal<Report | null>(null);
  model = signal<ModelInfo | null>(null);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  resumeId = '';
  versionId = '';
  jobId = '';
  readonly band = band;
  readonly bandText = bandText;
  readonly statusText = statusText;

  constructor(private api: FeatureApi, private resumesApi: ApiService, private notify: NotifyService) {}

  ngOnInit() { return this.load(); }
  ionViewWillEnter() { if (!this.loading()) void this.load(); }
  noop() { /* details toggle only */ }

  async load() {
    try {
      const [resumes, jobs, model] = await Promise.all([firstValueFrom(this.resumesApi.listResumes()), this.api.get<JobRow[]>('/job-descriptions'), this.api.get<ModelInfo>('/ats/model').catch(() => null)]);
      this.resumes.set(resumes); this.jobs.set(jobs); this.model.set(model);
      if (!this.resumeId || !resumes.some((r) => r.id === this.resumeId)) this.resumeId = resumes[0]?.id ?? '';
      if (!this.jobId || !jobs.some((j) => j.id === this.jobId)) this.jobId = jobs[0]?.id ?? '';
      await this.onResume();
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  async onResume() {
    this.versionId = '';
    if (!this.resumeId) { this.versions.set([]); this.history.set([]); return; }
    try { this.versions.set(await firstValueFrom(this.resumesApi.listVersions(this.resumeId))); } catch { this.versions.set([]); }
    await this.loadHistory();
  }

  async loadHistory() {
    try { this.history.set(await this.api.get<HistoryRow[]>(`/resumes/${this.resumeId}/ats-reports`)); } catch { this.history.set([]); }
  }

  itemsOf(r: Report, d: Dimension) { return sortItems(r.items.filter((i) => i.dimension === d.id)); }

  async run() {
    this.error.set(''); this.busy.set(true);
    try {
      const body: Record<string, string> = { jobDescriptionId: this.jobId };
      if (this.versionId) body['resumeVersionId'] = this.versionId;
      this.report.set(await this.api.post<Report>(`/resumes/${this.resumeId}/ats-reports`, body));
      await this.loadHistory();
    } catch (e) { this.error.set(errorMessage(e)); }
    finally { this.busy.set(false); }
  }

  async open(h: HistoryRow) {
    try { this.report.set(await this.api.get<Report>(`/ats-reports/${h.id}`)); } catch (e) { this.error.set(errorMessage(e)); }
  }

  async del(h: HistoryRow) {
    if (!(await this.notify.confirm('Delete this report?', 'The saved report is removed. Your resume and job posting are not affected.'))) return;
    try {
      await this.api.del(`/ats-reports/${h.id}`);
      if (this.report()?.id === h.id) this.report.set(null);
      await this.loadHistory();
    } catch (e) { this.error.set(errorMessage(e)); }
  }
}
