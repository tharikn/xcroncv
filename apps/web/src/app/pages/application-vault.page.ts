import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ApiService } from '../core/api.service';
import { ResumeSummary, ResumeVersion } from '../core/models';
import { errorMessage, NotifyService } from '../core/notify.service';
import { ReadinessToolsApi, STAGES, VaultEntry, VaultReminder } from '../core/readiness-tools.api';
import { registerReadinessToolIcons } from '../core/readiness-tools.icons';

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const today = () => new Date().toISOString().slice(0, 10);
const pretty = (s: string) => s.toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** Application resume vault (doc 33): which saved resume version went to which employer. Metadata only; no files. */
@Component({
  selector: 'app-application-vault',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, DatePipe, RouterLink],
  template: `
    <ion-header><ion-toolbar><ion-title>Application vault</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head">
          <div><h1>Application vault</h1><p>A private record of which saved resume version you sent to each employer. Later edits never change a past record.</p></div>
          <button class="btn" data-testid="new-entry" (click)="showForm.set(!showForm())"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> Log application</button>
        </div>
        <p class="muted small" data-testid="vault-note">Your job portal stays the source of truth for application status. Stages and notes here are your own record, and no documents are stored.</p>
        @if (error()) { <div class="banner err" role="alert" data-testid="vault-error">{{ error() }}</div> }

        @if (showForm()) {
          <section class="card" aria-labelledby="ve-h" data-testid="vault-form">
            <h2 id="ve-h">Log an application</h2>
            @if (resumes().length === 0) {
              <p class="muted" data-testid="vault-no-resumes">You need a resume first. <a [routerLink]="'/resumes'">Create one</a>, save a version, then log it here.</p>
            } @else {
              <div class="form-grid">
                <div class="field" [class.invalid]="touched() && !f.employerLabel.trim()"><label for="v-emp">Employer *</label><input id="v-emp" data-testid="v-employer" [(ngModel)]="f.employerLabel" maxlength="160" /></div>
                <div class="field"><label for="v-job">Job title</label><input id="v-job" data-testid="v-job" [(ngModel)]="f.jobTitle" maxlength="160" /></div>
                <div class="field"><label for="v-ext">Job ID from the portal</label><input id="v-ext" data-testid="v-extid" [(ngModel)]="f.externalJobId" maxlength="120" /></div>
                <div class="field" [class.invalid]="touched() && !dateOk()"><label for="v-date">Applied on *</label><input id="v-date" type="date" data-testid="v-date" [(ngModel)]="f.appliedOn" /></div>
                <div class="field"><label for="v-res">Resume *</label>
                  <select id="v-res" data-testid="v-resume" [ngModel]="f.resumeId" (ngModelChange)="pickResume($event)">@for (r of resumes(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }</select></div>
                <div class="field"><label for="v-ver">Saved version</label>
                  <select id="v-ver" data-testid="v-version" [(ngModel)]="f.resumeVersionId">
                    <option value="">Latest saved version</option>
                    @for (v of versions(); track v.id) { <option [value]="v.id">Version {{ v.versionNumber }}{{ v.changeSummary ? ' - ' + v.changeSummary : '' }}</option> }
                  </select>
                  @if (versionsLoaded() && versions().length === 0) { <span class="hint" data-testid="v-no-versions">This resume has no saved version yet. Save one in the editor first; a working draft cannot be recorded.</span> }
                </div>
                <div class="field"><label for="v-stage">Stage you are at</label><select id="v-stage" data-testid="v-stage" [(ngModel)]="f.stage">@for (s of stages; track s) { <option [value]="s">{{ pretty(s) }}</option> }</select></div>
                <div class="field"><label for="v-cl">Cover letter version (optional)</label><input id="v-cl" data-testid="v-cl" [(ngModel)]="f.coverLetterVersionRef" maxlength="120" placeholder="e.g. Acme letter v2" /></div>
                <div class="field"><label for="v-fu">Follow up on</label><input id="v-fu" type="date" data-testid="v-followup" [(ngModel)]="f.followUpOn" /></div>
                <div class="field full"><label for="v-notes">Notes</label><textarea id="v-notes" rows="2" data-testid="v-notes" [(ngModel)]="f.notes" maxlength="2000"></textarea></div>
              </div>
              @for (e of formErrors(); track e) { <p class="error" role="alert" data-testid="v-form-error">{{ e }}</p> }
              <div class="row"><button class="btn" data-testid="save-entry" (click)="create()" [disabled]="busy()">Save record</button><button class="btn ghost" (click)="showForm.set(false)">Cancel</button></div>
            }
          </section>
        }

        @if (reminders().length) {
          <section class="card" aria-labelledby="rem-h" data-testid="vault-reminders">
            <h2 id="rem-h">Reminders</h2>
            <p class="muted small">In-app reminders from the follow-up dates you set. Suggestions are only prompts; nothing is sent for you.</p>
            <ul class="list">
              @for (rm of reminders(); track rm.entryId) {
                <li class="row between" [attr.data-testid]="'reminder-' + rm.kind.toLowerCase()">
                  <span class="wrap grow"><strong>{{ rm.employerLabel }}</strong>{{ rm.jobTitle ? ' · ' + rm.jobTitle : '' }}<br /><span class="small" [class.error]="rm.kind === 'OVERDUE'">{{ rm.label }}</span></span>
                  <span class="row">
                    <button class="btn sm ghost" (click)="snooze(rm, 3)" data-testid="reminder-snooze" [attr.aria-label]="'Remind me in 3 days: ' + rm.employerLabel">In 3 days</button>
                    @if (rm.kind !== 'SUGGESTED') { <button class="btn sm" (click)="markDone(rm)" data-testid="reminder-done" [attr.aria-label]="'Mark follow-up done: ' + rm.employerLabel">Done</button> }
                  </span>
                </li>
              }
            </ul>
          </section>
        }

        <section class="card" aria-label="Filters">
          <div class="row">
            <div class="field grow"><label for="vf-emp">Employer</label><input id="vf-emp" data-testid="filter-employer" [(ngModel)]="filter.employer" (ngModelChange)="reload()" placeholder="Search employers" /></div>
            <div class="field"><label for="vf-st">Stage</label><select id="vf-st" data-testid="filter-stage" [(ngModel)]="filter.stage" (ngModelChange)="reload()"><option value="">All stages</option>@for (s of stages; track s) { <option [value]="s">{{ pretty(s) }}</option> }</select></div>
          </div>
        </section>

        @if (loading()) { <p class="muted" role="status" data-testid="vault-loading">Loading…</p> }
        @else if (items().length === 0) {
          <div class="empty" data-testid="vault-empty"><h2>{{ filtered() ? 'No matching applications' : 'No applications recorded yet' }}</h2>
            <p class="muted">{{ filtered() ? 'Try clearing the filters.' : 'When you apply, log which resume version you sent so you can see it later.' }}</p></div>
        } @else {
          <ul class="list" data-testid="vault-list">
            @for (e of items(); track e.id) {
              <li class="card" [attr.data-testid]="'entry-' + e.id">
                <div class="row between">
                  <div class="grow"><h2 class="wrap" data-testid="entry-employer">{{ e.employerLabel }}</h2>
                    <p class="muted small">{{ e.jobTitle || 'No job title' }}{{ e.externalJobId ? ' · ID ' + e.externalJobId : '' }} · applied {{ e.appliedOn }}</p></div>
                  <span class="badge" data-testid="entry-version">Resume v{{ e.resume.versionNumber }}</span>
                </div>
                <p class="small muted wrap" data-testid="entry-hash">Snapshot reference {{ e.resume.contentHash.slice(0, 8) }}{{ e.coverLetterVersionRef ? ' · cover letter: ' + e.coverLetterVersionRef : '' }}</p>
                @if (e.resume.newerVersionExists) { <p class="small" data-testid="entry-newer"><span class="badge">Newer version exists</span> This record still points to version {{ e.resume.versionNumber }}, what you sent.</p> }
                @if (!e.resume.versionAvailable) { <p class="small"><span class="badge warn" data-testid="entry-gone">Version no longer available</span> The resume or version was deleted; the reference is kept.</p> }
                <div class="row">
                  <div class="field"><label [for]="'st-' + e.id">Stage</label>
                    <select [id]="'st-' + e.id" data-testid="entry-stage" [ngModel]="e.stage" (ngModelChange)="setStage(e, $event)">@for (s of stages; track s) { <option [value]="s">{{ pretty(s) }}</option> }</select></div>
                  @if (e.followUpOn) {
                    <label class="checkbox"><input type="checkbox" data-testid="entry-followup-done" [checked]="e.followUpDone" (change)="setFollowUp(e, $any($event.target).checked)" />
                      Follow up {{ e.followUpOn }}@if (e.followUpOverdue) { <span class="badge warn" data-testid="entry-overdue">Overdue</span> }</label>
                  }
                  <button class="btn danger sm" data-testid="entry-delete" (click)="remove(e)" [attr.aria-label]="'Delete record for ' + e.employerLabel"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Delete</button>
                </div>
                @if (e.notes) { <p class="small wrap" data-testid="entry-notes">{{ e.notes }}</p> }
                <p class="small muted">Recorded {{ e.createdAt | date: 'mediumDate' }}</p>
              </li>
            }
          </ul>
        }
      </div>
    </ion-content>
  `,
})
export class ApplicationVaultPage implements OnInit {
  readonly stages = STAGES;
  readonly pretty = pretty;
  items = signal<VaultEntry[]>([]);
  resumes = signal<ResumeSummary[]>([]);
  versions = signal<ResumeVersion[]>([]);
  versionsLoaded = signal(false);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  showForm = signal(false);
  touched = signal(false);
  filter = { employer: '', stage: '' };
  f = { employerLabel: '', jobTitle: '', externalJobId: '', appliedOn: today(), resumeId: '', resumeVersionId: '', coverLetterVersionRef: '', stage: 'APPLIED', notes: '', followUpOn: '' };

