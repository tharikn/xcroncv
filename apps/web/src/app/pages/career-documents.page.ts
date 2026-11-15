import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { DocDetail, DocDiff, DocListItem, DocSection, DocTypeInfo, DocValidation, DocumentsApi } from '../core/documents.api';
import { errorMessage, NotifyService } from '../core/notify.service';

const INPUT_LABEL: Record<string, string> = {
  recipientName: 'Recipient name', managerName: 'Manager name', relationship: 'How you worked together', lastDay: 'Last working day (YYYY-MM-DD)',
  targetRole: 'Target role', occasion: 'Occasion (for example interview)', experienceId: 'Experience id', projectId: 'Project id',
};

/** Career document suite (doc 52): drafts from confirmed profile facts, evidence labels, immutable versions, local export. */
@Component({
  selector: 'app-career-documents',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, FormsModule, DatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>Career documents</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        @if (error()) { <div class="banner err" role="alert" data-testid="cd-error">{{ error() }}</div> }

        @if (!doc()) {
          <div class="page-head"><div><h1>Career documents</h1><p>Bios, reference requests, notes and letters built from the facts in your profile. Every statement is labelled as evidenced or written by you. Manual editing always works; nothing needs AI.</p></div></div>
          <section class="card" aria-labelledby="cd-new-h" data-testid="cd-form">
            <h2 id="cd-new-h">New document</h2>
            <div class="form-grid">
              <div class="field"><label for="cd-type">Type</label><select id="cd-type" data-testid="cd-type" [(ngModel)]="type">@for (t of types(); track t.id) { <option [value]="t.id">{{ t.label }}</option> }</select></div>
              <div class="field"><label for="cd-tone">Tone</label><select id="cd-tone" data-testid="cd-tone" [(ngModel)]="tone"><option value="formal">Formal</option><option value="friendly">Friendly</option></select></div>
              @for (k of currentInputs(); track k) { <div class="field"><label [for]="'in-' + k">{{ inputLabel(k) }}</label><input [id]="'in-' + k" [attr.data-testid]="'in-' + k" [(ngModel)]="inputs[k]" maxlength="80" /></div> }
            </div>
            @if (currentType()?.disclaimer; as d) { <p class="banner warn small" role="note" data-testid="cd-disclaimer">{{ d }}</p> }
            <div class="row"><button class="btn" data-testid="cd-create" (click)="create()" [disabled]="busy()">Create draft</button></div>
          </section>

          @if (loading()) { <div class="sk-stack" role="status" aria-busy="true"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
          @else if (items().length === 0) { <div class="empty" data-testid="cd-empty"><h2>No documents yet</h2><p class="muted">Create a draft above. Fields we cannot fill from your profile show as [add ...] for you to complete.</p></div> }
          <ul class="list" data-testid="cd-list">
            @for (d of items(); track d.id) {
              <li class="card row between" [attr.data-testid]="'doc-' + d.id"><div class="grow"><h2 class="wrap">{{ d.title }}</h2><p class="muted small">{{ d.typeLabel }} · version {{ d.currentVersion }} · {{ d.updatedAt | date: 'mediumDate' }}</p></div>
                <button class="btn sm" data-testid="cd-open" (click)="open(d.id)" [attr.aria-label]="'Open ' + d.title">Open</button></li>
            }
          </ul>
        }

        @if (doc(); as d) {
          <button class="btn ghost sm" style="align-self:flex-start" data-testid="cd-back" (click)="close()">All documents</button>
          <div class="page-head"><div><h1 class="wrap" data-testid="cd-title">{{ d.title }}</h1><p>{{ d.typeLabel }} · viewing version {{ d.version?.versionNumber }} of {{ d.currentVersion }}</p></div>
            <button class="btn danger" data-testid="cd-delete" (click)="remove(d)">Delete</button></div>
          @if (d.disclaimer) { <p class="banner warn small" role="note" data-testid="cd-disclaimer">{{ d.disclaimer }}</p> }

          @if (d.version; as v) {
            <section class="card" aria-labelledby="cd-ed-h">
              <h2 id="cd-ed-h">Content</h2>
              @if (viewingOld()) { <p class="banner" role="status" data-testid="cd-old">You are viewing an older, read-only version.</p> }
              @for (s of v.sections; track s.id) {
                <div class="field" [attr.data-testid]="'sec-' + s.id">
                  <label [for]="'s-' + s.id">{{ s.heading }} <span class="badge" [class.ok]="s.origin === 'PROFILE'" data-testid="sec-origin">{{ s.origin === 'PROFILE' ? 'From your profile' : 'Written by you' }}</span>
                    @if (hasPlaceholder(s)) { <span class="badge warn" data-testid="sec-placeholder">Needs your input</span> }</label>
                  <textarea [id]="'s-' + s.id" rows="3" data-testid="sec-text" [disabled]="viewingOld()" [ngModel]="edits[s.id] ?? s.text" (ngModelChange)="edits[s.id] = $event" maxlength="6000"></textarea>
                  <span class="hint" data-testid="sec-evidence">{{ evidenceText(v.claims, s.id) }}</span>
                </div>
              }
              @if (!viewingOld()) {
                <div class="field"><label for="cd-sum">Change note (optional)</label><input id="cd-sum" data-testid="cd-summary" [(ngModel)]="summaryNote" maxlength="200" /></div>
                <div class="row"><button class="btn" data-testid="cd-save" (click)="save(d)" [disabled]="busy() || !changed()">Save as new version</button>
                  <button class="btn ghost" data-testid="cd-validate" (click)="validate(d)">Check evidence</button></div>
              }
              @if (validation(); as val) {
                <div data-testid="cd-validation" [class.banner]="true" [class.warn]="!val.ok" role="status">
                  <p class="small">{{ val.evidenced }} statement{{ val.evidenced === 1 ? '' : 's' }} linked to your profile, {{ val.userAuthored }} written by you (not verified).</p>
                  @if (val.stale.length) { <p class="small" data-testid="val-stale">{{ val.stale.length }} evidence link{{ val.stale.length === 1 ? ' is' : 's are' }} out of date because the profile item changed.</p> }
                  @if (val.placeholders.length) { <p class="small" data-testid="val-placeholders">{{ val.placeholders.length }} placeholder{{ val.placeholders.length === 1 ? '' : 's' }} still to fill in.</p> }
                  @if (val.ok) { <p class="small">Everything is linked and filled in.</p> }
                </div>
              }
            </section>

            <section class="card" aria-labelledby="cd-ver-h">
              <h2 id="cd-ver-h">Versions and export</h2>
              <ul class="list" data-testid="cd-versions">@for (x of d.versions; track x.versionNumber) {
                <li class="row between item-card"><span class="small">Version {{ x.versionNumber }} · {{ x.changeSummary || 'No note' }} · {{ x.createdAt | date: 'medium' }}</span>
                  <span class="row"><button class="btn ghost sm" data-testid="ver-view" (click)="view(d, x.versionNumber)">View</button>
                    @if (x.versionNumber > 1) { <button class="btn ghost sm" data-testid="ver-diff" (click)="diff(d, x.versionNumber - 1, x.versionNumber)">Compare with previous</button> }</span></li> }</ul>
              @if (diffView(); as df) {
                <ul class="list" data-testid="cd-diff">@for (s of df.sections; track s.id) { @if (s.status !== 'UNCHANGED') { <li class="item-card small"><strong>{{ s.heading }}</strong> ({{ s.status.toLowerCase() }})
                  @if (s.before) { <div class="muted wrap">Before: {{ s.before }}</div> } @if (s.after) { <div class="wrap">After: {{ s.after }}</div> }</li> } }</ul>
              }
              <div class="row"><button class="btn ghost" data-testid="cd-export-txt" (click)="exportFile(d, 'txt')">Download .txt</button><button class="btn ghost" data-testid="cd-export-md" (click)="exportFile(d, 'md')">Download .md</button><button class="btn ghost" data-testid="cd-export-docx" (click)="exportFile(d, 'docx')">Download .docx</button><button class="btn ghost" data-testid="cd-export-pdf" (click)="exportFile(d, 'pdf')">Download .pdf</button></div>
              <p class="hint">Files are created on request and handed to you. The server does not keep them.</p>
            </section>
          }
        }
      </div>
    </ion-content>
  `,
})
export class CareerDocumentsPage implements OnInit {
  types = signal<DocTypeInfo[]>([]); items = signal<DocListItem[]>([]); doc = signal<DocDetail | null>(null);
  validation = signal<DocValidation | null>(null); diffView = signal<DocDiff | null>(null);
  loading = signal(true); busy = signal(false); error = signal('');
  type = 'BIO'; tone = 'formal'; inputs: Record<string, string> = {}; edits: Record<string, string> = {}; summaryNote = '';

  constructor(private api: DocumentsApi, private notify: NotifyService) {}
  ngOnInit() { this.api.types().subscribe({ next: (t) => this.types.set(t), error: (e) => this.error.set(errorMessage(e)) }); this.reload(); }
  ionViewWillEnter() { if (!this.loading() && !this.doc()) this.reload(); }

  currentType() { return this.types().find((t) => t.id === this.type); }
  currentInputs() { return (this.currentType()?.inputs ?? []).filter((k) => k !== 'experienceId' && k !== 'projectId'); }
  inputLabel(k: string) { return INPUT_LABEL[k] ?? k; }
  hasPlaceholder(s: DocSection) { return /\[add [^\]]+\]/.test(this.edits[s.id] ?? s.text); }
  evidenceText(claims: Array<{ sectionId: string; label: string; evidence: { label: string } | null }>, id: string) {
    const c = claims.filter((x) => x.sectionId === id);
    if (c.some((x) => x.evidence)) return `Evidence: ${[...new Set(c.filter((x) => x.evidence).map((x) => x.evidence!.label))].slice(0, 3).join('; ')}`;
    return 'No evidence link. This text is yours and is not verified.';
  }
  viewingOld() { const d = this.doc(); return !!d && !!d.version && d.version.versionNumber !== d.currentVersion; }
  changed() { const v = this.doc()?.version; return !!v && v.sections.some((s) => this.edits[s.id] !== undefined && this.edits[s.id] !== s.text); }

  reload() {
    this.error.set('');
    this.api.list().subscribe({ next: (l) => { this.items.set(l); this.loading.set(false); }, error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); } });
  }

  create() {
    this.busy.set(true);
    const inputs = Object.fromEntries(Object.entries(this.inputs).filter(([, v]) => v?.trim()).map(([k, v]) => [k, v.trim()]));
    this.api.create({ type: this.type, tone: this.tone, inputs }).subscribe({
      next: (d) => { this.busy.set(false); this.inputs = {}; this.enter(d); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }
  private enter(d: DocDetail) { this.doc.set(d); this.edits = {}; this.validation.set(null); this.diffView.set(null); this.summaryNote = ''; }
  open(id: string) { this.api.get(id).subscribe({ next: (d) => this.enter(d), error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }
  close() { this.doc.set(null); this.reload(); }
  view(d: DocDetail, n: number) { this.api.get(d.id, n).subscribe({ next: (x) => { this.doc.set(x); this.edits = {}; this.diffView.set(null); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }

  save(d: DocDetail) {
    const v = d.version!;
    const sections = v.sections.filter((s) => this.edits[s.id] !== undefined && this.edits[s.id] !== s.text).map((s) => ({ id: s.id, text: this.edits[s.id] }));
    this.busy.set(true);
    this.api.version(d.id, sections, this.summaryNote.trim() || undefined).subscribe({
      next: (r) => { this.busy.set(false); this.enter(r); void this.notify.toast('Saved as a new version'); }, error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }
  validate(d: DocDetail) { this.api.validate(d.id).subscribe({ next: (v) => this.validation.set(v), error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }
  diff(d: DocDetail, a: number, b: number) { this.api.diff(d.id, a, b).subscribe({ next: (x) => this.diffView.set(x), error: (e) => void this.notify.toast(errorMessage(e), 'error') }); }

  exportFile(d: DocDetail, format: 'txt' | 'md' | 'docx' | 'pdf') {
    this.api.export(d.id, format).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = `${d.title.replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-') || 'document'}.${format}`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        void this.notify.toast('Downloaded');
      },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }
  async remove(d: DocDetail) {
    if (!(await this.notify.confirm('Delete document?', `"${d.title}" and all its versions will be permanently deleted.`))) return;
    this.api.remove(d.id).subscribe({ next: () => { void this.notify.toast('Document deleted'); this.close(); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }
}
