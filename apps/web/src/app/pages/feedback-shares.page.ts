import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ApiService } from '../core/api.service';
import { ResumeSummary, ResumeVersion } from '../core/models';
import { errorMessage, NotifyService } from '../core/notify.service';
import { FeedbackEntry, FeedbackShare, FeedbackSummary, ReadinessToolsApi, SharePreview } from '../core/readiness-tools.api';
import { registerReadinessToolIcons } from '../core/readiness-tools.icons';

const SECTIONS: Array<[string, string]> = [
  ['summary', 'Summary'], ['experience', 'Experience'], ['skills', 'Skills'], ['education', 'Education'], ['projects', 'Projects'], ['certifications', 'Certifications'], ['languages', 'Languages'],
];
const DIMS: Array<['clarity' | 'relevance' | 'evidence' | 'presentation', string]> = [['clarity', 'Clarity'], ['relevance', 'Relevance'], ['evidence', 'Evidence'], ['presentation', 'Presentation']];

/** Consent-based sharing and feedback (doc 36). Private by default; owner-side only (no public link in this release). */
@Component({
  selector: 'app-feedback-shares',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, DatePipe, RouterLink],
  template: `
    <ion-header><ion-toolbar><ion-title>Feedback and sharing</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        @if (error()) { <div class="banner err" role="alert" data-testid="fs-error">{{ error() }}</div> }

        @if (!share()) {
          <div class="page-head">
            <div><h1>Feedback and sharing</h1><p>Decide exactly what one resume version shows to one reviewer, for how long. Nothing is shared unless you say so, and you can revoke it instantly.</p></div>
            <button class="btn" data-testid="new-share" (click)="showForm.set(!showForm())"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> New share</button>
          </div>
          <p class="muted small" data-testid="fs-note">No public link is created in this release. Use the preview to see exactly what a reviewer would get, and record the feedback you receive.</p>

          @if (showForm()) {
            <section class="card" aria-labelledby="ns-h" data-testid="share-form">
              <h2 id="ns-h">Create a share</h2>
              @if (resumes().length === 0) {
                <p class="muted" data-testid="fs-no-resumes">You need a resume with a saved version first. <a [routerLink]="'/resumes'">Open resumes</a>.</p>
              } @else {
                <div class="form-grid">
                  <div class="field"><label for="fs-res">Resume *</label><select id="fs-res" data-testid="fs-resume" [ngModel]="f.resumeId" (ngModelChange)="pickResume($event)">@for (r of resumes(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }</select></div>
                  <div class="field"><label for="fs-ver">Saved version</label><select id="fs-ver" data-testid="fs-version" [(ngModel)]="f.resumeVersionId"><option value="">Latest saved version</option>
                    @for (v of versions(); track v.id) { <option [value]="v.id">Version {{ v.versionNumber }}</option> }</select>
                    @if (versionsLoaded() && versions().length === 0) { <span class="hint" data-testid="fs-no-versions">No saved version yet. Save one in the editor: only a fixed version can be shared.</span> }</div>
                  <div class="field" [class.invalid]="touched() && !f.recipientLabel.trim()"><label for="fs-rcp">Recipient *</label><input id="fs-rcp" data-testid="fs-recipient" [(ngModel)]="f.recipientLabel" maxlength="120" placeholder="Recruiter at Acme" /></div>
                  <div class="field"><label for="fs-days">Expires after (days)</label><input id="fs-days" type="number" min="1" max="90" data-testid="fs-days" [(ngModel)]="f.days" /></div>
                </div>
                <fieldset class="stack"><legend class="label">Sections to show</legend>
                  @for (s of sections; track s[0]) { <label class="checkbox"><input type="checkbox" [attr.data-testid]="'sec-' + s[0]" [checked]="f.sections.has(s[0])" (change)="toggleSection(s[0])" /> {{ s[1] }}</label> }
                </fieldset>
                <fieldset class="stack"><legend class="label">Contact details (hidden unless you tick them)</legend>
                  <label class="checkbox"><input type="checkbox" data-testid="contact-email" [(ngModel)]="f.email" /> Show email</label>
                  <label class="checkbox"><input type="checkbox" data-testid="contact-phone" [(ngModel)]="f.phone" /> Show phone</label>
                  <label class="checkbox"><input type="checkbox" data-testid="contact-location" [(ngModel)]="f.location" /> Show location</label>
                  <label class="checkbox"><input type="checkbox" data-testid="contact-links" [(ngModel)]="f.links" /> Show profile links</label>
                </fieldset>
                <label class="checkbox"><input type="checkbox" data-testid="fs-consent" [(ngModel)]="f.consent" /> I choose to share this version with this recipient, with these settings.</label>
                @for (e of formErrors(); track e) { <p class="error" role="alert" data-testid="fs-form-error">{{ e }}</p> }
                <div class="row"><button class="btn" data-testid="create-share" (click)="create()" [disabled]="busy() || !f.consent">Create share</button><button class="btn ghost" (click)="showForm.set(false)">Cancel</button></div>
              }
            </section>
          }

          @if (loading()) { <div class="sk-stack" role="status" aria-busy="true" data-testid="fs-loading"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
          @else if (shares().length === 0) {
            <div class="empty" data-testid="fs-empty"><h2>Nothing shared</h2><p class="muted">You have not shared any resume version. That is the default.</p></div>
          } @else {
            <ul class="list" data-testid="share-list">
              @for (s of shares(); track s.id) {
                <li class="card"><div class="row between"><div class="grow"><h2 class="wrap">{{ s.recipientLabel }}</h2>
                  <p class="muted small">Version {{ s.versionNumber }} · {{ s.status === 'ACTIVE' ? 'expires' : 'ended' }} {{ s.expiresAt | date: 'mediumDate' }} · {{ s.feedbackCount }} feedback</p></div>
                  <span class="badge" [class.ok]="s.status === 'ACTIVE'" [class.warn]="s.status !== 'ACTIVE'" data-testid="share-status">{{ s.status === 'ACTIVE' ? 'Active' : s.status === 'REVOKED' ? 'Revoked' : 'Expired' }}</span>
                  <button class="btn sm" data-testid="open-share" (click)="open(s.id)" [attr.aria-label]="'Open share with ' + s.recipientLabel">Open</button></div></li>
              }
            </ul>
          }
        }

        @if (share(); as s) {
          <button class="btn ghost sm" style="align-self:flex-start" (click)="close()" data-testid="back-shares"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon> All shares</button>
          <div class="page-head">
            <div><h1 class="wrap" data-testid="share-heading">{{ s.recipientLabel }}</h1><p>Resume version {{ s.versionNumber }} · read-only</p></div>
            <div class="row">
              @if (s.status === 'ACTIVE') { <button class="btn danger" data-testid="revoke-share" (click)="revoke(s)">Revoke now</button> }
              <button class="btn ghost" data-testid="delete-share" (click)="remove(s)"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Delete</button>
            </div>
          </div>

          <section class="card" aria-labelledby="sp-h" data-testid="share-panel">
            <h2 id="sp-h">What this share allows</h2>
            <p><span class="badge" [class.ok]="s.status === 'ACTIVE'" [class.warn]="s.status !== 'ACTIVE'" data-testid="detail-status">{{ s.status === 'ACTIVE' ? 'Active' : s.status === 'REVOKED' ? 'Revoked' : 'Expired' }}</span>
              <span class="muted small"> until {{ s.expiresAt | date: 'medium' }}</span></p>
            <p class="small" data-testid="perm-sections">Sections: {{ sectionNames(s) }}</p>
            <p class="small" data-testid="perm-contacts">Contact details shown: {{ contactNames(s) }}</p>
            @if (s.status === 'ACTIVE') { <button class="btn ghost" data-testid="preview-share" (click)="preview(s)">Preview what they see</button> }
            @else { <p class="muted small" data-testid="share-ended">This share has ended. Nothing is visible to the recipient and it accepts no new feedback.</p> }
            @if (pv(); as p) {
              <div class="item-card" data-testid="share-preview" role="region" aria-label="Recipient preview">
                <p class="small muted">Read-only preview of version {{ p.versionNumber }}. The recipient cannot edit or see other versions.</p>
                <h3 data-testid="pv-name">{{ p.resume.header.name }}</h3>
                @if (p.resume.header.headline) { <p>{{ p.resume.header.headline }}</p> }
                <p class="small" data-testid="pv-contacts">{{ p.resume.header.contacts.length ? p.resume.header.contacts.join(' · ') : 'No contact details shown' }}</p>
                @for (sec of p.resume.sections; track sec.type) { <p class="small" data-testid="pv-section"><strong>{{ sec.title }}</strong></p> }
              </div>
            }
          </section>

          <section class="card" aria-labelledby="lf-h" data-testid="log-feedback">
            <h2 id="lf-h">Record feedback you received</h2>
            @if (s.status !== 'ACTIVE') { <p class="muted small" data-testid="log-disabled">Feedback can only be recorded while the share is active.</p> }
            @else {
              <div class="form-grid">
                @for (d of dims; track d[0]) { <div class="field"><label [for]="'r-' + d[0]">{{ d[1] }} (1 to 5)</label>
                  <select [id]="'r-' + d[0]" [attr.data-testid]="'rate-' + d[0]" [(ngModel)]="rating[d[0]]"><option value="">No rating</option>@for (n of [1, 2, 3, 4, 5]; track n) { <option [value]="'' + n">{{ n }}</option> }</select></div> }
                <div class="field full"><label for="fb-c">Comment</label><textarea id="fb-c" rows="3" data-testid="fb-comment" [(ngModel)]="comment" maxlength="2000"></textarea></div>
              </div>
              @for (e of logErrors(); track e) { <p class="error" role="alert" data-testid="fb-form-error">{{ e }}</p> }
              <div class="row"><button class="btn" data-testid="save-feedback" (click)="log(s)" [disabled]="busy()">Save feedback</button></div>
            }
          </section>

          <section class="card" aria-labelledby="fl-h">
            <h2 id="fl-h">Feedback</h2>
            @if (sum(); as m) {
              <p class="small" data-testid="fb-summary">{{ m.entries }} entr{{ m.entries === 1 ? 'y' : 'ies' }}: {{ m.pending }} pending, {{ m.accepted }} accepted, {{ m.declined }} declined. @for (d of dims; track d[0]) { <span class="badge">{{ d[1] }} {{ m.dimensions[d[0]].average ?? 'n/a' }}</span> }</p>
              <p class="muted small" data-testid="fb-summary-note">{{ m.note }}</p>
            }
            @if (feedback().length === 0) { <p class="muted small" data-testid="fb-empty">No feedback recorded yet.</p> }
            <ul class="list" data-testid="feedback-list">
              @for (e of feedback(); track e.id) {
                <li class="item-card" [attr.data-testid]="'feedback-' + e.id">
                  <p class="small">@for (d of dims; track d[0]) { @if (e[d[0]] !== null) { <span class="badge">{{ d[1] }} {{ e[d[0]] }}</span> } }</p>
                  @if (e.comment) { <p class="wrap" data-testid="fb-text">{{ e.comment }}</p> }
                  <div class="row">
                    <span class="badge" [class.ok]="e.status === 'ACCEPTED'" data-testid="fb-status">{{ e.status === 'NEW' ? 'New' : e.status === 'ACCEPTED' ? 'Accepted' : 'Declined' }}</span>
                    @if (e.status === 'NEW') {
                      <button class="btn sm" data-testid="fb-accept" (click)="decide(s, e, 'ACCEPTED')">Accept</button>
                      <button class="btn ghost sm" data-testid="fb-decline" (click)="decide(s, e, 'DECLINED')">Decline</button>
                    }
                  </div>
                  @if (e.status === 'ACCEPTED') { <p class="muted small" data-testid="fb-accepted-note">Accepting does not change your resume. Make edits in the editor and save a new version when you are ready.</p> }
                </li>
              }
            </ul>
          </section>
        }
      </div>
    </ion-content>
  `,
})
export class FeedbackSharesPage implements OnInit {
  readonly sections = SECTIONS;
  readonly dims = DIMS;
  shares = signal<FeedbackShare[]>([]);
  share = signal<FeedbackShare | null>(null);
  pv = signal<SharePreview | null>(null);
  feedback = signal<FeedbackEntry[]>([]);
  sum = signal<FeedbackSummary | null>(null);
  resumes = signal<ResumeSummary[]>([]);
  versions = signal<ResumeVersion[]>([]);
  versionsLoaded = signal(false);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  showForm = signal(false);
  touched = signal(false);
  tried = signal(false);
  comment = '';
  rating: Record<string, string> = { clarity: '', relevance: '', evidence: '', presentation: '' };
  f = { resumeId: '', resumeVersionId: '', recipientLabel: '', days: 14, sections: new Set<string>(['summary', 'experience']), email: false, phone: false, location: false, links: false, consent: false };

