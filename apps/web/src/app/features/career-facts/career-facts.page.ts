import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ApiService } from '../../core/api.service';
import { CareerProfile } from '../../core/models';
import { LocalFileService } from '../../core/local-file.service';
import { errorMessage, NotifyService } from '../../core/notify.service';
import { toProfileInput } from '../../core/profile-mapper';
import { FeatureApi } from '../common/feature-api';

interface Metric { value: string; label: string; confirmed: boolean }
interface Fact {
  id: string; kind: string; origin: string; status: string; title: string; source?: string | null; revision: number; updatedAt: string;
  data: { context?: string; action?: string; outcome?: string; scope?: string; skills?: string[]; metric?: Metric; experienceRef?: string; roles?: string[]; locations?: string[]; workModes?: string[]; notes?: string; start?: string; end?: string; note?: string };
}
interface Revision { revision: number; note?: string; createdAt: string; snapshot: { title: string; status: string; data: Fact['data'] } }
const ORIGIN: Record<string, string> = { USER_ENTERED: 'Entered by you', IMPORTED: 'Imported', AI_REWRITTEN: 'Reworded by AI', EXTERNALLY_VERIFIED: 'Externally verified' };

/** Career facts and achievement bank (doc 26): canonical facts, reused on purpose, never changed by resume edits. */
@Component({
  selector: 'app-career-facts',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, DatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>Achievement bank</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head"><div><h1>Achievement bank</h1>
          <p>Write each achievement once, confirm it, and reuse it in any resume. Editing a resume never changes these facts.</p></div>
          <button class="btn ghost" data-testid="facts-export" (click)="exportAll()"><ion-icon name="cloud-download-outline" aria-hidden="true"></ion-icon> Export my data</button></div>

        @if (error()) { <div class="banner err" role="alert" data-testid="facts-error">{{ error() }}</div> }

        <section class="card" aria-labelledby="qd-h" data-testid="quick-draft">
          <h2 id="qd-h">Quick draft from rough notes</h2>
          <div class="field"><label for="rough">What did you do? (a sentence or two)</label>
            <textarea id="rough" rows="2" maxlength="600" [(ngModel)]="rough" data-testid="rough-text" placeholder="Reduced build time by 35% by caching Docker layers"></textarea>
            <span class="hint">We only structure what you wrote. We never add outcomes, numbers or skills you did not mention.</span></div>
          <button class="btn" data-testid="make-draft" (click)="makeDraft()" [disabled]="busy() || rough.trim().length < 8">Create draft</button>
          @if (draftInfo()) { <div class="banner warn" role="status" data-testid="draft-info">
            @for (h of draftInfo()!.hints; track h) { <div>{{ h }}</div> }
            <div>Still missing: {{ draftInfo()!.missing.join(', ') }}. Open the draft below to complete it.</div></div> }
        </section>

        <section class="card" aria-labelledby="add-h">
          <div class="row between"><h2 id="add-h">Add an achievement</h2>
            <button class="btn ghost sm" (click)="showForm.set(!showForm())" data-testid="toggle-form">{{ showForm() ? 'Hide' : 'Show' }} form</button></div>
          @if (showForm()) {
            <div class="form-grid" data-testid="fact-form">
              <div class="field full" [class.invalid]="touched() && !f.action.trim()"><label for="f-action">What you did *</label><textarea id="f-action" rows="2" maxlength="600" [(ngModel)]="f.action" data-testid="f-action"></textarea></div>
              <div class="field full"><label for="f-context">Context (the situation)</label><input id="f-context" maxlength="500" [(ngModel)]="f.context" data-testid="f-context" /></div>
              <div class="field full"><label for="f-outcome">Outcome</label><input id="f-outcome" maxlength="500" [(ngModel)]="f.outcome" data-testid="f-outcome" /></div>
              <div class="field"><label for="f-scope">Scope (team, users, budget)</label><input id="f-scope" maxlength="300" [(ngModel)]="f.scope" data-testid="f-scope" /></div>
              <div class="field"><label for="f-ref">Role or employer</label><input id="f-ref" maxlength="150" [(ngModel)]="f.experienceRef" data-testid="f-ref" /></div>
              <div class="field full"><label for="f-skills">Skills (comma separated)</label>
                <input id="f-skills" [(ngModel)]="f.skills" data-testid="f-skills" (blur)="normalizeSkills()" />
                @if (skillNote()) { <span class="hint" data-testid="skill-note">{{ skillNote() }}</span> }</div>
              <div class="field"><label for="f-mv">Number (optional)</label><input id="f-mv" maxlength="40" [(ngModel)]="f.metricValue" data-testid="f-metric-value" placeholder="40%" /></div>
              <div class="field"><label for="f-ml">What the number measures</label><input id="f-ml" maxlength="120" [(ngModel)]="f.metricLabel" data-testid="f-metric-label" placeholder="faster page loads" /></div>
              @if (f.metricValue.trim()) { <div class="field full"><label class="checkbox"><input type="checkbox" [(ngModel)]="f.metricConfirmed" data-testid="f-metric-confirm" /> I confirm this number is accurate</label></div> }
            </div>
            @if (touched() && !f.action.trim()) { <p class="error" role="alert">Describe what you did.</p> }
            <div class="row"><button class="btn" data-testid="save-fact" (click)="save()" [disabled]="busy()">Save as draft</button>
              <button class="btn ghost" data-testid="save-confirm-fact" (click)="save(true)" [disabled]="busy()">Save and confirm</button></div>
          }
        </section>

        <section class="card" aria-labelledby="pref-h" data-testid="prefs">
          <h2 id="pref-h">Career preferences</h2>
          <div class="form-grid">
            <div class="field"><label for="p-roles">Roles you want (comma separated)</label><input id="p-roles" [(ngModel)]="pref.roles" data-testid="pref-roles" /></div>
            <div class="field"><label for="p-loc">Locations</label><input id="p-loc" [(ngModel)]="pref.locations" data-testid="pref-locations" /></div>
            <div class="field full"><span class="label">Work modes</span>
              <div class="row">@for (m of modes; track m) { <label class="chip"><input type="checkbox" [checked]="pref.modes.includes(m)" (change)="toggleMode(m)" [attr.data-testid]="'mode-' + m" /> {{ m }}</label> }</div></div>
          </div>
          <button class="btn ghost" data-testid="save-prefs" (click)="savePrefs()" [disabled]="busy()">Save preferences</button>
        </section>

        <section class="card" aria-labelledby="brk-h" data-testid="breaks">
          <h2 id="brk-h">Career breaks</h2>
          <p class="muted small">Optional. Record time away from work in your own words (study, caring, health, travel, anything). A break is never scored, flagged or added to a resume unless you choose to.</p>
          @if (breaks().length) {
            <ul class="list" data-testid="break-list">
              @for (b of breaks(); track b.id) {
                <li class="item-card row between" data-testid="break-item">
                  <span class="wrap"><strong>{{ b.data.start || '?' }} to {{ b.data.end || 'ongoing' }}</strong>@if (b.data.note) { <span> - {{ b.data.note }}</span> }</span>
                  <span class="row"><button class="btn ghost sm" (click)="editBreak(b)" data-testid="break-edit" [attr.aria-label]="'Edit break ' + (b.data.start || '')">Edit</button>
                    <button class="btn ghost sm" (click)="deleteBreak(b)" data-testid="break-delete" [attr.aria-label]="'Delete break ' + (b.data.start || '')">Delete</button></span>
                </li>
              }
            </ul>
          } @else { <p class="muted small" data-testid="breaks-empty">No breaks recorded.</p> }
          <div class="form-grid">
            <div class="field"><label for="b-start">From (YYYY or YYYY-MM)</label><input id="b-start" [(ngModel)]="brk.start" data-testid="break-start" placeholder="2021-03" /></div>
            <div class="field"><label for="b-end">To (leave empty if ongoing)</label><input id="b-end" [(ngModel)]="brk.end" data-testid="break-end" placeholder="2022-01" /></div>
            <div class="field full"><label for="b-note">Note (optional)</label><input id="b-note" maxlength="300" [(ngModel)]="brk.note" data-testid="break-note" /></div>
          </div>
          @if (breakError()) { <p class="error" role="alert" data-testid="break-error">{{ breakError() }}</p> }
          <div class="row"><button class="btn ghost" (click)="saveBreak()" [disabled]="busy()" data-testid="break-save">{{ breakId ? 'Save changes' : 'Add break' }}</button>
            @if (breakId) { <button class="btn ghost" (click)="resetBreak()" data-testid="break-cancel">Cancel</button> }</div>
        </section>

        <div class="row" role="group" aria-label="Filter by status">
          @for (s of statuses; track s.v) { <button class="chip" [attr.aria-pressed]="status() === s.v" (click)="setStatus(s.v)" [attr.data-testid]="'filter-' + s.v">{{ s.l }}</button> }
        </div>

        @if (loading()) { <div class="sk-stack" role="status" aria-busy="true"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
        @else if (!achievements().length) { <div class="empty" data-testid="facts-empty"><h2>Nothing here yet</h2><p class="muted">Write a quick draft above or add an achievement.</p></div> }
        @else {
          <ul class="list" data-testid="fact-list">
            @for (a of achievements(); track a.id) {
              <li class="card" [attr.data-testid]="'fact-' + a.id">
                <div class="row between">
                  <div class="grow"><h3 class="wrap" data-testid="fact-title">{{ a.data.action }}</h3>
                    @if (a.data.outcome) { <p class="small">Outcome: {{ a.data.outcome }}</p> }
                    <p class="muted small">{{ origin(a.origin) }} · updated {{ a.updatedAt | date: 'medium' }} · revision {{ a.revision }}
                      @if (a.data.skills?.length) { · {{ a.data.skills!.join(', ') }} }</p>
                    @if (a.data.metric) { <p class="small" data-testid="fact-metric">{{ a.data.metric.value }} {{ a.data.metric.label }}
                      <span class="badge" [class.ok]="a.data.metric.confirmed" [class.warn]="!a.data.metric.confirmed">{{ a.data.metric.confirmed ? 'number confirmed' : 'number not confirmed' }}</span></p> }
                  </div>
                  <span class="badge" [class.ok]="a.status === 'CONFIRMED'" [class.warn]="a.status === 'DRAFT'" data-testid="fact-status">{{ a.status === 'CONFIRMED' ? 'Confirmed' : a.status === 'DRAFT' ? 'Draft' : 'Archived' }}</span>
                </div>
                @if (confirming() === a.id) {
                  <div class="banner warn" data-testid="confirm-box">
                    @if (a.data.metric && !a.data.metric.confirmed) { <label class="checkbox"><input type="checkbox" [(ngModel)]="confirmMetric" data-testid="confirm-metric" /> I confirm "{{ a.data.metric.value }} {{ a.data.metric.label }}" is accurate</label> }
                    @else { <span>Confirm that this achievement is true.</span> }
                    <div class="row"><button class="btn sm" data-testid="do-confirm" (click)="confirm(a)">Confirm</button><button class="btn ghost sm" (click)="confirming.set('')">Cancel</button></div>
                  </div>
                }
                @if (editing() === a.id) {
                  <div class="field"><label [for]="'ed-' + a.id">Edit what you did</label><textarea [id]="'ed-' + a.id" rows="2" [(ngModel)]="editText" data-testid="edit-text"></textarea></div>
                  <div class="row"><button class="btn sm" data-testid="edit-save" (click)="saveEdit(a)">Save edit</button><button class="btn ghost sm" (click)="editing.set('')">Cancel</button></div>
                }
                <div class="row" style="flex-wrap:wrap">
                  @if (a.status !== 'CONFIRMED' && a.status !== 'ARCHIVED') { <button class="btn sm" data-testid="fact-confirm" (click)="confirming.set(a.id); confirmMetric = false">Confirm</button> }
                  <button class="btn ghost sm" data-testid="fact-edit" (click)="editing.set(a.id); editText = a.data.action ?? ''">Edit</button>
                  <button class="btn ghost sm" data-testid="fact-history" (click)="toggleHistory(a)">History</button>
                  @if (a.status === 'CONFIRMED') { <button class="btn ghost sm" data-testid="fact-use" (click)="usingId.set(usingId() === a.id ? '' : a.id)">Add to my profile</button> }
                  <button class="btn ghost sm" data-testid="fact-archive" (click)="archive(a)">Archive</button>
                  <button class="btn danger sm" data-testid="fact-delete" (click)="remove(a)">Delete</button>
                </div>
                @if (usingId() === a.id) {
                  <div class="field"><label [for]="'use-' + a.id">Add as a bullet to this role</label>
                    <select [id]="'use-' + a.id" [(ngModel)]="useExp" data-testid="use-experience">
                      @for (e of experiences(); track $index) { <option [value]="$index">{{ e.jobTitle }} at {{ e.employerName }}</option> }
                    </select>
                    <span class="hint">Copies the text into your career profile. The fact itself is not changed.</span>
                    <button class="btn sm" data-testid="use-confirm" (click)="useInProfile(a)" [disabled]="!experiences().length">Add bullet</button></div>
                }
                @if (historyId() === a.id) {
                  <ol class="list" data-testid="fact-revisions">
                    @for (r of revisions(); track r.revision) {
                      <li class="row between"><span class="small">Revision {{ r.revision }} · {{ r.note }} · {{ r.createdAt | date: 'short' }} · {{ r.snapshot.status.toLowerCase() }}</span>
                        @if (r.revision !== a.revision) { <button class="btn ghost sm" data-testid="restore-revision" (click)="restore(a, r.revision)">Restore this</button> }</li>
                    }
                  </ol>
                }
              </li>
            }
          </ul>
        }

        <section class="card" aria-labelledby="dz-h"><h2 id="dz-h">Delete everything</h2>
          <p class="muted small">Removes every fact and its history. Resumes and your career profile are not affected.</p>
          <button class="btn danger" data-testid="facts-delete-all" (click)="deleteAll()">Delete all facts</button></section>
      </div>
    </ion-content>
  `,
})
export class CareerFactsPage implements OnInit {
  readonly modes = ['remote', 'hybrid', 'onsite'];
  readonly statuses = [{ v: '', l: 'Active' }, { v: 'DRAFT', l: 'Drafts' }, { v: 'CONFIRMED', l: 'Confirmed' }, { v: 'ARCHIVED', l: 'Archived' }];
  facts = signal<Fact[]>([]); loading = signal(true); busy = signal(false); error = signal(''); status = signal('');
  showForm = signal(false); touched = signal(false); skillNote = signal('');
  draftInfo = signal<{ hints: string[]; missing: string[] } | null>(null);
  confirming = signal(''); editing = signal(''); historyId = signal(''); usingId = signal('');
  revisions = signal<Revision[]>([]); experiences = signal<NonNullable<CareerProfile['experiences']>>([]);
  rough = ''; editText = ''; confirmMetric = false; useExp = '0';
  f = { action: '', context: '', outcome: '', scope: '', experienceRef: '', skills: '', metricValue: '', metricLabel: '', metricConfirmed: false };
  pref = { roles: '', locations: '', modes: [] as string[] };
  prefId = '';
  breaks = signal<Fact[]>([]); breakError = signal(''); breakId = '';
  brk = { start: '', end: '', note: '' };

  constructor(private api: FeatureApi, private profileApi: ApiService, private notify: NotifyService, private files: LocalFileService) {}
  achievements = () => this.facts().filter((x) => x.kind === 'ACHIEVEMENT');
  origin(o: string) { return ORIGIN[o] ?? o; }
  private csv(s: string) { return s.split(',').map((x) => x.trim()).filter(Boolean); }

  async ngOnInit() { await this.reload(); await this.loadPrefs(); await this.loadBreaks(); try { this.experiences.set((await this.profileApi.getProfile().toPromise())?.experiences ?? []); } catch { /* no profile yet */ } }
  async setStatus(s: string) { this.status.set(s); await this.reload(); }
  async reload() {
    this.loading.set(true); this.error.set('');
    try { this.facts.set(await this.api.get<Fact[]>(`/career-facts?kind=ACHIEVEMENT${this.status() ? '&status=' + this.status() : ''}`)); } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }
  private async loadPrefs() {
    try { const p = (await this.api.get<Fact[]>('/career-facts?kind=PREFERENCE'))[0]; if (p) { this.prefId = p.id; this.pref = { roles: (p.data.roles ?? []).join(', '), locations: (p.data.locations ?? []).join(', '), modes: p.data.workModes ?? [] }; } } catch { /* ignore */ }
  }
  private async loadBreaks() { try { this.breaks.set(await this.api.get<Fact[]>('/career-facts?kind=CAREER_BREAK')); } catch { /* optional */ } }
  resetBreak() { this.breakId = ''; this.brk = { start: '', end: '', note: '' }; this.breakError.set(''); }
  editBreak(b: Fact) { this.breakId = b.id; this.brk = { start: b.data.start ?? '', end: b.data.end ?? '', note: b.data.note ?? '' }; this.breakError.set(''); }
  async saveBreak() {
    const ok = /^\d{4}(-(0[1-9]|1[0-2]))?$/; const start = this.brk.start.trim(); const end = this.brk.end.trim();
    if (!start && !end && !this.brk.note.trim()) { this.breakError.set('Add at least a start date or a note.'); return; }
    if ((start && !ok.test(start)) || (end && !ok.test(end))) { this.breakError.set('Use YYYY or YYYY-MM for dates, for example 2021 or 2021-03.'); return; }
    if (start && end && end < start) { this.breakError.set('The end date is before the start date.'); return; }
    this.breakError.set('');
    const data = { ...(start ? { start } : {}), ...(end ? { end } : {}), ...(this.brk.note.trim() ? { note: this.brk.note.trim() } : {}) };
    await this.run(async () => {
      if (this.breakId) await this.api.patch(`/career-facts/${this.breakId}`, { data });
      else await this.api.post('/career-facts', { kind: 'CAREER_BREAK', title: 'Career break', data, confirmNow: true });
      this.resetBreak(); await this.loadBreaks(); await this.notify.toast('Break saved');
    });
  }
  async deleteBreak(b: Fact) {
    if (!(await this.notify.confirm('Delete this break?', 'It will be permanently removed from your facts.', 'Delete'))) return;
    await this.run(async () => { await this.api.del(`/career-facts/${b.id}`); if (this.breakId === b.id) this.resetBreak(); await this.loadBreaks(); });
  }
  toggleMode(m: string) { this.pref.modes = this.pref.modes.includes(m) ? this.pref.modes.filter((x) => x !== m) : [...this.pref.modes, m]; }
  async savePrefs() {
    const data = { roles: this.csv(this.pref.roles), locations: this.csv(this.pref.locations), workModes: this.pref.modes };
    await this.run(async () => {
      if (this.prefId) await this.api.patch(`/career-facts/${this.prefId}`, { data });
      else { const c = await this.api.post<Fact>('/career-facts', { kind: 'PREFERENCE', title: 'Career preferences', data, confirmNow: true }); this.prefId = c.id; }
      await this.notify.toast('Preferences saved');
    });
  }

  async normalizeSkills() {
    const names = this.csv(this.f.skills); if (!names.length) { this.skillNote.set(''); return; }
    try {
      const r = await this.api.post<{ results: Array<{ input: string; matched: boolean; label?: string }> }>('/skill-taxonomy/normalize', { names });
      this.f.skills = r.results.map((x) => x.label ?? x.input).join(', ');
      const unknown = r.results.filter((x) => !x.matched).map((x) => x.input);
      this.skillNote.set(unknown.length ? `Kept as you typed (not in our skill list): ${unknown.join(', ')}` : 'All skills use standard names.');
    } catch { /* optional helper */ }
  }

  async makeDraft() {
    await this.run(async () => {
      const r = await this.api.post<{ fact: Fact; missing: string[]; hints: string[] }>('/achievement-drafts', { text: this.rough });
      this.draftInfo.set({ hints: r.hints, missing: r.missing }); this.rough = ''; this.status.set('DRAFT'); await this.reload();
    });
  }

  async save(confirm = false) {
    this.touched.set(true); if (!this.f.action.trim()) return;
    const f = this.f; const metric = f.metricValue.trim() ? { value: f.metricValue.trim(), label: f.metricLabel.trim() || 'measured result', confirmed: f.metricConfirmed } : undefined;
    const data = { action: f.action.trim(), context: f.context, outcome: f.outcome, scope: f.scope, experienceRef: f.experienceRef, skills: this.csv(f.skills), ...(metric ? { metric } : {}) };
    await this.run(async () => {
      await this.api.post('/career-facts', { kind: 'ACHIEVEMENT', title: f.action.trim().slice(0, 150), data, ...(confirm ? { confirmNow: true } : {}) });
      this.f = { action: '', context: '', outcome: '', scope: '', experienceRef: '', skills: '', metricValue: '', metricLabel: '', metricConfirmed: false }; this.touched.set(false); this.skillNote.set('');
      this.showForm.set(false); await this.reload(); await this.notify.toast(confirm ? 'Achievement saved and confirmed' : 'Draft saved');
    });
  }

  async confirm(a: Fact) {
    await this.run(async () => { await this.api.post(`/career-facts/${a.id}/confirm`, { confirmMetric: this.confirmMetric }); this.confirming.set(''); await this.reload(); await this.notify.toast('Confirmed'); });
  }
  async saveEdit(a: Fact) {
    await this.run(async () => { await this.api.patch(`/career-facts/${a.id}`, { data: { ...a.data, action: this.editText } }); this.editing.set(''); await this.reload(); await this.notify.toast('Edit saved as a new revision'); });
  }
  async toggleHistory(a: Fact) {
    if (this.historyId() === a.id) { this.historyId.set(''); return; }
    this.revisions.set(await this.api.get<Revision[]>(`/career-facts/${a.id}/revisions`)); this.historyId.set(a.id);
  }
  async restore(a: Fact, revision: number) {
    await this.run(async () => { await this.api.post(`/career-facts/${a.id}/restore`, { revision }); await this.reload(); this.revisions.set(await this.api.get<Revision[]>(`/career-facts/${a.id}/revisions`)); await this.notify.toast(`Restored revision ${revision} as a new revision`); });
  }
  async archive(a: Fact) { await this.run(async () => { await this.api.post(`/career-facts/${a.id}/archive`); await this.reload(); }); }
  async remove(a: Fact) {
    if (!(await this.notify.confirm('Delete this fact?', 'It and its history will be deleted. Resumes that already use the text keep it.'))) return;
    await this.run(async () => { await this.api.del(`/career-facts/${a.id}`); await this.reload(); });
  }
  async deleteAll() {
    if (!(await this.notify.confirm('Delete all facts?', 'Every achievement, preference and revision will be permanently deleted. This cannot be undone.', 'Delete all'))) return;
    await this.run(async () => { await this.api.del('/career-facts?confirm=all'); this.prefId = ''; this.pref = { roles: '', locations: '', modes: [] }; await this.reload(); await this.notify.toast('All facts deleted'); });
  }
  async exportAll() {
    await this.run(async () => {
      const data = await this.api.get<unknown>('/career-facts/export');
      await this.files.save(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'career-facts.json');
      await this.notify.toast('Export started');
    });
  }

  /** Reuse is an explicit action: the text is copied into the profile; the fact and other resumes are untouched until the user saves. */
  async useInProfile(a: Fact) {
    await this.run(async () => {
      const profile = await this.profileApi.getProfile().toPromise(); if (!profile) throw new Error('Create your career profile first.');
      const p = toProfileInput(profile); const i = Number(this.useExp);
      const exp = p.experiences?.[i]; if (!exp) throw new Error('Choose a role.');
      exp.bullets = [...(exp.bullets ?? []), { kind: 'ACHIEVEMENT', content: [a.data.action, a.data.outcome].filter(Boolean).join('. ').slice(0, 600), isUserConfirmed: true }];
      await this.profileApi.saveProfile(p).toPromise(); this.usingId.set(''); await this.notify.toast('Added to your career profile');
    });
  }

  private async run(fn: () => Promise<void>) { this.error.set(''); this.busy.set(true); try { await fn(); } catch (e) { this.error.set(errorMessage(e)); } finally { this.busy.set(false); } }
}
