import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { LocalFolderService } from '../local-files/local-folder.service';
import { errorMessage, NotifyService } from '../../core/notify.service';
import { FeatureApi } from '../common/feature-api';

interface Version { id: string; versionNumber: number; changeSummary?: string | null; createdAt: string; meta: { label?: string | null; restoredFrom?: number | null; templateId: string; templateVersion: number; contentHash: string } | null }
interface FieldChange { field: string; before?: string; after?: string }
interface Diff {
  from: string; to: string; identical: boolean; counts: Record<string, number>; header: FieldChange[];
  sections: Array<{ type: string; title: string; change: string }>;
  items: Array<{ section: string; label: string; change: string; fields: FieldChange[]; bulletsAdded: string[]; bulletsRemoved: string[]; datesChanged?: { before?: string; after?: string } }>;
  skills: { added: string[]; removed: string[] }; design: FieldChange[];
}
interface EvidenceEntry { key: string; text: string; support: string }
interface EvidenceDiff {
  note: string; added: EvidenceEntry[]; removed: EvidenceEntry[]; changed: Array<{ text: string; from: string; to: string }>; unchanged: number;
  addedNeedingEvidence: number; removedWithoutEvidence: number;
}
const SUPPORT_TEXT: Record<string, string> = { direct: 'Directly supported', partial: 'Partly supported', ambiguous: 'Ambiguous', absent: 'No evidence linked', contradictory: 'Contradicts your evidence' };
interface Integrity { valid: boolean | null; note?: string }
interface Resume { id: string; name: string; updatedAt: string }
const KIND: Record<string, string> = { MASTER: 'Master resume', ROLE: 'Role-specific', JOB: 'Job-specific' };

