import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { errorMessage, NotifyService } from '../core/notify.service';
import { EvidenceLevel, Milestone, Plan, PlanImportSources, PlanListItem, ReadinessToolsApi } from '../core/readiness-tools.api';
import { registerReadinessToolIcons } from '../core/readiness-tools.icons';

const LEVEL_LABEL: Record<EvidenceLevel, string> = {
  DEMONSTRATED: 'Demonstrated in experience', PROJECT: 'Shown in a project', CERTIFICATION: 'Certification recorded', SELF_REPORTED: 'Self-reported only', NONE: 'No recorded evidence',
};
const LEVELS: EvidenceLevel[] = ['DEMONSTRATED', 'PROJECT', 'CERTIFICATION', 'SELF_REPORTED', 'NONE'];

/** Career readiness (doc 34): evidence by kind per target skill. No score, no hiring prediction. */
@Component({
  selector: 'app-readiness',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, RouterLink],
  template: `
    <ion-header><ion-toolbar><ion-title>Career readiness</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        @if (error()) { <div class="banner err" role="alert" data-testid="rd-error">{{ error() }}</div> }

        @if (!plan()) {
          <div class="page-head">
            <div><h1>Career readiness</h1><p>Compare a target role with the evidence in your profile and plan what to build next. This is guidance for you, not a verdict.</p></div>
            <button class="btn" data-testid="new-plan" (click)="showForm.set(!showForm()); loadSources()"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> New plan</button>
          </div>

          @if (showForm()) {
            <section class="card" aria-labelledby="np-h" data-testid="plan-form">
              <h2 id="np-h">Compare against a target role</h2>
              @if (sources(); as src) {
                @if (src.roles.length || src.jobDescriptions.length) {
                  <div class="row">
                    <div class="field grow"><label for="rd-src">Start from (optional)</label>
                      <select id="rd-src" data-testid="rd-source" [(ngModel)]="importChoice">
                        <option value="">Type my own skills</option>
                        @if (src.jobDescriptions.length) { <optgroup label="My saved job descriptions">@for (j of src.jobDescriptions; track j.id) { <option [value]="'JOB_DESCRIPTION:' + j.id">{{ j.title }}{{ j.company ? ' · ' + j.company : '' }}</option> }</optgroup> }
                        <optgroup label="Career-path roles">@for (r of src.roles; track r.id) { <option [value]="'CAREER_PATH_ROLE:' + r.id">{{ r.title }}</option> }</optgroup>
                      </select></div>
                    <button class="btn sm ghost" style="align-self:flex-end" (click)="importTargets()" [disabled]="!importChoice || busy()" data-testid="rd-import">Fill skills</button>
                  </div>
                  @if (importNote()) { <p class="muted small" role="status" data-testid="rd-import-note">{{ importNote() }}</p> }
                }
              }
              <div class="form-grid">
                <div class="field full" [class.invalid]="touched() && !f.targetRole.trim()"><label for="rd-role">Target role *</label><input id="rd-role" data-testid="rd-role" [(ngModel)]="f.targetRole" maxlength="120" placeholder="Backend engineer" /></div>
                <div class="field" [class.invalid]="touched() && !hasSkills()"><label for="rd-req">Required skills *</label><textarea id="rd-req" rows="4" data-testid="rd-required" [(ngModel)]="f.required" placeholder="One per line or comma separated"></textarea></div>
                <div class="field"><label for="rd-pref">Nice-to-have skills</label><textarea id="rd-pref" rows="4" data-testid="rd-preferred" [(ngModel)]="f.preferred" placeholder="One per line or comma separated"></textarea></div>
              </div>
              <p class="hint">Only confirmed facts in your career profile count as evidence. A missing skill means your profile does not show it yet, not that you lack it.</p>
              @for (e of formErrors(); track e) { <p class="error" role="alert" data-testid="rd-form-error">{{ e }}</p> }
              <div class="row"><button class="btn" data-testid="create-plan" (click)="create()" [disabled]="busy()">Compare with my profile</button><button class="btn ghost" (click)="showForm.set(false)">Cancel</button></div>
            </section>
          }

          @if (loading()) { <p class="muted" role="status" data-testid="rd-loading">Loading…</p> }
          @else if (plans().length === 0) {
            <div class="empty" data-testid="rd-empty"><h2>No plans yet</h2><p class="muted">Pick a role you want, list its key skills, and see which ones your profile already evidences.</p></div>
          } @else {
            <ul class="list" data-testid="plan-list">
              @for (p of plans(); track p.id) {
                <li class="card"><div class="row between"><div class="grow"><h2 class="wrap">{{ p.targetRole }}</h2>
                  <p class="muted small">{{ p.summary.total }} skills · {{ p.summary.counts.NONE }} without recorded evidence · {{ p.openMilestones }} open step{{ p.openMilestones === 1 ? '' : 's' }}</p></div>
                  <button class="btn sm" data-testid="open-plan" (click)="open(p.id)" [attr.aria-label]="'Open plan for ' + p.targetRole">Open</button></div></li>
              }
            </ul>
          }
        }

        @if (plan(); as p) {
          <button class="btn ghost sm" style="align-self:flex-start" (click)="close()" data-testid="back-plans"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon> All plans</button>
          <div class="page-head">
            <div><h1 class="wrap" data-testid="plan-heading">{{ p.targetRole }}</h1><p>Evidence found in your confirmed profile, by kind.</p></div>
            <div class="row">
              <button class="btn ghost" data-testid="refresh-plan" (click)="refresh(p)" [disabled]="busy()">Re-check profile</button>
              <button class="btn danger" data-testid="delete-plan" (click)="remove(p)"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Delete</button>
            </div>
          </div>

          <section class="card" aria-labelledby="sm-h" data-testid="plan-summary">
            <h2 id="sm-h">At a glance</h2>
            <p class="row">@for (l of levels; track l) { <span class="badge" [class.ok]="l === 'DEMONSTRATED'" [class.warn]="l === 'NONE'" [attr.data-testid]="'count-' + l">{{ p.summary.counts[l] }} {{ levelLabel(l) }}</span> }</p>
            <p class="muted small" data-testid="plan-note">{{ p.summary.note }}</p>
          </section>

          <section class="card" aria-labelledby="sk-h">
            <h2 id="sk-h">Skill by skill</h2>
            <ul class="list" data-testid="skill-list">
              @for (a of p.analysis; track a.skill) {
                <li class="item-card" [attr.data-testid]="'skill-' + a.skill">
                  <div class="row between"><strong class="wrap">{{ a.skill }}</strong>
                    <span class="row"><span class="badge">{{ a.importance === 'required' ? 'Required' : 'Nice to have' }}</span>
                    <span class="badge" [class.ok]="a.level === 'DEMONSTRATED'" [class.warn]="a.level === 'NONE'" data-testid="skill-level">{{ levelLabel(a.level) }}</span></span></div>
                  <p class="small" data-testid="skill-statement">{{ a.statement }}</p>
                  @if (a.sources.length) { <p class="small muted" data-testid="skill-sources">Evidence: {{ sourceText(a) }}</p> }
                  @for (t of a.transferableFrom; track t.skill) { <p class="small" data-testid="skill-transfer">Transferable: your {{ t.skill }} work ({{ t.sources[0].label }}) is related, but it is not the same skill.</p> }
                </li>
              }
            </ul>
          </section>

          <section class="card" aria-labelledby="ms-h" data-testid="milestones">
            <h2 id="ms-h">Your learning plan</h2>
            <p class="muted small">Suggestions are recommendations only. Edit, complete or dismiss any of them.</p>
            @if (p.milestones.length === 0) { <p class="muted small" data-testid="ms-empty">Nothing suggested: every target skill has evidence beyond a listed skill.</p> }
            <ul class="list">
              @for (m of p.milestones; track m.id) {
                <li class="item-card" [attr.data-testid]="'milestone-' + m.id" [style.opacity]="m.status === 'DISMISSED' ? 0.6 : 1">
                  <div class="row between"><span class="wrap" [style.text-decoration]="m.status === 'DONE' ? 'line-through' : 'none'" data-testid="ms-title">{{ m.title }}</span>
                    <span class="badge" data-testid="ms-origin">{{ m.origin === 'RECOMMENDATION' ? 'Recommendation' : 'Added by you' }}</span></div>
                  <div class="row">
                    <span class="badge" [class.ok]="m.status === 'DONE'" data-testid="ms-status">{{ m.status === 'OPEN' ? 'Open' : m.status === 'DONE' ? 'Done' : 'Dismissed' }}</span>
                    @if (m.status !== 'DONE') { <button class="btn sm" data-testid="ms-done" (click)="setStatus(p, m, 'DONE')">Mark done</button> }
                    @if (m.status === 'OPEN') { <button class="btn ghost sm" data-testid="ms-dismiss" (click)="setStatus(p, m, 'DISMISSED')">Dismiss</button> }
                    @if (m.status !== 'OPEN') { <button class="btn ghost sm" data-testid="ms-reopen" (click)="setStatus(p, m, 'OPEN')">Reopen</button> }
                  </div>
                </li>
              }
            </ul>
            <div class="row"><div class="field grow"><label for="ms-new">Add your own step</label><input id="ms-new" data-testid="ms-new" [(ngModel)]="newMilestone" maxlength="200" placeholder="Finish an online course on Docker" /></div>
              <button class="btn" data-testid="ms-add" (click)="addMilestone(p)" [disabled]="!newMilestone.trim() || busy()">Add step</button></div>
          </section>
          <p class="muted small">To record more evidence, update your <a [routerLink]="'/profile'">career profile</a> and re-check.</p>
        }
      </div>
    </ion-content>
  `,
})
export class ReadinessPage implements OnInit {
  readonly levels = LEVELS;
  plans = signal<PlanListItem[]>([]);
  plan = signal<Plan | null>(null);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  showForm = signal(false);
  sources = signal<PlanImportSources | null>(null);
  importChoice = '';
  importNote = signal('');
  touched = signal(false);
  f = { targetRole: '', required: '', preferred: '' };
  newMilestone = '';

