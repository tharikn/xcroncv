import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, arrowBackOutline, shieldCheckmarkOutline, trashOutline } from 'ionicons/icons';
import { ApiService } from '../core/api.service';
import { errorMessage, NotifyService } from '../core/notify.service';
import { Credential, CredentialDetail, CredentialStatus, Grant, ProfileToolsApi, VerificationInfo } from '../core/profile-tools.api';

const STATUS_LABEL: Record<CredentialStatus, string> = {
  SELF_REPORTED: 'Self-reported', DOCUMENT_REVIEWED: 'Document reviewed by you', ISSUER_VERIFIED: 'Issuer verified',
  EXPIRED: 'Expired', REVOKED: 'Revoked', UNABLE_TO_VERIFY: 'Unable to verify',
};
const STATUS_HELP: Record<CredentialStatus, string> = {
  SELF_REPORTED: 'You entered this yourself. Nobody has checked it.',
  DOCUMENT_REVIEWED: 'You confirmed you reviewed the original document. This is your own statement, not an issuer check.',
  ISSUER_VERIFIED: 'A connected provider confirmed this with the issuer.',
  EXPIRED: 'The expiry date has passed.', REVOKED: 'The issuer or provider reports this was revoked.',
  UNABLE_TO_VERIFY: 'A verification attempt could not confirm this credential.',
};
const FIELD_LABELS: Record<string, string> = {
  name: 'Name', issuer: 'Issuer', issuedOn: 'Issue date', expiresOn: 'Expiry date', status: 'Verification status (with source and date)',
  verificationUrl: 'Verification link', credentialIdMasked: 'Masked credential ID (last 4 only)',
};
const KINDS = ['CERTIFICATION', 'LICENSE', 'DEGREE', 'BADGE', 'PUBLICATION', 'OTHER'];
const PURPOSES: Array<[string, string]> = [['RESUME', 'Resume'], ['PORTFOLIO', 'Portfolio'], ['RECRUITER_SHARE', 'Recruiter share']];
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

interface ProfileItem { type: string; id: string; label: string }