/** Resume variants and immutable versions (doc 28). History is append-only; restoring creates a new version. */
@Component({
  selector: 'app-resume-versions',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, DatePipe, RouterLink],
  template: `
    <ion-header><ion-toolbar><ion-title>Versions</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head"><div><h1>{{ resume()?.name || 'Versions' }}</h1>
          <p>Saved versions never change. Restoring one adds a new version; it does not rewrite history.</p></div>
          <a class="btn ghost" [routerLink]="['/resumes', id]" data-testid="back-editor">Back to editor</a></div>
        @if (error()) { <div class="banner err" role="alert" data-testid="ver-error">{{ error() }}</div> }

        <section class="card" aria-labelledby="var-h" data-testid="variant-panel">
          <h2 id="var-h">Resume type</h2>
          <div class="form-grid">
            <div class="field"><label for="v-kind">Type</label>
              <select id="v-kind" [(ngModel)]="kind" (ngModelChange)="formDirty = true" data-testid="variant-kind"><option value="">Not set</option><option value="MASTER">Master resume</option><option value="ROLE">Role-specific</option><option value="JOB">Company / job-specific</option></select></div>
            <div class="field"><label for="v-co">Company</label><input id="v-co" maxlength="120" [(ngModel)]="company" (ngModelChange)="formDirty = true" data-testid="variant-company" /></div>
            <div class="field"><label for="v-jt">Job title</label><input id="v-jt" maxlength="120" [(ngModel)]="jobTitle" (ngModelChange)="formDirty = true" data-testid="variant-job" /></div>
          </div>
          <div class="row"><button class="btn ghost" data-testid="variant-save" (click)="saveVariant()" [disabled]="busy() || !kind">Save type</button>
            @if (variantKind()) { <span class="badge" data-testid="variant-badge">{{ kindName(variantKind()!) }}</span> }</div>
          <h3>Make a copy for a role or job</h3>
          <div class="form-grid">
            <div class="field"><label for="nv-name">Name of the copy</label><input id="nv-name" maxlength="100" [(ngModel)]="newName" data-testid="newvariant-name" /></div>
            <div class="field"><label for="nv-kind">Copy type</label><select id="nv-kind" [(ngModel)]="newKind" data-testid="newvariant-kind"><option value="ROLE">Role-specific</option><option value="JOB">Company / job-specific</option></select></div>
          </div>
          <button class="btn" data-testid="newvariant-create" (click)="createVariant()" [disabled]="busy() || !newName.trim()">Create copy</button>
          <p class="muted small">Copies keep this resume's template and layout. Your content comes from your shared career profile.</p>
          @if (variants().length) {
            <h3>Your resume family</h3>
            <ul class="list" data-testid="variant-list">@for (v of variants(); track v.resumeId) { <li class="small">{{ v.name }} · {{ kindName(v.kind) }}{{ v.company ? ' · ' + v.company : '' }}{{ v.parentResumeId ? ' · copy' : '' }}</li> }</ul>
          }
        </section>

        <section class="card" aria-labelledby="snap-h">
          <h2 id="snap-h">Save a version</h2>
          <div class="form-grid">
            <div class="field"><label for="s-label">Label (for example the employer)</label><input id="s-label" maxlength="60" [(ngModel)]="label" data-testid="snap-label" /></div>
            <div class="field"><label for="s-sum">What changed</label><input id="s-sum" maxlength="200" [(ngModel)]="summary" data-testid="snap-summary" /></div>
          </div>
          <button class="btn" data-testid="snap-create" (click)="snapshot()" [disabled]="busy()">Save version</button>
        </section>

        <section class="card" aria-labelledby="hist-h" data-testid="version-list">
          <h2 id="hist-h">History</h2>
          @if (!versions().length) { <p class="muted" data-testid="no-versions">No saved versions yet.</p> }
          <ul class="list">
            @for (v of versions(); track v.id) {
              <li class="item-card" [attr.data-testid]="'version-' + v.versionNumber">
                <div class="row between"><strong>Version {{ v.versionNumber }}@if (v.meta?.label) { · {{ v.meta!.label }} }</strong>
                  <span class="muted small">{{ v.createdAt | date: 'medium' }}</span></div>
                <p class="small">{{ v.changeSummary || 'No description' }}{{ v.meta?.restoredFrom ? ' (restored from version ' + v.meta!.restoredFrom + ')' : '' }}
                  @if (v.meta) { · template {{ v.meta.templateId }} v{{ v.meta.templateVersion }} }</p>
                @if (integrity()[v.versionNumber]; as i) {
                  <p class="small" [attr.data-testid]="'integrity-' + v.versionNumber"><span class="badge" [class.ok]="i.valid === true" [class.warn]="i.valid !== true">{{ i.valid === true ? 'Unchanged since saved' : i.valid === false ? 'Does not match what was saved' : 'No integrity record' }}</span></p>
                }
                <div class="row" style="flex-wrap:wrap">
                  <button class="btn ghost sm" data-testid="verify" (click)="verify(v)">Verify</button>
                  <button class="btn ghost sm" data-testid="compare-draft" (click)="compare(v.versionNumber + '', 'draft')">Compare with current</button>
                  <button class="btn ghost sm" data-testid="export-v-pdf" (click)="exportVersion(v, 'pdf')">PDF</button>
                  <button class="btn ghost sm" data-testid="export-v-docx" (click)="exportVersion(v, 'docx')">DOCX</button>
                  <button class="btn ghost sm" data-testid="restore" (click)="restoring.set(v.versionNumber)">Restore</button>
                </div>
                @if (restoring() === v.versionNumber) {
                  <div class="banner warn" data-testid="restore-box">
                    <p>This adds a new version with the content of version {{ v.versionNumber }}. Nothing is overwritten.</p>
                    <label class="checkbox"><input type="checkbox" [(ngModel)]="applyLayout" data-testid="restore-layout" /> Also use its template and layout for the working resume</label>
                    <div class="row"><button class="btn sm" data-testid="restore-confirm" (click)="restore(v)">Restore as new version</button><button class="btn ghost sm" (click)="restoring.set(0)">Cancel</button></div>
                  </div>
                }
              </li>
            }
          </ul>
        </section>

        @if (versions().length > 1) {
          <section class="card" aria-labelledby="cmp-h">
            <h2 id="cmp-h">Compare two versions</h2>
            <div class="row">
              <label class="sr-only" for="c-from">From</label><select id="c-from" [(ngModel)]="from" data-testid="cmp-from">@for (v of versions(); track v.id) { <option [value]="v.versionNumber">Version {{ v.versionNumber }}</option> }</select>
              <label class="sr-only" for="c-to">To</label><select id="c-to" [(ngModel)]="to" data-testid="cmp-to">@for (v of versions(); track v.id) { <option [value]="v.versionNumber">Version {{ v.versionNumber }}</option> }<option value="draft">Current working resume</option></select>
              <button class="btn" data-testid="cmp-run" (click)="compare(from, to)">Compare</button>
            </div>
          </section>
        }

        @if (diff(); as d) {
          <section class="card" aria-labelledby="df-h" data-testid="diff">
            <h2 id="df-h">{{ d.from }} → {{ d.to }}</h2>
            @if (d.identical) { <p data-testid="diff-identical">No differences.</p> }
            @else {
              <p class="small" data-testid="diff-counts">Sections {{ d.counts['sections'] }} · Items {{ d.counts['items'] }} · Bullets {{ d.counts['bullets'] }} · Skills {{ d.counts['skills'] }} · Dates {{ d.counts['dates'] }} · Header {{ d.counts['header'] }} · Design {{ d.counts['design'] }}</p>
              @if (d.header.length) { <h3>Header</h3><ul>@for (h of d.header; track h.field) { <li class="small">{{ h.field }}: <del>{{ h.before || '(empty)' }}</del> → <ins>{{ h.after || '(empty)' }}</ins></li> }</ul> }
              <h3>Sections</h3><ul data-testid="diff-sections">@for (s of changedSections(d); track s.type) { <li class="small">{{ s.title }}: {{ s.change }}</li> }</ul>
              <h3>Items</h3>
              <ul data-testid="diff-items">@for (i of d.items; track $index) {
                <li class="small"><strong>{{ i.section }} — {{ i.label }}</strong> ({{ i.change }})
                  @for (f of i.fields; track f.field) { <div>{{ f.field }}: <del>{{ f.before || '(empty)' }}</del> → <ins>{{ f.after || '(empty)' }}</ins></div> }
                  @for (b of i.bulletsAdded; track b) { <div><span class="sr-only">added bullet: </span><ins>+ {{ b }}</ins></div> }
                  @for (b of i.bulletsRemoved; track b) { <div><span class="sr-only">removed bullet: </span><del>- {{ b }}</del></div> }</li> }</ul>
              @if (d.skills.added.length || d.skills.removed.length) { <h3>Skills</h3><p class="small" data-testid="diff-skills">Added: {{ d.skills.added.join(', ') || 'none' }}. Removed: {{ d.skills.removed.join(', ') || 'none' }}.</p> }
              @if (d.design.length) { <h3>Design</h3><ul data-testid="diff-design">@for (x of d.design; track x.field) { <li class="small">{{ x.field }}: {{ x.before }} → {{ x.after }}</li> }</ul> }
              @if (evidence(); as e) {
                <h3>Evidence</h3>
                <p class="small muted">{{ e.note }}</p>
                <p class="small" data-testid="ev-summary">{{ e.addedNeedingEvidence }} new statement{{ e.addedNeedingEvidence === 1 ? '' : 's' }} without full evidence · {{ e.removedWithoutEvidence }} removed statement{{ e.removedWithoutEvidence === 1 ? '' : 's' }} that had none · {{ e.changed.length }} with changed support · {{ e.unchanged }} unchanged</p>
                @if (e.added.length) { <h4>Added statements</h4><ul data-testid="ev-added">@for (x of e.added; track x.key) { <li class="small"><span class="sr-only">added: </span><ins>+ {{ x.text }}</ins> <span class="badge" [class.ok]="x.support === 'direct'" [class.warn]="x.support !== 'direct'">{{ supportText(x.support) }}</span></li> }</ul> }
                @if (e.removed.length) { <h4>Removed statements</h4><ul data-testid="ev-removed">@for (x of e.removed; track x.key) { <li class="small"><span class="sr-only">removed: </span><del>- {{ x.text }}</del> <span class="badge">{{ supportText(x.support) }}</span></li> }</ul> }
                @if (e.changed.length) { <h4>Support changed</h4><ul data-testid="ev-changed">@for (x of e.changed; track x.text) { <li class="small">{{ x.text }}: {{ supportText(x.from) }} → {{ supportText(x.to) }}</li> }</ul> }
              }
            }
          </section>
        }
      </div>
    </ion-content>
  `,
})
export class ResumeVersionsPage implements OnInit {
  id = '';
  resume = signal<Resume | null>(null); versions = signal<Version[]>([]); variants = signal<Array<{ resumeId: string; name: string; kind: string; company?: string; parentResumeId?: string }>>([]);
  evidence = signal<EvidenceDiff | null>(null);
  variantKind = signal<string | null>(null); diff = signal<Diff | null>(null); integrity = signal<Record<number, Integrity>>({});
  busy = signal(false); error = signal(''); restoring = signal(0);
  formDirty = false; kind = ''; company = ''; jobTitle = ''; newName = ''; newKind = 'JOB'; label = ''; summary = ''; applyLayout = false; from = ''; to = 'draft';

