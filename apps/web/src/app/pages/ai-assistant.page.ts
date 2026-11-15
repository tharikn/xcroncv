import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { AiApi, AiStatus, AiSuggestion, AiTask, AiUsage } from '../core/ai.api';
import { errorMessage, NotifyService } from '../core/notify.service';

const TASKS: Array<{ id: AiTask; label: string; help: string; placeholder: string }> = [
  { id: 'REWRITE_BULLET', label: 'Tidy a bullet', help: 'Removes filler and asks for a real result. Never adds a number or claim.', placeholder: 'Responsible for building the billing API' },
  { id: 'SUMMARY_DRAFT', label: 'Draft a summary', help: 'Built only from the title, years and skills you type below.', placeholder: '(not needed)' },
  { id: 'POLISH_TEXT', label: 'Tidy a letter or document', help: 'Fixes spacing, repeated words and filler. Never adds a fact or number. Use it for cover letters and career documents.', placeholder: 'Paste a paragraph from your letter or document' },
  { id: 'COACH_ANSWER', label: 'Check an interview answer', help: 'Looks at the structure of your own answer and asks what is missing. No score. Put the interview question in the title field.', placeholder: 'Paste your practice answer' },
  { id: 'KEYWORD_GAPS', label: 'Find keyword gaps', help: 'Compares a job posting with your skills list. Advisory only; never changes a score.', placeholder: 'Paste the job posting text' },
];

