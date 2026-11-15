import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { analyticsOutline, eyeOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { ApiService } from '../core/api.service';
import { ResumeSummary } from '../core/models';
import { errorMessage } from '../core/notify.service';

/** Resume insights hub (docs 20-23, 29, 31): pick a resume, then open match, quality review or recruiter view. Scores stay separate. */
@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, RouterLink],
  template: `
    <ion-header><ion-toolbar><ion-title>Insights</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head"><div><h1>Resume insights</h1><p>Check how a resume reads, how it fits a job, and how a recruiter may scan it. Each result is separate and explained.</p></div></div>

        @if (error()) { <div class="banner err" role="alert" data-testid="insights-error">{{ error() }}</div> }
        @if (loading()) { <div class="sk-stack" role="status" aria-busy="true" data-testid="insights-loading"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
        @else if (resumes().length === 0) {
          <div class="empty" data-testid="insights-empty"><h2>No resumes yet</h2><p class="muted">Create a resume first, then come back to review it.</p><a class="btn" routerLink="/resumes">Go to resumes</a></div>
        } @else {
          <section class="card flat">
            <div class="field"><label for="insight-resume">Resume</label>
              <select id="insight-resume" data-testid="insights-resume" [ngModel]="resumeId()" (ngModelChange)="resumeId.set($event)">
                @for (r of resumes(); track r.id) { <option [value]="r.id">{{ r.name }}{{ r.targetRole ? ' (' + r.targetRole + ')' : '' }}</option> }
              </select></div>
          </section>
          <div class="grid" role="list">
            <a class="card tool" role="listitem" routerLink="/match" [queryParams]="{ resumeId: resumeId() }" data-testid="go-match">
              <ion-icon name="analytics-outline" aria-hidden="true"></ion-icon>
              <h2>Match to a job</h2><p class="muted">Paste a job description, confirm its requirements, and see which are backed by evidence in this resume.</p><span class="badge">Job match score</span>
            </a>
            <a class="card tool" role="listitem" routerLink="/quality" [queryParams]="{ resumeId: resumeId() }" data-testid="go-quality">
              <ion-icon name="shield-checkmark-outline" aria-hidden="true"></ion-icon>
              <h2>Quality and export check</h2><p class="muted">Find writing, structure and consistency problems, and see what to fix before exporting.</p><span class="badge">Quality score</span>
            </a>
            <a class="card tool" role="listitem" [routerLink]="['/recruiter-view', resumeId()]" data-testid="go-recruiter">
              <ion-icon name="eye-outline" aria-hidden="true"></ion-icon>
              <h2>Recruiter view</h2><p class="muted">A read-only, quick-scan reading mode, with optional anonymising before you screenshot or print.</p><span class="badge">No score</span>
            </a>
          </div>
          <p class="muted small">These are aids to improve your resume. None of them predicts a hiring decision or an employer ATS result.</p>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    .tool { text-decoration: none; color: inherit; gap: var(--space-2); }
    .tool:hover { border-color: var(--c-text); }
    .tool ion-icon { font-size: 1.75rem; }
    .tool .badge { align-self: flex-start; }
  `],
})
export class InsightsPage implements OnInit {
  resumes = signal<ResumeSummary[]>([]);
  resumeId = signal('');
  loading = signal(true);
  error = signal('');

  constructor(private api: ApiService, private route: ActivatedRoute) { addIcons({ analyticsOutline, eyeOutline, shieldCheckmarkOutline }); }

  ngOnInit() { this.reload(); }
  ionViewWillEnter() { if (!this.loading()) this.reload(); }

  private reload() {
    this.api.listResumes().subscribe({
      next: (r) => {
        this.resumes.set(r);
        const wanted = this.route.snapshot.queryParamMap.get('resumeId');
        if (!this.resumeId() || !r.some((x) => x.id === this.resumeId())) this.resumeId.set(r.find((x) => x.id === wanted)?.id ?? r[0]?.id ?? '');
        this.loading.set(false);
      },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }
}
