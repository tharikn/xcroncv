import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { errorMessage, NotifyService } from '../core/notify.service';
import { EventTypes, WebhookDelivery, WebhookEndpoint, WebhooksApi } from '../core/webhooks.api';

/** Client-side mirror of the server rule, for fast feedback only. The API re-checks and also guards DNS at delivery time. */
export function urlProblem(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return 'Enter a full URL such as https://example.com/hook.'; }
  if (u.protocol !== 'https:') return 'The URL must start with https://.';
  if (u.username || u.password) return 'Remove the username and password from the URL.';
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || /\.(local|internal|localhost|lan)$/.test(h) || !h.includes('.') && !h.includes(':')) return 'Use a public hostname. Local and internal addresses are blocked.';
  if (/^(127\.|10\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h === '[::1]') return 'Private and loopback addresses are blocked.';
  if (u.port && !['443', '8443'].includes(u.port)) return 'Only ports 443 and 8443 are allowed.';
  return null;
}

/** Integrations (doc 37): signed webhooks with a delivery log. Secrets are shown once. */
@Component({
  selector: 'app-integrations',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, FormsModule, DatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>Integrations</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head"><div><h1>Integrations</h1><p>Send signed, minimal event notices to your own HTTPS endpoint. Payloads carry ids and counts, never resume content.</p></div>
          <button class="btn" data-testid="new-webhook" (click)="showForm.set(!showForm())">Add endpoint</button></div>
        @if (error()) { <div class="banner err" role="alert" data-testid="wh-error">{{ error() }}</div> }

        @if (secret(); as s) {
          <section class="card" role="status" aria-labelledby="sec-h" data-testid="secret-panel">
            <h2 id="sec-h">Copy your signing secret now</h2>
            <p class="small muted">{{ s.note }}</p>
            <code class="wrap" data-testid="secret-value">{{ s.value }}</code>
            <div class="row"><button class="btn ghost sm" data-testid="copy-secret" (click)="copy(s.value)">Copy</button><button class="btn sm" data-testid="dismiss-secret" (click)="secret.set(null)">I have saved it</button></div>
          </section>
        }

        @if (showForm()) {
          <section class="card" aria-labelledby="wf-h" data-testid="webhook-form">
            <h2 id="wf-h">Add endpoint</h2>
            <div class="form-grid">
              <div class="field full" [class.invalid]="!!urlError()"><label for="wh-url">Endpoint URL *</label><input id="wh-url" type="url" data-testid="wh-url" [(ngModel)]="f.url" maxlength="500" placeholder="https://example.com/hooks/xcroncv" />
                <span class="hint">HTTPS only. Private, loopback and internal addresses are rejected.</span></div>
              <div class="field full"><label for="wh-desc">Description</label><input id="wh-desc" data-testid="wh-desc" [(ngModel)]="f.description" maxlength="120" /></div>
            </div>
            <fieldset class="stack"><legend class="label">Events</legend>
              @for (e of types()?.events ?? []; track e.id) { <label class="checkbox"><input type="checkbox" [attr.data-testid]="'wh-event-' + e.id" [checked]="f.events.has(e.id)" (change)="toggle(e.id)" /> <span><strong>{{ e.id }}</strong> <span class="muted small">{{ e.description }}</span></span></label> }
            </fieldset>
            @if (urlError()) { <p class="error" role="alert" data-testid="wh-form-error">{{ urlError() }}</p> }
            <div class="row"><button class="btn" data-testid="save-webhook" (click)="create()" [disabled]="busy()">Create endpoint</button><button class="btn ghost" (click)="showForm.set(false)">Cancel</button></div>
          </section>
        }

        @if (loading()) { <div class="sk-stack" role="status" aria-busy="true"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
        @else if (items().length === 0) { <div class="empty" data-testid="wh-empty"><h2>No endpoints yet</h2><p class="muted">Add an HTTPS endpoint to receive signed event notices.</p></div> }
        @else {
          <ul class="list" data-testid="wh-list">
            @for (w of items(); track w.id) {
              <li class="card" [attr.data-testid]="'wh-' + w.id">
                <div class="row between"><div class="grow"><h2 class="wrap">{{ w.url }}</h2><p class="muted small">{{ w.description || 'No description' }} · {{ w.events.join(', ') }} · secret {{ w.secretHint }} (v{{ w.secretVersion }})</p></div>
                  <span class="badge" [class.ok]="w.active" [class.warn]="!w.active" data-testid="wh-state">{{ w.active ? 'Active' : 'Paused' }}</span></div>
                <div class="row">
                  <button class="btn sm" data-testid="wh-test" (click)="test(w)" [disabled]="busy() || !w.active">Send test</button>
                  <button class="btn ghost sm" data-testid="wh-toggle" (click)="toggleActive(w)" [disabled]="busy()">{{ w.active ? 'Pause' : 'Resume' }}</button>
                  <button class="btn ghost sm" data-testid="wh-rotate" (click)="rotate(w)" [disabled]="busy()">Rotate secret</button>
                  <button class="btn danger sm" data-testid="wh-delete" (click)="remove(w)" [disabled]="busy()">Delete</button>
                </div>
              </li>
            }
          </ul>
        }

        <section class="card" aria-labelledby="dl-h" data-testid="delivery-log">
          <h2 id="dl-h">Delivery log</h2>
          <p class="small muted">Failed deliveries are retried with the same event id so your receiver can de-duplicate. Verify the signature header with the secret, and reject timestamps older than 5 minutes.</p>
          @if (deliveries().length === 0) { <p class="muted small" data-testid="dl-empty">No deliveries yet.</p> }
          <ul class="list">
            @for (d of deliveries(); track d.id) {
              <li class="row between item-card" [attr.data-testid]="'dl-' + d.id">
                <span class="wrap small">{{ d.createdAt | date: 'medium' }} · {{ d.eventType }} · attempt {{ d.attempts }}{{ d.responseCode ? ' · HTTP ' + d.responseCode : '' }}{{ d.error ? ' · ' + d.error : '' }}{{ d.status === 'FAILED' && d.nextAttemptAt ? ' · next try ' + (d.nextAttemptAt | date: 'shortTime') : '' }}</span>
                <span class="row"><span class="badge" [class.ok]="d.status === 'SUCCESS'" [class.warn]="d.status === 'FAILED'" data-testid="dl-status">{{ d.status }}</span>
                  @if (d.status === 'FAILED') { <button class="btn ghost sm" data-testid="dl-retry" (click)="retry(d)" [disabled]="busy()">Retry</button> }</span>
              </li>
            }
          </ul>
        </section>
      </div>
    </ion-content>
  `,
})
export class IntegrationsPage implements OnInit {
  items = signal<WebhookEndpoint[]>([]);
  deliveries = signal<WebhookDelivery[]>([]);
  types = signal<EventTypes | null>(null);
  secret = signal<{ value: string; note: string } | null>(null);
  loading = signal(true); busy = signal(false); error = signal(''); showForm = signal(false); urlError = signal('');
  f = { url: '', description: '', events: new Set<string>(['test.ping']) };

  constructor(private api: WebhooksApi, private notify: NotifyService) {}
  ngOnInit() { this.api.eventTypes().subscribe({ next: (t) => this.types.set(t), error: () => this.types.set(null) }); this.reload(); }
  ionViewWillEnter() { if (!this.loading()) this.reload(); }

  reload() {
    this.error.set('');
    this.api.list().subscribe({ next: (l) => { this.items.set(l); this.loading.set(false); }, error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); } });
    this.api.deliveries().subscribe({ next: (d) => this.deliveries.set(d), error: () => this.deliveries.set([]) });
  }
  toggle(id: string) { this.f.events.has(id) ? this.f.events.delete(id) : this.f.events.add(id); }

  create() {
    this.urlError.set('');
    const p = urlProblem(this.f.url);
    if (p) { this.urlError.set(p); return; }
    if (this.f.events.size === 0) { this.urlError.set('Choose at least one event.'); return; }
    this.busy.set(true);
    this.api.create({ url: this.f.url.trim(), description: this.f.description.trim() || undefined, events: [...this.f.events] }).subscribe({
      next: (r) => {
        this.busy.set(false); this.showForm.set(false); this.f = { url: '', description: '', events: new Set(['test.ping']) };
        this.secret.set({ value: r.secret, note: r.secretNote }); this.reload();
      },
      error: (e) => { this.busy.set(false); this.urlError.set(errorMessage(e)); },
    });
  }

  private run(obs: import('rxjs').Observable<unknown>, ok: string) {
    this.busy.set(true);
    obs.subscribe({ next: () => { this.busy.set(false); void this.notify.toast(ok); this.reload(); }, error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); this.reload(); } });
  }
  test(w: WebhookEndpoint) { this.run(this.api.test(w.id), 'Test delivery sent. Check the log below.'); }
  toggleActive(w: WebhookEndpoint) { this.run(this.api.update(w.id, { active: !w.active }), w.active ? 'Endpoint paused' : 'Endpoint resumed'); }
  retry(d: WebhookDelivery) { this.run(this.api.retry(d.id), 'Retry sent'); }
  async rotate(w: WebhookEndpoint) {
    if (!(await this.notify.confirm('Rotate secret?', 'The current secret stops working immediately. You will see the new one once.', 'Rotate'))) return;
    this.api.rotate(w.id).subscribe({ next: (r) => { this.secret.set({ value: r.secret, note: r.secretNote }); this.reload(); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }
  async remove(w: WebhookEndpoint) {
    if (!(await this.notify.confirm('Delete endpoint?', 'The endpoint and its delivery history are permanently deleted.'))) return;
    this.run(this.api.remove(w.id), 'Endpoint deleted');
  }
  async copy(v: string) { try { await navigator.clipboard.writeText(v); void this.notify.toast('Copied'); } catch { void this.notify.toast('Copy failed. Select the secret and copy it manually.', 'error'); } }
}
