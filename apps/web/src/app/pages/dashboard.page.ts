import { DatePipe } from '@angular/common';
import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonRefresher, IonRefresherContent, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { forkJoin, of, catchError } from 'rxjs';
import { LocaleService } from '../core/i18n/locale.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { UsageApi } from '../core/usage.api';
import { ApiService } from '../core/api.service';
import { LocalFileService } from '../core/local-file.service';
import { errorMessage } from '../core/notify.service';
import { CareerProfile, ResumeSummary } from '../core/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonRefresher, IonRefresherContent, RouterLink, DatePipe, TranslatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>{{ 'dash.title' | t }}</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>
      <div class="page-shell">
        <div class="page-head">
          <div><h1>{{ profile()?.fullName ? ('dash.welcomeName' | t: { name: firstName() }) : ('dash.welcome' | t) }}</h1>
            <p>{{ 'dash.lead' | t }}</p></div>
          <a class="btn" routerLink="/templates" data-testid="dash-create">
            <ion-icon name="add-outline" aria-hidden="true"></ion-icon> {{ 'dash.newResume' | t }}</a>
        </div>

        @if (error()) { <div class="banner err" role="alert">{{ error() }}</div> }

        @if (loading()) {
          <p class="muted" data-testid="dash-loading">{{ 'common.loading' | t }}</p>
        } @else {
          @if (!profile()) {
            <section class="empty" data-testid="dash-no-profile">
              <h2>{{ 'dash.startTitle' | t }}</h2>
              <p class="muted">{{ 'dash.startLead' | t }}</p>
              <a class="btn" routerLink="/profile">{{ 'dash.createProfile' | t }}</a>
            </section>
          }

          <section class="grid stats" [attr.aria-label]="'dash.summary' | t">
            <div class="card"><span class="muted small">{{ 'dash.resumes' | t }}</span><span class="stat" data-testid="stat-resumes">{{ resumes().length }}</span></div>
            <div class="card"><span class="muted small">{{ 'dash.templates' | t }}</span><span class="stat" data-testid="stat-templates">{{ templateCount() }}</span></div>
            <div class="card"><span class="muted small">{{ 'dash.profile' | t }}</span><span class="stat" style="font-size:1.25rem">{{ (profile() ? 'dash.ready' : 'dash.notSetup') | t }}</span></div>
            <div class="card"><span class="muted small">{{ 'dash.savedFiles' | t }}</span>
              <span class="small wrap" data-testid="stat-storage">{{ (files.isNative ? 'dash.storageNative' : 'dash.storageBrowser') | t }}</span></div>
          </section>

          <section class="stack" aria-labelledby="recent-h">
            <div class="group-title"><h2 id="recent-h">{{ 'dash.recent' | t }}</h2><a class="btn ghost sm" routerLink="/resumes">{{ 'dash.viewAll' | t }}</a></div>
            @if (resumes().length === 0) {
              <p class="muted" data-testid="dash-no-resumes">{{ 'dash.none' | t }}</p>
            } @else {
              <ul class="list">
                @for (r of recent(); track r.id) {
                  <li class="card">
                    <div class="row between">
                      <div class="grow"><h3 class="wrap">{{ r.name }}</h3>
                        <p class="muted small">{{ r.targetRole || ('dash.noRole' | t) }} · {{ 'dash.edited' | t: { date: (r.updatedAt | date: 'mediumDate') } }}</p></div>
                      <a class="btn ghost sm" [routerLink]="['/resumes', r.id]" [attr.aria-label]="'dash.continueAria' | t: { name: r.name }">{{ 'dash.continue' | t }}</a>
                    </div>
                  </li>
                }
              </ul>
            }
          </section>
        }
      </div>
    </ion-content>
  `,
})
export class DashboardPage {
  loading = signal(true);
  error = signal('');
  profile = signal<CareerProfile | null>(null);
  resumes = signal<ResumeSummary[]>([]);
  templateCount = signal(0);

  constructor(private api: ApiService, public files: LocalFileService, private usage: UsageApi) {}

  ionViewWillEnter() { this.usage.emit({ name: 'DASHBOARD_OPENED' }); this.load(); } // Ionic caches pages; refresh on every entry

  firstName() { return (this.profile()?.fullName ?? '').split(' ')[0]; }
  recent() { return this.resumes().slice(0, 3); }

  load(done?: () => void) {
    this.error.set('');
    forkJoin({
      profile: this.api.getProfile().pipe(catchError((e) => (e.status === 404 ? of(null) : (this.error.set(errorMessage(e)), of(null))))),
      resumes: this.api.listResumes().pipe(catchError((e) => (this.error.set(errorMessage(e)), of([] as ResumeSummary[])))),
      templates: this.api.listTemplates().pipe(catchError(() => of([]))),
    }).subscribe((r) => {
      this.profile.set(r.profile); this.resumes.set(r.resumes); this.templateCount.set(r.templates.length);
      this.loading.set(false); done?.();
    });
  }

  refresh(ev: Event) { this.load(() => (ev as CustomEvent).detail.complete()); }
}