  constructor(private api: ReadinessToolsApi, private resumeApi: ApiService, private notify: NotifyService) { registerReadinessToolIcons(); }

  ngOnInit() {
    this.reload();
    this.resumeApi.listResumes().subscribe({
      next: (r) => { this.resumes.set(r); if (r.length) this.pickResume(r[0].id); },
      error: () => this.resumes.set([]),
    });
  }
  ionViewWillEnter() { if (!this.loading()) this.reload(); }

  filtered() { return !!(this.filter.employer || this.filter.stage); }
  dateOk() { return DATE_RE.test(this.f.appliedOn); }

  pickResume(id: string) {
    this.f.resumeId = id; this.f.resumeVersionId = ''; this.versionsLoaded.set(false);
    this.resumeApi.listVersions(id).subscribe({ next: (v) => { this.versions.set(v); this.versionsLoaded.set(true); }, error: () => { this.versions.set([]); this.versionsLoaded.set(true); } });
  }

  reminders = signal<VaultReminder[]>([]);

  snooze(rm: VaultReminder, days: number) {
    this.api.snoozeVaultEntry(rm.entryId, days).subscribe({ next: () => { void this.notify.toast(`Reminder moved ${days} days`); this.reload(); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }
  markDone(rm: VaultReminder) {
    this.api.updateVaultEntry(rm.entryId, { followUpDone: true }).subscribe({ next: () => this.reload(), error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }

  reload() {
    this.api.vaultReminders().subscribe({ next: (r) => this.reminders.set(r.items), error: () => this.reminders.set([]) });
    this.api.listVault({ employer: this.filter.employer.trim() || undefined, stage: this.filter.stage || undefined }).subscribe({
      next: (r) => { this.items.set(r); this.loading.set(false); this.error.set(''); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  formErrors() {
    if (!this.touched()) return [];
    const e: string[] = [];
    if (!this.f.employerLabel.trim()) e.push('Enter the employer.');
    if (!this.dateOk()) e.push('Enter the application date.');
    if (!this.f.resumeId) e.push('Choose a resume.');
    if (this.f.followUpOn && !DATE_RE.test(this.f.followUpOn)) e.push('Follow-up date must be a valid date.');
    return e;
  }

  create() {
    this.touched.set(true);
    if (this.formErrors().length) return;
    const t = (s: string) => s.trim() || undefined;
    this.busy.set(true);
    this.api.createVaultEntry({
      employerLabel: this.f.employerLabel.trim(), jobTitle: t(this.f.jobTitle), externalJobId: t(this.f.externalJobId), appliedOn: this.f.appliedOn,
      resumeId: this.f.resumeId, resumeVersionId: this.f.resumeVersionId || undefined, coverLetterVersionRef: t(this.f.coverLetterVersionRef),
      stage: this.f.stage, notes: t(this.f.notes), followUpOn: this.f.followUpOn || undefined,
    }).subscribe({
      next: () => {
        this.busy.set(false); this.showForm.set(false); this.touched.set(false);
        this.f = { ...this.f, employerLabel: '', jobTitle: '', externalJobId: '', coverLetterVersionRef: '', notes: '', followUpOn: '', stage: 'APPLIED', appliedOn: today() };
        void this.notify.toast('Application recorded'); this.reload();
      },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  private patch(e: VaultEntry, body: Parameters<ReadinessToolsApi['updateVaultEntry']>[1]) {
    this.api.updateVaultEntry(e.id, body).subscribe({
      next: (u) => this.items.update((l) => l.map((x) => (x.id === u.id ? u : x))),
      error: (err) => { void this.notify.toast(errorMessage(err), 'error'); this.reload(); },
    });
  }
  setStage(e: VaultEntry, stage: string) { this.patch(e, { stage }); }
  setFollowUp(e: VaultEntry, done: boolean) { this.patch(e, { followUpDone: done }); }

  async remove(e: VaultEntry) {
    if (!(await this.notify.confirm('Delete this record?', `Removes only your record for ${e.employerLabel}. Your resume is not changed.`, 'Delete'))) return;
    this.api.deleteVaultEntry(e.id).subscribe({ next: () => this.reload(), error: (err) => void this.notify.toast(errorMessage(err), 'error') });
  }
}
