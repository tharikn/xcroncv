import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ApiService } from '../../core/api.service';
import { errorMessage, NotifyService } from '../../core/notify.service';
import { FeatureApi } from '../common/feature-api';

type Support = 'direct' | 'partial' | 'ambiguous' | 'absent' | 'contradictory';
interface EvidenceMatch { id: string; label: string; excerpt: string; confirmed: boolean; origin: string; byUser?: boolean }
interface ClaimRow { key: string; section: string; kind: string; text: string; support: Support; origin: string | null; issues: string[]; evidence: EvidenceMatch[] }
interface CheckResult { note: string; summary: Record<string, number>; claims: ClaimRow[] }
interface Fact { id: string; title: string; data: { action?: string } }
interface Diff { op: 'keep' | 'add' | 'remove'; text: string }
interface Unsupported { type: string; text: string; reason: string }
interface Proposal { id: string; verdict: string; status: string; diff: Diff[]; unsupported: Unsupported[]; proposed: string; origin: string; finalText?: string }

const SUPPORT_TEXT: Record<Support, string> = { direct: 'Directly supported', partial: 'Partly supported', ambiguous: 'Ambiguous', absent: 'No evidence linked', contradictory: 'Contradicts your evidence' };
const ORIGIN: Record<string, string> = { USER_ENTERED: 'Entered by you', IMPORTED: 'Imported', AI_REWRITTEN: 'Reworded by AI', EXTERNALLY_VERIFIED: 'Externally verified' };

/** Truth verification and evidence provenance (doc 27). Reads only; changes nothing unless the user links evidence or approves a rewrite. */
@Component({
  selector: 'app-provenance',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule],
  template: `
    <ion-header><ion-toolbar><ion-title>Evidence check</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head"><div><h1>Evidence check</h1>
          <p>See which statements in your resume are backed by facts you confirmed. This is a check, not a verdict: "no evidence linked" does not mean a statement is false.</p></div></div>
        @if (error()) { <div class="banner err" role="alert" data-testid="pv-error">{{ error() }}</div> }

        <section class="card" aria-labelledby="chk-h">
          <h2 id="chk-h">1. Check a resume</h2>
          <div class="field"><label for="pv-resume">Resume</label>
            <select id="pv-resume" [(ngModel)]="resumeId" data-testid="pv-resume">@for (r of resumes(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }</select></div>
          <button class="btn" data-testid="pv-run" (click)="check()" [disabled]="busy() || !resumeId">Check evidence</button>
        </section>

        @if (result(); as r) {
          <section class="card" data-testid="pv-result" aria-labelledby="sum-h">
            <h2 id="sum-h">Results</h2>
            <p class="muted small">{{ r.note }}</p>
            <ul class="row" style="flex-wrap:wrap;list-style:none;padding:0" aria-label="Summary" data-testid="pv-summary">
              @for (s of order; track s) { <li><button class="chip" [attr.aria-pressed]="filter() === s" (click)="filter.set(filter() === s ? '' : s)" [attr.data-testid]="'sum-' + s">{{ label(s) }}: {{ r.summary[s] }}</button></li> }
            </ul>
            <ul class="list">
              @for (c of shown(); track c.key) {
                <li class="item-card" [attr.data-testid]="'claim-' + c.support">
                  <p><span class="badge" [class.ok]="c.support === 'direct'" [class.warn]="c.support !== 'direct'" data-testid="claim-support">{{ label(c.support) }}</span>
                    <span class="muted small"> {{ c.section }} · {{ c.kind }}@if (c.origin) { · {{ origin(c.origin) }} }</span></p>
                  <p class="wrap" data-testid="claim-text">{{ c.text }}</p>
                  @for (i of c.issues; track i) { <p class="small error">{{ i }}</p> }
                  @for (e of c.evidence; track e.id) { <p class="small muted">Evidence: {{ e.label }} — "{{ e.excerpt }}"{{ e.confirmed ? '' : ' (not confirmed)' }}{{ e.byUser ? ' (linked by you)' : '' }}</p> }
                  @if (c.support !== 'direct') {
                    <div class="row"><label class="sr-only" [for]="'lk-' + c.key">Link a confirmed fact</label>
                      <select [id]="'lk-' + c.key" [(ngModel)]="pick[c.key]" data-testid="link-select"><option value="">Link a confirmed fact…</option>@for (f of facts(); track f.id) { <option [value]="f.id">{{ f.data.action || f.title }}</option> }</select>
                      <button class="btn ghost sm" data-testid="link-save" (click)="link(c)" [disabled]="!pick[c.key]">Link</button></div>
                  }
                </li>
              }
            </ul>
            @if (!facts().length) { <p class="muted small" data-testid="no-facts">You have no confirmed facts yet. Add and confirm achievements in the Achievement bank to link evidence.</p> }
          </section>
        }

        <section class="card" aria-labelledby="rw-h" data-testid="rewrite-section">
          <h2 id="rw-h">2. Check a rewrite before you keep it</h2>
          <p class="muted small">Paste the original and a reworded version (for example from the AI assistant). We show exactly what changed and flag anything new that your evidence does not support.</p>
          <div class="form-grid">
            <div class="field"><label for="rw-o">Original</label><textarea id="rw-o" rows="3" maxlength="1500" [(ngModel)]="original" data-testid="rw-original"></textarea></div>
            <div class="field"><label for="rw-p">Reworded version</label><textarea id="rw-p" rows="3" maxlength="1500" [(ngModel)]="proposed" data-testid="rw-proposed"></textarea></div>
          </div>
          <button class="btn" data-testid="rw-run" (click)="propose()" [disabled]="busy() || !original.trim() || !proposed.trim()">Compare</button>

          @if (proposal(); as p) {
            <div data-testid="rw-result">
              <p data-testid="rw-verdict"><span class="badge" [class.ok]="p.verdict !== 'needs-approval'" [class.warn]="p.verdict === 'needs-approval'">{{ verdictText(p.verdict) }}</span></p>
              <p class="wrap" aria-label="Changes" data-testid="rw-diff">@for (d of p.diff; track $index) {
                <span [class]="'diff-' + d.op">@if (d.op === 'add') { <span class="sr-only">added: </span><ins>{{ d.text }} </ins> } @else if (d.op === 'remove') { <span class="sr-only">removed: </span><del>{{ d.text }} </del> } @else { {{ d.text }} }</span> }</p>
              @if (p.unsupported.length) {
                <div class="banner warn" data-testid="rw-unsupported" role="alert"><strong>New claims we cannot find in your evidence. Tick each one only if it is true.</strong>
                  @for (u of p.unsupported; track u.text) {
                    <label class="checkbox"><input type="checkbox" [checked]="acks().includes(u.text)" (change)="toggleAck(u.text)" data-testid="rw-ack" /> <strong>{{ u.text }}</strong> ({{ u.type }}) — {{ u.reason }}</label>
                  }</div>
              }
              @if (p.status === 'PENDING') {
                <div class="row"><button class="btn" data-testid="rw-approve" (click)="approve()" [disabled]="busy() || acks().length < p.unsupported.length">Approve this wording</button>
                  <button class="btn ghost" data-testid="rw-reject" (click)="reject()" [disabled]="busy()">Reject</button></div>
              } @else {
                <p role="status" data-testid="rw-status">This proposal is {{ p.status.toLowerCase() }}.</p>
                @if (p.finalText) { <div class="field"><label for="rw-final">Approved text (copy it into your profile)</label><textarea id="rw-final" rows="3" readonly [value]="p.finalText" data-testid="rw-final"></textarea></div> }
              }
            </div>
          }
        </section>
      </div>
    </ion-content>
  `,
})
export class ProvenancePage implements OnInit {
  readonly order: Support[] = ['direct', 'partial', 'ambiguous', 'absent', 'contradictory'];
  resumes = signal<Array<{ id: string; name: string }>>([]); resumeId = '';
  busy = signal(false); error = signal(''); result = signal<CheckResult | null>(null); filter = signal<'' | Support>('');
  facts = signal<Fact[]>([]); pick: Record<string, string> = {};
  original = ''; proposed = ''; proposal = signal<Proposal | null>(null); acks = signal<string[]>([]);