  constructor(private api: ReadinessToolsApi, private notify: NotifyService) { registerReadinessToolIcons(); }

  ngOnInit() { this.reload(); }
  ionViewWillEnter() { if (!this.loading() && !this.plan()) this.reload(); }

  levelLabel(l: EvidenceLevel) { return LEVEL_LABEL[l]; }
  sourceText(a: { sources: Array<{ type: string; label: string }> }) { return a.sources.map((s) => `${s.type.toLowerCase()}: ${s.label}`).join('; '); }
  private parse(s: string) { return [...new Set(s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean))]; }
  hasSkills() { return this.parse(this.f.required).length + this.parse(this.f.preferred).length > 0; }
  formErrors() {
    if (!this.touched()) return [];
    const e: string[] = [];
    if (!this.f.targetRole.trim()) e.push('Enter the target role.');
    if (!this.hasSkills()) e.push('Add at least one skill to compare.');
    if (this.parse(this.f.required).length + this.parse(this.f.preferred).length > 40) e.push('Please keep it to 40 skills or fewer.');
    return e;
  }

  reload() {
    this.api.listPlans().subscribe({
      next: (p) => { this.plans.set(p); this.loading.set(false); this.error.set(''); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  loadSources() {
    if (this.sources()) return;
    this.api.planImportSources().subscribe({ next: (s) => this.sources.set(s), error: () => this.sources.set(null) });
  }

  importTargets() {
    const [source, ...rest] = this.importChoice.split(':');
    if (!source || !rest.length) return;
    this.busy.set(true);
    this.api.planImportPreview(source as 'JOB_DESCRIPTION' | 'CAREER_PATH_ROLE', rest.join(':')).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.f.targetRole = r.targetRole;
        this.f.required = r.skills.filter((s) => s.importance === 'required').map((s) => s.name).join(', ');
        this.f.preferred = r.skills.filter((s) => s.importance === 'preferred').map((s) => s.name).join(', ');
        this.importNote.set(r.note);
      },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  create() {
    this.touched.set(true);
    if (this.formErrors().length) return;
    const req = this.parse(this.f.required);
    const pref = this.parse(this.f.preferred).filter((s) => !req.some((r) => r.toLowerCase() === s.toLowerCase()));
    this.busy.set(true);
    this.api.createPlan({ targetRole: this.f.targetRole.trim(), skills: [...req.map((name) => ({ name, importance: 'required' as const })), ...pref.map((name) => ({ name, importance: 'preferred' as const }))] }).subscribe({
      next: (p) => { this.busy.set(false); this.showForm.set(false); this.touched.set(false); this.f = { targetRole: '', required: '', preferred: '' }; this.plan.set(p); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  open(id: string) { this.api.getPlan(id).subscribe({ next: (p) => this.plan.set(p), error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }
  close() { this.plan.set(null); this.reload(); }

  private apply(obs: ReturnType<ReadinessToolsApi['refreshPlan']>, message?: string) {
    this.busy.set(true);
    obs.subscribe({
      next: (p) => { this.busy.set(false); this.plan.set(p); if (message) void this.notify.toast(message); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }
  refresh(p: Plan) { this.apply(this.api.refreshPlan(p.id), 'Compared with your current profile. Your steps were kept.'); }
  setStatus(p: Plan, m: Milestone, status: Milestone['status']) { this.apply(this.api.updateMilestone(p.id, m.id, { status })); }
  addMilestone(p: Plan) { const title = this.newMilestone.trim(); if (!title) return; this.newMilestone = ''; this.apply(this.api.addMilestone(p.id, { title })); }

  async remove(p: Plan) {
    if (!(await this.notify.confirm('Delete this plan?', 'Your career profile is not changed.', 'Delete'))) return;
    this.api.deletePlan(p.id).subscribe({ next: () => this.close(), error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }
}