/** Credential and Evidence Wallet (doc 49): metadata and references only; no document files are uploaded or stored. */
@Component({
  selector: 'app-evidence-wallet',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, DatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>Evidence wallet</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        @if (error()) { <div class="banner err" role="alert" data-testid="wallet-error">{{ error() }}</div> }

        @if (!detail()) {
          <div class="page-head">
            <div><h1>Credential and evidence wallet</h1><p>Keep credential details and where your proof lives. Documents stay on your device; only details are saved here.</p></div>
            <button class="btn" data-testid="new-credential" (click)="showForm.set(!showForm())"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> Add credential</button>
          </div>

          @if (showForm()) {
            <section class="card" aria-labelledby="nc-h" data-testid="credential-form">
              <h2 id="nc-h">Add credential</h2>
              <div class="form-grid">
                <div class="field"><label for="ckind">Type</label><select id="ckind" data-testid="cred-kind" [(ngModel)]="f.kind">@for (k of kinds; track k) { <option [value]="k">{{ pretty(k) }}</option> }</select></div>
                <div class="field" [class.invalid]="touched() && !f.name.trim()"><label for="cname">Credential name *</label><input id="cname" data-testid="cred-name" [(ngModel)]="f.name" maxlength="160" /></div>
                <div class="field" [class.invalid]="touched() && !f.issuer.trim()"><label for="cissuer">Issuer *</label><input id="cissuer" data-testid="cred-issuer" [(ngModel)]="f.issuer" maxlength="160" /></div>
                <div class="field"><label for="cissued">Issued (YYYY-MM)</label><input id="cissued" data-testid="cred-issued" [(ngModel)]="f.issuedOn" maxlength="10" placeholder="2024-03" /></div>
                <div class="field"><label for="cexp">Expires (YYYY-MM)</label><input id="cexp" data-testid="cred-expires" [(ngModel)]="f.expiresOn" maxlength="10" placeholder="2027-03" /></div>
                <div class="field"><label for="cid">Credential ID</label><input id="cid" data-testid="cred-id" [(ngModel)]="f.credentialId" maxlength="120" autocomplete="off" />
                  <span class="hint">Encrypted at rest. Only the last 4 characters are ever shown.</span></div>
                <div class="field full"><label for="curl">Public verification link</label><input id="curl" type="url" data-testid="cred-url" [(ngModel)]="f.verificationUrl" maxlength="500" placeholder="https://" /></div>
              </div>
              @for (e of formErrors(); track e) { <p class="error" role="alert" data-testid="cred-form-error">{{ e }}</p> }
              <div class="row"><button class="btn" data-testid="save-credential" (click)="create()" [disabled]="busy()">Save credential</button><button class="btn ghost" (click)="showForm.set(false)">Cancel</button></div>
            </section>
          }

          @if (loading()) { <div class="sk-stack" role="status" aria-busy="true"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
          @else if (items().length === 0) {
            <div class="empty" data-testid="wallet-empty"><h2>No credentials yet</h2><p class="muted">Add a certification, licence or degree. New entries start as self-reported.</p></div>
          } @else {
            <ul class="list" data-testid="credential-list">
              @for (c of items(); track c.id) {
                <li class="card" [attr.data-testid]="'credential-' + c.id">
                  <div class="row between">
                    <div class="grow"><h2 class="wrap">{{ c.name }}</h2><p class="muted small">{{ c.issuer }} · {{ pretty(c.kind) }}{{ c.expiresOn ? ' · expires ' + c.expiresOn : '' }}{{ c.credentialIdMasked ? ' · ID ' + c.credentialIdMasked : '' }}</p></div>
                    <span class="badge" [class.ok]="c.effectiveStatus === 'ISSUER_VERIFIED'" [class.warn]="c.effectiveStatus === 'EXPIRED' || c.effectiveStatus === 'REVOKED' || c.effectiveStatus === 'UNABLE_TO_VERIFY'" data-testid="credential-status">{{ statusLabel(c.effectiveStatus) }}</span>
                    <button class="btn sm" (click)="open(c.id)" data-testid="open-credential" [attr.aria-label]="'Open ' + c.name">Open</button>
                  </div>
                </li>
              }
            </ul>
          }
        }

        @if (detail(); as d) {
          <button class="btn ghost sm" style="align-self:flex-start" (click)="close()" data-testid="back-wallet"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon> All credentials</button>
          <div class="page-head">
            <div><h1 class="wrap" data-testid="credential-heading">{{ d.name }}</h1><p>{{ d.issuer }} · {{ pretty(d.kind) }}</p></div>
            <button class="btn danger" (click)="remove(d)" data-testid="delete-credential"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Delete</button>
          </div>

          <section class="card" aria-labelledby="vs-h" data-testid="verification-panel">
            <h2 id="vs-h">Verification</h2>
            <p><span class="badge" [class.ok]="d.effectiveStatus === 'ISSUER_VERIFIED'" [class.warn]="d.effectiveStatus === 'EXPIRED' || d.effectiveStatus === 'REVOKED' || d.effectiveStatus === 'UNABLE_TO_VERIFY'" data-testid="detail-status">{{ statusLabel(d.effectiveStatus) }}</span>
              <span class="muted small" data-testid="status-source"> source: {{ d.statusSource === 'USER' ? 'you' : d.statusSource }} · {{ d.statusAt | date: 'mediumDate' }}</span></p>
            <p class="muted small" data-testid="status-help">{{ statusHelp(d.effectiveStatus) }}</p>
            @if (d.recheckDue) { <div class="banner warn" role="status" data-testid="recheck-due">Recheck due: this was last confirmed a while ago.</div> }
            <label class="checkbox"><input type="checkbox" data-testid="verify-consent" [(ngModel)]="verifyConsent" /> I consent to this verification attempt.</label>
            <div class="row">
              <button class="btn ghost" (click)="verify(d, 'SELF_DOCUMENT_REVIEW')" [disabled]="!verifyConsent || busy()" data-testid="verify-self">I reviewed the original document</button>
              <button class="btn ghost" (click)="verify(d, 'PROVIDER')" [disabled]="!verifyConsent || busy()" data-testid="verify-provider">Ask a verification provider</button>
            </div>
            @if (verifyNote()) { <p class="muted small" role="status" data-testid="verify-note">{{ verifyNote() }}</p> }
            @if (ver(); as v) {
              <ul class="list" data-testid="verification-history">
                @for (h of v.history; track h.id) { <li class="small muted">{{ h.checkedAt | date: 'medium' }} · {{ statusLabel(h.status) }} · {{ h.source }}{{ h.note ? ' · ' + h.note : '' }}</li> }
              </ul>
            }
          </section>

          <section class="card" aria-labelledby="ed-h">
            <h2 id="ed-h">Details</h2>
            <p class="muted small">Changing the name, issuer, dates or ID resets verification to self-reported.</p>
            <div class="form-grid">
              <div class="field"><label for="ename">Name</label><input id="ename" data-testid="edit-name" [(ngModel)]="edit.name" maxlength="160" /></div>
              <div class="field"><label for="eissuer">Issuer</label><input id="eissuer" data-testid="edit-issuer" [(ngModel)]="edit.issuer" maxlength="160" /></div>
              <div class="field"><label for="eissued">Issued</label><input id="eissued" data-testid="edit-issued" [(ngModel)]="edit.issuedOn" maxlength="10" /></div>
              <div class="field"><label for="eexp">Expires</label><input id="eexp" data-testid="edit-expires" [(ngModel)]="edit.expiresOn" maxlength="10" /></div>
              <div class="field"><label for="eid">Credential ID</label><input id="eid" data-testid="edit-id" [(ngModel)]="edit.credentialId" maxlength="120" autocomplete="off" [placeholder]="d.credentialIdMasked || 'None stored'" />
                <span class="hint">Leave blank to keep the stored ID.</span></div>
              <div class="field"><label for="eurl">Verification link</label><input id="eurl" type="url" data-testid="edit-url" [(ngModel)]="edit.verificationUrl" maxlength="500" /></div>
            </div>
            @for (e of editErrors(); track e) { <p class="error" role="alert">{{ e }}</p> }
            <div class="row"><button class="btn sm" (click)="saveEdit(d)" data-testid="save-edit" [disabled]="busy()">Save changes</button></div>
          </section>

          <section class="card" aria-labelledby="ev-h">
            <h2 id="ev-h">Evidence</h2>
            <p class="muted small">Link proof without uploading it. Notes record where you keep a document on your own device.</p>
            @if (d.evidence.length === 0) { <p class="muted small" data-testid="evidence-empty">No evidence linked yet.</p> }
            <ul class="list" data-testid="evidence-list">
              @for (e of d.evidence; track e.id) {
                <li class="row between item-card" [attr.data-testid]="'evidence-' + e.id">
                  <span class="wrap">{{ e.kind === 'LINK' ? 'Link' : e.kind === 'PROFILE_ITEM' ? 'Profile item' : 'Local note' }}: {{ e.label }}
                    @if (e.url) { <a [href]="e.url" target="_blank" rel="noopener noreferrer"> ({{ e.url }})</a> }
                    @if (e.kind === 'PROFILE_ITEM' && e.profileLinkValid === false) { <span class="badge warn" data-testid="stale-link">Item no longer in profile</span> }</span>
                  <button class="btn ghost sm" (click)="removeEvidence(d, e.id)" data-testid="remove-evidence" [attr.aria-label]="'Remove ' + e.label"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon></button>
                </li>
              }
            </ul>
            <div class="form-grid">
              <div class="field"><label for="evk">Type</label><select id="evk" data-testid="ev-kind" [(ngModel)]="ev.kind"><option value="LINK">Link</option><option value="PROFILE_ITEM">Profile item</option><option value="LOCAL_NOTE">Local note</option></select></div>
              @if (ev.kind === 'PROFILE_ITEM') {
                <div class="field"><label for="evp">Profile item</label><select id="evp" data-testid="ev-profile" [(ngModel)]="ev.profileKey"><option value="">Choose…</option>
                  @for (p of profileItems(); track p.id) { <option [value]="p.type + ':' + p.id">{{ p.label }}</option> }</select></div>
              } @else {
                <div class="field"><label for="evl">{{ ev.kind === 'LINK' ? 'Label' : 'Note' }}</label><input id="evl" data-testid="ev-label" [(ngModel)]="ev.label" maxlength="200" [placeholder]="ev.kind === 'LINK' ? 'Badge page' : 'PDF in Documents/Certs'" /></div>
              }
              @if (ev.kind === 'LINK') { <div class="field"><label for="evu">URL</label><input id="evu" type="url" data-testid="ev-url" [(ngModel)]="ev.url" maxlength="500" placeholder="https://" /></div> }
            </div>
            @if (ev.kind === 'LOCAL_NOTE') { <p class="hint">Do not paste secrets, ID numbers or passwords into notes.</p> }
            <div class="row"><button class="btn sm" (click)="addEvidence(d)" data-testid="add-evidence" [disabled]="busy()">Add evidence</button></div>
          </section>

          <section class="card" aria-labelledby="gr-h" data-testid="disclosure-panel">
            <h2 id="gr-h">Selective disclosure</h2>
            <p class="muted small">Nothing is shared by default. A grant lists exactly which fields a purpose may use, and it expires.</p>
            <div class="form-grid">
              <div class="field"><label for="gp">Purpose</label><select id="gp" data-testid="grant-purpose" [(ngModel)]="grant.purpose">@for (p of purposes; track p[0]) { <option [value]="p[0]">{{ p[1] }}</option> }</select></div>
              <div class="field"><label for="gr">Recipient (optional)</label><input id="gr" data-testid="grant-recipient" [(ngModel)]="grant.recipient" maxlength="120" /></div>
              <div class="field"><label for="gd">Expires after (days)</label><input id="gd" type="number" min="1" max="365" data-testid="grant-days" [(ngModel)]="grant.days" /></div>
            </div>
            <fieldset class="stack"><legend class="label">Fields to disclose</legend>
              @for (f of fieldKeys; track f) { <label class="checkbox"><input type="checkbox" [attr.data-testid]="'grant-field-' + f" [checked]="grant.fields.has(f)" (change)="toggleField(f)" /> {{ fieldLabels[f] }}</label> }
            </fieldset>
            <label class="checkbox"><input type="checkbox" data-testid="grant-confirm" [(ngModel)]="grant.confirm" /> I confirm I want to disclose these fields.</label>
            <div class="row"><button class="btn" data-testid="create-grant" (click)="createGrant(d)" [disabled]="busy() || grant.fields.size === 0 || !grant.confirm">Create disclosure</button></div>
            @if (lastProjection(); as p) { <pre class="item-card small wrap" data-testid="grant-projection">{{ p }}</pre> }
            @if (grants().length === 0) { <p class="muted small" data-testid="grants-empty">No disclosures yet.</p> }
            <ul class="list" data-testid="grant-list">
              @for (g of grants(); track g.id) {
                <li class="row between item-card" [attr.data-testid]="'grant-' + g.id">
                  <span class="wrap">{{ pretty(g.purpose) }}{{ g.recipientLabel ? ' to ' + g.recipientLabel : '' }} · {{ g.fields.length }} field{{ g.fields.length === 1 ? '' : 's' }} · until {{ g.expiresAt | date: 'mediumDate' }}</span>
                  <span class="row"><span class="badge" [class.ok]="g.state === 'ACTIVE'" [class.warn]="g.state !== 'ACTIVE'" data-testid="grant-state">{{ g.state }}</span>
                    @if (g.state === 'ACTIVE') { <button class="btn danger sm" (click)="revokeGrant(d, g.id)" data-testid="revoke-grant">Revoke</button> }</span>
                </li>
              }
            </ul>
          </section>
        }
      </div>
    </ion-content>
  `,
})
export class EvidenceWalletPage implements OnInit {
  readonly kinds = KINDS;
  readonly purposes = PURPOSES;
  readonly fieldKeys = Object.keys(FIELD_LABELS);
  readonly fieldLabels = FIELD_LABELS;
  items = signal<Credential[]>([]);
  detail = signal<CredentialDetail | null>(null);
  ver = signal<VerificationInfo | null>(null);
  grants = signal<Grant[]>([]);
  profileItems = signal<ProfileItem[]>([]);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  showForm = signal(false);
  touched = signal(false);
  verifyNote = signal('');
  lastProjection = signal('');
  verifyConsent = false;
  f = { kind: 'CERTIFICATION', name: '', issuer: '', issuedOn: '', expiresOn: '', credentialId: '', verificationUrl: '' };
  edit = { name: '', issuer: '', issuedOn: '', expiresOn: '', credentialId: '', verificationUrl: '' };
  ev = { kind: 'LINK', label: '', url: '', profileKey: '' };
  grant = { purpose: 'RESUME', recipient: '', days: 30, fields: new Set<string>(), confirm: false };

  constructor(private api: ProfileToolsApi, private profiles: ApiService, private notify: NotifyService) { addIcons({ addOutline, arrowBackOutline, shieldCheckmarkOutline, trashOutline }); }

  ngOnInit() { this.reload(); }
  ionViewWillEnter() { if (!this.loading() && !this.detail()) this.reload(); }

  pretty(s: string) { return s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()); }
  statusLabel(s: string) { return STATUS_LABEL[s as CredentialStatus] ?? s; }
  statusHelp(s: string) { return STATUS_HELP[s as CredentialStatus] ?? ''; }

  reload() {
    this.api.listCredentials().subscribe({
      next: (c) => { this.items.set(c); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  private validateDates(i: string, x: string): string[] {
    const out: string[] = [];
    if (i && !DATE_RE.test(i)) out.push('Issue date must be YYYY-MM or YYYY-MM-DD.');
    if (x && !DATE_RE.test(x)) out.push('Expiry date must be YYYY-MM or YYYY-MM-DD.');
    if (!out.length && i && x && x < i) out.push('Expiry cannot be before the issue date.');
    return out;
  }
  private validUrl(u: string) { return !u || /^https?:\/\/\S+$/i.test(u); }
  formErrors() {
    if (!this.touched()) return [];
    const e = this.validateDates(this.f.issuedOn.trim(), this.f.expiresOn.trim());
    if (!this.f.name.trim()) e.unshift('Enter the credential name.');
    if (!this.f.issuer.trim()) e.unshift('Enter the issuer.');
    if (!this.validUrl(this.f.verificationUrl.trim())) e.push('The verification link must start with http:// or https://.');
    return e;
  }
  editErrors() {
    const e = this.validateDates(this.edit.issuedOn.trim(), this.edit.expiresOn.trim());
    if (!this.edit.name.trim()) e.unshift('Name cannot be empty.');
    if (!this.edit.issuer.trim()) e.unshift('Issuer cannot be empty.');
    if (!this.validUrl(this.edit.verificationUrl.trim())) e.push('The verification link must start with http:// or https://.');
    return e;
  }

  create() {
    this.touched.set(true);
    if (this.formErrors().length) return;
    this.busy.set(true);
    const t = (s: string) => s.trim() || undefined;
    this.api.createCredential({ kind: this.f.kind, name: this.f.name.trim(), issuer: this.f.issuer.trim(), issuedOn: t(this.f.issuedOn), expiresOn: t(this.f.expiresOn), credentialId: t(this.f.credentialId), verificationUrl: t(this.f.verificationUrl) }).subscribe({
      next: () => {
        this.busy.set(false); this.showForm.set(false); this.touched.set(false);
        this.f = { kind: 'CERTIFICATION', name: '', issuer: '', issuedOn: '', expiresOn: '', credentialId: '', verificationUrl: '' };
        void this.notify.toast('Credential saved as self-reported'); this.reload();
      },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  open(id: string, keepNote = false) {
    this.api.getCredential(id).subscribe({
      next: (d) => {
        this.detail.set(d); if (!keepNote) this.verifyNote.set(''); this.lastProjection.set(''); this.verifyConsent = false; this.grant = { purpose: 'RESUME', recipient: '', days: 30, fields: new Set<string>(), confirm: false };
        this.edit = { name: d.name, issuer: d.issuer, issuedOn: d.issuedOn ?? '', expiresOn: d.expiresOn ?? '', credentialId: '', verificationUrl: d.verificationUrl ?? '' };
        this.api.verification(id).subscribe({ next: (v) => this.ver.set(v), error: () => this.ver.set(null) });
        this.api.listGrants(id).subscribe({ next: (g) => this.grants.set(g), error: () => this.grants.set([]) });
        this.profiles.getProfile().subscribe({ next: (p) => this.profileItems.set(this.itemsOf(p as unknown as Record<string, any>)), error: () => this.profileItems.set([]) });
      },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }
  close() { this.detail.set(null); this.reload(); }

  private itemsOf(p: Record<string, any>): ProfileItem[] {
    const map: Array<[string, string, (x: any) => string]> = [
      ['EXPERIENCE', 'experiences', (x) => `Experience: ${x.jobTitle} at ${x.employerName}`], ['PROJECT', 'projects', (x) => `Project: ${x.name}`],
      ['SKILL', 'skills', (x) => `Skill: ${x.name}`], ['EDUCATION', 'educations', (x) => `Education: ${x.degree}, ${x.institution}`],
      ['CERTIFICATION', 'certifications', (x) => `Certification: ${x.name}`],
    ];
    return map.flatMap(([type, key, label]) => ((p[key] ?? []) as any[]).filter((x) => x.id).map((x) => ({ type, id: x.id as string, label: label(x) })));
  }

  saveEdit(d: CredentialDetail) {
    if (this.editErrors().length) return;
    const t = (s: string) => s.trim();
    const body: Record<string, string | null> = {
      name: t(this.edit.name), issuer: t(this.edit.issuer), issuedOn: t(this.edit.issuedOn) || null, expiresOn: t(this.edit.expiresOn) || null, verificationUrl: t(this.edit.verificationUrl) || null,
    };
    if (t(this.edit.credentialId)) body['credentialId'] = t(this.edit.credentialId);
    this.busy.set(true);
    this.api.updateCredential(d.id, body as never).subscribe({
      next: () => { this.busy.set(false); void this.notify.toast('Saved'); this.open(d.id); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  verify(d: CredentialDetail, method: 'SELF_DOCUMENT_REVIEW' | 'PROVIDER') {
    this.busy.set(true);
    this.api.requestVerification(d.id, { consent: true, method, provider: method === 'PROVIDER' ? 'default' : undefined }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.verifyNote.set(r.verification.note ?? (r.applied ? 'Status updated.' : 'Recorded in history; your current status is unchanged.'));
        this.verifyConsent = false; this.open(d.id, true);
      },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  addEvidence(d: CredentialDetail) {
    let body: Parameters<ProfileToolsApi['addEvidence']>[1];
    if (this.ev.kind === 'PROFILE_ITEM') {
      const p = this.profileItems().find((x) => `${x.type}:${x.id}` === this.ev.profileKey);
      if (!p) { void this.notify.toast('Choose a profile item first.', 'error'); return; }
      body = { kind: 'PROFILE_ITEM', label: p.label, profileItemType: p.type, profileItemId: p.id };
    } else {
      if (!this.ev.label.trim()) { void this.notify.toast('Enter a label or note first.', 'error'); return; }
      if (this.ev.kind === 'LINK' && !/^https?:\/\/\S+$/i.test(this.ev.url.trim())) { void this.notify.toast('Enter a URL starting with http:// or https://.', 'error'); return; }
      body = { kind: this.ev.kind, label: this.ev.label.trim(), url: this.ev.kind === 'LINK' ? this.ev.url.trim() : undefined };
    }
    this.api.addEvidence(d.id, body).subscribe({
      next: () => { this.ev = { kind: 'LINK', label: '', url: '', profileKey: '' }; this.open(d.id); },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }
  async removeEvidence(d: CredentialDetail, id: string) {
    if (!(await this.notify.confirm('Remove evidence?', 'Only the reference is removed. Nothing on your device is touched.', 'Remove'))) return;
    this.api.removeEvidence(d.id, id).subscribe({ next: () => this.open(d.id), error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }

  toggleField(f: string) { this.grant.fields.has(f) ? this.grant.fields.delete(f) : this.grant.fields.add(f); }
  createGrant(d: CredentialDetail) {
    this.busy.set(true);
    this.api.createGrant(d.id, { purpose: this.grant.purpose, recipientLabel: this.grant.recipient.trim() || undefined, fields: [...this.grant.fields], expiresInDays: Number(this.grant.days) || 30, confirm: true }).subscribe({
      next: (g) => {
        this.busy.set(false); this.lastProjection.set(JSON.stringify(g.projection ?? {}, null, 2));
        this.grant = { purpose: 'RESUME', recipient: '', days: 30, fields: new Set<string>(), confirm: false };
        this.api.listGrants(d.id).subscribe((l) => this.grants.set(l));
        void this.notify.toast('Disclosure created');
      },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }
  async revokeGrant(d: CredentialDetail, id: string) {
    if (!(await this.notify.confirm('Revoke disclosure?', 'The recipient loses access to these fields immediately.', 'Revoke'))) return;
    this.api.revokeGrant(id).subscribe({ next: () => { this.lastProjection.set(''); this.api.listGrants(d.id).subscribe((l) => this.grants.set(l)); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }

  async remove(d: CredentialDetail) {
    if (!(await this.notify.confirm('Delete credential?', `"${d.name}", its evidence references and disclosures will be permanently deleted.`))) return;
    this.api.deleteCredential(d.id).subscribe({ next: () => { void this.notify.toast('Credential deleted'); this.close(); }, error: (e) => void this.notify.toast(errorMessage(e), 'error') });
  }
}