  constructor(private api: FeatureApi, private resumesApi: ApiService, private notify: NotifyService, private route: ActivatedRoute) {}
  label(s: string) { return SUPPORT_TEXT[s as Support] ?? s; }
  origin(o: string) { return ORIGIN[o] ?? o; }
  verdictText(v: string) { return v === 'needs-approval' ? 'Needs your approval' : v === 'safe' ? 'No new claims found' : 'No change'; }
  shown = () => (this.result()?.claims ?? []).filter((c) => !this.filter() || c.support === this.filter());

  async ngOnInit() {
    try {
      const list = await this.resumesApi.listResumes().toPromise(); this.resumes.set(list ?? []);
      this.resumeId = this.route.snapshot.queryParamMap.get('resume') ?? list?.[0]?.id ?? '';
      this.facts.set(await this.api.get<Fact[]>('/career-facts?kind=ACHIEVEMENT&status=CONFIRMED'));
    } catch (e) { this.error.set(errorMessage(e)); }
  }
  private async run(fn: () => Promise<void>) { this.error.set(''); this.busy.set(true); try { await fn(); } catch (e) { this.error.set(errorMessage(e)); } finally { this.busy.set(false); } }

  check() { return this.run(async () => { this.result.set(await this.api.post<CheckResult>(`/resumes/${this.resumeId}/provenance/check`, {})); }); }
  link(c: ClaimRow) {
    return this.run(async () => { await this.api.post(`/resumes/${this.resumeId}/provenance/links`, { claimKey: c.key, factId: this.pick[c.key] }); this.pick[c.key] = ''; await this.check(); await this.notify.toast('Evidence linked'); });
  }

  propose() { return this.run(async () => { this.acks.set([]); this.proposal.set(await this.api.post<Proposal>('/provenance/rewrites', { original: this.original, proposed: this.proposed, resumeId: this.resumeId || undefined })); }); }
  toggleAck(t: string) { this.acks.set(this.acks().includes(t) ? this.acks().filter((x) => x !== t) : [...this.acks(), t]); }
  approve() { return this.run(async () => { const p = this.proposal()!; this.proposal.set(await this.api.post<Proposal>(`/provenance/rewrites/${p.id}/approve`, { acknowledged: this.acks() })); await this.notify.toast('Wording approved'); }); }
  reject() { return this.run(async () => { const p = this.proposal()!; this.proposal.set(await this.api.post<Proposal>(`/provenance/rewrites/${p.id}/reject`)); }); }
}
