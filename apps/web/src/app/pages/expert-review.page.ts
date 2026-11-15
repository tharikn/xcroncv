import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ApiService } from '../core/api.service';
import { ExpertReview, ExpertReviewApi, PackagesInfo, ReviewEvent, ReviewFeedback, ReviewPreview, Reviewer } from '../core/expert-review.api';
import { ResumeSummary, ResumeVersion } from '../core/models';
import { errorMessage, NotifyService } from '../core/notify.service';

const SECTIONS: Array<[string, string]> = [
  ['summary', 'Summary'], ['experience', 'Experience'], ['skills', 'Skills'], ['education', 'Education'], ['projects', 'Projects'], ['certifications', 'Certifications'], ['languages', 'Languages'],
];
const DIMS: Array<['clarity' | 'relevance' | 'evidence' | 'presentation', string]> = [['clarity', 'Clarity'], ['relevance', 'Relevance'], ['evidence', 'Evidence'], ['presentation', 'Presentation']];
const EVENT_LABEL: Record<string, string> = {
  REQUESTED: 'Review requested', GRANTED: 'Access granted with your consent', PREVIEWED: 'Reviewer view opened', FEEDBACK_RECORDED: 'Feedback recorded',
  ACCEPTED: 'You accepted a suggestion', DECLINED: 'You declined a suggestion', REVOKED: 'Access revoked',
};

