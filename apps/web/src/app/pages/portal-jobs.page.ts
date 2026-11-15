import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ApiService } from '../core/api.service';
import { ResumeSummary, ResumeVersion } from '../core/models';
import { errorMessage, NotifyService } from '../core/notify.service';
import { PortalApi, PortalApplication, PortalJob, Proposal } from '../core/portal.api';

const LABEL: Record<string, string> = { EMPHASISE_SKILL: 'Emphasise a skill', LEAD_WITH_EXPERIENCE: 'Lead with experience', NO_RECORDED_EVIDENCE: 'No evidence recorded' };

/** Job portal integration (doc 32): host job context -> evidence-mapped suggestions -> review -> record the exact version used. */
@Component({
  selector: 'app-portal-jobs',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, FormsModule, DatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>Portal jobs</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head"><div><h1>Portal jobs</h1><p>Jobs sent from a job portal, or added by hand. Get suggestions grounded in your own profile, then record exactly which saved resume version you used. The portal still owns the application.</p></div>
          <button class="btn" data-testid="new-pjob" (click)="showForm.set(!showForm())">Add a job</button></div>
        @if (error()) { <div class="banner err" role="alert" data-testid="pj-error">{{ error() }}</div> }

        @if (showForm()) {
          <section class="card" aria-labelledby="pj-h" data-testid="pjob-form">
            <h2 id="pj-h">Add a job</h2>
            <div class="form-grid">
              <div class="field"><label for="pj-host">Portal id</label><input id="pj-host" data-testid="pj-host" [(ngModel)]="f.hostId" maxlength="40" /><span class="hint">A short name for where the job lives, such as xcron-jobs.</span></div>
              <div class="field"><label for="pj-ext">Job id in the portal</label><input id="pj-ext" data-testid="pj-ext" [(ngModel)]="f.externalId" maxlength="120" /></div>
              <div class="field" [class.invalid]="touched() && !f.title.trim()"><label for="pj-title">Title *</label><input id="pj-title" data-testid="pj-title" [(ngModel)]="f.title" maxlength="200" /></div>
              <div class="field" [class.invalid]="touched() && !f.company.trim()"><label for="pj-co">Company *</label><input id="pj-co" data-testid="pj-company" [(ngModel)]="f.company" maxlength="200" /></div>
              <div class="field full"><label for="pj-req">Requirements (comma separated, optional)</label><input id="pj-req" data-testid="pj-req" [(ngModel)]="f.requirements" maxlength="600" /></div>
              <div class="field full"><label for="pj-desc">Description *</label><textarea id="pj-desc" rows="6" data-testid="pj-desc" [(ngModel)]="f.description" maxlength="40000"></textarea></div>
            </div>
            @for (e of formErrors(); track e) { <p class="error" role="alert" data-testid="pj-form-error">{{ e }}</p> }
            <label class="checkbox"><input type="checkbox" data-testid="pj-consent" [(ngModel)]="f.consent" /> Add this job to my account.</label>
            <div class="row"><button class="btn" data-testid="pj-save" (click)="save()" [disabled]="busy()">Save job</button><button class="btn ghost" (click)="showForm.set(false)">Cancel</button></div>
          </section>
        }

        @if (loading()) { <div class="sk-stack" role="status" aria-busy="true"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
        @else if (jobs().length === 0) { <div class="empty" data-testid="pj-empty"><h2>No portal jobs yet</h2><p class="muted">Add a job to get evidence-based tailoring suggestions.</p></div> }
        <ul class="list" data-testid="pjob-list">
          @for (j of jobs(); track j.id) {
            <li class="card" [attr.data-testid]="'pjob-' + j.id">
              <div class="row between"><div class="grow"><h2 class="wrap">{{ j.title }}</h2><p class="muted small">{{ j.company }} · {{ j.hostId }}/{{ j.externalId }} · {{ j.requirements.length }} requirement{{ j.requirements.length === 1 ? '' : 's' }}</p></div>
                <button class="btn sm" data-testid="pj-open" (click)="open(j)" [attr.aria-label]="'Open ' + j.title">Open</button></div>
            </li>
          }
        </ul>

        @if (current(); as j) {
          <section class="card" aria-labelledby="pj-d-h" data-testid="pjob-detail">
            <div class="row between"><h2 id="pj-d-h" class="wrap">{{ j.title }} at {{ j.company }}</h2><button class="btn ghost sm" data-testid="pj-close" (click)="close()">Close</button></div>
            <p class="small"><strong>Requirements:</strong> {{ j.requirements.join(', ') || 'none found' }}</p>
            <h3>1. Tailoring suggestions</h3>
            @if (resumes().length === 0) { <p class="muted small" data-testid="pj-no-resume">Create a resume first to get suggestions.</p> }
            @else {
              <div class="row"><div class="field grow"><label for="pj-res">Resume</label><select id="pj-res" data-testid="pj-resume" [(ngModel)]="resumeId" (ngModelChange)="loadVersions()">@for (r of resumes(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }</select></div>
                <button class="btn sm" data-testid="pj-propose" (click)="propose(j)" [disabled]="busy()">Suggest</button></div>
            }
            @if (proposal(); as p) {
              <p class="hint" data-testid="pj-notice">{{ p.notice }}</p>
              <ul class="list" data-testid="pj-items">
                @for (i of p.items; track i.id) {
                  <li class="item-card" [attr.data-testid]="'item-' + i.id">
                    <div class="row between"><strong>{{ label(i.type) }}: {{ i.requirement }}</strong><span class="badge" [class.ok]="i.decision === 'ACCEPT'" [class.warn]="i.decision === 'REJECT'" data-testid="item-decision">{{ i.decision === 'PENDING' ? 'To review' : i.decision === 'ACCEPT' ? 'Accepted' : 'Rejected' }}</span></div>
                    <p class="small wrap">{{ i.note }}</p>
                    @if (i.refs.length) { <p class="hint">Based on: {{ refText(i) }}</p> }
                    @if (i.type !== 'NO_RECORDED_EVIDENCE') { <div class="row"><button class="btn sm" data-testid="item-accept" (click)="decide(p, i, 'ACCEPT')">Accept</button><button class="btn ghost sm" data-testid="item-reject" (click)="decide(p, i, 'REJECT')">Reject</button></div> }
                  </li>
                }
              </ul>
              <p class="hint">Accepting only records your view. Edit your resume yourself, save a version, then record it below.</p>
            }
            <h3>2. Record the version you used</h3>
            @if (versions().length === 0) { <p class="muted small" data-testid="pj-no-version">This resume has no saved versions. Save one in the resume editor first, so the exact content is recorded.</p> }
            @else {
              <div class="row"><div class="field grow"><label for="pj-ver">Saved version</label><select id="pj-ver" data-testid="pj-version" [(ngModel)]="versionNumber">@for (v of versions(); track v.id) { <option [ngValue]="v.versionNumber">Version {{ v.versionNumber }}{{ v.changeSummary ? ' - ' + v.changeSummary : '' }}</option> }</select></div></div>
              <label class="checkbox"><input type="checkbox" data-testid="pj-record-confirm" [(ngModel)]="recordConfirm" /> I used this version for this job.</label>
              <div class="row"><button class="btn" data-testid="pj-record" (click)="record(j)" [disabled]="!recordConfirm || busy()">Record</button></div>
            }
            <div class="row"><button class="btn danger sm" data-testid="pj-delete" (click)="remove(j)">Delete this job</button></div>
          </section>
        }

        <section class="card" aria-labelledby="pj-a-h" data-testid="pj-apps">
          <h2 id="pj-a-h">Recorded applications</h2>
          @if (apps().length === 0) { <p class="muted small" data-testid="apps-empty">Nothing recorded yet.</p> }
          <ul class="list">
            @for (a of apps(); track a.id) {
              <li class="item-card" [attr.data-testid]="'app-' + a.id">
                <span class="wrap small" data-testid="app-line">{{ jobTitle(a.jobContextId) }} · resume version {{ a.versionNumber }} · {{ a.createdAt | date: 'mediumDate' }}</span>
                <div class="row"><div class="field grow"><label [for]="'hs-' + a.id">Status in the portal (your note)</label><input [id]="'hs-' + a.id" data-testid="app-status" [ngModel]="a.hostStatus ?? ''" (change)="setStatus(a, $any($event.target).value)" maxlength="40" /></div>
                  <button class="btn ghost sm" data-testid="app-remove" (click)="removeApp(a)">Remove</button></div>
              </li>
            }
          </ul>
        </section>
      </div>
    </ion-content>
  `,
})
export class PortalJobsPage implements OnInit {
  jobs = signal<PortalJob[]>([]); apps = signal<PortalApplication[]>([]); current = signal<PortalJob | null>(null); proposal = signal<Proposal | null>(null);
  resumes = signal<ResumeSummary[]>([]); versions = signal<ResumeVersion[]>([]);
  loading = signal(true); busy = signal(false); error = signal(''); showForm = signal(false); touched = signal(false);
  f = { hostId: 'xcron-jobs', externalId: '', title: '', company: '', requirements: '', description: '', consent: false };
  resumeId = ''; versionNumber: number | null = null; recordConfirm = false;

  constructor(private api: PortalApi, private core: ApiService, private notify: NotifyService) {}
  ngOnInit() {
    this.core.listResumes().subscribe({ next: (r) => { this.resumes.set(r); this.resumeId = r[0]?.id ?? ''; }, error: () => this.resumes.set([]) });
    this.reload();
  }
  ionViewWillEnter() { if (!this.loading()) this.reload(); }
  label(t: string) { return LABEL[t] ?? t; }
  refText(i: { refs: Array<{ label: string }> }) { return i.refs.map((r) => r.label).join(', '); }
  jobTitle(id: string) { return this.jobs().find((j) => j.id === id)?.title ?? 'Removed job'; }

  reload() {
    this.error.set('');
    this.api.jobs().subscribe({ next: (j) => { this.jobs.set(j); this.loading.set(false); }, error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); } });
    this.api.applications().subscribe({ next: (a) => this.apps.set(a), error: () => this.apps.set([]) });
  }

  formErrors() {
    if (!this.touched()) return [];
    const e: string[] = [];
    if (!this.f.hostId.trim() || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(this.f.hostId.trim())) e.push('Portal id must be a short lowercase name such as xcron-jobs.');
    if (!this.f.title.trim()) e.push('Enter the job title.');
    if (!this.f.company.trim()) e.push('Enter the company.');
    if (this.f.description.trim().length < 20) e.push('Enter the job description (at least 20 characters).');
    if (!this.f.consent) e.push('Tick the box to add this job to your account.');
    return e;
  }
  save() {
    this.touched.set(true);
    if (this.formErrors().length) return;
    this.busy.set(true);
    const reqs = this.f.requirements.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30);
    this.api.upsert({ hostId: this.f.hostId.trim(), externalId: this.f.externalId.trim() || crypto.randomUUID(), title: this.f.title.trim(), company: this.f.company.trim(), description: this.f.description.trim(), requirements: reqs, consent: true }).subscribe({
      next: () => { this.busy.set(false); this.showForm.set(false); this.touched.set(false); this.f = { ...this.f, externalId: '', title: '', company: '', requirements: '', description: '', consent: false }; void this.notify.toast('Job saved'); this.reload(); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  open(j: PortalJob) { this.proposal.set(null); this.recordConfirm = false; this.api.job(j.id).subscribe({ next: (d) => { this.current.set(d); this.loadVersions(); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }
  close() { this.current.set(null); this.proposal.set(null); }
  loadVersions() {
    if (!this.resumeId) { this.versions.set([]); return; }
    this.core.listVersions(this.resumeId).subscribe({ next: (v) => { this.versions.set(v); this.versionNumber = v[0]?.versionNumber ?? null; }, error: () => this.versions.set([]) });
  }
  propose(j: PortalJob) {
    this.busy.set(true);
    this.api.propose(j.id, this.resumeId).subscribe({ next: (p) => { this.proposal.set(p); this.busy.set(false); }, error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); } });
  }
  decide(p: Proposal, i: { id: string }, d: 'ACCEPT' | 'REJECT') { this.api.decide(p.id, i.id, d).subscribe({ next: (r) => this.proposal.set(r), error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }
  record(j: PortalJob) {
    if (this.versionNumber === null) return;
    this.busy.set(true);
    this.api.record({ jobContextId: j.id, resumeId: this.resumeId, versionNumber: this.versionNumber, proposalId: this.proposal()?.id, confirm: true }).subscribe({
      next: () => { this.busy.set(false); this.recordConfirm = false; void this.notify.toast('Recorded'); this.reload(); }, error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }
  setStatus(a: PortalApplication, v: string) { this.api.setStatus(a.id, v.trim()).subscribe({ next: () => this.reload(), error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }
  removeApp(a: PortalApplication) { this.api.removeApplication(a.id).subscribe({ next: () => this.reload(), error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }
  async remove(j: PortalJob) {
    if (!(await this.notify.confirm('Delete job?', 'The job, its suggestions and recorded applications are permanently deleted.'))) return;
    this.api.remove(j.id).subscribe({ next: () => { this.close(); void this.notify.toast('Job deleted'); this.reload(); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }
}
