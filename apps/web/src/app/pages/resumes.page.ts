import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ApiService } from '../core/api.service';
import { ResumeSummary, TemplateSummary } from '../core/models';
import { errorMessage, NotifyService } from '../core/notify.service';

@Component({
  selector: 'app-resumes',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, RouterLink, DatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>My resumes</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head">
          <div><h1>My resumes</h1><p>Create targeted resumes from your career profile.</p></div>
          <button class="btn" data-testid="new-resume" (click)="showForm.set(!showForm())"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> New resume</button>
        </div>

        @if (noProfile()) {
          <div class="banner warn" role="status" data-testid="needs-profile">Create your career profile first. <a routerLink="/profile">Go to profile</a></div>
        }

        @if (showForm()) {
          <section class="card" aria-labelledby="new-h" data-testid="new-resume-form">
            <h2 id="new-h">New resume</h2>
            <div class="form-grid">
              <div class="field" [class.invalid]="touched() && !name.trim()"><label for="rname">Resume name *</label>
                <input id="rname" data-testid="resume-name" [(ngModel)]="name" maxlength="100" placeholder="Backend Engineer - Acme" /></div>
              <div class="field"><label for="rrole">Target role</label><input id="rrole" data-testid="resume-role" [(ngModel)]="role" maxlength="100" /></div>
              <div class="field full"><label for="rtpl">Template</label>
                <select id="rtpl" data-testid="resume-template" [(ngModel)]="templateId">
                  @for (t of templates(); track t.id) { <option [value]="t.id">{{ t.name }} ({{ t.category }})</option> }
                </select></div>
            </div>
            @if (touched() && !name.trim()) { <p class="error" role="alert">Give your resume a name.</p> }
            <div class="row">
              <button class="btn" data-testid="create-resume" (click)="create()" [disabled]="busy()">Create resume</button>
              <button class="btn ghost" (click)="showForm.set(false)">Cancel</button>
            </div>
          </section>
        }

        @if (error()) { <div class="banner err" role="alert">{{ error() }}</div> }
        @if (loading()) { <div class="sk-stack" role="status" aria-busy="true"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
        @else if (resumes().length === 0) {
          <div class="empty" data-testid="resumes-empty"><h2>No resumes yet</h2><p class="muted">Create your first resume to preview and export it.</p></div>
        } @else {
          <ul class="list" data-testid="resume-list">
            @for (r of resumes(); track r.id) {
              <li class="card" [attr.data-testid]="'resume-' + r.id">
                <div class="row between">
                  <div class="grow"><h2 class="wrap">{{ r.name }}</h2>
                    <p class="muted small">{{ r.targetRole || 'No target role' }} · {{ r.templateId }} v{{ r.templateVersion }} · edited {{ r.updatedAt | date: 'medium' }}</p></div>
                  <span class="badge" [class.ok]="r.status === 'ACTIVE'">{{ r.status }}</span>
                </div>
                <div class="row">
                  <a class="btn sm" [routerLink]="['/resumes', r.id]" data-testid="open-resume">Edit</a>
                  <a class="btn ghost sm" [routerLink]="['/resumes', r.id, 'preview']" data-testid="preview-resume"><ion-icon name="eye-outline" aria-hidden="true"></ion-icon> Preview</a>
                  <a class="btn ghost sm" [routerLink]="['/resumes', r.id, 'versions']" data-testid="versions-resume">Versions</a>
                  <button class="btn danger sm" (click)="remove(r)" data-testid="delete-resume" [attr.aria-label]="'Delete ' + r.name"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Delete</button>
                </div>
              </li>
            }
          </ul>
        }
      </div>
    </ion-content>
  `,
})
export class ResumesPage implements OnInit {
  resumes = signal<ResumeSummary[]>([]);
  templates = signal<TemplateSummary[]>([]);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  noProfile = signal(false);
  showForm = signal(false);
  touched = signal(false);
  name = '';
  role = '';
  templateId = 'ats-classic';

  constructor(private api: ApiService, private notify: NotifyService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit() {
    const q = this.route.snapshot.queryParamMap;
    if (q.get('new')) this.showForm.set(true);
    if (q.get('templateId')) this.templateId = q.get('templateId')!;
    this.api.listTemplates().subscribe((t) => { this.templates.set(t); if (t.length && !t.some((x) => x.id === this.templateId)) this.templateId = t[0].id; });
    this.api.getProfile().subscribe({ error: (e) => { if (e.status === 404) this.noProfile.set(true); } });
    this.reload();
  }

  ionViewWillEnter() { if (!this.loading()) this.reload(); } // refresh after create/delete elsewhere

  reload() {
    this.api.listResumes().subscribe({
      next: (r) => { this.resumes.set(r); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  create() {
    this.touched.set(true);
    if (!this.name.trim()) return;
    this.busy.set(true);
    this.api.createResume({ name: this.name.trim(), targetRole: this.role.trim() || undefined, templateId: this.templateId }).subscribe({
      next: (r) => { this.busy.set(false); void this.router.navigate(['/resumes', r.id]); },
      error: (e) => {
        this.busy.set(false);
        void this.notify.toast(e.status === 409 ? 'Create your career profile before creating a resume.' : errorMessage(e), 'error');
      },
    });
  }

  async remove(r: ResumeSummary) {
    if (!(await this.notify.confirm('Delete resume?', `"${r.name}" and its saved versions will be permanently deleted.`))) return;
    this.api.deleteResume(r.id).subscribe({
      next: () => { this.resumes.update((l) => l.filter((x) => x.id !== r.id)); void this.notify.toast('Resume deleted'); },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }
}
