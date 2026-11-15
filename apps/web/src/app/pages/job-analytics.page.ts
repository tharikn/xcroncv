import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { firstValueFrom, forkJoin } from 'rxjs';
import { ActivityWeeks, CareerToolsApi, Funnel, Overview, VersionInsights } from '../core/career-tools.api';
import { barWidth, EVENT_LABELS, formatRate, windowLabel } from '../core/career-tools.format';
import { LocalFileService } from '../core/local-file.service';
import { errorMessage, NotifyService } from '../core/notify.service';

/** Job Search Analytics (doc 48): descriptive only. Every metric shows numerator, denominator, window and source. */
@Component({
  selector: 'app-job-analytics',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule],
  template: `
    <ion-header><ion-toolbar><ion-title>Job search</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head">
          <div><h1>Job search analytics</h1><p>What happened in your own search. Descriptive, not predictive.</p></div>
          <div class="row">
            <button class="btn ghost" (click)="ingestVault()" [disabled]="busy()" data-testid="ingest-vault">Build from application vault</button>
            <button class="btn ghost" (click)="exportData()" data-testid="export-analytics"><ion-icon name="download-outline" aria-hidden="true"></ion-icon> Export</button>
            <button class="btn" (click)="showForm.set(!showForm())" data-testid="record-toggle"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> Record activity</button>
          </div>
        </div>

        @if (showForm()) {
          <section class="card" aria-labelledby="rec-h" data-testid="record-form">
            <h2 id="rec-h">Record activity</h2>
            <p class="muted small">Only these fields are stored. No resume text, contact details or job descriptions.</p>
            <div class="form-grid">
              <div class="field"><label for="etype">Event</label><select id="etype" data-testid="ev-type" [(ngModel)]="ev.type">@for (t of eventTypes; track t) { <option [value]="t">{{ labels[t] }}</option> }</select></div>
              <div class="field"><label for="edate">Date</label><input id="edate" type="date" data-testid="ev-date" [(ngModel)]="ev.date" /></div>
              <div class="field" [class.invalid]="touched() && !ev.ref.trim()"><label for="eref">Application reference *</label><input id="eref" data-testid="ev-ref" [(ngModel)]="ev.ref" maxlength="120" placeholder="e.g. acme-backend" /></div>
              <div class="field"><label for="erole">Role family</label><input id="erole" data-testid="ev-role" [(ngModel)]="ev.roleFamily" maxlength="60" /></div>
              <div class="field"><label for="egeo">Location</label><input id="egeo" data-testid="ev-geo" [(ngModel)]="ev.geography" maxlength="60" /></div>
              <div class="field"><label for="esen">Seniority</label><input id="esen" data-testid="ev-sen" [(ngModel)]="ev.seniority" maxlength="40" /></div>
              <div class="field"><label for="esrc">Where you found it</label><input id="esrc" data-testid="ev-src" [(ngModel)]="ev.sourceName" maxlength="60" /></div>
              <div class="field"><label for="ever">Resume version (optional)</label><input id="ever" data-testid="ev-ver" [(ngModel)]="ev.resumeVersionId" maxlength="120" /></div>
            </div>
            @if (touched() && !ev.ref.trim()) { <p class="error" role="alert">Enter an application reference.</p> }
            <div class="row"><button class="btn" (click)="record()" [disabled]="busy()" data-testid="ev-save">Save</button><button class="btn ghost" (click)="showForm.set(false)">Cancel</button></div>
          </section>
        }

        <section class="card flat" aria-label="Filters">
          <div class="form-grid">
            <div class="field"><label for="ffrom">From</label><input id="ffrom" type="date" data-testid="f-from" [(ngModel)]="filter.from" (ngModelChange)="load()" /></div>
            <div class="field"><label for="fto">To</label><input id="fto" type="date" data-testid="f-to" [(ngModel)]="filter.to" (ngModelChange)="load()" /></div>
            <div class="field"><label for="frole">Role family</label><input id="frole" data-testid="f-role" [(ngModel)]="filter.roleFamily" (change)="load()" /></div>
            <div class="field"><label for="fgeo">Location</label><input id="fgeo" data-testid="f-geo" [(ngModel)]="filter.geography" (change)="load()" /></div>
          </div>
        </section>

        @if (error()) { <div class="banner err" role="alert" data-testid="analytics-error">{{ error() }}</div> }
        @if (loading()) { <p class="muted" data-testid="analytics-loading">Loading…</p> }
        @if (!loading() && overview(); as o) {
          <div class="banner" [class.warn]="o.coverage.incomplete" role="status" data-testid="coverage">
            <strong>Data source:</strong> {{ o.coverage.note }} ({{ o.coverage.manualEvents }} manual, {{ o.coverage.hostEvents }} from portals)
            · Window: {{ window(o.window) }} · Last event: {{ o.freshness.lastEventAt ? o.freshness.lastEventAt.slice(0, 10) : 'none yet' }}
          </div>

          @if (o.coverage.totalEvents === 0) {
            <div class="empty" data-testid="analytics-empty"><h2>No activity yet</h2><p class="muted">Record when you save, apply, hear back or interview. Charts appear as soon as there is data.</p></div>
          } @else {
            <section class="grid stats" aria-label="Totals">
              <div class="card"><span class="muted small">Saved</span><span class="stat" data-testid="tot-saved">{{ o.totals.saved }}</span></div>
              <div class="card"><span class="muted small">Applied</span><span class="stat" data-testid="tot-applied">{{ o.totals.applied }}</span></div>
              <div class="card"><span class="muted small">Responses</span><span class="stat" data-testid="tot-responses">{{ o.totals.responses }}</span></div>
              <div class="card"><span class="muted small">Interviews</span><span class="stat" data-testid="tot-interviews">{{ o.totals.interviews }}</span></div>
              <div class="card"><span class="muted small">Offers</span><span class="stat" data-testid="tot-offers">{{ o.totals.offers }}</span></div>
              <div class="card"><span class="muted small">Open follow-ups</span><span class="stat" data-testid="tot-followups">{{ o.followUps.open }}</span><span class="hint">{{ o.followUps.overdue }} overdue</span></div>
            </section>

            <section class="card" aria-labelledby="tr-h">
              <h2 id="tr-h">Time to first response</h2>
              <p data-testid="time-to-response">
                @if (o.timeToResponseDays.median !== null) { <strong>{{ o.timeToResponseDays.median }} days</strong> median } @else { <strong>Not enough data</strong> }
                <span class="muted"> · based on {{ o.timeToResponseDays.sampleSize }} application(s)</span></p>
              <p class="hint">{{ o.timeToResponseDays.note }}</p>
            </section>
          }

          @if (funnel(); as f) {
            <section class="card" aria-labelledby="fn-h" data-testid="funnel">
              <h2 id="fn-h">Funnel</h2>
              <p class="hint">Window: {{ window(f.window) }}. Each rate is the next stage divided by this stage.</p>
              <ul class="list">
                @for (s of f.stages; track s.stage) {
                  <li [attr.data-testid]="'stage-' + s.stage.toLowerCase()">
                    <div class="row between"><span>{{ s.label }}</span><span class="small wrap" data-testid="stage-rate">{{ s.stage === 'OFFER' ? s.count + ' offer(s)' : rate(s) }}</span></div>
                    <div class="bar" role="img" [attr.aria-label]="s.stage + ': ' + s.count"><span [style.width.%]="width(s.count)"></span></div>
                    <span class="hint">{{ s.count }} application(s) reached this stage</span>
                  </li>
                }
              </ul>
              @for (n of f.quality.notes; track n) { <p class="hint" data-testid="funnel-note">{{ n }}</p> }
            </section>
          }

          @if (versions(); as v) {
            <section class="card" aria-labelledby="rv-h" data-testid="version-insights">
              <h2 id="rv-h">Resume versions</h2>
              @if (v.versions.length === 0) { <p class="muted small">No applications are linked to a resume version yet.</p> }
              <ul class="list">
                @for (r of v.versions; track r.resumeVersionId) {
                  <li class="item-card"><div class="row between"><strong class="wrap">{{ r.resumeVersionId }}</strong><span class="muted small">{{ r.applications }} application(s)</span></div>
                    @if (r.sufficientSample) { <p class="small">Response: {{ rate1(r.responseRate) }} · Interview: {{ rate1(r.interviewRate) }}</p> }
                    @else { <p class="small muted" data-testid="small-cohort">{{ r.note }}</p> }
                  </li>
                }
              </ul>
              <p class="hint" data-testid="no-causation">{{ v.caveat }}</p>
            </section>
          }

          @if (weeks(); as w) {
            @if (w.weeks.length) {
              <section class="card" aria-labelledby="wk-h" data-testid="weekly">
                <h2 id="wk-h">Weekly activity</h2>
                <table class="tbl"><thead><tr><th scope="col">Week of</th><th scope="col">Events</th><th scope="col">Breakdown</th></tr></thead>
                  <tbody>@for (r of w.weeks; track r.weekStart) { <tr><td>{{ r.weekStart }}</td><td>{{ r.total }}</td><td class="wrap">{{ breakdown(r.counts) }}</td></tr> }</tbody></table>
              </section>
            }
          }

          <section class="card" aria-labelledby="priv-h">
            <h2 id="priv-h">Your data</h2>
            <p class="muted small">You can delete all recorded job-search events at any time. Tasks and contacts are managed under Contacts.</p>
            <div class="row"><button class="btn danger sm" (click)="deleteAll()" data-testid="delete-events"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Delete all events</button></div>
          </section>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    .bar { height: 0.75rem; background: var(--c-surface); border-radius: 999px; overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--c-primary); border-radius: 999px; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 0.9rem; } .tbl th, .tbl td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--c-border); }
  `],
})
export class JobAnalyticsPage implements OnInit {
  readonly eventTypes = Object.keys(EVENT_LABELS);
  readonly labels = EVENT_LABELS;
  overview = signal<Overview | null>(null);
  funnel = signal<Funnel | null>(null);
  versions = signal<VersionInsights | null>(null);
  weeks = signal<ActivityWeeks | null>(null);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  showForm = signal(false);
  touched = signal(false);
  filter = { from: '', to: '', roleFamily: '', geography: '' };
  ev = { type: 'APPLIED', date: new Date().toISOString().slice(0, 10), ref: '', roleFamily: '', geography: '', seniority: '', sourceName: '', resumeVersionId: '' };

