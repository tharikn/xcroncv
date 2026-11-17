import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { ResumeStepperComponent } from '../shared/resume-stepper.component';
import { ResetProfileDialogComponent } from '../shared/reset-profile-dialog.component';
import { ApiService } from '../core/api.service';
import { LocaleService } from '../core/i18n/locale.service';
import { CareerProfile, Certification, Education, Experience, LanguageItem, Link, Project, Skill } from '../core/models';
import { errorMessage, NotifyService } from '../core/notify.service';
import { emptyProfile, moveItem, toProfileInput, validateProfile } from '../core/profile-mapper';

type Form = Required<Pick<CareerProfile, 'links' | 'experiences' | 'skills' | 'educations' | 'projects' | 'certifications' | 'languages'>> & CareerProfile;
type ListKey = 'links' | 'experiences' | 'skills' | 'educations' | 'projects' | 'certifications' | 'languages';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, RouterLink, ResumeStepperComponent, ResetProfileDialogComponent, TranslatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>Career profile</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell reading">
        <app-resume-stepper [current]="1" [reached]="2" />
        <div class="page-head">
          <div><h1>Career profile</h1><p>Your single source of truth. Resumes pick from this. <a routerLink="/import" data-testid="goto-import">Import from a PDF or DOCX</a></p></div>
          <span class="badge" [class.warn]="isDirty()" [class.ok]="!isDirty() && loaded()" data-testid="save-state" role="status">
            {{ saving() ? 'Saving…' : isDirty() ? 'Unsaved changes' : loaded() ? 'All changes saved' : '' }}</span>
        </div>

        @if (loaded()) {
          <section class="card import-highlight-card" aria-labelledby="import-card-h" data-testid="import-highlight-card">
            <div class="import-card-content">
              <div class="import-icon-wrap" aria-hidden="true">
                <ion-icon name="cloud-upload-outline"></ion-icon>
              </div>
              <div class="import-text">
                <div class="row" style="gap: var(--space-2); align-items: center;">
                  <h2 id="import-card-h" style="font-size: 1.05rem; margin: 0;">{{ 'profile.importCard.title' | t }}</h2>
                  <span class="badge ok">{{ 'profile.importCard.badge' | t }}</span>
                </div>
                <p class="muted" style="margin: 0; font-size: 0.9rem;">
                  {{ 'profile.importCard.lead' | t }}
                </p>
              </div>
              <div class="import-action">
                <a class="btn sm" routerLink="/import" data-tour="import-resume-action" data-testid="import-resume-action">
                  <ion-icon name="cloud-upload-outline" aria-hidden="true"></ion-icon> {{ 'profile.importCard.button' | t }}
                </a>
              </div>
            </div>
          </section>
        }

        @if (loadError()) { <div class="banner err" role="alert">{{ loadError() }}</div> }
        @if (!loaded() && !loadError()) { <div class="sk-stack" role="status" aria-busy="true"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }

        @if (loaded()) {
          <section class="card" aria-labelledby="basics-h">
            <h2 id="basics-h">Basics</h2>
            <div class="form-grid">
              <div class="field"><label for="fullName">Full name *</label><input id="fullName" data-testid="fullName" [(ngModel)]="f.fullName" (ngModelChange)="markDirty()" autocomplete="name" /></div>
              <div class="field"><label for="headline">Headline</label><input id="headline" data-testid="headline" [(ngModel)]="f.headline" (ngModelChange)="markDirty()" maxlength="150" /></div>
              <div class="field"><label for="email">Email</label><input id="email" data-testid="email" type="email" inputmode="email" [(ngModel)]="f.email" (ngModelChange)="markDirty()" autocomplete="email" /></div>
              <div class="field"><label for="phone">Phone</label><input id="phone" data-testid="phone" type="tel" [(ngModel)]="f.phone" (ngModelChange)="markDirty()" autocomplete="tel" /></div>
              <div class="field full"><label for="location">Location</label><input id="location" data-testid="location" [(ngModel)]="f.location" (ngModelChange)="markDirty()" autocomplete="address-level2" /></div>
              <div class="field full"><label for="summary">Summary</label><textarea id="summary" data-testid="summary" [(ngModel)]="f.summary" (ngModelChange)="markDirty()" maxlength="2000"></textarea>
                <span class="hint">{{ (f.summary || '').length }}/2000</span></div>
            </div>
          </section>

          <section class="card" aria-labelledby="links-h">
            <div class="group-title"><h2 id="links-h">Links</h2>
              <button class="btn ghost sm" data-testid="add-link" (click)="add('links', { label: '', url: '' })"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> Add link</button></div>
            @for (l of f.links; track $index) {
              <div class="item-card">
                <div class="form-grid">
                  <div class="field"><label [for]="'ll' + $index">Label</label><input [id]="'ll' + $index" [(ngModel)]="l.label" (ngModelChange)="markDirty()" placeholder="Portfolio" /></div>
                  <div class="field"><label [for]="'lu' + $index">URL</label><input [id]="'lu' + $index" [(ngModel)]="l.url" (ngModelChange)="markDirty()" inputmode="url" placeholder="https://" /></div>
                </div>
                <div class="row">
                  <button class="btn ghost sm" (click)="remove('links', $index)" [attr.aria-label]="'Remove link ' + ($index + 1)"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Remove</button>
                </div>
              </div>
            }
          </section>

          <section class="card" aria-labelledby="exp-h">
            <div class="group-title"><h2 id="exp-h">Experience</h2>
              <button class="btn ghost sm" data-testid="add-experience" (click)="addExperience()"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> Add experience</button></div>
            @if (f.experiences.length === 0) { <p class="muted">No experience added yet.</p> }
            @for (e of f.experiences; track i; let i = $index) {
              <div class="item-card" [attr.data-testid]="'experience-' + i">
                <div class="form-grid">
                  <div class="field"><label [for]="'ee' + i">Employer *</label><input [id]="'ee' + i" data-testid="exp-employer" [(ngModel)]="e.employerName" (ngModelChange)="markDirty()" /></div>
                  <div class="field"><label [for]="'ej' + i">Job title *</label><input [id]="'ej' + i" data-testid="exp-title" [(ngModel)]="e.jobTitle" (ngModelChange)="markDirty()" /></div>
                  <div class="field"><label [for]="'es' + i">Start (YYYY-MM) *</label><input [id]="'es' + i" data-testid="exp-start" [(ngModel)]="e.startDate" (ngModelChange)="markDirty()" placeholder="2021-03" inputmode="numeric" maxlength="7" /></div>
                  <div class="field"><label [for]="'ed' + i">End (YYYY-MM)</label><input [id]="'ed' + i" [(ngModel)]="e.endDate" (ngModelChange)="markDirty()" [disabled]="!!e.isCurrent" placeholder="2023-08" inputmode="numeric" maxlength="7" /></div>
                  <div class="field"><label [for]="'el' + i">Location</label><input [id]="'el' + i" [(ngModel)]="e.location" (ngModelChange)="markDirty()" /></div>
                  <label class="checkbox"><input type="checkbox" [(ngModel)]="e.isCurrent" (ngModelChange)="markDirty()" data-testid="exp-current" /> I currently work here</label>
                </div>
                <div class="stack">
                  <div class="group-title"><h3>Bullets</h3>
                    <button class="btn ghost sm" (click)="addBullet(e)"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> Add bullet</button></div>
                  @for (b of e.bullets; track bi; let bi = $index) {
                    <div class="stack">
                      <div class="field"><label [for]="'eb' + i + '_' + bi">Bullet {{ bi + 1 }}</label>
                        <textarea [id]="'eb' + i + '_' + bi" data-testid="exp-bullet" [(ngModel)]="b.content" (ngModelChange)="markDirty()" maxlength="600" style="min-height:3.5rem"></textarea></div>
                      <div class="row">
                        <select [(ngModel)]="b.kind" (ngModelChange)="markDirty()" [attr.aria-label]="'Bullet ' + (bi + 1) + ' type'" style="min-height:2.25rem">
                          <option value="RESPONSIBILITY">Responsibility</option><option value="ACHIEVEMENT">Achievement</option></select>
                        <button class="btn ghost sm" (click)="e.bullets = move(e.bullets!, bi, bi - 1); markDirty()" [disabled]="bi === 0" [attr.aria-label]="'Move bullet ' + (bi + 1) + ' up'"><ion-icon name="chevron-up-outline" aria-hidden="true"></ion-icon></button>
                        <button class="btn ghost sm" (click)="e.bullets = move(e.bullets!, bi, bi + 1); markDirty()" [disabled]="bi === e.bullets!.length - 1" [attr.aria-label]="'Move bullet ' + (bi + 1) + ' down'"><ion-icon name="chevron-down-outline" aria-hidden="true"></ion-icon></button>
                        <button class="btn ghost sm" (click)="e.bullets!.splice(bi, 1); markDirty()" [attr.aria-label]="'Remove bullet ' + (bi + 1)"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon></button>
                      </div>
                    </div>
                  }
                </div>
                <div class="row">
                  <button class="btn ghost sm" (click)="shift('experiences', i, -1)" [disabled]="i === 0" [attr.aria-label]="'Move experience ' + (i + 1) + ' up'"><ion-icon name="chevron-up-outline" aria-hidden="true"></ion-icon> Up</button>
                  <button class="btn ghost sm" (click)="shift('experiences', i, 1)" [disabled]="i === f.experiences.length - 1" [attr.aria-label]="'Move experience ' + (i + 1) + ' down'"><ion-icon name="chevron-down-outline" aria-hidden="true"></ion-icon> Down</button>
                  <button class="btn danger sm" data-testid="exp-remove" (click)="remove('experiences', i)" [attr.aria-label]="'Remove experience ' + (i + 1)"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Remove</button>
                </div>
              </div>
            }
          </section>

          <section class="card" aria-labelledby="skills-h">
            <div class="group-title"><h2 id="skills-h">Skills</h2>
              <button class="btn ghost sm" data-testid="add-skill" (click)="add('skills', { name: '', category: '' })"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> Add skill</button></div>
            @for (s of f.skills; track i; let i = $index) {
              <div class="item-card">
                <div class="form-grid">
                  <div class="field"><label [for]="'sn' + i">Skill</label><input [id]="'sn' + i" data-testid="skill-name" [(ngModel)]="s.name" (ngModelChange)="markDirty()" /></div>
                  <div class="field"><label [for]="'sc' + i">Category</label><input [id]="'sc' + i" [(ngModel)]="s.category" (ngModelChange)="markDirty()" placeholder="Languages" /></div>
                </div>
                <div class="row"><button class="btn ghost sm" (click)="remove('skills', i)" [attr.aria-label]="'Remove skill ' + (i + 1)"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Remove</button></div>
              </div>
            }
          </section>

          <section class="card" aria-labelledby="edu-h">
            <div class="group-title"><h2 id="edu-h">Education</h2>
              <button class="btn ghost sm" data-testid="add-education" (click)="add('educations', { institution: '', degree: '' })"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> Add education</button></div>
            @for (e of f.educations; track i; let i = $index) {
              <div class="item-card">
                <div class="form-grid">
                  <div class="field"><label [for]="'ei' + i">Institution *</label><input [id]="'ei' + i" data-testid="edu-institution" [(ngModel)]="e.institution" (ngModelChange)="markDirty()" /></div>
                  <div class="field"><label [for]="'eg' + i">Degree *</label><input [id]="'eg' + i" data-testid="edu-degree" [(ngModel)]="e.degree" (ngModelChange)="markDirty()" /></div>
                  <div class="field"><label [for]="'ef' + i">Field</label><input [id]="'ef' + i" [(ngModel)]="e.field" (ngModelChange)="markDirty()" /></div>
                  <div class="field"><label [for]="'ey' + i">End (YYYY-MM)</label><input [id]="'ey' + i" [(ngModel)]="e.endDate" (ngModelChange)="markDirty()" maxlength="7" inputmode="numeric" /></div>
                </div>
                <div class="row"><button class="btn ghost sm" (click)="remove('educations', i)" [attr.aria-label]="'Remove education ' + (i + 1)"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Remove</button></div>
              </div>
            }
          </section>

          <section class="card" aria-labelledby="proj-h">
            <div class="group-title"><h2 id="proj-h">Projects</h2>
              <button class="btn ghost sm" data-testid="add-project" (click)="add('projects', { name: '', technologies: [] })"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> Add project</button></div>
            @for (x of f.projects; track i; let i = $index) {
              <div class="item-card">
                <div class="form-grid">
                  <div class="field"><label [for]="'pn' + i">Name *</label><input [id]="'pn' + i" data-testid="project-name" [(ngModel)]="x.name" (ngModelChange)="markDirty()" /></div>
                  <div class="field"><label [for]="'pu' + i">URL</label><input [id]="'pu' + i" [(ngModel)]="x.url" (ngModelChange)="markDirty()" inputmode="url" /></div>
                  <div class="field full"><label [for]="'pd' + i">Description</label><textarea [id]="'pd' + i" [(ngModel)]="x.description" (ngModelChange)="markDirty()"></textarea></div>
                  <div class="field full"><label [for]="'pt' + i">Technologies</label>
                    <input [id]="'pt' + i" [ngModel]="tech(x)" (ngModelChange)="setTech(x, $event)" placeholder="Angular, NestJS" /><span class="hint">Comma separated</span></div>
                </div>
                <div class="row"><button class="btn ghost sm" (click)="remove('projects', i)" [attr.aria-label]="'Remove project ' + (i + 1)"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Remove</button></div>
              </div>
            }
          </section>

          <section class="card" aria-labelledby="cert-h">
            <div class="group-title"><h2 id="cert-h">Certifications</h2>
              <button class="btn ghost sm" (click)="add('certifications', { name: '' })"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> Add certification</button></div>
            @for (c of f.certifications; track i; let i = $index) {
              <div class="item-card">
                <div class="form-grid">
                  <div class="field"><label [for]="'cn' + i">Name *</label><input [id]="'cn' + i" [(ngModel)]="c.name" (ngModelChange)="markDirty()" /></div>
                  <div class="field"><label [for]="'ci' + i">Issuer</label><input [id]="'ci' + i" [(ngModel)]="c.issuer" (ngModelChange)="markDirty()" /></div>
                </div>
                <div class="row"><button class="btn ghost sm" (click)="remove('certifications', i)" [attr.aria-label]="'Remove certification ' + (i + 1)"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Remove</button></div>
              </div>
            }
          </section>

          <section class="card" aria-labelledby="lang-h">
            <div class="group-title"><h2 id="lang-h">Languages</h2>
              <button class="btn ghost sm" (click)="add('languages', { name: '' })"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> Add language</button></div>
            @for (l of f.languages; track i; let i = $index) {
              <div class="item-card">
                <div class="form-grid">
                  <div class="field"><label [for]="'ln' + i">Language</label><input [id]="'ln' + i" [(ngModel)]="l.name" (ngModelChange)="markDirty()" /></div>
                  <div class="field"><label [for]="'lp' + i">Proficiency</label><input [id]="'lp' + i" [(ngModel)]="l.proficiency" (ngModelChange)="markDirty()" /></div>
                </div>
                <div class="row"><button class="btn ghost sm" (click)="remove('languages', i)" [attr.aria-label]="'Remove language ' + (i + 1)"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Remove</button></div>
              </div>
            }
          </section>

          @if (errors().length) {
            <div class="banner err" role="alert" data-testid="profile-errors">
              <strong>Fix before saving:</strong>
              <ul>@for (er of errors(); track er) { <li>{{ er }}</li> }</ul>
            </div>
          }
        }
      </div>
    </ion-content>
    @if (loaded()) {
      <div class="sticky-actions" style="position:sticky;bottom:0">
        <button class="btn" data-testid="profile-save" (click)="save()" [disabled]="saving()"><ion-icon name="save-outline" aria-hidden="true"></ion-icon> Save profile</button>
        <a class="btn ghost" routerLink="/templates" data-tour="step-profile-action" data-testid="profile-continue">{{ 'flow.profileContinue' | t }}</a>
        <button class="btn danger sm" data-testid="profile-reset" (click)="openReset()" [disabled]="saving() || resetting()">
          <ion-icon name="refresh-outline" aria-hidden="true"></ion-icon> {{ 'profile.reset.button' | t }}
        </button>
      </div>
    }
    <app-reset-profile-dialog [open]="resetOpen()" [busy]="resetting()" domId="reset-profile-page"
                              (cancelRequest)="closeReset()" (confirmRequest)="resetProfile()" />
  `,
})
export class ProfilePage implements OnInit, OnDestroy {
  f: Form = this.normalise(emptyProfile());
  loaded = signal(false);
  loadError = signal('');
  saving = signal(false);
  errors = signal<string[]>([]);
  resetOpen = signal(false);
  resetting = signal(false);
  private snapshot = '';
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private api: ApiService, private notify: NotifyService, private locale: LocaleService) {}

  ngOnInit() {
    this.api.getProfile().subscribe({
      next: (p) => { this.f = this.normalise(p); this.snapshot = this.json(); this.loaded.set(true); },
      error: (e) => {
        if (e.status === 404) { this.f = this.normalise(emptyProfile()); this.snapshot = this.json(); this.loaded.set(true); }
        else this.loadError.set(errorMessage(e));
      },
    });
  }

  /** Ionic caches routed pages (IonicRouteStrategy), so ngOnInit does not re-run when returning here
   *  (e.g. after the resume importer saved new details). Refetch on every entry after the first. */
  ionViewWillEnter() {
    if (!this.loaded()) return; // first entry: ngOnInit already fetches
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    void this.refresh();
  }

  /** Leaving the page (e.g. to /import): flush the debounced autosave now so a stale timer
   *  cannot fire later and overwrite data saved from another page. */
  ionViewWillLeave() {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    if (this.isDirty()) void this.autosave();
  }

  private async refresh() {
    if (this.isDirty()) {
      await this.autosave();
      if (this.isDirty()) return; // save failed; keep local edits instead of clobbering them
    }
    this.ngOnInit();
  }

  ngOnDestroy() {
    if (this.timer) clearTimeout(this.timer);
    if (this.isDirty()) void this.autosave();
  }

  private normalise(p: CareerProfile): Form {
    return {
      ...p,
      links: p.links ?? [], skills: p.skills ?? [], educations: p.educations ?? [], projects: p.projects ?? [],
      certifications: p.certifications ?? [], languages: p.languages ?? [],
      experiences: (p.experiences ?? []).map((e) => ({ ...e, bullets: e.bullets ?? [] })),
    };
  }
  private json() { return JSON.stringify(toProfileInput(this.f)); }
  isDirty() { return this.loaded() && this.json() !== this.snapshot; }

  /** Debounce autosave whenever changes are made */
  markDirty() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.autosave(), 1500);
  }

  private autosave(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isDirty() || this.saving()) { resolve(); return; }
      const errs = validateProfile(this.f);
      if (errs.length) { resolve(); return; } // Don't show toast for incomplete transient draft typing
      this.saving.set(true);
      this.api.saveProfile(toProfileInput(this.f)).subscribe({
        next: (p) => {
          this.snapshot = this.json();
          this.saving.set(false);
          resolve();
        },
        error: () => {
          this.saving.set(false);
          resolve();
        },
      });
    });
  }

  add(key: ListKey, item: Link | Skill | Education | Project | Certification | LanguageItem) { (this.f[key] as unknown[]).push(item); this.markDirty(); }
  addExperience() { const e: Experience = { employerName: '', jobTitle: '', startDate: '', isCurrent: false, bullets: [] }; this.f.experiences.push(e); this.markDirty(); }
  addBullet(e: Experience) { (e.bullets ??= []).push({ kind: 'RESPONSIBILITY', content: '' }); this.markDirty(); }
  remove(key: ListKey, i: number) { (this.f[key] as unknown[]).splice(i, 1); this.markDirty(); }
  shift(key: ListKey, i: number, d: number) { (this.f as unknown as Record<string, unknown[]>)[key] = moveItem(this.f[key] as unknown[], i, i + d); this.markDirty(); }
  move = moveItem;
  tech(x: Project) { return (x.technologies ?? []).join(', '); }
  setTech(x: Project, v: string) { x.technologies = (v ?? '').split(',').map((t) => t.trim()).filter(Boolean); this.markDirty(); }

  save() {
    const errs = validateProfile(this.f);
    this.errors.set(errs);
    if (errs.length) return;
    this.saving.set(true);
    this.api.saveProfile(toProfileInput(this.f)).subscribe({
      next: (p) => { this.f = this.normalise(p); this.snapshot = this.json(); this.saving.set(false); void this.notify.toast('Profile saved'); },
      error: (e) => { this.saving.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  /** Discard any pending debounced save so it cannot overwrite the restored profile. */
  openReset() {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    this.resetOpen.set(true);
  }
  /** Re-arm the debounce after a cancelled reset so pre-existing edits still autosave. */
  closeReset() { this.resetOpen.set(false); if (this.isDirty()) this.markDirty(); }

  resetProfile() {
    if (this.resetting()) return;
    this.resetting.set(true);
    this.api.resetProfile().subscribe({
      next: (p) => {
        this.f = this.normalise(p);
        this.snapshot = this.json();
        this.errors.set([]);
        this.resetting.set(false);
        this.resetOpen.set(false);
        void this.notify.toast(this.locale.t('profile.reset.success'));
      },
      error: (e) => {
        this.resetting.set(false);
        this.resetOpen.set(false);
        void this.notify.toast(errorMessage(e), 'error');
      },
    });
  }
}
