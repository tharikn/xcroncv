import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ApiService } from '../core/api.service';
import { ResumeSummary, ResumeVersion } from '../core/models';
import { errorMessage, NotifyService } from '../core/notify.service';
import { AnswerFeedback, PrepListItem, PrepQuestion, PrepSession, ReadinessToolsApi } from '../core/readiness-tools.api';
import { registerReadinessToolIcons } from '../core/readiness-tools.icons';

const CATEGORY_LABEL: Record<string, string> = {
  RESUME_WALKTHROUGH: 'Resume walkthrough', BEHAVIOURAL: 'Behavioural', TECHNICAL: 'Technical', JOB_SPECIFIC: 'Job specific', GAP_PREPARATION: 'Gaps to prepare for',
};
const ORDER = ['RESUME_WALKTHROUGH', 'BEHAVIOURAL', 'TECHNICAL', 'JOB_SPECIFIC', 'GAP_PREPARATION'];
const DIMS: Array<[keyof AnswerFeedback, string]> = [
  ['relevance', 'Relevance'], ['structure', 'Structure'], ['clarity', 'Clarity'], ['specificity', 'Specificity'], ['evidenceAlignment', 'Matches your resume'],
];
const RATING_LABEL = { strong: 'Strong', ok: 'Fine', improve: 'Improve' } as const;

