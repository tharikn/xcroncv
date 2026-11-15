import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ApiService } from '../core/api.service';
import { CopilotApi, CopilotListItem, CopilotSession, CopilotSummary, Dimension } from '../core/copilot.api';
import { ResumeSummary, ResumeVersion } from '../core/models';
import { errorMessage, NotifyService } from '../core/notify.service';

/** Interview copilot (doc 51): text-only practice grounded in a saved resume version. Observations on answers, never on the person. */
@Component({
  selector: 'app-interview-copilot',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, FormsModule],
  template: `
    <ion-header><ion-toolbar><ion-title>Interview copilot</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        @if (error()) { <div class="banner err" role="alert" data-testid="ic-error">{{ error() }}</div> }

        @if (!session()) {
          <div class="page-head"><div><h1>Interview copilot</h1><p>Practise answering questions drawn from your resume and a job posting. Text only. This is rehearsal: never use it for live help in a real assessment.</p></div></div>
          <section class="card" aria-labelledby="ic-new-h" data-testid="ic-form">
            <h2 id="ic-new-h">Start a practice session</h2>
            @if (resumes().length === 0) { <p class="muted small" data-testid="ic-no-resume">Create a resume and save a version first. Questions are grounded in that exact version.</p> }
            @else {
              <div class="form-grid">
                <div class="field"><label for="ic-res">Resume</label><select id="ic-res" data-testid="ic-resume" [(ngModel)]="resumeId" (ngModelChange)="loadVersions()">@for (r of resumes(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }</select></div>
                <div class="field"><label for="ic-ver">Saved version</label>
                  <select id="ic-ver" data-testid="ic-version" [(ngModel)]="versionNumber">@for (v of versions(); track v.id) { <option [ngValue]="v.versionNumber">Version {{ v.versionNumber }}</option> }</select>
                  @if (versions().length === 0) { <span class="hint" data-testid="ic-no-version">No saved versions yet. Save one in the resume editor.</span> }</div>
                <div class="field" [class.invalid]="touched() && !title.trim()"><label for="ic-title">Role you are practising for *</label><input id="ic-title" data-testid="ic-title" [(ngModel)]="title" maxlength="120" /></div>
                <div class="field full"><label for="ic-jd">Job description (optional)</label><textarea id="ic-jd" rows="5" data-testid="ic-jd" [(ngModel)]="jd" maxlength="20000"></textarea>
                  <span class="hint">Used once to find requirements. The text itself is not stored.</span></div>
              </div>
              <label class="checkbox"><input type="checkbox" data-testid="ic-retain" [(ngModel)]="retain" /> Keep my answer text after feedback (off by default).</label>
              <label class="checkbox"><input type="checkbox" data-testid="ic-practice" [(ngModel)]="practiceOnly" /> I understand this is practice only.</label>
              @for (e of formErrors(); track e) { <p class="error" role="alert" data-testid="ic-form-error">{{ e }}</p> }
              <div class="row"><button class="btn" data-testid="ic-start" (click)="start()" [disabled]="busy()">Start practising</button></div>
            }
          </section>

          <section aria-labelledby="ic-hist-h"><h2 id="ic-hist-h">Past sessions</h2>
            @if (loading()) { <div class="sk-stack" role="status" aria-busy="true"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
            @else if (items().length === 0) { <p class="muted" data-testid="ic-empty">No sessions yet.</p> }
            <ul class="list" data-testid="ic-list">
              @for (s of items(); track s.id) {
                <li class="card row between" [attr.data-testid]="'ics-' + s.id"><div class="grow"><h3 class="wrap">{{ s.jobTitle }}</h3><p class="muted small">Resume version {{ s.versionNumber }} · {{ s.answered }} of {{ s.total }} answered</p></div>
                  <button class="btn sm" data-testid="ic-open" (click)="open(s.id)">Open</button></li>
              }
            </ul>
          </section>
        }

        @if (session(); as s) {
          <button class="btn ghost sm" style="align-self:flex-start" data-testid="ic-back" (click)="close()">All sessions</button>
          <div class="page-head"><div><h1 class="wrap">{{ s.jobTitle }}</h1><p data-testid="ic-notice">{{ s.notice }}</p></div>
            <button class="btn danger" data-testid="ic-delete" (click)="remove(s)">Delete session</button></div>
          <section class="card" aria-labelledby="ic-priv-h">
            <h2 id="ic-priv-h">Privacy</h2>
            <label class="checkbox"><input type="checkbox" data-testid="ic-retain-toggle" [checked]="s.retainAnswers" (change)="setRetain(s, $any($event.target).checked)" /> Keep my answer text</label>
            <p class="hint">Text mode only. No audio or video is recorded. Feedback runs on fixed rules on this server and never quotes your answer.</p>
          </section>
          <ul class="list" data-testid="ic-questions">
            @for (q of s.questions; track q.id) {
              <li class="card" [attr.data-testid]="'q-' + q.id">
                <h2 class="wrap">{{ q.text }}</h2>
                <p class="small muted" data-testid="q-why">Why this question: {{ q.why }}</p>
                @if (q.kind === 'GAP') { <span class="badge warn">Possible weak spot</span> }
                <div class="field"><label [for]="'a-' + q.id">Your answer</label><textarea [id]="'a-' + q.id" rows="5" data-testid="q-answer" [ngModel]="draft[q.id] ?? saved(s, q.id)" (ngModelChange)="draft[q.id] = $event" maxlength="4000"></textarea></div>
                <div class="row"><button class="btn sm" data-testid="q-submit" (click)="answer(s, q.id)" [disabled]="busy()">Get feedback</button></div>
                @if (feedbackFor(s, q.id); as fb) {
                  <ul class="list" data-testid="q-feedback">@for (d of fb; track d.key) { <li class="small"><span class="badge" [class.ok]="d.status === 'STRONG'" [class.warn]="d.status !== 'STRONG'" data-testid="dim-status">{{ d.status === 'STRONG' ? 'Looks strong' : 'Could improve' }}</span> <strong>{{ d.label }}:</strong> {{ d.observation }}</li> }</ul>
                }
              </li>
            }
          </ul>
          <div class="row"><button class="btn" data-testid="ic-summary" (click)="summarise(s)">Session summary</button></div>
          @if (summary(); as m) {
            <section class="card" data-testid="ic-summary-panel"><h2>Summary</h2><p class="small">{{ m.answered }} of {{ m.total }} questions answered.</p>
              <ul class="small">@for (k of dimKeys(m); track k) { <li>{{ k }}: {{ m.dimensions[k].strong }} strong, {{ m.dimensions[k].couldImprove }} could improve</li> }</ul>
              <p class="hint">{{ m.note }}</p></section>
          }
        }
      </div>
    </ion-content>
  `,
})
export class InterviewCopilotPage implements OnInit {
  items = signal<CopilotListItem[]>([]); session = signal<CopilotSession | null>(null); summary = signal<CopilotSummary | null>(null);
  resumes = signal<ResumeSummary[]>([]); versions = signal<ResumeVersion[]>([]); fresh = signal<Record<string, Dimension[]>>({});
  loading = signal(true); busy = signal(false); error = signal(''); touched = signal(false);
  resumeId = ''; versionNumber: number | null = null; title = ''; jd = ''; retain = false; practiceOnly = false;
  draft: Record<string, string> = {};

