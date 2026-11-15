import { DatePipe } from '@angular/common';
import { Component, computed, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, analyticsOutline, trashOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { ImportResult, InsightsApi, JobDescription, MatchReportRow, Requirement, RequirementType } from '../core/insights.api';
import { groupRequirements, includedCount, newRequirement, toRequirementInput } from '../core/insights.format';
import { ResumeSummary, ResumeVersion } from '../core/models';
import { errorMessage, NotifyService } from '../core/notify.service';

/**
 * Resume Match (docs 23, 29). Flow: choose resume version -> paste (or import) a job description -> review and confirm the extracted
 * requirements -> deterministic, evidence-linked score. No AI decides the score.
 */
@Component({
  selector: 'app-match',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, RouterLink, DatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>Job match</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <a class="btn ghost sm" routerLink="/insights" style="align-self:flex-start"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon> Insights</a>
        <div class="page-head"><div><h1>Match a resume to a job</h1><p>See which job requirements are backed by evidence in your resume. This is an alignment check, not a hiring prediction.</p></div></div>

        @if (error()) { <div class="banner err" role="alert" data-testid="match-error">{{ error() }}</div> }
        @if (loading()) { <div class="sk-stack" role="status" aria-busy="true" data-testid="match-loading"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
        @else if (resumes().length === 0) {
          <div class="empty" data-testid="match-no-resumes"><h2>You need a resume first</h2><p class="muted">Create a resume, then match it to a job description.</p><a class="btn" routerLink="/resumes">Go to resumes</a></div>
        } @else {
          <section class="card" aria-labelledby="m-step1">
            <h2 id="m-step1">1. Choose the resume version</h2>
            <div class="form-grid">
              <div class="field"><label for="m-resume">Resume</label>
                <select id="m-resume" data-testid="match-resume" [ngModel]="resumeId()" (ngModelChange)="onResume($event)">
                  @for (r of resumes(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }
                </select></div>
              <div class="field"><label for="m-version">Version</label>
                <select id="m-version" data-testid="match-version" [ngModel]="versionId()" (ngModelChange)="versionId.set($event)">
                  <option value="">Working draft (current content)</option>
                  @for (v of versions(); track v.id) { <option [value]="v.id">Version {{ v.versionNumber }}{{ v.changeSummary ? ' - ' + v.changeSummary : '' }}</option> }
                </select>
                <span class="hint">The report is tied to exactly this version. Save a version in the editor to freeze it.</span></div>
            </div>
          </section>

          @if (!jd()) {
            <section class="card" aria-labelledby="m-step2">
              <h2 id="m-step2">2. Add the job description</h2>
              <div class="row" role="group" aria-label="How to add the job">
                <button class="chip" [attr.aria-pressed]="mode() === 'paste'" (click)="mode.set('paste')" data-testid="mode-paste">Paste text</button>
                <button class="chip" [attr.aria-pressed]="mode() === 'url'" (click)="mode.set('url')" data-testid="mode-url">Public job link</button>
              </div>

              @if (mode() === 'paste') {
                <div class="form-grid" data-testid="paste-form">
                  <div class="field" [class.invalid]="touched() && !title.trim()"><label for="jd-title">Job title *</label><input id="jd-title" data-testid="jd-title" [(ngModel)]="title" maxlength="160" placeholder="Senior Backend Engineer" /></div>
                  <div class="field"><label for="jd-company">Company</label><input id="jd-company" data-testid="jd-company" [(ngModel)]="company" maxlength="120" /></div>
                  <div class="field"><label for="jd-location">Location</label><input id="jd-location" data-testid="jd-location" [(ngModel)]="location" maxlength="120" /></div>
                  <div class="field full" [class.invalid]="touched() && text.trim().length < 20"><label for="jd-text">Job description *</label>
                    <textarea id="jd-text" data-testid="jd-text" rows="10" [(ngModel)]="text" maxlength="30000" placeholder="Paste the full posting: responsibilities, requirements, nice-to-haves."></textarea>
                    <span class="hint">{{ text.length }} / 30000. Treated as untrusted text.</span></div>
                  <label class="checkbox full"><input type="checkbox" data-testid="jd-retain" [(ngModel)]="retain" /> Keep the original text so I can re-read it later (off by default: only the requirements are stored)</label>
                </div>
                @if (touched() && (!title.trim() || text.trim().length < 20)) { <p class="error" role="alert" data-testid="jd-invalid">Enter a job title and paste at least a few lines of the description.</p> }
                <div class="row"><button class="btn" (click)="extract()" [disabled]="busy()" data-testid="extract"><ion-icon name="analytics-outline" aria-hidden="true"></ion-icon> Extract requirements</button></div>
              } @else {
                <div class="stack" data-testid="url-form">
                  <div class="field"><label for="jd-url">Job posting address</label><input id="jd-url" data-testid="jd-url" type="url" [(ngModel)]="url" maxlength="2048" placeholder="https://company.example/careers/backend-engineer" />
                    <span class="hint">We only read pages that are public and allow automated reading. We never sign in for you, and we never bypass blocks.</span></div>
                  <div class="row"><button class="btn" (click)="fetchUrl()" [disabled]="busy() || !url.trim()" data-testid="fetch-url">Fetch posting</button></div>
                  @if (importResult(); as ir) {
                    <div class="banner" [class.warn]="ir.status !== 'imported'" role="status" data-testid="import-status" [attr.data-status]="ir.status">
                      <strong>{{ importTitle(ir.status) }}</strong> {{ ir.reason }}
                      @if (ir.status !== 'imported') { <div class="row" style="margin-top:.5rem"><button class="btn sm" (click)="mode.set('paste')" data-testid="switch-paste">Paste the description instead</button></div> }
                    </div>
                  }
                </div>
              }
            </section>
          } @else {
            <section class="card" aria-labelledby="m-step3" data-testid="review-step">
              <div class="row between"><h2 id="m-step3">3. Review the requirements</h2>
                <button class="btn ghost sm" (click)="startOver()" data-testid="start-over">Use a different job</button></div>
              <p class="muted">{{ jd()!.title }}{{ jd()!.company ? ' · ' + jd()!.company : '' }}{{ jd()!.sourceDomain ? ' · from ' + jd()!.sourceDomain : '' }}.
                These were extracted by fixed rules, not guessed by AI. Correct anything wrong, untick what does not apply, add what was missed, then confirm.</p>
              @for (w of jd()!.warnings ?? []; track w) { <div class="banner warn" role="status" data-testid="jd-warning">{{ w }}</div> }

              @if (reqs().length === 0) { <div class="empty" data-testid="no-reqs"><p class="muted">No requirements were found. Add them below to continue.</p></div> }
              @for (g of groups(); track g.type) {
                <div class="stack" [attr.data-testid]="'group-' + g.type">
                  <h3>{{ g.label }} <span class="badge">{{ g.items.length }}</span></h3>
                  <ul class="list">
                    @for (r of g.items; track r.id) {
                      <li class="item-card" [attr.data-testid]="'req-' + r.id">
                        <div class="row">
                          <label class="checkbox"><input type="checkbox" [checked]="r.included" (change)="toggle(r, $any($event.target).checked)" [attr.aria-label]="'Include ' + r.label" data-testid="req-include" /></label>
                          <div class="grow stack" style="gap:.25rem">
                            <input class="req-label" [value]="r.label" (change)="rename(r, $any($event.target).value)" [attr.aria-label]="'Requirement text'" maxlength="200" data-testid="req-label" />
                            <span class="hint wrap">{{ r.origin === 'USER' ? 'Added by you' : 'From the posting: "' + r.sourceText + '"' }}</span>
                          </div>
                          @if (r.type === 'required_skill' || r.type === 'preferred_skill') {
                            <select class="req-type" [ngModel]="r.type" (ngModelChange)="retype(r, $event)" [attr.aria-label]="'Type of ' + r.label" data-testid="req-type">
                              <option value="required_skill">Required</option><option value="preferred_skill">Preferred</option>
                            </select>
                          }
                          @if (r.confidence < 0.7 && r.origin === 'EXTRACTED') { <span class="badge warn" title="The rules were not sure about this one">Check this</span> }
                          <button class="btn danger sm" (click)="remove(r)" [attr.aria-label]="'Remove ' + r.label" data-testid="req-remove"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon></button>
                        </div>
                      </li>
                    }
                  </ul>
                </div>
              }

              <div class="item-card" data-testid="add-req">
                <h3>Add a requirement</h3>
                <div class="row">
                  <select [(ngModel)]="newType" aria-label="Requirement type" data-testid="new-type">
                    <option value="required_skill">Required skill</option><option value="preferred_skill">Preferred skill</option><option value="responsibility">Responsibility</option><option value="qualification">Qualification</option>
                  </select>
                  <input class="grow" [(ngModel)]="newLabel" maxlength="200" aria-label="Requirement text" placeholder="e.g. Kubernetes" data-testid="new-label" (keyup.enter)="add()" />
                  <button class="btn sm" (click)="add()" [disabled]="!newLabel.trim()" data-testid="add-req-btn"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> Add</button>
                </div>
              </div>

              <div class="row between">
                <span class="muted" data-testid="req-count" aria-live="polite">{{ included() }} of {{ reqs().length }} requirements will be scored.</span>
                <button class="btn" (click)="confirmAndScore()" [disabled]="busy() || included() === 0" data-testid="confirm-score">Confirm and calculate match</button>
              </div>
            </section>
          }

          <section class="card" aria-labelledby="m-history">
            <h2 id="m-history">Match history for this resume</h2>
            @if (histLoading()) { <div class="sk-stack" role="status" aria-busy="true" data-testid="history-loading"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
            @else if (history().length === 0) { <p class="muted" data-testid="history-empty">No match reports yet for this resume.</p> }
            @else {
              @if (comparisons().length) {
                <div class="stack" data-testid="comparison">
                  <h3>Same job, across versions</h3>
                  @for (c of comparisons(); track c.id) {
                    <p class="small"><strong>{{ c.title }}</strong>: @for (p of c.points; track $index) { <span class="badge">{{ p.label }}: {{ p.score }}</span> }</p>
                  }
                  <p class="hint">Scores are comparable only within the same scoring version and job revision.</p>
                </div>
              }
              <ul class="list" data-testid="history-list">
                @for (h of history(); track h.id) {
                  <li class="item-card" [attr.data-testid]="'history-' + h.id">
                    <div class="row between">
                      <div class="grow"><strong class="wrap">{{ h.jdTitle }}{{ h.jdCompany ? ' · ' + h.jdCompany : '' }}</strong>
                        <p class="muted small">{{ h.resumeVersionNumber ? 'Version ' + h.resumeVersionNumber : 'Working draft' }} · scoring {{ h.scoringVersion }} · {{ h.createdAt | date: 'medium' }}
                          @if (h.stale) { <span class="badge warn">Job edited since</span> }</p></div>
                      <span class="stat small-stat" [attr.aria-label]="'Score ' + h.totalScore + ' out of 100'">{{ h.totalScore }}</span>
                      <a class="btn sm" [routerLink]="['/match/reports', h.id]" data-testid="open-report">Open</a>
                    </div>
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
    .req-label { width: 100%; min-height: 2.5rem; border: 1px solid transparent; background: transparent; font: inherit; font-weight: 600; padding: 0 .25rem; border-radius: 6px; color: var(--c-text); }
    .req-label:hover, .req-label:focus { border-color: var(--c-border); background: var(--c-bg); }
    .req-type, [data-testid='new-type'] { min-height: 2.5rem; border: 1px solid var(--c-border); border-radius: 8px; background: var(--c-bg); color: var(--c-text); font: inherit; padding: 0 .5rem; }
    [data-testid='add-req'] input { min-height: 2.5rem; border: 1px solid var(--c-border); border-radius: 8px; padding: 0 .75rem; font: inherit; background: var(--c-bg); color: var(--c-text); min-width: 0; }
    .small-stat { font-size: 1.4rem; }
  `],
})
export class MatchPage implements OnInit {
  resumes = signal<ResumeSummary[]>([]);
  versions = signal<ResumeVersion[]>([]);
  resumeId = signal('');
  versionId = signal('');
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  mode = signal<'paste' | 'url'>('paste');
  touched = signal(false);
  jd = signal<JobDescription | null>(null);
  reqs = signal<Requirement[]>([]);
  importResult = signal<ImportResult | null>(null);
  history = signal<MatchReportRow[]>([]);
  histLoading = signal(false);
  title = ''; company = ''; location = ''; text = ''; retain = false; url = '';
  newType: RequirementType = 'required_skill'; newLabel = '';

  groups = computed(() => groupRequirements(this.reqs()));
  included = computed(() => includedCount(this.reqs()));
  /** Same job description scored against several resume versions. */
  comparisons = computed(() => {
    const by = new Map<string, MatchReportRow[]>();
    for (const h of this.history()) by.set(h.jobDescriptionId, [...(by.get(h.jobDescriptionId) ?? []), h]);
    return [...by.entries()].filter(([, rows]) => rows.length > 1).map(([id, rows]) => ({
      id, title: rows[0].jdTitle,
      points: [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((r) => ({ label: r.resumeVersionNumber ? `v${r.resumeVersionNumber}` : 'draft', score: r.totalScore })),
    }));
  });

  constructor(private api: InsightsApi, private core: ApiService, private route: ActivatedRoute, private router: Router, private notify: NotifyService) {
    addIcons({ addOutline, analyticsOutline, trashOutline });
    // Ionic may reuse a cached instance of this page, so react to query changes (?resumeId, ?jd) instead of reading them once.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(() => { if (!this.loading()) void this.applyQuery(); });
  }

  ngOnInit() { void this.init(); }
  ionViewWillEnter() { if (!this.loading()) { void this.refreshHistory(); void this.applyQuery(); } }

  private async init() {
    try {
      this.resumes.set(await firstValueFrom(this.core.listResumes()));
      this.loading.set(false);
      await this.applyQuery(true);
    } catch (e) { this.error.set(errorMessage(e)); this.loading.set(false); }
  }

  private async applyQuery(first = false) {
    const q = this.route.snapshot.queryParamMap;
    const resumes = this.resumes();
    const wanted = resumes.find((r) => r.id === q.get('resumeId'))?.id;
    const rid = wanted ?? (first ? resumes[0]?.id : this.resumeId()) ?? '';
    if (rid && (first || rid !== this.resumeId())) { this.resumeId.set(rid); await this.loadResume(rid); }
    const jdId = q.get('jd');
    if (jdId && this.jd()?.id !== jdId) { try { this.setJd(await firstValueFrom(this.api.getJd(jdId))); } catch (e) { this.error.set(errorMessage(e)); } }
  }

  private async loadResume(id: string) {
    this.versionId.set('');
    try { this.versions.set(await firstValueFrom(this.core.listVersions(id))); } catch { this.versions.set([]); }
    await this.refreshHistory();
  }

  async refreshHistory() {
    if (!this.resumeId()) return;
    this.histLoading.set(true);
    try { this.history.set(await firstValueFrom(this.api.listReports(this.resumeId()))); } catch (e) { this.error.set(errorMessage(e)); } finally { this.histLoading.set(false); }
  }

  onResume(id: string) { this.resumeId.set(id); void this.loadResume(id); }

  private setJd(jd: JobDescription) { this.jd.set(jd); this.reqs.set(jd.requirements.map((r) => ({ ...r }))); }
  importTitle(s: string) { return ({ imported: 'Imported.', manual_paste_required: 'Please paste it instead.', unsupported_source: 'That address cannot be used.', retrieval_failed: 'Could not retrieve the page.' } as Record<string, string>)[s] ?? s; }

  startOver() { this.jd.set(null); this.reqs.set([]); this.importResult.set(null); this.touched.set(false); }

  extract() {
    this.touched.set(true);
    if (!this.title.trim() || this.text.trim().length < 20) return;
    this.busy.set(true);
    this.api.createJd({ title: this.title.trim(), company: this.company.trim() || undefined, location: this.location.trim() || undefined, text: this.text, retainRawText: this.retain }).subscribe({
      next: (jd) => { this.busy.set(false); this.error.set(''); this.setJd(jd); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  fetchUrl() {
    this.busy.set(true); this.importResult.set(null);
    this.api.importUrl(this.url.trim()).subscribe({
      next: (r) => { this.busy.set(false); this.importResult.set(r); if (r.status === 'imported' && r.jobDescription) this.setJd(r.jobDescription); },
      error: (e) => { this.busy.set(false); this.importResult.set({ status: 'retrieval_failed', reason: errorMessage(e) + ' Paste the job description instead.', sourceDomain: null, jobDescription: null }); },
    });
  }

  toggle(r: Requirement, v: boolean) { this.reqs.update((x) => x.map((i) => (i.id === r.id ? { ...i, included: v } : i))); }
  rename(r: Requirement, v: string) { if (v.trim()) this.reqs.update((x) => x.map((i) => (i.id === r.id ? { ...i, label: v.trim(), normalized: undefined, alternatives: undefined } : i))); }
  retype(r: Requirement, t: RequirementType) { this.reqs.update((x) => x.map((i) => (i.id === r.id ? { ...i, type: t } : i))); }
  remove(r: Requirement) { this.reqs.update((x) => x.filter((i) => i.id !== r.id)); }
  add() { if (!this.newLabel.trim()) return; this.reqs.update((x) => [...x, newRequirement(this.newType, this.newLabel)]); this.newLabel = ''; }

  async confirmAndScore() {
    const jd = this.jd(); if (!jd || this.included() === 0) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.updateJd(jd.id, { requirements: this.reqs().map(toRequirementInput), confirm: true }));
      const report = await firstValueFrom(this.api.createReport(this.resumeId(), { jobDescriptionId: jd.id, resumeVersionId: this.versionId() || undefined }));
      this.busy.set(false);
      this.startOver();
      await this.router.navigate(['/match/reports', report.id]);
    } catch (e) { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); }
  }
}