/** Expert review (doc 50): consent-based, scoped, expiring and revocable. Owner-side only; no payment provider is configured. */
@Component({
  selector: 'app-expert-review',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, FormsModule, DatePipe, RouterLink],
  template: `
    <ion-header><ion-toolbar><ion-title>Expert review</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        @if (error()) { <div class="banner err" role="alert" data-testid="er-error">{{ error() }}</div> }

        @if (!review()) {
          <div class="page-head">
            <div><h1>Expert review</h1><p>Ask a reviewer for feedback on one saved resume version. You choose what they can see and for how long, you can revoke instantly, and nothing changes in your resume unless you change it.</p></div>
            <button class="btn" data-testid="er-new" (click)="showForm.set(!showForm())">New review request</button>
          </div>
          <p class="banner warn small" role="note" data-testid="er-payment-note">{{ pkgInfo()?.payment?.note ?? 'No payment provider is configured. Reviews are not charged.' }}</p>
          <p class="muted small" data-testid="er-note">This is optional and separate from building your resume. There is no public link and reviewers cannot sign in here yet: use the preview to see exactly what a reviewer would get, and record the feedback you receive. Reviews give opinions, not hiring or ATS outcomes.</p>

          @if (showForm()) {
            <section class="card" aria-labelledby="er-new-h" data-testid="er-form">
              <h2 id="er-new-h">Request a review</h2>
              @if (resumes().length === 0) {
                <p class="muted" data-testid="er-no-resumes">You need a resume with a saved version first. <a [routerLink]="'/resumes'">Open resumes</a>.</p>
              } @else {
                <div class="form-grid">
                  <div class="field"><label for="er-res">Resume *</label><select id="er-res" data-testid="er-resume" [ngModel]="f.resumeId" (ngModelChange)="pickResume($event)">@for (r of resumes(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }</select></div>
                  <div class="field"><label for="er-ver">Saved version</label><select id="er-ver" data-testid="er-version" [(ngModel)]="f.resumeVersionId"><option value="">Latest saved version</option>
                    @for (v of versions(); track v.id) { <option [value]="v.id">Version {{ v.versionNumber }}</option> }</select>
                    @if (versionsLoaded() && versions().length === 0) { <span class="hint" data-testid="er-no-versions">No saved version yet. Save one in the editor: only a fixed version can be reviewed.</span> }</div>
                  <div class="field"><label for="er-rv">Reviewer *</label><select id="er-rv" data-testid="er-reviewer" [(ngModel)]="f.reviewerId">@for (r of reviewers(); track r.id) { <option [value]="r.id">{{ r.displayName }}</option> }</select></div>
                  <div class="field"><label for="er-pk">Package *</label><select id="er-pk" data-testid="er-package" [(ngModel)]="f.packageId">@for (p of pkgInfo()?.packages ?? []; track p.id) { <option [value]="p.id">{{ p.label }}</option> }</select></div>
                  <div class="field"><label for="er-days">Access expires after (days)</label><input id="er-days" type="number" min="1" max="30" data-testid="er-days" [(ngModel)]="f.days" /></div>
                </div>
                @if (selectedReviewer(); as rv) {
                  <div class="item-card small" data-testid="er-reviewer-info">
                    <p><strong>{{ rv.displayName }}</strong> <span class="badge" [class.ok]="rv.vetting === 'VETTED'" [class.warn]="rv.vetting !== 'VETTED'" data-testid="er-vetting">{{ rv.vetting === 'VETTED' ? 'Vetted' : 'Not vetted (sample entry)' }}</span></p>
                    <p>Expertise: {{ rv.expertise.join(', ') }}. Service level: about {{ rv.serviceLevelDays }} days.</p>
                    <p data-testid="er-conflict">Conflict policy: {{ rv.conflictPolicy }}</p>
                  </div>
                }
                @if (selectedPackage(); as pk) { <p class="muted small" data-testid="er-package-info">{{ pk.description }} Price: none, payment is not configured.</p> }
                <fieldset class="stack"><legend class="label">Sections to share</legend>
                  @for (s of sections; track s[0]) { <label class="checkbox"><input type="checkbox" [attr.data-testid]="'sec-' + s[0]" [checked]="f.sections.has(s[0])" (change)="toggleSection(s[0])" /> {{ s[1] }}</label> }
                </fieldset>
                <fieldset class="stack"><legend class="label">Contact details (hidden unless you tick them)</legend>
                  <label class="checkbox"><input type="checkbox" data-testid="contact-email" [(ngModel)]="f.email" /> Show email</label>
                  <label class="checkbox"><input type="checkbox" data-testid="contact-phone" [(ngModel)]="f.phone" /> Show phone</label>
                  <label class="checkbox"><input type="checkbox" data-testid="contact-location" [(ngModel)]="f.location" /> Show location</label>
                  <label class="checkbox"><input type="checkbox" data-testid="contact-links" [(ngModel)]="f.links" /> Show profile links</label>
                </fieldset>
                <label class="checkbox"><input type="checkbox" data-testid="er-consent" [(ngModel)]="f.consent" /> I consent to this reviewer seeing exactly the sections and details above, read-only, until the expiry date. I can revoke at any time.</label>
                @for (e of formErrors(); track e) { <p class="error" role="alert" data-testid="er-form-error">{{ e }}</p> }
                <div class="row"><button class="btn" data-testid="er-create" (click)="create()" [disabled]="busy() || !f.consent">Request review</button><button class="btn ghost" (click)="showForm.set(false)">Cancel</button></div>
              }
            </section>
          }

          @if (loading()) { <p class="muted" role="status">Loading…</p> }
          @else if (items().length === 0) {
            <div class="empty" data-testid="er-empty"><h2>No review requests</h2><p class="muted">Nothing is shared with any reviewer. That is the default.</p></div>
          } @else {
            <ul class="list" data-testid="er-list">
              @for (r of items(); track r.id) {
                <li class="card"><div class="row between"><div class="grow"><h2 class="wrap">{{ r.reviewer.displayName }}</h2>
                  <p class="muted small">Version {{ r.versionNumber }} · {{ r.status === 'ACTIVE' ? 'access until' : 'access ended' }} {{ r.expiresAt | date: 'mediumDate' }} · {{ r.feedbackCount }} feedback</p></div>
                  <span class="badge" [class.ok]="r.status === 'ACTIVE'" [class.warn]="r.status !== 'ACTIVE'" data-testid="er-status">{{ statusLabel(r) }}</span>
                  <button class="btn sm" data-testid="er-open" (click)="open(r.id)" [attr.aria-label]="'Open review with ' + r.reviewer.displayName">Open</button></div></li>
              }
            </ul>
          }
        }

        @if (review(); as r) {
          <button class="btn ghost sm" style="align-self:flex-start" (click)="close()" data-testid="er-back">All review requests</button>
          <div class="page-head">
            <div><h1 class="wrap" data-testid="er-heading">{{ r.reviewer.displayName }}</h1><p>Resume version {{ r.versionNumber }} · read-only access</p></div>
            <div class="row">
              @if (r.status === 'ACTIVE') { <button class="btn danger" data-testid="er-revoke" (click)="revoke(r)">Revoke now</button> }
              <button class="btn ghost" data-testid="er-delete" (click)="remove(r)">Delete</button>
            </div>
          </div>

          <section class="card" aria-labelledby="er-cs-h" data-testid="er-consent-panel">
            <h2 id="er-cs-h">Consent and scope</h2>
            <p><span class="badge" [class.ok]="r.status === 'ACTIVE'" [class.warn]="r.status !== 'ACTIVE'" data-testid="er-detail-status">{{ statusLabel(r) }}</span>
              <span class="muted small"> consent given {{ r.consentAt | date: 'medium' }}, access until {{ r.expiresAt | date: 'medium' }}</span></p>
            <p class="small" data-testid="er-sections">Sections: {{ sectionNames(r) }}</p>
            <p class="small" data-testid="er-contacts">Contact details shown: {{ contactNames(r) }}</p>
            <p class="small muted" data-testid="er-pay-status">Payment: not configured, nothing was charged.</p>
            @if (r.status === 'ACTIVE') {
              <div class="row"><button class="btn ghost" data-testid="er-preview" (click)="preview(r)">Preview what the reviewer sees</button>
                <button class="btn ghost" data-testid="er-extend" (click)="extend(r)">Extend access by 7 days</button></div>
            } @else if (r.status === 'EXPIRED') {
              <p class="muted small" data-testid="er-ended">Access has expired. Nothing is visible to the reviewer. You can extend it with fresh consent.</p>
              <button class="btn ghost" data-testid="er-extend" (click)="extend(r)">Extend access by 7 days</button>
            } @else { <p class="muted small" data-testid="er-ended">Access was revoked. Nothing is visible to the reviewer and no feedback can be recorded. Create a new request to share again.</p> }
            @if (pv(); as p) {
              <div class="item-card" data-testid="er-preview-panel" role="region" aria-label="Reviewer preview">
                <p class="small muted">Read-only preview of version {{ p.versionNumber }}. The reviewer cannot edit your resume or see other versions.</p>
                <h3 data-testid="pv-name">{{ p.resume.header.name }}</h3>
                @if (p.resume.header.headline) { <p>{{ p.resume.header.headline }}</p> }
                <p class="small" data-testid="pv-contacts">{{ p.resume.header.contacts.length ? p.resume.header.contacts.join(' · ') : 'No contact details shown' }}</p>
                @for (sec of p.resume.sections; track sec.type) { <p class="small" data-testid="pv-section"><strong>{{ sec.title }}</strong></p> }
              </div>
            }
          </section>

          <section class="card" aria-labelledby="er-lf-h" data-testid="er-log">
            <h2 id="er-lf-h">Record feedback you received</h2>
            @if (r.status !== 'ACTIVE') { <p class="muted small" data-testid="er-log-disabled">Feedback can only be recorded while access is active.</p> }
            @else {
              <div class="form-grid">
                <div class="field"><label for="fb-sec">About section</label><select id="fb-sec" data-testid="fb-section" [(ngModel)]="fbSection"><option value="">Whole resume</option>@for (s of scopeSections(r); track s[0]) { <option [value]="s[0]">{{ s[1] }}</option> }</select></div>
                @for (d of dims; track d[0]) { <div class="field"><label [for]="'r-' + d[0]">{{ d[1] }} (1 to 5)</label>
                  <select [id]="'r-' + d[0]" [attr.data-testid]="'rate-' + d[0]" [(ngModel)]="rating[d[0]]"><option value="">No rating</option>@for (n of [1, 2, 3, 4, 5]; track n) { <option [value]="'' + n">{{ n }}</option> }</select></div> }
                <div class="field full"><label for="fb-c">Comment</label><textarea id="fb-c" rows="3" data-testid="fb-comment" [(ngModel)]="comment" maxlength="2000"></textarea></div>
              </div>
              @for (e of logErrors(); track e) { <p class="error" role="alert" data-testid="fb-form-error">{{ e }}</p> }
              <div class="row"><button class="btn" data-testid="fb-save" (click)="log(r)" [disabled]="busy()">Save feedback</button></div>
            }
          </section>

          <section class="card" aria-labelledby="er-fl-h">
            <h2 id="er-fl-h">Feedback</h2>
            @if (feedback().length === 0) { <p class="muted small" data-testid="fb-empty">No feedback recorded yet.</p> }
            <ul class="list" data-testid="fb-list">
              @for (e of feedback(); track e.id) {
                <li class="item-card" [attr.data-testid]="'feedback-' + e.id">
                  <p class="small"><span class="badge" data-testid="fb-where">{{ e.section ? sectionLabel(e.section) : 'Whole resume' }}</span>
                    @for (d of dims; track d[0]) { @if (e[d[0]] !== null) { <span class="badge">{{ d[1] }} {{ e[d[0]] }}</span> } }</p>
                  @if (e.comment) { <p class="wrap" data-testid="fb-text">{{ e.comment }}</p> }
                  <div class="row">
                    <span class="badge" [class.ok]="e.status === 'ACCEPTED'" data-testid="fb-status">{{ e.status === 'NEW' ? 'New' : e.status === 'ACCEPTED' ? 'Accepted' : 'Declined' }}</span>
                    @if (e.status === 'NEW') {
                      <button class="btn sm" data-testid="fb-accept" (click)="decide(r, e, 'ACCEPTED')">Accept</button>
                      <button class="btn ghost sm" data-testid="fb-decline" (click)="decide(r, e, 'DECLINED')">Decline</button>
                    }
                  </div>
                  @if (e.status === 'ACCEPTED') { <p class="muted small" data-testid="fb-accepted-note">Accepting does not change your resume. Make edits in the editor and save a new version when you are ready.</p> }
                </li>
              }
            </ul>
          </section>

          <section class="card" aria-labelledby="er-au-h">
            <h2 id="er-au-h">Access log</h2>
            <p class="muted small">Records what happened and when. It never contains your resume text or the feedback itself.</p>
            <ul class="list" data-testid="er-audit">@for (a of audit(); track a.id) { <li class="small item-card" data-testid="audit-row">{{ eventLabel(a.kind) }} · {{ a.createdAt | date: 'medium' }}</li> }</ul>
          </section>
        }
      </div>
    </ion-content>
  `,
})
export class ExpertReviewPage implements OnInit {
  readonly sections = SECTIONS;
  readonly dims = DIMS;
  items = signal<ExpertReview[]>([]);
  review = signal<ExpertReview | null>(null);
  pv = signal<ReviewPreview | null>(null);
  feedback = signal<ReviewFeedback[]>([]);
  audit = signal<ReviewEvent[]>([]);
  reviewers = signal<Reviewer[]>([]);
  pkgInfo = signal<PackagesInfo | null>(null);
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
  fbSection = '';
  rating: Record<string, string> = { clarity: '', relevance: '', evidence: '', presentation: '' };
  f = { resumeId: '', resumeVersionId: '', reviewerId: '', packageId: '', days: 7, sections: new Set<string>(['summary', 'experience']), email: false, phone: false, location: false, links: false, consent: false };