/** Resume-grounded interview preparation (doc 35): questions quote your resume; answers get text-only rubric feedback. */
@Component({
  selector: 'app-interview-prep',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, RouterLink],
  template: `
    <ion-header><ion-toolbar><ion-title>Interview preparation</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        @if (error()) { <div class="banner err" role="alert" data-testid="ip-error">{{ error() }}</div> }

        @if (!session()) {
          <div class="page-head">
            <div><h1>Interview preparation</h1><p>Practice questions built from the resume you choose. Sessions are private, text only, and you can delete them any time.</p></div>
            <button class="btn" data-testid="new-prep" (click)="showForm.set(!showForm())"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> New practice session</button>
          </div>

          @if (showForm()) {
            <section class="card" aria-labelledby="np-h" data-testid="prep-form">
              <h2 id="np-h">Start a practice session</h2>
              @if (resumes().length === 0) {
                <p class="muted" data-testid="ip-no-resumes">You need a resume first. <a [routerLink]="'/resumes'">Create one</a>.</p>
              } @else {
                <div class="form-grid">
                  <div class="field"><label for="ip-res">Resume *</label><select id="ip-res" data-testid="ip-resume" [ngModel]="f.resumeId" (ngModelChange)="pickResume($event)">@for (r of resumes(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }</select></div>
                  <div class="field"><label for="ip-ver">Version</label><select id="ip-ver" data-testid="ip-version" [(ngModel)]="f.resumeVersionId"><option value="">Current working draft</option>
                    @for (v of versions(); track v.id) { <option [value]="v.id">Version {{ v.versionNumber }}</option> }</select>
                    <span class="hint">Choose the version you actually sent, if you have one.</span></div>
                  <div class="field"><label for="ip-role">Role you are interviewing for</label><input id="ip-role" data-testid="ip-role" [(ngModel)]="f.roleTitle" maxlength="120" /></div>
                  <div class="field"><label for="ip-co">Company</label><input id="ip-co" data-testid="ip-company" [(ngModel)]="f.company" maxlength="120" /></div>
                  <div class="field full"><label for="ip-focus">Skills the job emphasises</label><input id="ip-focus" data-testid="ip-focus" [(ngModel)]="f.focus" placeholder="Comma separated, e.g. Redis, Terraform" />
                    <span class="hint">Skills that are not on your resume become honest gap-preparation questions.</span></div>
                </div>
                @for (e of formErrors(); track e) { <p class="error" role="alert" data-testid="ip-form-error">{{ e }}</p> }
                <div class="row"><button class="btn" data-testid="create-prep" (click)="create()" [disabled]="busy()">Generate questions</button><button class="btn ghost" (click)="showForm.set(false)">Cancel</button></div>
              }
            </section>
          }

          @if (loading()) { <p class="muted" role="status" data-testid="ip-loading">Loading…</p> }
          @else if (sessions().length === 0) {
            <div class="empty" data-testid="ip-empty"><h2>No practice sessions yet</h2><p class="muted">Pick a resume and we will turn its real content into practice questions.</p></div>
          } @else {
            <ul class="list" data-testid="prep-list">
              @for (s of sessions(); track s.id) {
                <li class="card"><div class="row between"><div class="grow"><h2 class="wrap">{{ s.title }}</h2>
                  <p class="muted small">{{ s.roleTitle || 'No role set' }}{{ s.company ? ' at ' + s.company : '' }} · {{ s.progress.practiced }} of {{ s.progress.total }} practised</p></div>
                  <button class="btn sm" data-testid="open-prep" (click)="open(s.id)" [attr.aria-label]="'Open ' + s.title">Open</button></div></li>
              }
            </ul>
          }
        }

        @if (session(); as s) {
          <button class="btn ghost sm" style="align-self:flex-start" (click)="close()" data-testid="back-preps"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon> All sessions</button>
          <div class="page-head">
            <div><h1 class="wrap" data-testid="prep-heading">{{ s.title }}</h1><p data-testid="prep-progress">{{ s.progress.practiced }} of {{ s.progress.total }} questions practised</p></div>
            <button class="btn danger" data-testid="delete-prep" (click)="remove(s)"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Delete session</button>
          </div>
          <p class="muted small" data-testid="prep-note">Questions marked "From your resume" quote what your resume states. "General knowledge" questions are not claims about your work. Feedback is a text rubric, not a score, and never judges voice or appearance.</p>

          @for (g of groups(s); track g.key) {
            <section class="card" [attr.aria-label]="g.label" [attr.data-testid]="'group-' + g.key">
              <h2>{{ g.label }}</h2>
              <ul class="list">
                @for (q of g.items; track q.id) {
                  <li class="item-card" [attr.data-testid]="'question-' + q.id">
                    <div class="row between"><strong class="wrap" data-testid="q-text">{{ q.text }}</strong>
                      <span class="badge" [class.ok]="q.grounding === 'RESUME'" data-testid="q-grounding">{{ q.grounding === 'RESUME' ? 'From your resume' : 'General knowledge' }}</span></div>
                    @if (q.evidence) { <blockquote class="small wrap" data-testid="q-evidence">Resume text: "{{ q.evidence.excerpt }}"</blockquote> }
                    @if (q.notOnResume) { <p class="small" data-testid="q-gap"><span class="badge warn">Not on your resume</span> Answer honestly and do not imply you did this work.</p> }
                    <p class="small muted" data-testid="q-hint">{{ q.hint }}</p>
                    <div class="field"><label [for]="'a-' + q.id">Your answer</label>
                      <textarea [id]="'a-' + q.id" rows="4" data-testid="q-answer" [ngModel]="draft(q)" (ngModelChange)="drafts[q.id] = $event" maxlength="4000"></textarea></div>
                    <div class="row">
                      <button class="btn sm" data-testid="q-feedback" (click)="feedback(s, q)" [disabled]="busy() || !draft(q).trim()">Get feedback</button>
                      <label class="checkbox"><input type="checkbox" data-testid="q-practiced" [checked]="q.practiced" (change)="setPracticed(s, q, $any($event.target).checked)" /> Practised</label>
                    </div>
                    @if (q.feedback; as fb) {
                      <div class="item-card" data-testid="q-feedback-result" role="status">
                        <ul class="list">
                          @for (d of dims; track d[0]) {
                            <li class="row between small"><span><strong>{{ d[1] }}</strong>: {{ dim(fb, d[0]).tip }}</span><span class="badge" [class.ok]="dim(fb, d[0]).rating === 'strong'" [class.warn]="dim(fb, d[0]).rating === 'improve'" [attr.data-testid]="'rating-' + d[0]">{{ ratingLabel(dim(fb, d[0]).rating) }}</span></li>
                          }
                        </ul>
                        <p class="small" data-testid="star-coverage">STAR: @for (k of starKeys; track k) { <span class="badge" [class.ok]="fb.starCoverage[k]">{{ k }}</span> }</p>
                        @if (fb.unsupportedTerms.length) { <p class="small" data-testid="unsupported-terms"><span class="badge warn">Not on your resume</span> {{ fb.unsupportedTerms.join(', ') }}</p> }
                        <p class="muted small">{{ fb.note }}</p>
                      </div>
                    }
                  </li>
                }
              </ul>
            </section>
          }
        }
      </div>
    </ion-content>
  `,
})
export class InterviewPrepPage implements OnInit {
  readonly dims = DIMS;
  readonly starKeys = ['situation', 'task', 'action', 'result'] as const;
  sessions = signal<PrepListItem[]>([]);
  session = signal<PrepSession | null>(null);
  resumes = signal<ResumeSummary[]>([]);
  versions = signal<ResumeVersion[]>([]);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  showForm = signal(false);
  touched = signal(false);
  drafts: Record<string, string> = {};
  f = { resumeId: '', resumeVersionId: '', roleTitle: '', company: '', focus: '' };

