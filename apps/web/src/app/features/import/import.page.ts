import { HttpClient } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { CareerProfile } from '../../core/models';
import { errorMessage, NotifyService } from '../../core/notify.service';
import { validateProfile } from '../../core/profile-mapper';
import { SettingsService } from '../../core/settings.service';
import { checkUpload, ImportSuggestion, mergeIntoProfile, ParseResponse, Picked, Scalar, SCALARS } from './import-merge';

interface Row<T> { on: boolean; v: T }
const LABELS: Record<Scalar, string> = { fullName: 'Full name', email: 'Email', phone: 'Phone', location: 'Location', headline: 'Headline', summary: 'Summary' };

/**
 * Review-and-confirm import (docs 05, 18 s.7). The file is sent once, parsed in memory by the API and discarded; the response is
 * only suggestions. Nothing reaches the career profile until the user ticks it and presses "Add to my profile".
 */
@Component({
  selector: 'app-import',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule],
  template: `
    <ion-header><ion-toolbar><ion-title>Import resume</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell reading">
        <div class="page-head"><div><h1>Import a resume</h1><p>Pull your details from a PDF or DOCX, review them, then add what is correct to your career profile.</p></div></div>

        @if (!result()) {
          <section class="card" aria-labelledby="up-h" data-testid="upload-card">
            <h2 id="up-h">1. Choose a file</h2>
            <p class="muted">PDF or DOCX, up to 5 MB, with selectable text. The file is read once to extract text and is <strong>not stored</strong> anywhere. Nothing is saved until you confirm.</p>
            <div class="field" [class.invalid]="!!error()">
              <label for="file">Resume file</label>
              <input id="file" type="file" data-testid="import-file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" (change)="pick($event)" [disabled]="busy()" />
              @if (error()) { <span class="error" role="alert" data-testid="import-error">{{ error() }}</span> }
            </div>
            @if (busy()) { <p role="status" data-testid="import-busy"><ion-icon name="cloud-upload-outline" aria-hidden="true"></ion-icon> Reading your file…</p> }
          </section>
        } @else {
          <section class="card" aria-labelledby="rv-h" data-testid="review">
            <h2 id="rv-h">2. Review what we found</h2>
            <p class="muted">Found {{ result()!.kind.toUpperCase() }} content{{ result()!.pages ? ' (' + result()!.pages + ' pages)' : '' }}. Untick anything that is wrong, and edit fields as needed. These are suggestions, not facts.</p>
            @for (w of result()!.suggestion.warnings; track w) { <div class="banner warn" role="status" data-testid="import-warning">{{ w }}</div> }
          </section>

          <section class="card" aria-labelledby="sc-h" data-testid="review-details">
            <h2 id="sc-h">Details</h2>
            @for (f of scalarKeys; track f) {
              @if (scalars()[f]; as s) {
                <div class="field">
                  <label class="checkbox"><input type="checkbox" [(ngModel)]="s.on" [attr.data-testid]="'use-' + f" /> {{ labels[f] }}</label>
                  <input [(ngModel)]="s.v" [attr.data-testid]="'val-' + f" [attr.aria-label]="labels[f] + ' value'" />
                  @if (current()?.[f]) { <span class="hint" [attr.data-testid]="'cur-' + f">Current: {{ current()![f] }}</span> }
                </div>
              }
            }
          </section>

          @if (links().length) {
            <section class="card"><h2>Links</h2>
              @for (r of links(); track $index) { <label class="checkbox"><input type="checkbox" [(ngModel)]="r.on" data-testid="use-link" /> {{ r.v.label }}: {{ r.v.url }}</label> }
            </section>
          }

          @if (exps().length) {
            <section class="card" data-testid="review-experience"><h2>Experience</h2>
              @for (r of exps(); track $index) {
                <div class="item-card" data-testid="exp-row">
                  <label class="checkbox"><input type="checkbox" [(ngModel)]="r.on" data-testid="use-exp" /> Include this role
                    <span class="badge" [class.warn]="r.conf !== 'high'" data-testid="exp-conf">{{ r.conf }} confidence</span></label>
                  <div class="form-grid">
                    <div class="field"><label>Job title</label><input [(ngModel)]="r.v.jobTitle" data-testid="exp-title" /></div>
                    <div class="field"><label>Employer</label><input [(ngModel)]="r.v.employerName" data-testid="exp-employer" /></div>
                    <div class="field"><label>Start (YYYY-MM)</label><input [(ngModel)]="r.v.startDate" data-testid="exp-start" /></div>
                    <div class="field"><label>End (YYYY-MM)</label><input [(ngModel)]="r.end" [disabled]="r.v.isCurrent" data-testid="exp-end" /></div>
                    <div class="field full"><label class="checkbox"><input type="checkbox" [(ngModel)]="r.v.isCurrent" /> I currently work here</label></div>
                    <div class="field full"><label>Achievements / responsibilities (one per line)</label><textarea rows="3" [(ngModel)]="r.bulletText" data-testid="exp-bullets"></textarea></div>
                  </div>
                </div>
              }
            </section>
          }

          @if (skills().length) {
            <section class="card" data-testid="review-skills"><h2>Skills</h2>
              <div class="row" style="flex-wrap:wrap">
                @for (r of skills(); track $index) { <label class="chip"><input type="checkbox" [(ngModel)]="r.on" data-testid="use-skill" /> {{ r.v.name }}</label> }
              </div>
            </section>
          }

          @if (edus().length) {
            <section class="card" data-testid="review-education"><h2>Education</h2>
              @for (r of edus(); track $index) {
                <div class="item-card">
                  <label class="checkbox"><input type="checkbox" [(ngModel)]="r.on" data-testid="use-edu" /> Include
                    <span class="badge" [class.warn]="r.conf !== 'high'">{{ r.conf }} confidence</span></label>
                  <div class="form-grid">
                    <div class="field"><label>Institution</label><input [(ngModel)]="r.v.institution" data-testid="edu-institution" /></div>
                    <div class="field"><label>Degree</label><input [(ngModel)]="r.v.degree" data-testid="edu-degree" /></div>
                  </div>
                </div>
              }
            </section>
          }

          @for (g of simple(); track g.title) {
            @if (g.rows.length) {
              <section class="card"><h2>{{ g.title }}</h2>
                @for (r of g.rows; track $index) { <label class="checkbox"><input type="checkbox" [(ngModel)]="r.on" [attr.data-testid]="'use-' + g.key" /> {{ r.label }}</label> }
              </section>
            }
          }

          @if (errors().length) {
            <div class="banner err" role="alert" data-testid="import-errors">@for (e of errors(); track e) { <div>{{ e }}</div> }</div>
          }
          <div class="sticky-actions row">
            <button class="btn" data-testid="import-confirm" (click)="confirm()" [disabled]="busy()"><ion-icon name="checkmark-circle-outline" aria-hidden="true"></ion-icon> Add to my profile</button>
            <button class="btn ghost" data-testid="import-cancel" (click)="reset()">Start over</button>
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class ImportPage {
  readonly labels = LABELS;
  readonly scalarKeys = SCALARS;
  busy = signal(false);
  error = signal('');
  errors = signal<string[]>([]);
  result = signal<ParseResponse | null>(null);
  current = signal<CareerProfile | null>(null);
  scalars = signal<Partial<Record<Scalar, Row<string>>>>({});
  links = signal<Array<Row<{ label: string; url: string }>>>([]);
  exps = signal<Array<Row<any> & { conf: string; end: string; bulletText: string }>>([]);
  skills = signal<Array<Row<{ name: string; category?: string }>>>([]);
  edus = signal<Array<Row<any> & { conf: string }>>([]);
  simple = signal<Array<{ key: string; title: string; rows: Array<Row<any> & { label: string }> }>>([]);

  constructor(private http: HttpClient, private settings: SettingsService, private api: ApiService, private notify: NotifyService, private router: Router) {}

  async pick(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0]; if (!file) return;
    this.error.set('');
    const problem = checkUpload(file);
    if (problem) { this.error.set(problem); input.value = ''; return; }
    this.busy.set(true);
    try {
      const form = new FormData(); form.append('file', file, file.name);
      const res = await firstValueFrom(this.http.post<ParseResponse>(`${this.settings.apiBase}/resume-imports/parse`, form));
      this.current.set(await this.loadCurrent());
      this.load(res);
    } catch (e) { this.error.set(errorMessage(e)); }
    finally { this.busy.set(false); input.value = ''; }
  }

  private async loadCurrent(): Promise<CareerProfile | null> {
    try { return await firstValueFrom(this.api.getProfile()); } catch { return null; }
  }

  private load(res: ParseResponse) {
    const s: ImportSuggestion = res.suggestion; const cur = this.current();
    const sc: Partial<Record<Scalar, Row<string>>> = {};
    for (const f of SCALARS) {
      const v = s[f]; if (!v) continue;
      const existing = (cur?.[f] ?? '').toString().trim();
      sc[f] = { v, on: true }; // auto-select all fetched fields by default
    }
    this.scalars.set(sc);
    this.links.set(s.links.map((v) => ({ v, on: true })));
    this.exps.set(s.experiences.map((e) => ({ on: true, conf: e.confidence, v: { ...e }, end: e.endDate ?? '', bulletText: e.bullets.map((b) => b.content).join('\n') })));
    this.skills.set(s.skills.map((v) => ({ v, on: true })));
    this.edus.set(s.educations.map((e) => ({ on: true, conf: e.confidence, v: { ...e } })));
    this.simple.set([
      { key: 'project', title: 'Projects', rows: s.projects.map((v) => ({ v, on: true, label: v.name })) },
      { key: 'cert', title: 'Certifications', rows: s.certifications.map((v) => ({ v, on: true, label: v.name })) },
      { key: 'lang', title: 'Languages', rows: s.languages.map((v) => ({ v, on: true, label: v.proficiency ? `${v.name} (${v.proficiency})` : v.name })) },
    ]);
    this.result.set(res);
  }

  reset() { this.result.set(null); this.errors.set([]); this.error.set(''); }

  picked(): Picked {
    const scalars: Picked['scalars'] = {};
    for (const f of SCALARS) { const r = this.scalars()[f]; if (r?.on && r.v.trim()) scalars[f] = r.v; }
    const g = (k: string) => this.simple().find((x) => x.key === k)!.rows.filter((r) => r.on).map((r) => r.v);
    return {
      scalars,
      links: this.links().filter((r) => r.on).map((r) => r.v),
      experiences: this.exps().filter((r) => r.on).map((r) => ({
        employerName: r.v.employerName.trim(), jobTitle: r.v.jobTitle.trim(), startDate: r.v.startDate.trim(), endDate: r.v.isCurrent ? null : (r.end.trim() || null), isCurrent: !!r.v.isCurrent,
        bullets: r.bulletText.split('\n').map((c: string) => ({ content: c.trim() })).filter((b: { content: string }) => b.content),
      })),
      skills: this.skills().filter((r) => r.on).map((r) => ({ name: r.v.name, category: r.v.category ?? null })),
      educations: this.edus().filter((r) => r.on).map((r) => ({ institution: r.v.institution.trim(), degree: r.v.degree.trim(), startDate: r.v.startDate ?? null, endDate: r.v.endDate ?? null })),
      projects: g('project'), certifications: g('cert'), languages: g('lang'),
    };
  }

  async confirm() {
    const { profile, added } = mergeIntoProfile(this.current(), this.picked());
    const errs = validateProfile(profile);
    if (errs.length) { this.errors.set(errs); return; }
    if (added === 0) { this.errors.set(['Nothing is selected. Tick at least one item to add.']); return; }
    this.errors.set([]); this.busy.set(true);
    try {
      await firstValueFrom(this.api.saveProfile(profile));
      await this.notify.toast(`Added ${added} ${added === 1 ? 'item' : 'items'} to your profile`);
      await this.router.navigateByUrl('/profile');
    } catch (e) { this.errors.set([errorMessage(e)]); }
    finally { this.busy.set(false); }
  }
}