  constructor(private api: FeatureApi, private route: ActivatedRoute, private notify: NotifyService, private folder: LocalFolderService) {}
  kindName(k: string) { return KIND[k] ?? k; }
  changedSections = (d: Diff) => d.sections.filter((s) => s.change !== 'unchanged');
  ngOnInit() { this.id = this.route.snapshot.paramMap.get('id') ?? ''; return this.load(); }
  ionViewWillEnter() { if (this.id) void this.load(); }

  private async run(fn: () => Promise<void>) { this.error.set(''); this.busy.set(true); try { await fn(); } catch (e) { this.error.set(errorMessage(e)); } finally { this.busy.set(false); } }
  load() {
    return this.run(async () => {
      this.resume.set(await this.api.get<Resume>(`/resumes/${this.id}`));
      this.versions.set(await this.api.get<Version[]>(`/resumes/${this.id}/snapshots`));
      const v = await this.api.get<{ kind: string | null; company?: string; jobTitle?: string }>(`/resumes/${this.id}/variant`);
      this.variantKind.set(v.kind);
      if (!this.formDirty) { this.kind = v.kind ?? ''; this.company = v.company ?? ''; this.jobTitle = v.jobTitle ?? ''; } // never overwrite what the user is typing
      this.variants.set(await this.api.get(`/resume-variants`));
      this.from = String(this.versions()[1]?.versionNumber ?? this.versions()[0]?.versionNumber ?? '');
      this.to = String(this.versions()[0]?.versionNumber ?? 'draft');
    });
  }
  saveVariant() { return this.run(async () => { await this.api.put(`/resumes/${this.id}/variant`, { kind: this.kind, company: this.company || undefined, jobTitle: this.jobTitle || undefined }); this.formDirty = false; await this.load(); await this.notify.toast('Resume type saved'); }); }
  createVariant() {
    return this.run(async () => { await this.api.post(`/resumes/${this.id}/variants`, { name: this.newName, kind: this.newKind }); this.newName = ''; await this.load(); await this.notify.toast('Copy created'); });
  }
  snapshot() { return this.run(async () => { await this.api.post(`/resumes/${this.id}/snapshots`, { label: this.label || undefined, changeSummary: this.summary || undefined }); this.label = ''; this.summary = ''; await this.load(); await this.notify.toast('Version saved'); }); }
  verify(v: Version) { return this.run(async () => { const r = await this.api.get<{ integrity: Integrity }>(`/resumes/${this.id}/snapshots/${v.versionNumber}`); this.integrity.set({ ...this.integrity(), [v.versionNumber]: r.integrity }); }); }
  supportText(s: string) { return SUPPORT_TEXT[s] ?? s; }
  compare(from: string, to: string) {
    return this.run(async () => {
      this.evidence.set(null);
      this.diff.set(await this.api.get<Diff>(`/resumes/${this.id}/snapshots/compare?from=${from}&to=${to}`));
      // Evidence-level comparison is optional: it needs the evidence-check module, so any failure just hides the section.
      try { this.evidence.set(await this.api.get<EvidenceDiff>(`/resumes/${this.id}/provenance/compare?from=${from}&to=${to}`)); } catch { /* feature off or unavailable */ }
    });
  }
  restore(v: Version) {
    return this.run(async () => {
      await this.api.post(`/resumes/${this.id}/snapshots/${v.versionNumber}/restore`, { applyLayout: this.applyLayout });
      this.restoring.set(0); this.applyLayout = false; await this.load(); await this.notify.toast(`Restored as a new version`);
    });
  }
  exportVersion(v: Version, format: 'pdf' | 'docx') {
    return this.run(async () => {
      const blob = await this.api.blob(`/resumes/${this.id}/snapshots/${v.versionNumber}/export/${format}`);
      await this.folder.init(); const r = await this.folder.save(`${this.resume()?.name ?? 'resume'}-v${v.versionNumber}`, format, blob);
      await this.notify.toast(r.kind === 'saved' ? `Saved ${r.fileName}` : `${format.toUpperCase()} download started`);
    });
  }
}