  constructor(private api: ExpertReviewApi, private resumeApi: ApiService, private notify: NotifyService) {}

  ngOnInit() {
    this.reload();
    this.api.reviewers().subscribe({ next: (r) => { this.reviewers.set(r); if (r.length && !this.f.reviewerId) this.f.reviewerId = r[0].id; }, error: (e) => this.error.set(errorMessage(e)) });
    this.api.packages().subscribe({ next: (p) => { this.pkgInfo.set(p); if (p.packages.length && !this.f.packageId) this.f.packageId = p.packages[p.packages.length - 1].id; }, error: (e) => this.error.set(errorMessage(e)) });
    this.resumeApi.listResumes().subscribe({ next: (r) => { this.resumes.set(r); if (r.length) this.pickResume(r[0].id); }, error: () => this.resumes.set([]) });
  }
  ionViewWillEnter() { if (!this.loading() && !this.review()) this.reload(); }

  selectedReviewer() { return this.reviewers().find((r) => r.id === this.f.reviewerId); }
  selectedPackage() { return this.pkgInfo()?.packages.find((p) => p.id === this.f.packageId); }
  pickResume(id: string) {
    this.f.resumeId = id; this.f.resumeVersionId = ''; this.versionsLoaded.set(false);
    this.resumeApi.listVersions(id).subscribe({ next: (v) => { this.versions.set(v); this.versionsLoaded.set(true); }, error: () => { this.versions.set([]); this.versionsLoaded.set(true); } });
  }
  toggleSection(k: string) { const s = new Set(this.f.sections); if (s.has(k)) s.delete(k); else s.add(k); this.f.sections = s; }
  sectionLabel(k: string) { return SECTIONS.find((x) => x[0] === k)?.[1] ?? k; }
  sectionNames(r: ExpertReview) { return r.scope.sections.map((k) => this.sectionLabel(k)).join(', '); }
  scopeSections(r: ExpertReview) { return SECTIONS.filter((s) => r.scope.sections.includes(s[0])); }
  contactNames(r: ExpertReview) {
    const c = r.scope.contacts; const on = [c.email === 'visible' ? 'email' : '', c.phone === 'visible' ? 'phone' : '', c.location === 'visible' ? 'location' : '', r.scope.links === 'visible' ? 'links' : ''].filter(Boolean);
    return on.length ? on.join(', ') : 'none (all hidden)';
  }
  statusLabel(r: ExpertReview) { return r.status === 'ACTIVE' ? 'Active' : r.status === 'REVOKED' ? 'Revoked' : 'Expired'; }
  eventLabel(k: string) { return EVENT_LABEL[k] ?? k; }