  constructor(private api: CareerToolsApi, private notify: NotifyService, private files: LocalFileService) {}

  ngOnInit() { this.load(); }
  ionViewWillEnter() { if (!this.loading()) this.load(); }

  window = windowLabel;
  rate = (s: { numerator: number; denominator: number; rate: number | null }) => formatRate(s);
  rate1 = (r: Parameters<typeof formatRate>[0]) => formatRate(r);
  width(count: number) { return barWidth(count, Math.max(...(this.funnel()?.stages.map((s) => s.count) ?? [0]))); }
  breakdown(c: Record<string, number>) { return Object.entries(c).map(([k, n]) => `${this.labels[k] ?? k} ${n}`).join(', '); }

  private query() {
    const f = this.filter;
    return {
      from: f.from ? new Date(`${f.from}T00:00:00Z`).toISOString() : undefined,
      to: f.to ? new Date(`${f.to}T23:59:59Z`).toISOString() : undefined,
      roleFamily: f.roleFamily.trim() || undefined, geography: f.geography.trim() || undefined,
    };
  }

  load() {
    const q = this.query();
    this.error.set('');
    forkJoin({ o: this.api.overview(q), f: this.api.funnel(q), v: this.api.versionInsights(q), w: this.api.activityWeeks(q) }).subscribe({
      next: (r) => { this.overview.set(r.o); this.funnel.set(r.f); this.versions.set(r.v); this.weeks.set(r.w); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  record() {
    this.touched.set(true);
    if (!this.ev.ref.trim()) return;
    const e = this.ev;
    this.busy.set(true);
    this.api.recordEvents([{
      type: e.type, occurredAt: new Date(`${e.date}T12:00:00Z`).toISOString(), applicationRef: e.ref.trim(), source: 'MANUAL',
      roleFamily: e.roleFamily.trim() || undefined, geography: e.geography.trim() || undefined, seniority: e.seniority.trim() || undefined,
      sourceName: e.sourceName.trim() || undefined, resumeVersionId: e.resumeVersionId.trim() || undefined,
      idempotencyKey: `ui-${crypto.randomUUID?.() ?? Date.now()}`,
    }]).subscribe({
      next: () => { this.busy.set(false); this.touched.set(false); this.ev.ref = ''; void this.notify.toast('Activity recorded'); this.load(); },
      error: (er) => { this.busy.set(false); void this.notify.toast(errorMessage(er), 'error'); },
    });
  }

  async ingestVault() {
    if (!(await this.notify.confirm('Build events from your application vault?', 'Applied dates and stages you recorded in the vault become activity events. Running it again never duplicates them. Nothing is read from any employer.', 'Build events'))) return;
    this.busy.set(true);
    this.api.ingestFromVault().subscribe({
      next: (r) => { this.busy.set(false); void this.notify.toast(`${r.created} event(s) added from ${r.applications} application(s); ${r.duplicates} already present`); this.load(); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  async exportData() {
    try {
      const blob = await firstValueFrom(this.api.exportAnalytics());
      await this.files.save(blob, 'job-search-analytics.json');
      void this.notify.toast('Analytics exported to this device');
    } catch (e) { void this.notify.toast(errorMessage(e), 'error'); }
  }

  async deleteAll() {
    if (!(await this.notify.confirm('Delete all events?', 'All recorded job-search events will be permanently deleted. This cannot be undone.'))) return;
    this.api.deleteEvents().subscribe({
      next: (r) => { void this.notify.toast(`Deleted ${r.deleted} event(s)`); this.load(); },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }
}
