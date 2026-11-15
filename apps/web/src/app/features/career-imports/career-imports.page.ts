import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { errorMessage, NotifyService } from '../../core/notify.service';
import { FeatureApi } from '../common/feature-api';

type Classification = 'new' | 'duplicate' | 'conflict';
type Choice = 'keep_existing' | 'use_imported' | 'keep_both';
interface Field {
  id: string; section: string; label: string; confidence: string; sourceKind: string; sourceRef: string; parserVersion: string; importedAt: string;
  status: 'pending' | 'accepted' | 'rejected' | 'merged'; classification?: Classification; conflictId?: string;
}
interface Conflict { id: string; fieldId: string; section: string; existing: string; imported: string; differences: Array<{ field: string; existing: string; imported: string }>; choices: Choice[] }
interface Counts { total: number; pending: number; accepted: number; rejected: number; merged: number; new: number; duplicate: number; conflict: number }
interface Job {
  id: string; status: 'review_ready' | 'confirmed'; sourceKind: string; warnings: string[]; expiresAt: string; undoable: boolean;
  fields: Field[]; conflicts: Conflict[]; decisions: Record<string, Choice>; counts: Counts; result: { add: number; replace: number; skip: number } | null;
}
interface JobRow { id: string; status: string; sourceKind: string; createdAt: string; expiresAt: string; fieldCount: number }
interface Change { fieldId: string; label: string; action: 'add' | 'replace' | 'skip'; reason?: string }
interface MergePreview { add: number; replace: number; skip: number; unresolved: string[]; error: string | null; changes: Change[] }

const SECTION_TITLES: Record<string, string> = { profile: 'Profile details', link: 'Links', experience: 'Experience', skill: 'Skills', education: 'Education', project: 'Projects', certification: 'Certifications', language: 'Languages' };
const SECTION_ORDER = Object.keys(SECTION_TITLES);
const CLASS_TEXT: Record<Classification, string> = { new: 'New to your profile', duplicate: 'Already in your profile', conflict: 'Differs from your profile' };
const CHOICE_TEXT: Record<Choice, string> = { keep_existing: 'Keep what I have', use_imported: 'Use the imported value', keep_both: 'Keep both' };
const FIELD_TEXT: Record<string, string> = { jobTitle: 'Job title', startDate: 'Start', endDate: 'End', field: 'Field', url: 'Web address', issuer: 'Issuer', proficiency: 'Level', email: 'Email', phone: 'Phone', fullName: 'Name', location: 'Location', headline: 'Headline', summary: 'Summary' };
const KIND_TEXT: Record<string, string> = { pdf: 'PDF', docx: 'DOCX', json: 'JSON', csv: 'CSV' };

/**
 * External profile and career data import (doc 43). Everything imported is staged and unconfirmed. Only items the user
 * ticks, and conflicts the user decides, are merged into the career profile, and a merge can be undone.
 */
