import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { copyOutline, shieldCheckmarkOutline, trashOutline } from 'ionicons/icons';
import { ApiService } from '../core/api.service';
import { errorMessage, NotifyService } from '../core/notify.service';
import { AuthorizeResult, AutofillSession, FieldOption, ProfileToolsApi, SiteAdapter } from '../core/profile-tools.api';

/** Application Autofill Assistant (doc 47): user-started sessions, field-by-field review, copy values yourself. Never submits. */
@Component({
  selector: 'app-autofill',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, RouterLink, DatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>Autofill assistant</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head"><div><h1>Application autofill</h1>
          <p>Review which confirmed profile facts to share for one application, then copy them. The assistant never submits a form and never touches passwords.</p></div></div>
        @if (error()) { <div class="banner err" role="alert" data-testid="autofill-error">{{ error() }}</div> }
        @if (noProfile()) {
          <div class="banner warn" role="status" data-testid="autofill-needs-profile">Create your career profile first. <a routerLink="/profile">Go to profile</a></div>
        }

        @if (!session()) {
          <section class="card" aria-labelledby="st-h" data-testid="start-panel">
            <h2 id="st-h">1. Start a session</h2>
            <p class="muted small">A session lasts 15 minutes, is yours alone and can be revoked at any time.</p>
            <div class="form-grid">
              <div class="field"><label for="adapter">Method</label>
                <select id="adapter" data-testid="adapter-select" [(ngModel)]="adapterId">
                  @for (a of adapters(); track a.id) { <option [value]="a.id">{{ a.name }}{{ a.verified ? '' : ' (experimental)' }}</option> }
                </select><span class="hint" data-testid="adapter-desc">{{ adapterDesc() }}</span></div>
              <div class="field"><label for="host">Site hostname (optional)</label>
                <input id="host" data-testid="host-input" [(ngModel)]="host" maxlength="253" placeholder="boards.greenhouse.io" autocomplete="off" />
                <span class="hint">Hostname only, never the full address.</span></div>
            </div>
            <div class="row"><button class="btn" data-testid="start-session" (click)="start()" [disabled]="busy() || noProfile()"><ion-icon name="shield-checkmark-outline" aria-hidden="true"></ion-icon> Start session</button></div>
          </section>

          <section class="card" aria-labelledby="hist-h">
            <h2 id="hist-h">Recent sessions</h2>
            @if (loading()) { <p class="muted" role="status">Loading…</p> }
            @else if (history().length === 0) { <p class="muted small" data-testid="sessions-empty">No sessions yet.</p> }
            <ul class="list" data-testid="session-list">
              @for (s of history(); track s.id) {
                <li class="row between item-card" [attr.data-testid]="'session-' + s.id">
                  <span class="wrap">{{ s.adapterId }}{{ s.targetHost ? ' · ' + s.targetHost : '' }} · {{ s.createdAt | date: 'short' }}</span>
                  <span class="row"><span class="badge" [class.ok]="s.status === 'AUTHORIZED'" [class.warn]="s.status === 'REVOKED' || s.status === 'EXPIRED'" data-testid="session-status">{{ s.status }}</span>
                    @if (s.status === 'ACTIVE' || s.status === 'AUTHORIZED') {
                      <button class="btn ghost sm" (click)="resume(s)" data-testid="resume-session">Continue</button>
                      <button class="btn danger sm" (click)="revoke(s.id)" data-testid="revoke-listed">Revoke</button>
                    }</span>
                </li>
              }
            </ul>
          </section>
        }

        @if (session(); as s) {
          <div class="row between">
            <span class="badge" [class.ok]="s.status === 'AUTHORIZED'" data-testid="session-state">Session {{ s.status.toLowerCase() }}</span>
            <span class="row"><button class="btn danger sm" (click)="revoke(s.id)" data-testid="revoke-session"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Revoke session</button>
              <button class="btn ghost sm" (click)="leave()" data-testid="leave-session">Leave</button></span>
          </div>

          @if (!result()) {
            <section class="card" aria-labelledby="rv-h" data-testid="review-panel">
              <h2 id="rv-h">2. Choose what to share</h2>
              <p class="muted small">Nothing is selected by default. Fields marked sensitive need your consent for this session. Eligibility, demographic and identity-number questions are never filled.</p>
              @for (g of groups(); track g) {
                <fieldset class="stack"><legend class="label">{{ g }}</legend>
                  @for (f of fieldsIn(g); track f.key) {
                    <label class="checkbox" [class.muted]="!f.available">
                      <input type="checkbox" [attr.data-testid]="'field-' + f.key" [disabled]="!f.available" [checked]="chosen.has(f.key)" (change)="toggle(f.key)" />
                      <span class="grow wrap">{{ f.label }} <span class="muted small">{{ f.available ? f.preview : 'not in your profile' }}</span></span>
                      @if (f.sensitive) { <span class="badge warn">Sensitive</span> }
                    </label>
                  }
                </fieldset>
              }
              @if (needsSensitive()) {
                <label class="checkbox"><input type="checkbox" data-testid="sensitive-consent" [(ngModel)]="sensitiveConsent" /> I consent to share the sensitive fields I selected, for this session only.</label>
              }
              <label class="checkbox"><input type="checkbox" data-testid="review-confirm" [(ngModel)]="reviewed" /> I reviewed the selected fields.</label>
              <div class="row">
                <button class="btn" data-testid="authorize-btn" (click)="authorize(s)" [disabled]="busy() || chosen.size === 0 || !reviewed || (needsSensitive() && !sensitiveConsent)">Release {{ chosen.size }} field{{ chosen.size === 1 ? '' : 's' }}</button>
              </div>
            </section>
          }

          @if (result(); as r) {
            <section class="card" aria-labelledby="out-h" data-testid="result-panel">
              <h2 id="out-h">3. Copy into the application</h2>
              <div class="banner" role="status" data-testid="no-submit-note">Nothing has been submitted. Paste the values yourself, check them, and submit the application on the site.
                {{ r.mode === 'FILL' ? 'The browser extension (when installed) fills only the visible fields listed here and never presses submit.' : '' }}</div>
              <ul class="list" data-testid="fill-list">
                @for (f of r.fills; track f.fieldKey) {
                  <li class="row between item-card" [attr.data-testid]="'fill-' + f.fieldKey">
                    <div class="grow"><strong>{{ labelOf(f.fieldKey) }}</strong><p class="wrap" data-testid="fill-value">{{ f.value }}</p></div>
                    <button class="btn sm" (click)="copy(f.value)" [attr.aria-label]="'Copy ' + labelOf(f.fieldKey)" data-testid="copy-value"><ion-icon name="copy-outline" aria-hidden="true"></ion-icon> Copy</button>
                  </li>
                }
              </ul>
              @if (r.skipped.length) { <p class="muted small" data-testid="skipped-note">Left blank (nothing confirmed in your profile): {{ r.skipped.join(', ') }}</p> }
              <div class="row"><button class="btn ghost" (click)="clearValues()" data-testid="clear-values">Clear values from this screen</button></div>
            </section>
          }
        }
      </div>
    </ion-content>
  `,
})
export class AutofillPage implements OnInit {
  adapters = signal<SiteAdapter[]>([]);
  history = signal<AutofillSession[]>([]);
  session = signal<AutofillSession | null>(null);
  fields = signal<FieldOption[]>([]);
  result = signal<AuthorizeResult | null>(null);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  noProfile = signal(false);
  adapterId = 'manual-copy';
  host = '';
  chosen = new Set<string>();
  sensitiveConsent = false;
  reviewed = false;

  constructor(private api: ProfileToolsApi, private profiles: ApiService, private notify: NotifyService) { addIcons({ copyOutline, shieldCheckmarkOutline, trashOutline }); }

  ngOnInit() { this.reload(); }
  ionViewWillEnter() { if (!this.loading() && !this.session()) this.reload(); }

  reload() {
    this.profiles.getProfile().subscribe({ next: () => this.noProfile.set(false), error: (e) => this.noProfile.set(e.status === 404) });
    this.api.siteAdapters().subscribe({ next: (a) => this.adapters.set(a), error: (e) => this.error.set(errorMessage(e)) });
    this.api.listSessions().subscribe({
      next: (s) => { this.history.set(s); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  adapterDesc() { return this.adapters().find((a) => a.id === this.adapterId)?.description ?? ''; }
  groups() { return [...new Set(this.fields().map((f) => f.group))]; }
  fieldsIn(g: string) { return this.fields().filter((f) => f.group === g); }
  labelOf(key: string) { return this.fields().find((f) => f.key === key)?.label ?? key; }
  needsSensitive() { return this.fields().some((f) => f.sensitive && this.chosen.has(f.key)); }
  toggle(k: string) { this.chosen.has(k) ? this.chosen.delete(k) : this.chosen.add(k); }

  start() {
    this.busy.set(true); this.error.set('');
    this.api.startSession({ adapterId: this.adapterId, targetHost: this.host.trim() || undefined, confirm: true }).subscribe({
      next: (s) => { this.busy.set(false); this.enter(s); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }
  resume(s: AutofillSession) { this.enter(s); }

  private enter(s: AutofillSession) {
    this.api.fieldOptions(s.id).subscribe({
      next: (r) => {
        this.session.set(r.session); this.fields.set(r.fields); this.result.set(null);
        this.chosen = new Set(); this.sensitiveConsent = false; this.reviewed = false;
      },
      error: (e) => { void this.notify.toast(errorMessage(e), 'error'); this.reload(); },
    });
  }

  authorize(s: AutofillSession) {
    this.busy.set(true);
    this.api.authorizeFields(s.id, { fieldKeys: [...this.chosen], sensitiveConsent: this.needsSensitive() ? this.sensitiveConsent : undefined, confirm: true }).subscribe({
      next: (r) => { this.busy.set(false); this.session.set(r.session); this.result.set(r); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  async revoke(id: string) {
    if (!(await this.notify.confirm('Revoke session?', 'Any released values stop being available and the session ends.', 'Revoke'))) return;
    this.api.revokeSession(id).subscribe({
      next: () => { void this.notify.toast('Session revoked'); this.leave(); },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }

  clearValues() { this.result.set(null); void this.notify.toast('Values cleared from this screen'); }
  leave() { this.session.set(null); this.result.set(null); this.chosen = new Set(); this.reload(); }

  async copy(v: string) {
    try { await navigator.clipboard.writeText(v); void this.notify.toast('Copied'); }
    catch { void this.notify.toast('Copy failed. Select the value and copy it manually.', 'error'); }
  }
}
