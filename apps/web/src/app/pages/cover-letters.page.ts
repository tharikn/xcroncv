import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ApiService } from '../core/api.service';
import { CareerToolsApi, CoverLetterSummary, LetterTemplate } from '../core/career-tools.api';
import { ResumeSummary } from '../core/models';
import { errorMessage, NotifyService } from '../core/notify.service';

/** Cover Letter Intelligence (doc 42): list and draft. Editing lives on /cover-letters/:id. */
@Component({
  selector: 'app-cover-letters',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, RouterLink, DatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>Cover letters</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head">
          <div><h1>Cover letters</h1><p>Drafts built only from your confirmed career profile, with every claim checked.</p></div>
          <button class="btn" data-testid="new-letter" (click)="showForm.set(!showForm())"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> New cover letter</button>
        </div>

        @if (noProfile()) {
          <div class="banner warn" role="status" data-testid="letters-needs-profile">Create your career profile first so drafts can use your real experience. <a routerLink="/profile">Go to profile</a></div>
        }

        @if (showForm()) {
          <section class="card" aria-labelledby="draft-h" data-testid="draft-form">
            <h2 id="draft-h">New draft</h2>
            <div class="form-grid">
              <div class="field" [class.invalid]="touched() && !title.trim()"><label for="ltitle">Title *</label>
                <input id="ltitle" data-testid="letter-title" [(ngModel)]="title" maxlength="120" placeholder="Acme - Backend Engineer" /></div>
              <div class="field"><label for="lcompany">Company</label><input id="lcompany" data-testid="letter-company" [(ngModel)]="company" maxlength="120" /></div>
              <div class="field"><label for="ljob">Job title</label><input id="ljob" data-testid="letter-job" [(ngModel)]="jobTitle" maxlength="120" /></div>
              <div class="field"><label for="lkind">Template</label>
                <select id="lkind" data-testid="letter-kind" [(ngModel)]="kind">
                  @for (t of templates(); track t.id) { <option [value]="t.id">{{ t.name }}</option> }
                </select><span class="hint">{{ kindHint() }}</span></div>
              <div class="field"><label for="ltone">Tone</label>
                <select id="ltone" data-testid="letter-tone" [(ngModel)]="tone"><option value="professional">Professional</option><option value="warm">Warm</option><option value="direct">Direct</option></select></div>
              <div class="field"><label for="llen">Length</label>
                <select id="llen" data-testid="letter-length" [(ngModel)]="length"><option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option></select></div>
              <div class="field"><label for="lresume">Resume (optional)</label>
                <select id="lresume" data-testid="letter-resume" [(ngModel)]="resumeId"><option value="">None</option>
                  @for (r of resumes(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }</select></div>
              @if (kind === 'referral') {
                <div class="field" [class.invalid]="touched() && !referrer.trim()"><label for="lref">Referrer name *</label>
                  <input id="lref" data-testid="letter-referrer" [(ngModel)]="referrer" maxlength="80" />
                  <span class="hint">You supply this. We never invent referrals.</span></div>
              }
              <div class="field full"><label for="ljd">Job description (optional)</label>
                <textarea id="ljd" data-testid="letter-jd" [(ngModel)]="jd" maxlength="20000" placeholder="Paste the job description to match your skills. It is used once and not saved."></textarea></div>
            </div>
            @if (touched() && !title.trim()) { <p class="error" role="alert">Give the letter a title.</p> }
            @if (touched() && kind === 'referral' && !referrer.trim()) { <p class="error" role="alert">A referral letter needs the referrer's name.</p> }
            <div class="row">
              <button class="btn" data-testid="create-draft" (click)="create()" [disabled]="busy()">Create draft</button>
              <button class="btn ghost" (click)="showForm.set(false)">Cancel</button>
            </div>
          </section>
        }

        @if (error()) { <div class="banner err" role="alert">{{ error() }}</div> }
        @if (loading()) { <p class="muted" data-testid="letters-loading">Loading…</p> }
        @else if (letters().length === 0) {
          <div class="empty" data-testid="letters-empty"><h2>No cover letters yet</h2><p class="muted">Draft one for a specific job. You can edit everything by hand, with or without AI.</p></div>
        } @else {
          <ul class="list" data-testid="letter-list">
            @for (l of letters(); track l.id) {
              <li class="card" [attr.data-testid]="'letter-' + l.id">
                <div class="row between">
                  <div class="grow"><h2 class="wrap">{{ l.title }}</h2>
                    <p class="muted small">{{ l.jobTitle || 'No job title' }}{{ l.company ? ' · ' + l.company : '' }} · {{ l.kind }} · v{{ l.currentVersion }} · edited {{ l.updatedAt | date: 'medium' }}</p></div>
                </div>
                <div class="row">
                  <a class="btn sm" [routerLink]="['/cover-letters', l.id]" data-testid="open-letter">Open</a>
                  <button class="btn danger sm" (click)="remove(l)" data-testid="delete-letter" [attr.aria-label]="'Delete ' + l.title"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Delete</button>
                </div>
              </li>
            }
          </ul>
        }
      </div>
    </ion-content>
  `,
})
export class CoverLettersPage implements OnInit {
  letters = signal<CoverLetterSummary[]>([]);
  templates = signal<LetterTemplate[]>([]);
  resumes = signal<ResumeSummary[]>([]);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  noProfile = signal(false);
  showForm = signal(false);
  touched = signal(false);
  title = ''; company = ''; jobTitle = ''; kind = 'standard'; tone = 'professional'; length = 'medium'; resumeId = ''; referrer = ''; jd = '';

  constructor(private api: CareerToolsApi, private core: ApiService, private notify: NotifyService, private router: Router) {}

  ngOnInit() {
    this.api.letterTemplates().subscribe({ next: (t) => this.templates.set(t), error: () => this.templates.set([]) });
    this.core.listResumes().subscribe({ next: (r) => this.resumes.set(r), error: () => this.resumes.set([]) });
    this.core.getProfile().subscribe({ error: (e) => { if (e.status === 404) this.noProfile.set(true); } });
    this.reload();
  }

  ionViewWillEnter() { if (!this.loading()) this.reload(); }

  kindHint() { return this.templates().find((t) => t.id === this.kind)?.description ?? ''; }

  reload() {
    this.api.listLetters().subscribe({
      next: (l) => { this.letters.set(l); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  create() {
    this.touched.set(true);
    if (!this.title.trim() || (this.kind === 'referral' && !this.referrer.trim())) return;
    this.busy.set(true);
    this.api.createDraft({
      title: this.title.trim(), company: this.company.trim() || undefined, jobTitle: this.jobTitle.trim() || undefined,
      kind: this.kind, tone: this.tone, length: this.length, resumeId: this.resumeId || undefined,
      referrerName: this.kind === 'referral' ? this.referrer.trim() : undefined, jdText: this.jd.trim() || undefined,
    }).subscribe({
      next: (d) => { this.busy.set(false); void this.router.navigate(['/cover-letters', d.id]); },
      error: (e) => { this.busy.set(false); void this.notify.toast(e.status === 404 ? 'Create your career profile before drafting a cover letter.' : errorMessage(e), 'error'); },
    });
  }

  async remove(l: CoverLetterSummary) {
    if (!(await this.notify.confirm('Delete cover letter?', `"${l.title}", all its versions and application bindings will be permanently deleted.`))) return;
    this.api.deleteLetter(l.id).subscribe({
      next: () => { this.letters.update((x) => x.filter((i) => i.id !== l.id)); void this.notify.toast('Cover letter deleted'); },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }
}