  constructor(private api: ReadinessToolsApi, private resumeApi: ApiService, private notify: NotifyService) { registerReadinessToolIcons(); }

  ngOnInit() {
    this.reload();
    this.resumeApi.listResumes().subscribe({ next: (r) => { this.resumes.set(r); if (r.length) this.pickResume(r[0].id); }, error: () => this.resumes.set([]) });
  }
  ionViewWillEnter() { if (!this.loading() && !this.session()) this.reload(); }

  ratingLabel(r: keyof typeof RATING_LABEL) { return RATING_LABEL[r]; }
  dim(fb: AnswerFeedback, k: keyof AnswerFeedback) { return fb[k] as { rating: keyof typeof RATING_LABEL; tip: string }; }
  draft(q: PrepQuestion) { return this.drafts[q.id] ?? q.answer ?? ''; }
  groups(s: PrepSession) {
    return ORDER.map((key) => ({ key, label: CATEGORY_LABEL[key], items: s.questions.filter((q) => q.category === key) })).filter((g) => g.items.length);
  }

  pickResume(id: string) {
    this.f.resumeId = id; this.f.resumeVersionId = '';
    this.resumeApi.listVersions(id).subscribe({ next: (v) => this.versions.set(v), error: () => this.versions.set([]) });
  }
  formErrors() { return this.touched() && !this.f.resumeId ? ['Choose a resume.'] : []; }

  reload() {
    this.api.listPreps().subscribe({
      next: (r) => { this.sessions.set(r); this.loading.set(false); this.error.set(''); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  create() {
    this.touched.set(true);
    if (this.formErrors().length) return;
    const t = (s: string) => s.trim() || undefined;
    const focus = this.f.focus.split(',').map((x) => x.trim()).filter(Boolean);
    this.busy.set(true);
    this.api.createPrep({ resumeId: this.f.resumeId, resumeVersionId: this.f.resumeVersionId || undefined, roleTitle: t(this.f.roleTitle), company: t(this.f.company), focusSkills: focus.length ? focus : undefined }).subscribe({
      next: (s) => { this.busy.set(false); this.showForm.set(false); this.touched.set(false); this.f.roleTitle = ''; this.f.company = ''; this.f.focus = ''; this.drafts = {}; this.session.set(s); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  open(id: string) { this.api.getPrep(id).subscribe({ next: (s) => { this.drafts = {}; this.session.set(s); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }
  close() { this.session.set(null); this.reload(); }

  feedback(s: PrepSession, q: PrepQuestion) {
    this.busy.set(true);
    this.api.answerFeedback(s.id, q.id, this.draft(q).trim()).subscribe({
      next: (u) => { this.busy.set(false); delete this.drafts[q.id]; this.session.set(u); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }
  setPracticed(s: PrepSession, q: PrepQuestion, practiced: boolean) {
    this.api.updateQuestion(s.id, q.id, { practiced }).subscribe({ next: (u) => this.session.set(u), error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }
  async remove(s: PrepSession) {
    if (!(await this.notify.confirm('Delete this session?', 'Your answers and feedback are deleted. Your resume is not changed.', 'Delete'))) return;
    this.api.deletePrep(s.id).subscribe({ next: () => this.close(), error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }
}
