import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { Channel, CareerToolsApi, Contact, ContactDetail, ContactImportPreview, FollowUpTask } from '../core/career-tools.api';
import { ACTIVITY_LABELS, dueLabel, splitTags } from '../core/career-tools.format';
import { LocalFileService } from '../core/local-file.service';
import { errorMessage, NotifyService } from '../core/notify.service';

const RELATIONSHIPS = ['RECRUITER', 'REFERRER', 'HIRING_MANAGER', 'PEER', 'MENTOR', 'OTHER'];

/** Application CRM and Contact Network (doc 46): a private workspace; host job/application ids are opaque references. */
@Component({
  selector: 'app-contacts',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, DatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>Contacts</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        @if (error()) { <div class="banner err" role="alert" data-testid="contacts-error">{{ error() }}</div> }

        @if (!detail()) {
          <div class="page-head">
            <div><h1>Contacts</h1><p>People, conversations and follow-ups. Private to you; nothing is ever sent automatically.</p></div>
            <div class="row">
              <button class="btn ghost" (click)="showImport.set(!showImport())" data-testid="import-contacts"><ion-icon name="download-outline" aria-hidden="true"></ion-icon> Import CSV</button>
              <button class="btn ghost" (click)="exportAll()" data-testid="export-contacts"><ion-icon name="download-outline" aria-hidden="true"></ion-icon> Export</button>
              <button class="btn" data-testid="new-contact" (click)="showForm.set(!showForm())"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> New contact</button>
            </div>
          </div>

          @if (showImport()) {
            <section class="card" aria-labelledby="imp-h" data-testid="import-panel">
              <h2 id="imp-h">Import contacts from a CSV file</h2>
              <p class="muted small">Works with a LinkedIn connections export or any spreadsheet with name, company, title, email and phone columns. The file is read on this device and sent only to your own account; nothing is enriched, looked up or messaged, and the file itself is not stored.</p>
              <div class="field"><label for="impfile">CSV file</label><input id="impfile" type="file" accept=".csv,text/csv" data-testid="import-file" (change)="pickFile($event)" /></div>
              <div class="field"><label for="imptext">Or paste CSV text</label><textarea id="imptext" data-testid="import-text" [(ngModel)]="importText" maxlength="90000"></textarea></div>
              <label class="checkbox"><input type="checkbox" data-testid="import-consent" [(ngModel)]="importConsent" /> <span>I may keep these contacts and understand duplicates are skipped, not merged.</span></label>
              <div class="row"><button class="btn sm" (click)="previewImport()" [disabled]="busy() || !importText.trim() || !importConsent" data-testid="import-preview">Preview</button></div>
              @if (importPreview(); as p) {
                <div data-testid="import-summary" role="status">
                  <p><strong>{{ p.summary.new }}</strong> new, <strong>{{ p.summary.duplicate }}</strong> duplicates (skipped), <strong>{{ p.summary.invalid }}</strong> invalid (skipped).@if (p.truncated) { Only the first 500 rows are considered. }</p>
                  @if (p.unmappedColumns.length) { <p class="muted small">Ignored columns: {{ p.unmappedColumns.join(', ') }}</p> }
                  <ul class="list" data-testid="import-rows">
                    @for (r of p.rows; track r.line) { <li class="small wrap" [attr.data-testid]="'import-row-' + r.status.toLowerCase()">Row {{ r.line }}: {{ r.status }}{{ r.contact ? ' · ' + r.contact.name : '' }}{{ r.reason ? ' (' + r.reason + ')' : '' }}</li> }
                  </ul>
                  <div class="row"><button class="btn sm" (click)="commitImport()" [disabled]="busy() || p.summary.new === 0" data-testid="import-commit">Import {{ p.summary.new }} contacts</button></div>
                </div>
              }
            </section>
          }

          @if (showForm()) {
            <section class="card" aria-labelledby="nc-h" data-testid="contact-form">
              <h2 id="nc-h">New contact</h2>
              <div class="form-grid">
                <div class="field" [class.invalid]="touched() && !f.name.trim()"><label for="cname">Name *</label><input id="cname" data-testid="contact-name" [(ngModel)]="f.name" maxlength="120" /></div>
                <div class="field"><label for="corg">Organization</label><input id="corg" data-testid="contact-org" [(ngModel)]="f.organization" maxlength="120" /></div>
                <div class="field"><label for="crole">Role</label><input id="crole" data-testid="contact-role" [(ngModel)]="f.role" maxlength="120" /></div>
                <div class="field"><label for="crel">Relationship</label>
                  <select id="crel" data-testid="contact-rel" [(ngModel)]="f.relationship">@for (r of relationships; track r) { <option [value]="r">{{ pretty(r) }}</option> }</select></div>
                <div class="field"><label for="cemail">Email</label><input id="cemail" type="email" data-testid="contact-email" [(ngModel)]="f.email" maxlength="200" /></div>
                <div class="field"><label for="cphone">Phone</label><input id="cphone" type="tel" data-testid="contact-phone" [(ngModel)]="f.phone" maxlength="60" /></div>
                <div class="field"><label for="ctags">Tags</label><input id="ctags" data-testid="contact-tags" [(ngModel)]="f.tags" placeholder="comma, separated" /></div>
                <div class="field full"><label for="cnotes">Notes</label><textarea id="cnotes" data-testid="contact-notes" [(ngModel)]="f.notes" maxlength="4000"></textarea>
                  <span class="hint">Notes are encrypted at rest.</span></div>
              </div>
              @if (touched() && !f.name.trim()) { <p class="error" role="alert">Enter a name.</p> }
              <div class="row">
                <button class="btn" data-testid="save-contact" (click)="create()" [disabled]="busy()">Save contact</button>
                <button class="btn ghost" (click)="showForm.set(false)">Cancel</button>
              </div>
            </section>
          }

          <section class="card" aria-labelledby="due-h" data-testid="open-tasks">
            <h2 id="due-h">Follow-ups</h2>
            @if (tasks().length === 0) { <p class="muted small" data-testid="tasks-empty">No open follow-ups.</p> }
            <ul class="list">
              @for (t of tasks(); track t.id) {
                <li class="row between" [attr.data-testid]="'task-' + t.id">
                  <label class="checkbox grow"><input type="checkbox" [checked]="t.status === 'DONE'" (change)="toggleTask(t)" [attr.aria-label]="'Mark done: ' + t.title" data-testid="task-toggle" /> <span class="wrap">{{ t.title }}</span></label>
                  <span class="badge" [class.warn]="due(t) === 'overdue'">{{ due(t) === 'overdue' ? 'Overdue' : due(t) === 'today' ? 'Today' : (t.dueAt | date: 'mediumDate') }}</span>
                </li>
              }
            </ul>
          </section>

          <div class="field"><label for="csearch" class="sr-only">Search contacts</label>
            <input id="csearch" type="search" data-testid="contact-search" placeholder="Search by name or organization" [ngModel]="q()" (ngModelChange)="search($event)" /></div>

          @if (loading()) { <div class="sk-stack" role="status" aria-busy="true"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
          @else if (contacts().length === 0) {
            <div class="empty" data-testid="contacts-empty"><h2>{{ q() ? 'No matching contacts' : 'No contacts yet' }}</h2><p class="muted">Add recruiters, referrers and hiring managers you are talking to.</p></div>
          } @else {
            <ul class="list" data-testid="contact-list">
              @for (c of contacts(); track c.id) {
                <li class="card" [attr.data-testid]="'contact-' + c.id">
                  <div class="row between">
                    <div class="grow"><h2 class="wrap">{{ c.name }}</h2>
                      <p class="muted small">{{ c.role || 'No role' }}{{ c.organization ? ' · ' + c.organization : '' }} · {{ pretty(c.relationship) }}</p></div>
                    <button class="btn sm" (click)="open(c.id)" data-testid="open-contact" [attr.aria-label]="'Open ' + c.name">Open</button>
                  </div>
                  @if (c.tags.length) { <div class="row">@for (t of c.tags; track t) { <span class="badge">{{ t }}</span> }</div> }
                </li>
              }
            </ul>
          }
        }
        @if (detail(); as d) {
          <button class="btn ghost sm" style="align-self:flex-start" (click)="close()" data-testid="back-contacts"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon> All contacts</button>
          <div class="page-head">
            <div><h1 class="wrap" data-testid="contact-heading">{{ d.name }}</h1><p>{{ d.role || 'No role' }}{{ d.organization ? ' · ' + d.organization : '' }} · {{ pretty(d.relationship) }}</p></div>
            <button class="btn danger" (click)="remove(d)" data-testid="delete-contact"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Delete contact</button>
          </div>

          <section class="card" aria-labelledby="info-h">
            <h2 id="info-h">Details</h2>
            @for (ch of d.channels; track $index) { <p class="small wrap" data-testid="channel">{{ ch.type }}: {{ ch.value }}</p> }
            @if (d.channels.length === 0) { <p class="muted small">No channels recorded.</p> }
            <div class="field"><label for="dnotes">Notes</label>
              <textarea id="dnotes" data-testid="detail-notes" [(ngModel)]="notesDraft" maxlength="4000"></textarea></div>
            <div class="row"><button class="btn sm" (click)="saveNotes(d)" data-testid="save-notes">Save notes</button></div>
          </section>

          <section class="card" aria-labelledby="links-h">
            <h2 id="links-h">Linked jobs and applications</h2>
            <p class="muted small">References come from your job portal. They are labels only and do not give this app access to that record.</p>
            <ul class="list" data-testid="link-list">
              @for (l of d.links; track l.id) { <li class="row between"><span class="wrap">{{ l.kind === 'JOB' ? 'Job' : 'Application' }} · {{ l.label || l.externalRef }}</span><span class="badge">{{ l.externalRef }}</span></li> }
            </ul>
            <div class="form-grid">
              <div class="field"><label for="lkind">Type</label><select id="lkind" data-testid="link-kind" [(ngModel)]="link.kind"><option value="JOB">Job</option><option value="APPLICATION">Application</option></select></div>
              <div class="field"><label for="lref">Reference</label><input id="lref" data-testid="link-ref" [(ngModel)]="link.ref" maxlength="120" /></div>
              <div class="field"><label for="llabel">Label (optional)</label><input id="llabel" data-testid="link-label" [(ngModel)]="link.label" maxlength="120" /></div>
            </div>
            <div class="row"><button class="btn sm" (click)="addLink(d)" [disabled]="!link.ref.trim()" data-testid="add-link">Add link</button></div>
          </section>

          <section class="card" aria-labelledby="tl-h">
            <h2 id="tl-h">Activity timeline</h2>
            <div class="form-grid">
              <div class="field"><label for="atype">Type</label><select id="atype" data-testid="act-type" [(ngModel)]="act.type">@for (a of activityTypes; track a) { <option [value]="a">{{ activityLabels[a] }}</option> }</select></div>
              <div class="field"><label for="adate">Date</label><input id="adate" type="date" data-testid="act-date" [(ngModel)]="act.date" /></div>
              <div class="field full"><label for="asum">What happened</label><input id="asum" data-testid="act-summary" [(ngModel)]="act.summary" maxlength="500" /></div>
            </div>
            <div class="row"><button class="btn sm" (click)="addActivity(d)" [disabled]="!act.summary.trim() || !act.date" data-testid="add-activity">Add to timeline</button></div>
            @if (d.activities.length === 0) { <p class="muted small" data-testid="timeline-empty">Nothing logged yet.</p> }
            <ol class="list" data-testid="timeline">
              @for (a of d.activities; track a.id) {
                <li class="item-card"><div class="row between"><strong>{{ activityLabels[a.type] || a.type }}</strong><span class="muted small">{{ a.occurredAt | date: 'mediumDate' }}</span></div>
                  <p class="wrap">{{ a.summary }}</p>
                  <div class="row"><button class="btn ghost sm" (click)="removeActivity(d, a.id)" data-testid="delete-activity" aria-label="Delete this entry"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon></button></div></li>
              }
            </ol>
          </section>

          <section class="card" aria-labelledby="ft-h">
            <h2 id="ft-h">Follow-up reminders</h2>
            <div class="form-grid">
              <div class="field"><label for="ttitle">Task</label><input id="ttitle" data-testid="task-title" [(ngModel)]="task.title" maxlength="200" /></div>
              <div class="field"><label for="tdue">Due</label><input id="tdue" type="date" data-testid="task-due" [(ngModel)]="task.due" /></div>
            </div>
            <div class="row"><button class="btn sm" (click)="addTask(d)" [disabled]="!task.title.trim() || !task.due" data-testid="add-task">Add reminder</button></div>
            <ul class="list">
              @for (t of d.tasks; track t.id) { <li class="row between"><span class="wrap" [style.text-decoration]="t.status === 'DONE' ? 'line-through' : 'none'">{{ t.title }}</span><span class="muted small">{{ t.dueAt | date: 'mediumDate' }} · {{ t.status }}</span></li> }
            </ul>
          </section>
        }
      </div>
    </ion-content>
  `,
})
export class ContactsPage implements OnInit {
  readonly relationships = RELATIONSHIPS;
  readonly activityTypes = Object.keys(ACTIVITY_LABELS);
  readonly activityLabels = ACTIVITY_LABELS;
  contacts = signal<Contact[]>([]);
  tasks = signal<FollowUpTask[]>([]);
  detail = signal<ContactDetail | null>(null);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  showForm = signal(false);
  showImport = signal(false);
  importText = '';
  importConsent = false;
  importPreview = signal<ContactImportPreview | null>(null);
  touched = signal(false);
  q = signal('');
  notesDraft = '';
  f = { name: '', organization: '', role: '', relationship: 'OTHER', email: '', phone: '', tags: '', notes: '' };
  link: { kind: 'JOB' | 'APPLICATION'; ref: string; label: string } = { kind: 'JOB', ref: '', label: '' };
  act = { type: 'OUTREACH', date: new Date().toISOString().slice(0, 10), summary: '' };
  task = { title: '', due: '' };
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private api: CareerToolsApi, private notify: NotifyService, private files: LocalFileService) {}

  ngOnInit() { this.reload(); }
  ionViewWillEnter() { if (!this.loading()) this.reload(); }

  pretty(s: string) { return s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()); }
  due(t: FollowUpTask) { return dueLabel(t.dueAt); }

  reload() {
    this.api.listContacts({ q: this.q() || undefined }).subscribe({
      next: (c) => { this.contacts.set(c); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
    this.api.listTasks('OPEN').subscribe({ next: (t) => this.tasks.set(t), error: () => this.tasks.set([]) });
  }

  search(v: string) { this.q.set(v); clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.reload(), 250); }

  create() {
    this.touched.set(true);
    if (!this.f.name.trim()) return;
    const channels: Channel[] = [];
    if (this.f.email.trim()) channels.push({ type: 'email', value: this.f.email.trim() });
    if (this.f.phone.trim()) channels.push({ type: 'phone', value: this.f.phone.trim() });
    this.busy.set(true);
    this.api.createContact({
      name: this.f.name.trim(), organization: this.f.organization.trim() || undefined, role: this.f.role.trim() || undefined,
      relationship: this.f.relationship, channels, tags: splitTags(this.f.tags), notes: this.f.notes.trim() || undefined,
    }).subscribe({
      next: () => {
        this.busy.set(false); this.showForm.set(false); this.touched.set(false);
        this.f = { name: '', organization: '', role: '', relationship: 'OTHER', email: '', phone: '', tags: '', notes: '' };
        void this.notify.toast('Contact saved'); this.reload();
      },
      error: (e) => {
        this.busy.set(false);
        void this.notify.toast(e.status === 409 ? 'You already have a matching contact. Open it instead of adding a duplicate.' : errorMessage(e), 'error');
      },
    });
  }

  open(id: string) {
    this.api.getContact(id).subscribe({
      next: (d) => { this.detail.set(d); this.notesDraft = d.notes ?? ''; },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }
  close() { this.detail.set(null); this.reload(); }
  private refresh(id: string) { this.open(id); }

  saveNotes(d: ContactDetail) {
    this.api.updateContact(d.id, { notes: this.notesDraft }).subscribe({
      next: () => { void this.notify.toast('Notes saved'); this.refresh(d.id); },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }

  addLink(d: ContactDetail) {
    this.api.linkContact(d.id, { kind: this.link.kind, externalRef: this.link.ref.trim(), label: this.link.label.trim() || undefined }).subscribe({
      next: () => { this.link = { kind: 'JOB', ref: '', label: '' }; this.refresh(d.id); },
      error: (e) => void this.notify.toast(e.status === 409 ? 'That link already exists.' : errorMessage(e), 'error'),
    });
  }

  addActivity(d: ContactDetail) {
    this.api.createActivity({ contactId: d.id, type: this.act.type, occurredAt: new Date(`${this.act.date}T12:00:00Z`).toISOString(), summary: this.act.summary.trim() }).subscribe({
      next: () => { this.act.summary = ''; this.refresh(d.id); },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }

  async removeActivity(d: ContactDetail, id: string) {
    if (!(await this.notify.confirm('Delete entry?', 'This timeline entry will be permanently deleted.'))) return;
    this.api.deleteActivity(id).subscribe({ next: () => this.refresh(d.id), error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }

  addTask(d: ContactDetail) {
    this.api.createTask({ contactId: d.id, title: this.task.title.trim(), dueAt: new Date(`${this.task.due}T09:00:00Z`).toISOString() }).subscribe({
      next: () => { this.task = { title: '', due: '' }; this.refresh(d.id); },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }

  toggleTask(t: FollowUpTask) {
    this.api.updateTask(t.id, { status: t.status === 'DONE' ? 'OPEN' : 'DONE' }).subscribe({
      next: () => this.reload(), error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }

  async remove(d: ContactDetail) {
    if (!(await this.notify.confirm('Delete contact?', `"${d.name}", their timeline, links and reminders will be permanently deleted.`))) return;
    this.api.deleteContact(d.id).subscribe({
      next: () => { void this.notify.toast('Contact deleted'); this.close(); },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }

  async pickFile(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 90_000) { void this.notify.toast('That file is too large (limit about 90 KB, roughly 500 contacts). Split it and import in parts.', 'error'); return; }
    this.importText = await file.text();
    this.importPreview.set(null);
  }

  previewImport() {
    this.busy.set(true);
    this.api.previewContactImport(this.importText, this.importConsent).subscribe({
      next: (p) => { this.importPreview.set(p); this.busy.set(false); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  commitImport() {
    this.busy.set(true);
    this.api.commitContactImport(this.importText, this.importConsent).subscribe({
      next: (r) => {
        this.busy.set(false); this.importPreview.set(null); this.importText = ''; this.importConsent = false; this.showImport.set(false);
        void this.notify.toast(`Imported ${r.created} contacts (${r.skippedDuplicates} duplicates and ${r.invalid} invalid rows skipped)`);
        this.reload();
      },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  async exportAll() {
    try {
      const blob = await firstValueFrom(this.api.exportContacts());
      await this.files.save(blob, 'contacts-export.json');
      void this.notify.toast('Contacts exported to this device');
    } catch (e) { void this.notify.toast(errorMessage(e), 'error'); }
  }
}
