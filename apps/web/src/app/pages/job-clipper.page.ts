import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { Clip, ClipAnalysis, ClipperApi, ExtSession } from '../core/clipper.api';
import { errorMessage, NotifyService } from '../core/notify.service';

const strip = (s: string) => s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' ').trim();

/** Job clipper (doc 45): paste or enter a job, review it, then explicitly save. The server never fetches the URL. */
@Component({
  selector: 'app-job-clipper',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, FormsModule, DatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>Job clipper</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head"><div><h1>Job clipper</h1><p>Save a job you found so you can analyse it later. Nothing is saved until you review it and confirm. The server never opens the job link.</p></div>
          <button class="btn" data-testid="new-clip" (click)="startNew()">Add a job</button></div>
        @if (error()) { <div class="banner err" role="alert" data-testid="clip-error">{{ error() }}</div> }

        @if (step() === 'form') {
          <section class="card" aria-labelledby="cf-h" data-testid="clip-form">
            <h2 id="cf-h">1. Paste the job</h2>
            <div class="form-grid">
              <div class="field" [class.invalid]="touched() && !f.title.trim()"><label for="cl-title">Job title *</label><input id="cl-title" data-testid="clip-title" [(ngModel)]="f.title" maxlength="200" /></div>
              <div class="field" [class.invalid]="touched() && !f.company.trim()"><label for="cl-co">Company *</label><input id="cl-co" data-testid="clip-company" [(ngModel)]="f.company" maxlength="200" /></div>
              <div class="field full"><label for="cl-url">Link (optional)</label><input id="cl-url" type="url" data-testid="clip-url" [(ngModel)]="f.url" maxlength="500" placeholder="https://" />
                <span class="hint">Stored as a reference only. It is not opened or scraped.</span></div>
              <div class="field full"><label for="cl-desc">Job description *</label><textarea id="cl-desc" rows="8" data-testid="clip-desc" [(ngModel)]="f.description" maxlength="40000"></textarea></div>
            </div>
            @for (e of formErrors(); track e) { <p class="error" role="alert" data-testid="clip-form-error">{{ e }}</p> }
            <div class="row"><button class="btn" data-testid="clip-review" (click)="review()">Review</button><button class="btn ghost" (click)="step.set('list')">Cancel</button></div>
          </section>
        }

        @if (step() === 'review') {
          <section class="card" aria-labelledby="cr-h" data-testid="clip-review-panel">
            <h2 id="cr-h">2. Review before saving</h2>
            <p class="small muted">This is exactly what will be stored. HTML is removed. Go back to correct anything.</p>
            <dl class="small"><dt>Title</dt><dd data-testid="rev-title">{{ f.title.trim() }}</dd><dt>Company</dt><dd>{{ f.company.trim() }}</dd>
              @if (f.url.trim()) { <dt>Link</dt><dd class="wrap">{{ f.url.trim() }}</dd> }
              <dt>Description ({{ cleaned().length }} characters)</dt><dd class="wrap" style="white-space:pre-wrap" data-testid="rev-desc">{{ cleaned().slice(0, 600) }}{{ cleaned().length > 600 ? '…' : '' }}</dd></dl>
            <label class="checkbox"><input type="checkbox" data-testid="clip-confirm" [(ngModel)]="confirmed" /> I reviewed this and want to save it.</label>
            <div class="row"><button class="btn" data-testid="clip-save" (click)="save()" [disabled]="!confirmed || busy()">Save job</button><button class="btn ghost" data-testid="clip-back" (click)="step.set('form')">Back and edit</button></div>
          </section>
        }

        @if (detail(); as d) {
          <section class="card" aria-labelledby="cd-h" data-testid="clip-detail">
            <div class="row between"><h2 id="cd-h" class="wrap">{{ d.title }} at {{ d.company }}</h2><button class="btn ghost sm" data-testid="detail-close" (click)="detail.set(null); analysis.set(null)">Close</button></div>
            @if (d.url) { <p class="small wrap muted">{{ d.url }}</p> }
            <p class="wrap small" style="white-space:pre-wrap" data-testid="detail-desc">{{ d.description }}</p>
            <div class="row">
              <button class="btn sm" data-testid="clip-analyze" (click)="analyze(d)" [disabled]="busy()">Analyse against my profile</button>
              <button class="btn ghost sm" data-testid="clip-archive" (click)="setStatus(d, d.status === 'ARCHIVED' ? 'NEW' : 'ARCHIVED')">{{ d.status === 'ARCHIVED' ? 'Unarchive' : 'Archive' }}</button>
              <button class="btn danger sm" data-testid="clip-delete" (click)="remove(d)">Delete</button>
            </div>
            @if (analysis(); as a) {
              <div data-testid="analysis"><h3>Terms found in this posting</h3>
                @if (a.terms.length === 0) { <p class="muted small" data-testid="analysis-none">No known terms were found. Try Job match for a full analysis.</p> }
                <ul class="list">@for (t of a.terms; track t.label) { <li class="small"><strong>{{ t.label }}</strong>: <span data-testid="term-state">{{ t.inProfile ? 'recorded in your profile' : 'not recorded in your profile' }}</span></li> }</ul>
                @for (n of a.notes; track n) { <p class="hint">{{ n }}</p> }</div>
            }
          </section>
        }

        @if (loading()) { <div class="sk-stack" role="status" aria-busy="true"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
        @else if (items().length === 0 && step() === 'list') { <div class="empty" data-testid="clips-empty"><h2>No saved jobs</h2><p class="muted">Add a job by pasting its text, or use the browser extension.</p></div> }
        <ul class="list" data-testid="clip-list">
          @for (c of items(); track c.id) {
            <li class="card" [attr.data-testid]="'clip-' + c.id">
              <div class="row between"><div class="grow"><h2 class="wrap">{{ c.title }}</h2><p class="muted small">{{ c.company }}{{ c.hostname ? ' · ' + c.hostname : '' }} · {{ c.source === 'EXTENSION' ? 'Browser extension' : 'Pasted' }} · {{ c.createdAt | date: 'mediumDate' }}</p></div>
                <span class="badge" data-testid="clip-status">{{ c.status === 'NEW' ? 'New' : c.status === 'REVIEWED' ? 'Reviewed' : 'Archived' }}</span>
                <button class="btn sm" data-testid="clip-open" (click)="open(c.id)" [attr.aria-label]="'Open ' + c.title">Open</button></div>
            </li>
          }
        </ul>

        <section class="card" aria-labelledby="ex-h" data-testid="ext-panel">
          <h2 id="ex-h">Browser extension</h2>
          <p class="small muted">The optional extension captures only the page you are on, only when you click Save Job, and always shows this same review step first. It has no access to your browsing history or other tabs. Pasting here always works without it.</p>
          <div class="row"><button class="btn ghost sm" data-testid="ext-new" (click)="newSession()" [disabled]="busy()">Start a 30-minute extension session</button></div>
          @if (sessions().length === 0) { <p class="small muted" data-testid="ext-empty">No extension sessions.</p> }
          <ul class="list">
            @for (s of sessions(); track s.id) {
              <li class="row between item-card" [attr.data-testid]="'ext-' + s.id"><span class="small wrap">{{ s.label }} · until {{ s.expiresAt | date: 'shortTime' }}</span>
                <span class="row"><span class="badge" [class.ok]="s.state === 'ACTIVE'" [class.warn]="s.state !== 'ACTIVE'" data-testid="ext-state">{{ s.state }}</span>
                  @if (s.state === 'ACTIVE') { <button class="btn danger sm" data-testid="ext-revoke" (click)="revoke(s)">Revoke</button> }</span></li>
            }
          </ul>
        </section>
      </div>
    </ion-content>
  `,
})
export class JobClipperPage implements OnInit {
  items = signal<Clip[]>([]); detail = signal<Clip | null>(null); analysis = signal<ClipAnalysis | null>(null); sessions = signal<ExtSession[]>([]);
  step = signal<'list' | 'form' | 'review'>('list');
  loading = signal(true); busy = signal(false); error = signal(''); touched = signal(false);
  f = { title: '', company: '', url: '', description: '' };
  confirmed = false;
  private key = '';

  constructor(private api: ClipperApi, private notify: NotifyService) {}
  ngOnInit() { this.reload(); }
  ionViewWillEnter() { if (!this.loading()) this.reload(); }

  cleaned() { return strip(this.f.description); }
  reload() {
    this.error.set('');
    this.api.list().subscribe({ next: (l) => { this.items.set(l); this.loading.set(false); }, error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); } });
    this.api.sessions().subscribe({ next: (s) => this.sessions.set(s), error: () => this.sessions.set([]) });
  }

  startNew() { this.f = { title: '', company: '', url: '', description: '' }; this.touched.set(false); this.confirmed = false; this.key = crypto.randomUUID(); this.step.set('form'); }
  formErrors() {
    if (!this.touched()) return [];
    const e: string[] = [];
    if (!this.f.title.trim()) e.push('Enter the job title.');
    if (!this.f.company.trim()) e.push('Enter the company.');
    if (this.cleaned().length < 20) e.push('Paste the job description (at least a couple of sentences).');
    if (this.f.url.trim() && !/^https?:\/\/\S+$/i.test(this.f.url.trim())) e.push('The link must start with http:// or https://.');
    return e;
  }
  review() { this.touched.set(true); if (this.formErrors().length) return; this.confirmed = false; this.step.set('review'); }

  save() {
    this.busy.set(true);
    this.api.create({ title: this.f.title.trim(), company: this.f.company.trim(), url: this.f.url.trim() || undefined, description: this.cleaned(), source: 'MANUAL', reviewed: true, idempotencyKey: this.key }).subscribe({
      next: (c) => { this.busy.set(false); this.step.set('list'); void this.notify.toast(c.duplicate ? 'You already saved this job.' : 'Job saved'); this.reload(); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  open(id: string) { this.analysis.set(null); this.api.get(id).subscribe({ next: (c) => this.detail.set(c), error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }
  analyze(d: Clip) { this.busy.set(true); this.api.analyze(d.id).subscribe({ next: (a) => { this.analysis.set(a); this.busy.set(false); }, error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); } }); }
  setStatus(d: Clip, status: 'NEW' | 'ARCHIVED') { this.api.update(d.id, { status }).subscribe({ next: (c) => { this.detail.set(c); this.reload(); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }
  async remove(d: Clip) {
    if (!(await this.notify.confirm('Delete saved job?', 'The saved job text is permanently deleted.'))) return;
    this.api.remove(d.id).subscribe({ next: () => { this.detail.set(null); this.analysis.set(null); void this.notify.toast('Job deleted'); this.reload(); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }

  newSession() { this.busy.set(true); this.api.createSession('Browser extension').subscribe({ next: () => { this.busy.set(false); this.reload(); }, error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); } }); }
  async revoke(s: ExtSession) {
    if (!(await this.notify.confirm('Revoke session?', 'The extension can no longer send jobs with this session.', 'Revoke'))) return;
    this.api.revokeSession(s.id).subscribe({ next: () => this.reload(), error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }
}