  constructor(private api: ReadinessToolsApi, private resumeApi: ApiService, private notify: NotifyService) { registerReadinessToolIcons(); }

  ngOnInit() {
    this.reload();
    this.resumeApi.listResumes().subscribe({ next: (r) => { this.resumes.set(r); if (r.length) this.pickResume(r[0].id); }, error: () => this.resumes.set([]) });
  }
  ionViewWillEnter() { if (!this.loading() && !this.share()) this.reload(); }

  pickResume(id: string) {
    this.f.resumeId = id; this.f.resumeVersionId = ''; this.versionsLoaded.set(false);
    this.resumeApi.listVersions(id).subscribe({ next: (v) => { this.versions.set(v); this.versionsLoaded.set(true); }, error: () => { this.versions.set([]); this.versionsLoaded.set(true); } });
  }
  toggleSection(k: string) { const s = new Set(this.f.sections); if (s.has(k)) s.delete(k); else s.add(k); this.f.sections = s; }
  sectionNames(s: FeedbackShare) { return s.permissions.sections.map((k) => SECTIONS.find((x) => x[0] === k)?.[1] ?? k).join(', '); }
  contactNames(s: FeedbackShare) {
    const c = s.permissions.contacts; const on = [c.email === 'visible' ? 'email' : '', c.phone === 'visible' ? 'phone' : '', c.location === 'visible' ? 'location' : '', s.permissions.links === 'visible' ? 'links' : ''].filter(Boolean);
    return on.length ? on.join(', ') : 'none (all hidden)';
  }