/** AI assistant (docs 06, 38): optional, opt-in, suggestions need approval, nothing is saved to the profile automatically. */
@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, FormsModule],
  template: `
    <ion-header><ion-toolbar><ion-title>AI assistant</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head"><div><h1>AI assistant</h1><p>Optional help with wording. You review everything; nothing is saved to your profile until you apply it yourself.</p></div></div>
        @if (error()) { <div class="banner err" role="alert" data-testid="ai-error">{{ error() }}</div> }
        @if (loading()) { <p class="muted" role="status">Loading…</p> }

        @if (status(); as s) {
          <section class="card" aria-labelledby="ai-set-h" data-testid="ai-settings">
            <h2 id="ai-set-h">Settings and limits</h2>
            <p class="small muted" data-testid="ai-provider">Provider: {{ s.provider.id }} ({{ s.provider.model }}){{ s.provider.available ? '' : ' - not available' }}.
              {{ s.provider.external ? 'Text is sent to an external service.' : 'Runs on this server with fixed rules; no text leaves the platform.' }}</p>
            <ul class="small muted">@for (g of s.guarantees; track g) { <li>{{ g }}</li> }</ul>
            <label class="checkbox"><input type="checkbox" data-testid="ai-enabled" [checked]="s.enabled" [disabled]="busy()" (change)="toggle($any($event.target).checked)" /> Turn on AI assistance for my account</label>
            <p class="small" data-testid="ai-quota">Today: {{ s.quota.used }} of {{ s.quota.limit }} requests used.</p>
            @if (!s.provider.available) { <div class="banner warn" role="status" data-testid="ai-unavailable">No AI provider is configured. Everything else in the app works as normal.</div> }
          </section>

          <section class="card" aria-labelledby="ai-new-h">
            <h2 id="ai-new-h">Ask for a suggestion</h2>
            @if (!s.enabled) { <div class="banner" role="status" data-testid="ai-off">AI assistance is off. Turn it on above to use it.</div> }
            <div class="form-grid">
              <div class="field"><label for="ai-task">What do you need?</label>
                <select id="ai-task" data-testid="ai-task" [(ngModel)]="task">@for (t of tasks; track t.id) { <option [value]="t.id">{{ t.label }}</option> }</select>
                <span class="hint">{{ current().help }}</span></div>
              @if (task !== 'SUMMARY_DRAFT') {
                <div class="field full" [class.invalid]="touched() && !text.trim()"><label for="ai-text">Your text</label>
                  <textarea id="ai-text" rows="4" data-testid="ai-text" [(ngModel)]="text" maxlength="4000" [placeholder]="current().placeholder"></textarea>
                  <span class="hint">Emails and phone numbers are removed before processing.</span></div>
              }
              @if (task !== 'REWRITE_BULLET') {
                <div class="field"><label for="ai-title">Job title</label><input id="ai-title" data-testid="ai-title" [(ngModel)]="title" maxlength="120" /></div>
                <div class="field"><label for="ai-years">Years of experience</label><input id="ai-years" type="number" min="0" max="60" data-testid="ai-years" [(ngModel)]="years" /></div>
                <div class="field full"><label for="ai-skills">Skills (comma separated)</label><input id="ai-skills" data-testid="ai-skills" [(ngModel)]="skills" maxlength="400" /></div>
              }
            </div>
            @if (formError()) { <p class="error" role="alert" data-testid="ai-form-error">{{ formError() }}</p> }
            <div class="row"><button class="btn" data-testid="ai-suggest" (click)="suggest()" [disabled]="busy() || !s.enabled || !s.provider.available">Get suggestion</button></div>
          </section>
        }

        <section class="card" aria-labelledby="ai-sug-h">
          <div class="row between"><h2 id="ai-sug-h">Suggestions for review</h2>
            @if (items().length) { <button class="btn ghost sm" data-testid="ai-purge" (click)="purge()">Delete all suggestions</button> }</div>
          @if (items().length === 0) { <p class="muted" data-testid="ai-empty">No suggestions yet.</p> }
          <ul class="list" data-testid="ai-list">
            @for (i of items(); track i.id) {
              <li class="item-card" [attr.data-testid]="'sug-' + i.id">
                <div class="row between"><strong>{{ label(i.feature) }}</strong>
                  <span class="badge" [class.ok]="i.status === 'ACCEPTED'" [class.warn]="i.status === 'REJECTED'" data-testid="sug-status">{{ i.status === 'PENDING' ? 'Needs your review' : i.status === 'ACCEPTED' ? 'Accepted' : 'Rejected' }}</span></div>
                @if (i.inputPreview) { <p class="small muted wrap">From: {{ i.inputPreview }}</p> }
                <p class="wrap" data-testid="sug-text">{{ i.output.text || 'No text could be suggested.' }}</p>
                @for (n of i.output.notes; track n) { <p class="small muted wrap">{{ n }}</p> }
                @for (q of i.output.questions; track q) { <p class="small wrap" data-testid="sug-question">Question for you: {{ q }}</p> }
                @if (i.provenance.injectionFlagged) { <p class="small banner warn" data-testid="sug-injection">The source text contained instructions aimed at the assistant. They were ignored.</p> }
                @if (i.status === 'PENDING') {
                  <label class="checkbox"><input type="checkbox" [attr.data-testid]="'sug-confirm-' + i.id" [checked]="confirmed().has(i.id)" (change)="markConfirmed(i.id, $any($event.target).checked)" /> I reviewed this text and it is accurate.</label>
                  <div class="row">
                    <button class="btn sm" data-testid="sug-accept" [disabled]="!confirmed().has(i.id) || busy()" (click)="decide(i, 'ACCEPT')">Accept</button>
                    <button class="btn ghost sm" data-testid="sug-reject" [disabled]="busy()" (click)="decide(i, 'REJECT')">Reject</button>
                  </div>
                } @else if (i.status === 'ACCEPTED') {
                  <p class="small muted" data-testid="sug-applied-note">Accepted. Copy it into your profile yourself; nothing was changed automatically.</p>
                  <div class="row"><button class="btn ghost sm" data-testid="sug-copy" (click)="copy(i)">Copy text</button></div>
                }
              </li>
            }
          </ul>
        </section>

        @if (usage(); as u) {
          <section class="card" aria-labelledby="ai-use-h" data-testid="ai-usage">
            <h2 id="ai-use-h">Usage, last {{ u.windowDays }} days</h2>
            <p class="small" data-testid="usage-total">{{ u.totalCalls }} request{{ u.totalCalls === 1 ? '' : 's' }}, {{ u.failures }} failed. Accepted {{ u.suggestions.accepted }}, rejected {{ u.suggestions.rejected }}, waiting {{ u.suggestions.pending }}.</p>
            <ul class="small muted">@for (f of featureRows(u); track f.id) { <li>{{ label(f.id) }}: {{ f.calls }} call{{ f.calls === 1 ? '' : 's' }}, about {{ f.tokens }} tokens</li> }</ul>
            <p class="hint">{{ u.note }}</p>
          </section>
        }
      </div>
    </ion-content>
  `,
})
export class AiAssistantPage implements OnInit {
  readonly tasks = TASKS;
  status = signal<AiStatus | null>(null);
  usage = signal<AiUsage | null>(null);
  items = signal<AiSuggestion[]>([]);
  confirmed = signal<Set<string>>(new Set());
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  touched = signal(false);
  formError = signal('');
  task: AiTask = 'REWRITE_BULLET';
  text = ''; title = ''; years: number | null = null; skills = '';