@Component({
  selector: 'app-career-imports',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, FormsModule, RouterLink],
  template: `
    <ion-header><ion-toolbar><ion-title>Import career data</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell reading">
        <div class="page-head"><div><h1>Import career data</h1>
          <p>Bring in details from a PDF, DOCX, JSON or CSV file. Everything is held for your review first: nothing joins your profile until you approve it. Resume text only (<a routerLink="/import">single resume import</a>) is also available.</p></div></div>
        @if (error()) { <div class="banner err" role="alert" data-testid="ci-error">{{ error() }}</div> }

        @if (!job()) {
          <section class="card" aria-labelledby="up-h" data-testid="ci-upload">
            <h2 id="up-h">1. Choose a file</h2>
            <p class="muted">PDF or DOCX (up to 5 MB), or a JSON or CSV file (up to 1 MB). The file is read once and <strong>not stored</strong>. Imports connected to LinkedIn or other services are not available: export your data from that service as a file and choose it here.</p>
            <div class="field"><label for="ci-file">File to import</label>
              <input id="ci-file" type="file" data-testid="ci-file" accept=".pdf,.docx,.json,.csv" (change)="pick($event)" [disabled]="busy()" /></div>
            <details><summary>What can a JSON or CSV file contain?</summary>
              <p class="small muted">JSON: your profile in the platform shape, or the open JSON Resume format. CSV: a <code>type</code> column (experience, education, skill, project, certification, language, link or profile) plus columns such as employerName, jobTitle, startDate, endDate, institution, degree, name, url.</p></details>
            @if (busy()) { <p role="status" data-testid="ci-busy">Reading your file…</p> }
          </section>

          @if (recent().length) {
            <section class="card" aria-labelledby="rc-h" data-testid="ci-recent">
              <h2 id="rc-h">Imports waiting for you</h2>
              <p class="muted small">Staged imports are deleted automatically after 7 days.</p>
              <ul class="list">
                @for (r of recent(); track r.id) {
                  <li class="item-card row between">
                    <span>{{ kind(r.sourceKind) }} import, {{ r.fieldCount }} items, {{ r.status === 'confirmed' ? 'merged' : 'ready to review' }}</span>
                    <span class="row"><button class="btn ghost sm" (click)="open(r.id)" data-testid="ci-open">Open</button>
                      <button class="btn ghost sm" (click)="discardById(r.id)" [attr.aria-label]="'Delete this ' + kind(r.sourceKind) + ' import'" data-testid="ci-delete-recent">Delete</button></span>
                  </li>
                }
              </ul>
            </section>
          }
        } @else {
          <section class="card" aria-labelledby="rv-h" data-testid="ci-review">
            <h2 id="rv-h">2. Review what was found</h2>
            <p class="muted">{{ kind(job()!.sourceKind) }} import: {{ job()!.counts.total }} items.
              <span data-testid="ci-counts">{{ job()!.counts.new }} new, {{ job()!.counts.duplicate }} already in your profile, {{ job()!.counts.conflict }} differ.</span>
              These are unconfirmed until you include them. Deleted automatically on {{ job()!.expiresAt.slice(0, 10) }}.</p>
            @for (w of job()!.warnings; track w) { <div class="banner warn" role="status" data-testid="ci-warning">{{ w }}</div> }
            @if (job()!.status === 'review_ready') {
              <div class="row"><button class="btn ghost sm" (click)="selectNew()" data-testid="ci-select-new">Select all new items</button>
                <button class="btn ghost sm" (click)="clearSelection()" data-testid="ci-clear">Clear selection</button></div>
            }
          </section>

          @for (g of groups(); track g.section) {
            <section class="card" [attr.data-testid]="'ci-group-' + g.section">
              <h2>{{ g.title }}</h2>
              <ul class="list">
                @for (f of g.fields; track f.id) {
                  <li class="item-card" [attr.data-testid]="'ci-field-' + (f.classification ?? f.status)">
                    <label class="checkbox"><input type="checkbox" [checked]="selected().has(f.id)" (change)="toggle(f.id)" [disabled]="job()!.status !== 'review_ready'" data-testid="ci-include" />
                      <span class="wrap" data-testid="ci-label">{{ f.label }}</span></label>
                    <p class="small muted">
                      @if (f.classification) { <span class="badge" [class.ok]="f.classification === 'new'" [class.warn]="f.classification !== 'new'" data-testid="ci-class">{{ classText(f.classification) }}</span> }
                      @if (f.status === 'merged') { <span class="badge ok" data-testid="ci-merged">Added to your profile</span> }
                      Source: {{ f.sourceRef }} · {{ f.confidence }} confidence · parser {{ f.parserVersion }}</p>
                    @if (conflictOf(f); as c) {
                      <div class="conflict" data-testid="ci-conflict" role="group" [attr.aria-label]="'Decide: ' + f.label">
                        <p class="small">Your profile has <strong>{{ c.existing }}</strong>.</p>
                        <ul class="small">@for (d of c.differences; track d.field) { <li>{{ fieldText(d.field) }}: yours "{{ d.existing }}", imported "{{ d.imported }}"</li> }</ul>
                        @for (ch of c.choices; track ch) {
                          <label class="checkbox"><input type="radio" [name]="'dec-' + c.id" [checked]="decisions()[c.id] === ch" (change)="decide(c.id, ch)" [attr.data-testid]="'ci-choice-' + ch" /> {{ choiceText(ch) }}</label>
                        }
                      </div>
                    }
                  </li>
                }
              </ul>
            </section>
          }

          @if (job()!.status === 'review_ready') {
            <section class="card" aria-labelledby="mg-h" data-testid="ci-merge">
              <h2 id="mg-h">3. Preview and merge</h2>
              <p class="muted small">Previewing changes nothing. Merging adds only the items you included, and you can undo it afterwards.</p>
              <button class="btn" (click)="preview()" [disabled]="busy() || !selected().size" data-testid="ci-preview">Preview merge</button>
              @if (plan(); as p) {
                <div data-testid="ci-plan" aria-live="polite">
                  <p><strong data-testid="ci-plan-summary">{{ p.add }} to add, {{ p.replace }} to replace, {{ p.skip }} skipped.</strong></p>
                  @if (p.unresolved.length) { <p class="error" role="alert" data-testid="ci-unresolved">{{ p.unresolved.length }} difference{{ p.unresolved.length === 1 ? '' : 's' }} still need a decision above.</p> }
                  @if (p.error) { <p class="error" role="alert" data-testid="ci-plan-error">{{ p.error }}</p> }
                  <ul class="small">@for (c of p.changes; track c.fieldId) { <li data-testid="ci-change">{{ actionText(c.action) }}: {{ c.label }}@if (c.reason) { ({{ c.reason }}) }</li> }</ul>
                  <button class="btn" (click)="confirm()" [disabled]="busy() || p.unresolved.length > 0 || !!p.error || (p.add + p.replace) === 0" data-testid="ci-confirm">Add to my profile</button>
                </div>
              }
            </section>
          } @else {
            <section class="card" data-testid="ci-done" aria-live="polite">
              <h2>Merged</h2>
              <p data-testid="ci-done-summary">{{ job()!.result?.add }} added, {{ job()!.result?.replace }} replaced, {{ job()!.result?.skip }} skipped. <a routerLink="/profile">Open my profile</a></p>
              @if (job()!.undoable) { <button class="btn ghost" (click)="undo()" [disabled]="busy()" data-testid="ci-undo">Undo this import</button> }
            </section>
          }

          <div class="row">
            <button class="btn ghost" (click)="close()" data-testid="ci-back">Back to imports</button>
            @if (!confirmDiscard()) { <button class="btn ghost" (click)="confirmDiscard.set(true)" data-testid="ci-discard">Discard import</button> }
            @else { <span role="alert" class="row">Delete this staged import?
              <button class="btn danger sm" (click)="discard()" data-testid="ci-discard-yes">Yes, delete</button>
              <button class="btn ghost sm" (click)="confirmDiscard.set(false)">Keep</button></span> }
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class CareerImportsPage implements OnInit {
  job = signal<Job | null>(null);
  recent = signal<JobRow[]>([]);
  plan = signal<MergePreview | null>(null);
  busy = signal(false);
  error = signal('');
  selected = signal<Set<string>>(new Set());
  decisions = signal<Record<string, Choice>>({});
  confirmDiscard = signal(false);

  groups = computed(() => {
    const j = this.job(); if (!j) return [];
    return SECTION_ORDER.map((s) => ({ section: s, title: SECTION_TITLES[s], fields: j.fields.filter((f) => f.section === s) })).filter((g) => g.fields.length);
  });

  constructor(private api: FeatureApi, private notify: NotifyService) {}
  ngOnInit() { void this.loadRecent(); }

  kind = (k: string) => KIND_TEXT[k] ?? k;
  classText = (c: Classification) => CLASS_TEXT[c];
  choiceText = (c: Choice) => CHOICE_TEXT[c];
  fieldText = (f: string) => FIELD_TEXT[f] ?? f;
  actionText = (a: string) => ({ add: 'Add', replace: 'Replace', skip: 'Skip' } as Record<string, string>)[a] ?? a;
  conflictOf = (f: Field) => this.job()?.conflicts.find((c) => c.fieldId === f.id);

  private fail(e: unknown, fallback: string) { this.error.set(e instanceof Error || (e as { status?: number })?.status ? errorMessage(e) : fallback); }
  private async loadRecent() { try { this.recent.set(await this.api.get<JobRow[]>('/career-imports')); } catch { /* optional list */ } }
  private adopt(j: Job) {
    this.job.set(j);
    this.selected.set(new Set(j.fields.filter((f) => f.status === 'accepted' || f.status === 'merged').map((f) => f.id)));
    this.decisions.set({ ...j.decisions });
  }

  async pick(ev: Event) {
    const input = ev.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file) return;
    this.error.set('');
    if (!/\.(pdf|docx|json|csv)$/i.test(file.name)) { this.error.set('Choose a PDF, DOCX, JSON or CSV file. Older .doc files must be saved as DOCX first.'); return; }
    if (file.size === 0) { this.error.set('That file is empty.'); return; }
    if (file.size > 5 * 1024 * 1024 || (/\.(json|csv)$/i.test(file.name) && file.size > 1024 * 1024)) { this.error.set('That file is too large (limit 5 MB, or 1 MB for JSON and CSV).'); return; }
    this.busy.set(true);
    try {
      const fd = new FormData(); fd.append('file', file, file.name);
      this.adopt(await this.api.post<Job>('/career-imports', fd)); this.plan.set(null);
    } catch (e) { this.fail(e, 'We could not read that file.'); } finally { this.busy.set(false); }
  }

  async open(id: string) {
    this.error.set(''); this.busy.set(true);
    try { this.adopt(await this.api.get<Job>(`/career-imports/${id}`)); this.plan.set(null); } catch (e) { this.fail(e, 'We could not open that import.'); } finally { this.busy.set(false); }
  }

  toggle(id: string) { const s = new Set(this.selected()); if (s.has(id)) s.delete(id); else s.add(id); this.selected.set(s); this.plan.set(null); }
  selectNew() { this.selected.set(new Set(this.job()!.fields.filter((f) => f.classification === 'new').map((f) => f.id))); this.plan.set(null); }
  clearSelection() { this.selected.set(new Set()); this.plan.set(null); }
  decide(conflictId: string, c: Choice) { this.decisions.set({ ...this.decisions(), [conflictId]: c }); this.plan.set(null); }

  async preview() {
    const j = this.job(); if (!j) return;
    this.error.set(''); this.busy.set(true);
    try {
      const accept = [...this.selected()]; const reject = j.fields.filter((f) => f.status !== 'merged' && !this.selected().has(f.id)).map((f) => f.id);
      let cur = await this.api.post<Job>(`/career-imports/${j.id}/preview`, { accept, reject });
      const decisions = Object.entries(this.decisions()).filter(([cid]) => cur.conflicts.some((c) => c.id === cid)).map(([conflictId, choice]) => ({ conflictId, choice }));
      if (decisions.length) cur = await this.api.post<Job>(`/career-imports/${j.id}/resolve-conflicts`, { decisions });
      const keepSel = this.selected(); this.job.set(cur); this.selected.set(keepSel); this.decisions.set({ ...cur.decisions, ...this.decisions() });
      this.plan.set(await this.api.post<MergePreview>(`/career-imports/${j.id}/merge-preview`));
    } catch (e) { this.fail(e, 'We could not preview the merge.'); } finally { this.busy.set(false); }
  }

  async confirm() {
    const j = this.job(); if (!j) return;
    this.error.set(''); this.busy.set(true);
    try { this.adopt(await this.api.post<Job>(`/career-imports/${j.id}/confirm`, { confirm: true })); this.plan.set(null); this.notify.toast('Added to your profile'); }
    catch (e) { this.fail(e, 'We could not merge this import.'); } finally { this.busy.set(false); }
  }

  async undo() {
    const j = this.job(); if (!j) return;
    this.error.set(''); this.busy.set(true);
    try { this.adopt(await this.api.post<Job>(`/career-imports/${j.id}/undo`)); this.plan.set(null); this.notify.toast('Import undone'); }
    catch (e) { this.fail(e, 'We could not undo this import.'); } finally { this.busy.set(false); }
  }

  async discard() { const j = this.job(); if (j) await this.discardById(j.id); }
  async discardById(id: string) {
    this.error.set(''); this.busy.set(true);
    try { await this.api.del(`/career-imports/${id}`); if (this.job()?.id === id) this.job.set(null); this.confirmDiscard.set(false); await this.loadRecent(); this.notify.toast('Import deleted'); }
    catch (e) { this.fail(e, 'We could not delete that import.'); } finally { this.busy.set(false); }
  }

  close() { this.job.set(null); this.plan.set(null); this.error.set(''); this.confirmDiscard.set(false); void this.loadRecent(); }
}