  formErrors() {
    if (!this.touched()) return [];
    const e: string[] = [];
    if (!this.f.recipientLabel.trim()) e.push('Enter who this is for.');
    if (this.f.sections.size === 0) e.push('Choose at least one section to show.');
    if (!(this.f.days >= 1 && this.f.days <= 90)) e.push('Expiry must be between 1 and 90 days.');
    if (!this.f.consent) e.push('Confirm that you choose to share this.');
    return e;
  }
  logErrors() {
    if (!this.tried()) return [];
    return !this.comment.trim() && Object.values(this.rating).every((v) => !v) ? ['Add at least one rating or a comment.'] : [];
  }

  reload() {
    this.api.listShares().subscribe({
      next: (r) => { this.shares.set(r); this.loading.set(false); this.error.set(''); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  create() {
    this.touched.set(true);
    if (this.formErrors().length) return;
    this.busy.set(true);
    const vis = (b: boolean) => (b ? 'visible' : 'hidden') as 'visible' | 'hidden';
    this.api.createShare({
      resumeId: this.f.resumeId, resumeVersionId: this.f.resumeVersionId || undefined, recipientLabel: this.f.recipientLabel.trim(), sections: [...this.f.sections],
      contacts: { email: vis(this.f.email), phone: vis(this.f.phone), location: vis(this.f.location) }, links: vis(this.f.links), expiresInDays: Number(this.f.days), consent: true,
    }).subscribe({
      next: (s) => { this.busy.set(false); this.showForm.set(false); this.touched.set(false); this.f.recipientLabel = ''; this.f.consent = false; void this.notify.toast('Share created'); this.openShare(s); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  open(id: string) { this.api.getShare(id).subscribe({ next: (s) => this.openShare(s), error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }
  private openShare(s: FeedbackShare) {
    this.share.set(s); this.pv.set(null); this.tried.set(false); this.comment = ''; this.rating = { clarity: '', relevance: '', evidence: '', presentation: '' };
    this.loadFeedback(s.id);
  }
  private loadFeedback(id: string) {
    this.api.listFeedback(id).subscribe({ next: (r) => this.feedback.set(r), error: () => this.feedback.set([]) });
    this.api.feedbackSummary(id).subscribe({ next: (r) => this.sum.set(r), error: () => this.sum.set(null) });
  }
  close() { this.share.set(null); this.reload(); }

  preview(s: FeedbackShare) {
    this.api.previewShare(s.id).subscribe({ next: (p) => this.pv.set(p), error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }

  async revoke(s: FeedbackShare) {
    if (!(await this.notify.confirm('Revoke this share?', 'The recipient loses access immediately. Feedback you already recorded is kept.', 'Revoke'))) return;
    this.api.revokeShare(s.id).subscribe({ next: (u) => { this.pv.set(null); this.share.set({ ...s, ...u }); void this.notify.toast('Share revoked'); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }
  async remove(s: FeedbackShare) {
    if (!(await this.notify.confirm('Delete this share?', 'The share and its recorded feedback are deleted. Your resume is not changed.', 'Delete'))) return;
    this.api.deleteShare(s.id).subscribe({ next: () => this.close(), error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }

  log(s: FeedbackShare) {
    this.tried.set(true);
    if (this.logErrors().length) return;
    const body: Parameters<ReadinessToolsApi['logFeedback']>[1] = {};
    for (const [k] of DIMS) if (this.rating[k]) body[k] = Number(this.rating[k]);
    if (this.comment.trim()) body.comment = this.comment.trim();
    this.busy.set(true);
    this.api.logFeedback(s.id, body).subscribe({
      next: () => { this.busy.set(false); this.tried.set(false); this.comment = ''; this.rating = { clarity: '', relevance: '', evidence: '', presentation: '' }; this.loadFeedback(s.id); void this.notify.toast('Feedback saved'); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  decide(s: FeedbackShare, e: FeedbackEntry, decision: 'ACCEPTED' | 'DECLINED') {
    this.api.decideFeedback(s.id, e.id, { decision }).subscribe({ next: () => this.loadFeedback(s.id), error: (err) => void this.notify.toast(errorMessage(err), 'error') });
  }
}