  constructor(private api: AiApi, private notify: NotifyService) {}
  ngOnInit() { this.reload(); }
  ionViewWillEnter() { if (!this.loading()) this.reload(); }

  current() { return TASKS.find((t) => t.id === this.task) ?? TASKS[0]; }
  label(id: string) { return TASKS.find((t) => t.id === id)?.label ?? id; }
  featureRows(u: AiUsage) { return Object.entries(u.byFeature).map(([id, f]) => ({ id, calls: f.calls, tokens: f.inputTokens + f.outputTokens })); }

  reload() {
    this.error.set('');
    this.api.status().subscribe({ next: (s) => { this.status.set(s); this.loading.set(false); }, error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); } });
    this.api.suggestions().subscribe({ next: (l) => this.items.set(l), error: () => this.items.set([]) });
    this.api.usage().subscribe({ next: (u) => this.usage.set(u), error: () => this.usage.set(null) });
  }

  toggle(enabled: boolean) {
    this.busy.set(true);
    this.api.setEnabled(enabled).subscribe({
      next: (s) => { this.status.set(s); this.busy.set(false); void this.notify.toast(enabled ? 'AI assistance is on' : 'AI assistance is off'); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); this.reload(); },
    });
  }

  suggest() {
    this.touched.set(true); this.formError.set('');
    if (this.task !== 'SUMMARY_DRAFT' && !this.text.trim()) { this.formError.set('Enter some text first.'); return; }
    if (this.task === 'SUMMARY_DRAFT' && !this.title.trim()) { this.formError.set('Enter a job title: the summary can only use facts you provide.'); return; }
    const skills = this.skills.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30);
    const context = this.task === 'REWRITE_BULLET' ? undefined : { title: this.title.trim() || undefined, years: this.years === null || this.years === undefined || (this.years as unknown) === '' ? undefined : Number(this.years), skills: skills.length ? skills : undefined };
    this.busy.set(true);
    this.api.suggest({ task: this.task, text: this.task === 'SUMMARY_DRAFT' ? '' : this.text.trim(), context }).subscribe({
      next: () => { this.busy.set(false); this.touched.set(false); this.reload(); },
      error: (e) => { this.busy.set(false); this.formError.set(errorMessage(e)); this.reload(); },
    });
  }

  markConfirmed(id: string, on: boolean) { const s = new Set(this.confirmed()); on ? s.add(id) : s.delete(id); this.confirmed.set(s); }

  decide(i: AiSuggestion, decision: 'ACCEPT' | 'REJECT') {
    this.busy.set(true);
    this.api.decide(i.id, { decision, confirm: decision === 'ACCEPT' ? true : undefined }).subscribe({
      next: () => { this.busy.set(false); this.reload(); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  async copy(i: AiSuggestion) {
    try { await navigator.clipboard.writeText(i.output.text); void this.notify.toast('Copied'); } catch { void this.notify.toast('Copy failed. Select the text and copy it manually.', 'error'); }
  }

  async purge() {
    if (!(await this.notify.confirm('Delete suggestions?', 'All stored suggestions are permanently deleted. Usage counts remain.'))) return;
    this.api.purge().subscribe({ next: () => { this.reload(); void this.notify.toast('Suggestions deleted'); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }
}
