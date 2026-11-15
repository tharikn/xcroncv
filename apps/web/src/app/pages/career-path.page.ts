import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { Analysis, CareerPathApi, CompInsights, EvidenceStatus, PathOption, Plan, RoleInfo } from '../core/career-path.api';
import { errorMessage, NotifyService } from '../core/notify.service';

const EVIDENCE_LABEL: Record<EvidenceStatus, string> = {
  RECORDED_SKILL: 'On your skills list', RECORDED_IN_EXPERIENCE: 'Mentioned in your experience', NO_RECORDED_EVIDENCE: 'No evidence recorded yet',
};
const STATUS_LABEL: Record<string, string> = { NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', DONE: 'Done', ACTIVE: 'Active', PAUSED: 'Paused' };

/** Career path and compensation (doc 44): explainable options from confirmed profile facts, editable plans, sourced pay only. */
@Component({
  selector: 'app-career-path',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, FormsModule, RouterLink, DatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>Career path</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head"><div><h1>Career path</h1><p>See realistic next roles from the facts in your profile, then keep a plan you can edit. Not a prediction of hiring outcomes.</p></div></div>
        @if (error()) { <div class="banner err" role="alert" data-testid="cp-error">{{ error() }}</div> }

        <section class="card" aria-labelledby="cp-an-h">
          <h2 id="cp-an-h">Explore options</h2>
          <div class="form-grid">
            <div class="field"><label for="cp-role">Target role</label>
              <select id="cp-role" data-testid="cp-role" [(ngModel)]="target"><option value="">Explore adjacent roles</option>@for (r of roles(); track r.id) { <option [value]="r.id">{{ r.title }}</option> }</select></div>
          </div>
          <div class="row"><button class="btn" data-testid="cp-analyze" (click)="analyze()" [disabled]="busy()">{{ busy() ? 'Analysing…' : 'Analyse my profile' }}</button></div>
          @if (noProfile()) { <div class="banner warn" role="status" data-testid="cp-no-profile">Create your career profile first so the analysis has real facts to use. <a routerLink="/profile">Open profile</a></div> }
        </section>

        @if (analysis(); as a) {
          <section aria-labelledby="cp-res-h" data-testid="cp-results">
            <h2 id="cp-res-h">Options{{ a.currentRole ? ' from ' + a.currentRole.title : '' }}</h2>
            <ul class="list">
              @for (o of a.options; track o.roleId) {
                <li class="card" [attr.data-testid]="'opt-' + o.roleId">
                  <div class="row between"><div class="grow"><h3 class="wrap">{{ o.title }}</h3><p class="muted small">{{ o.summary }}</p></div>
                    <span class="badge" data-testid="opt-coverage">{{ o.coverage.covered }} of {{ o.coverage.total }} requirements have recorded evidence</span></div>
                <ul class="small">@for (w of o.why; track w) { <li>{{ w }}</li> }</ul>
                  <details><summary>Requirement by requirement</summary>
                    <ul class="list">@for (s of o.skills; track s.label) {
                      <li class="small"><strong>{{ s.label }}</strong>: <span [attr.data-testid]="'ev-' + o.roleId">{{ evidenceLabel(s.status) }}</span>
                        @if (s.evidence.length) { <span class="muted"> ({{ evidenceText(s) }})</span> }</li> }</ul>
                    <p class="hint">"No evidence recorded yet" means your profile does not mention it. It does not mean you lack the skill.</p></details>
                  <div class="row"><button class="btn sm" data-testid="opt-save" (click)="savePlan(o)" [disabled]="busy()">Save as a plan</button></div>
                </li>
              }
            </ul>
            @for (n of a.notes; track n) { <p class="hint">{{ n }}</p> }
          </section>
        }

        <section aria-labelledby="cp-pl-h">
          <h2 id="cp-pl-h">My plans</h2>
          @if (loading()) { <p class="muted" role="status">Loading…</p> }
          @else if (plans().length === 0) { <div class="empty" data-testid="plans-empty"><p class="muted">No plans yet. Analyse your profile and save an option to start one.</p></div> }
          <ul class="list" data-testid="plan-list">
            @for (p of plans(); track p.id) {
              <li class="card" [attr.data-testid]="'plan-' + p.id">
                <div class="row between"><div class="grow"><h3 class="wrap" data-testid="plan-title">{{ p.title }}</h3><p class="muted small">Target: {{ p.targetRoleTitle }}</p></div>
                  <span class="badge" data-testid="plan-progress">{{ p.progress.done }} of {{ p.progress.total }} done</span></div>
                <div class="form-grid"><div class="field"><label [for]="'ps-' + p.id">Plan status</label>
                  <select [id]="'ps-' + p.id" data-testid="plan-status" [ngModel]="p.status" (ngModelChange)="setPlanStatus(p, $event)">@for (s of planStatuses; track s) { <option [value]="s">{{ statusLabel(s) }}</option> }</select></div></div>
                <ul class="list">
                  @for (m of p.milestones; track m.id) {
                    <li class="item-card" [attr.data-testid]="'ms-' + m.id">
                      <span class="wrap">{{ m.title }}</span>
                      <div class="form-grid">
                        <div class="field"><label [for]="'mst-' + m.id">Status</label><select [id]="'mst-' + m.id" data-testid="ms-status" [ngModel]="m.status" (ngModelChange)="setMilestone(p, m.id, { status: $event })">@for (s of msStatuses; track s) { <option [value]="s">{{ statusLabel(s) }}</option> }</select></div>
                        <div class="field"><label [for]="'msd-' + m.id">Target date</label><input [id]="'msd-' + m.id" type="date" data-testid="ms-date" [ngModel]="m.targetDate ?? ''" (ngModelChange)="setMilestone(p, m.id, { targetDate: $event || null })" /></div>
                      </div>
                      <div class="row"><button class="btn ghost sm" data-testid="ms-remove" (click)="removeMilestone(p, m.id)" [attr.aria-label]="'Remove milestone ' + m.title">Remove</button></div>
                    </li>
                  }
                </ul>
                <div class="row"><div class="field grow"><label [for]="'nm-' + p.id">New milestone</label><input [id]="'nm-' + p.id" data-testid="ms-new" [(ngModel)]="newMs[p.id]" maxlength="200" /></div>
                  <button class="btn sm" data-testid="ms-add" (click)="addMilestone(p)">Add</button></div>
                <div class="row"><button class="btn danger sm" data-testid="plan-delete" (click)="deletePlan(p)">Delete plan</button></div>
              </li>
            }
          </ul>
        </section>

        <section class="card" aria-labelledby="cp-co-h" data-testid="comp-panel">
          <h2 id="cp-co-h">Compensation context</h2>
          <p class="small muted">Shown only from licensed, attributed sources. Nothing is estimated.</p>
          <div class="form-grid">
            <div class="field"><label for="cp-croll">Role</label><input id="cp-croll" data-testid="comp-role" [(ngModel)]="comp.role" maxlength="80" /></div>
            <div class="field"><label for="cp-cloc">Country or region</label><input id="cp-cloc" data-testid="comp-location" [(ngModel)]="comp.location" maxlength="80" /></div>
          </div>
          <div class="row"><button class="btn ghost" data-testid="comp-go" (click)="lookup()" [disabled]="busy() || !comp.role.trim()">Look up</button></div>
          @if (insights(); as i) {
            @if (!i.available) { <p class="banner" role="status" data-testid="comp-unavailable">{{ i.reason }}</p> }
            @else {
              <ul class="list" data-testid="comp-rows">@for (o of i.observations; track $index) {
                <li class="item-card small">{{ o.role }}, {{ o.geography }}: median {{ o.median }} {{ o.currency }} per {{ o.period.toLowerCase() }}{{ o.p25 && o.p75 ? ' (middle range ' + o.p25 + ' to ' + o.p75 + ')' : '' }}{{ o.sampleSize ? ', sample ' + o.sampleSize : '' }}. Source: {{ o.source }}, observed {{ o.observedAt | date: 'mediumDate' }}.</li> }</ul>
              @if (i.note) { <p class="hint">{{ i.note }}</p> }
            }
          }
        </section>
      </div>
    </ion-content>
  `,
})
export class CareerPathPage implements OnInit {
  readonly planStatuses = ['ACTIVE', 'PAUSED', 'DONE'];
  readonly msStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'DONE'];
  roles = signal<RoleInfo[]>([]);
  analysis = signal<Analysis | null>(null);
  plans = signal<Plan[]>([]);
  insights = signal<CompInsights | null>(null);
  loading = signal(true); busy = signal(false); error = signal(''); noProfile = signal(false);
  target = '';
  newMs: Record<string, string> = {};
  comp = { role: '', location: '' };

  constructor(private api: CareerPathApi, private notify: NotifyService) {}
  ngOnInit() { this.api.roles().subscribe({ next: (r) => this.roles.set(r.roles), error: () => this.roles.set([]) }); this.loadPlans(); }
  ionViewWillEnter() { if (!this.loading()) this.loadPlans(); }

  evidenceLabel(s: EvidenceStatus) { return EVIDENCE_LABEL[s]; }
  evidenceText(s: { evidence: Array<{ label: string }> }) { return s.evidence.map((e) => e.label).join(', '); }
  statusLabel(s: string) { return STATUS_LABEL[s] ?? s; }

  loadPlans() {
    this.api.listPlans().subscribe({ next: (p) => { this.plans.set(p); this.loading.set(false); }, error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); } });
  }

  analyze() {
    this.busy.set(true); this.noProfile.set(false); this.error.set('');
    this.api.analyze(this.target || undefined).subscribe({
      next: (a) => { this.analysis.set(a); this.busy.set(false); },
      error: (e) => { this.busy.set(false); if (e instanceof HttpErrorResponse && e.status === 404) this.noProfile.set(true); else this.error.set(errorMessage(e)); },
    });
  }

  savePlan(o: PathOption) {
    this.busy.set(true);
    this.api.createPlan(o.roleId).subscribe({
      next: () => { this.busy.set(false); void this.notify.toast('Plan saved. Edit its milestones below.'); this.loadPlans(); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  private replace(p: Plan) { this.plans.set(this.plans().map((x) => (x.id === p.id ? p : x))); }
  setPlanStatus(p: Plan, status: string) { this.api.updatePlan(p.id, { status }).subscribe({ next: (r) => this.replace(r), error: (e) => { void this.notify.toast(errorMessage(e), 'error'); this.loadPlans(); } }); }
  setMilestone(p: Plan, id: string, b: { status?: string; targetDate?: string | null }) {
    this.api.updateMilestone(p.id, id, b).subscribe({ next: (r) => this.replace(r), error: (e) => { void this.notify.toast(errorMessage(e), 'error'); this.loadPlans(); } });
  }
  addMilestone(p: Plan) {
    const title = (this.newMs[p.id] ?? '').trim();
    if (!title) { void this.notify.toast('Enter a milestone first.', 'error'); return; }
    this.api.addMilestone(p.id, { title }).subscribe({ next: (r) => { this.newMs[p.id] = ''; this.replace(r); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }
  removeMilestone(p: Plan, id: string) { this.api.removeMilestone(p.id, id).subscribe({ next: (r) => this.replace(r), error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }
  async deletePlan(p: Plan) {
    if (!(await this.notify.confirm('Delete plan?', `"${p.title}" and its milestones will be permanently deleted.`))) return;
    this.api.deletePlan(p.id).subscribe({ next: () => { void this.notify.toast('Plan deleted'); this.loadPlans(); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }

  lookup() {
    this.busy.set(true);
    this.api.compensation(this.comp.role.trim(), this.comp.location.trim() || undefined).subscribe({
      next: (i) => { this.insights.set(i); this.busy.set(false); }, error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }
}