  constructor(private api: CopilotApi, private core: ApiService, private notify: NotifyService) {}
  ngOnInit() {
    this.core.listResumes().subscribe({ next: (r) => { this.resumes.set(r); this.resumeId = r[0]?.id ?? ''; this.loadVersions(); }, error: () => this.resumes.set([]) });
    this.reload();
  }
  ionViewWillEnter() { if (!this.loading() && !this.session()) this.reload(); }
  loadVersions() {
    if (!this.resumeId) { this.versions.set([]); return; }
    this.core.listVersions(this.resumeId).subscribe({ next: (v) => { this.versions.set(v); this.versionNumber = v[0]?.versionNumber ?? null; }, error: () => this.versions.set([]) });
  }
  reload() {
    this.error.set('');
    this.api.list().subscribe({ next: (l) => { this.items.set(l); this.loading.set(false); }, error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); } });
  }

  formErrors() {
    if (!this.touched()) return [];
    const e: string[] = [];
    if (!this.title.trim()) e.push('Enter the role you are practising for.');
    if (this.versionNumber === null) e.push('Save a resume version first.');
    if (!this.practiceOnly) e.push('Tick the box to confirm this is practice only.');
    return e;
  }
  start() {
    this.touched.set(true);
    if (this.formErrors().length || this.versionNumber === null) return;
    this.busy.set(true);
    this.api.create({ resumeId: this.resumeId, versionNumber: this.versionNumber, jobTitle: this.title.trim(), jobDescription: this.jd.trim() || undefined, retainAnswers: this.retain, confirmPracticeOnly: true }).subscribe({
      next: (s) => { this.busy.set(false); this.touched.set(false); this.title = ''; this.jd = ''; this.practiceOnly = false; this.enter(s); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }
  private enter(s: CopilotSession) { this.session.set(s); this.summary.set(null); this.draft = {}; this.fresh.set({}); }
  open(id: string) { this.api.get(id).subscribe({ next: (s) => this.enter(s), error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }
  close() { this.session.set(null); this.reload(); }

  saved(s: CopilotSession, qid: string) { return s.answers.find((a) => a.questionId === qid)?.text ?? ''; }
  feedbackFor(s: CopilotSession, qid: string): Dimension[] | null { return this.fresh()[qid] ?? s.answers.find((a) => a.questionId === qid)?.feedback ?? null; }
  answer(s: CopilotSession, qid: string) {
    const text = (this.draft[qid] ?? this.saved(s, qid)).trim();
    if (!text) { void this.notify.toast('Write an answer first.', 'error'); return; }
    this.busy.set(true);
    this.api.answer(s.id, qid, text).subscribe({
      next: (r) => { this.busy.set(false); this.fresh.set({ ...this.fresh(), [qid]: r.feedback }); }, error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }
  summarise(s: CopilotSession) { this.api.summary(s.id).subscribe({ next: (m) => this.summary.set(m), error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }
  dimKeys(m: CopilotSummary) { return Object.keys(m.dimensions); }
  setRetain(s: CopilotSession, v: boolean) { this.api.consent(s.id, v).subscribe({ next: (r) => this.session.set(r), error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }
  async remove(s: CopilotSession) {
    if (!(await this.notify.confirm('Delete session?', 'The session and any stored answers are permanently deleted.'))) return;
    this.api.remove(s.id).subscribe({ next: () => { void this.notify.toast('Session deleted'); this.close(); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }
}