  formErrors() {
    if (!this.touched()) return [];
    const e: string[] = [];
    const max = this.selectedPackage()?.maxSections ?? 7;
    if (this.f.sections.size === 0) e.push('Choose at least one section to share.');
    if (this.f.sections.size > max) e.push(`This package covers up to ${max} sections.`);
    if (!(this.f.days >= 1 && this.f.days <= 30)) e.push('Access must last between 1 and 30 days.');
    if (!this.f.consent) e.push('Confirm your consent to share this.');
    return e;
  }
  logErrors() {
    if (!this.tried()) return [];
    return !this.comment.trim() && Object.values(this.rating).every((v) => !v) ? ['Add at least one rating or a comment.'] : [];
  }

  reload() {
    this.api.list().subscribe({
      next: (r) => { this.items.set(r); this.loading.set(false); this.error.set(''); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  create() {
    this.touched.set(true);
    if (this.formErrors().length) return;
    this.busy.set(true);
    const vis = (b: boolean) => (b ? 'visible' : 'hidden') as 'visible' | 'hidden';
    this.api.create({
      resumeId: this.f.resumeId, resumeVersionId: this.f.resumeVersionId || undefined, reviewerId: this.f.reviewerId, packageId: this.f.packageId, sections: [...this.f.sections],
      contacts: { email: vis(this.f.email), phone: vis(this.f.phone), location: vis(this.f.location) }, links: vis(this.f.links), expiresInDays: Number(this.f.days), consent: true,
    }).subscribe({
      next: (r) => { this.busy.set(false); this.showForm.set(false); this.touched.set(false); this.f.consent = false; void this.notify.toast('Review requested'); this.enter(r); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  open(id: string) { this.api.get(id).subscribe({ next: (r) => this.enter(r), error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }
  private enter(r: ExpertReview) {
    this.review.set(r); this.pv.set(null); this.tried.set(false); this.comment = ''; this.fbSection = ''; this.rating = { clarity: '', relevance: '', evidence: '', presentation: '' };
    this.loadDetail(r.id);
  }
  private loadDetail(id: string) {
    this.api.feedback(id).subscribe({ next: (x) => this.feedback.set(x), error: () => this.feedback.set([]) });
    this.api.audit(id).subscribe({ next: (x) => this.audit.set(x), error: () => this.audit.set([]) });
  }
  close() { this.review.set(null); this.reload(); }

  preview(r: ExpertReview) { this.api.preview(r.id).subscribe({ next: (p) => { this.pv.set(p); this.loadDetail(r.id); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }

  async revoke(r: ExpertReview) {
    if (!(await this.notify.confirm('Revoke reviewer access?', 'The reviewer loses access immediately. Feedback you already recorded is kept.', 'Revoke'))) return;
    this.api.revoke(r.id).subscribe({ next: (u) => { this.pv.set(null); this.review.set({ ...r, ...u }); this.loadDetail(r.id); void this.notify.toast('Access revoked'); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }
  async extend(r: ExpertReview) {
    if (!(await this.notify.confirm('Extend access?', 'You consent to the same sections and details being visible for 7 more days from now.', 'Extend'))) return;
    this.api.grant(r.id, { expiresInDays: 7, consent: true }).subscribe({ next: (u) => { this.review.set({ ...r, ...u }); this.loadDetail(r.id); void this.notify.toast('Access extended'); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }
  async remove(r: ExpertReview) {
    if (!(await this.notify.confirm('Delete this review request?', 'The request, recorded feedback and access log are permanently deleted. Your resume is not changed.', 'Delete'))) return;
    this.api.remove(r.id).subscribe({ next: () => this.close(), error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }

  log(r: ExpertReview) {
    this.tried.set(true);
    if (this.logErrors().length) return;
    const body: Parameters<ExpertReviewApi['record']>[1] = {};
    for (const [k] of DIMS) if (this.rating[k]) body[k] = Number(this.rating[k]);
    if (this.comment.trim()) body.comment = this.comment.trim();
    if (this.fbSection) body.section = this.fbSection;
    this.busy.set(true);
    this.api.record(r.id, body).subscribe({
      next: () => { this.busy.set(false); this.tried.set(false); this.comment = ''; this.fbSection = ''; this.rating = { clarity: '', relevance: '', evidence: '', presentation: '' }; this.loadDetail(r.id); void this.notify.toast('Feedback saved'); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  decide(r: ExpertReview, e: ReviewFeedback, decision: 'ACCEPTED' | 'DECLINED') {
    this.api.decide(r.id, e.id, { decision }).subscribe({ next: () => this.loadDetail(r.id), error: (err) => void this.notify.toast(errorMessage(err), 'error') });
  }
}
