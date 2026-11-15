import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, arrowBackOutline, copyOutline, eyeOutline, globeOutline, trashOutline } from 'ionicons/icons';
import { ApiService } from '../core/api.service';
import { errorMessage, NotifyService } from '../core/notify.service';
import {
  HEADER_FIELDS, HeaderField, PortfolioDetail, PortfolioSelection, PortfolioSnapshot, PortfolioSummary, ProfileToolsApi, SECTION_KEYS, SectionKey, Visibility,
} from '../core/profile-tools.api';
import { PortfolioRenderComponent } from '../shared/portfolio-render.component';

const HEADER_LABELS: Record<HeaderField, string> = {
  fullName: 'Full name', headline: 'Headline', summary: 'Summary / bio', location: 'Location', email: 'Email', phone: 'Phone', links: 'Links',
};
const SECTION_LABELS: Record<SectionKey, string> = {
  experience: 'Experience', projects: 'Projects', skills: 'Skills', education: 'Education', certifications: 'Credentials', languages: 'Languages',
};
const PROFILE_KEY: Record<SectionKey, string> = { experience: 'experiences', projects: 'projects', skills: 'skills', education: 'educations', certifications: 'certifications', languages: 'languages' };
const MASKABLE: HeaderField[] = ['email', 'phone'];

interface Item { id: string; label: string }
type ProfileLike = Record<string, any>;

/** Career Portfolio Website (doc 41): private editor and preview, selected-field publishing, expiry and revocation. */
@Component({
  selector: 'app-portfolio',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, RouterLink, DatePipe, NgTemplateOutlet, PortfolioRenderComponent],
  template: `
    <ion-header><ion-toolbar><ion-title>Portfolio</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        @if (error()) { <div class="banner err" role="alert" data-testid="portfolio-error">{{ error() }}</div> }
        @if (noProfile()) {
          <div class="banner warn" role="status" data-testid="portfolio-needs-profile">Create your career profile first; a portfolio can only show facts from it. <a routerLink="/profile">Go to profile</a></div>
        }

        @if (view() === 'list') {
          <div class="page-head">
            <div><h1>Career portfolio</h1><p>Share a polished page with only the facts you choose. Private until you publish; revoke any time.</p></div>
            <button class="btn" data-testid="portfolio-new" (click)="startNew()" [disabled]="noProfile()"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> New portfolio</button>
          </div>
          @if (loading()) { <div class="sk-stack" role="status" aria-busy="true"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
          @else if (items().length === 0) {
            <div class="empty" data-testid="portfolios-empty"><h2>No portfolios yet</h2><p class="muted">Create one for a target role family. Nothing is shared until you publish it.</p></div>
          } @else {
            <ul class="list" data-testid="portfolio-list">
              @for (p of items(); track p.id) {
                <li class="card" [attr.data-testid]="'portfolio-' + p.id">
                  <div class="row between">
                    <div class="grow"><h2 class="wrap">{{ p.name }}</h2><p class="muted small">{{ p.roleFamily || 'No role family' }} · updated {{ p.updatedAt | date: 'mediumDate' }}</p></div>
                    <span class="badge" [class.ok]="p.status === 'PUBLISHED'" [class.warn]="p.status === 'REVOKED'" data-testid="portfolio-status-badge">{{ statusLabel(p.status) }}</span>
                    <button class="btn sm" (click)="open(p.id)" data-testid="open-portfolio" [attr.aria-label]="'Open ' + p.name">Open</button>
                  </div>
                </li>
              }
            </ul>
          }
        }

        @if (view() === 'new') {
          <button class="btn ghost sm" style="align-self:flex-start" (click)="view.set('list')" data-testid="back-portfolios"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon> All portfolios</button>
          <div class="page-head"><div><h1>New portfolio</h1><p>Everything starts hidden. Pick exactly what visitors may see.</p></div></div>
          <section class="card" aria-labelledby="nm-h">
            <h2 id="nm-h">Details</h2>
            <div class="form-grid">
              <div class="field" [class.invalid]="touched() && !name.trim()"><label for="pfname">Name *</label><input id="pfname" data-testid="pf-name" [(ngModel)]="name" maxlength="80" placeholder="Backend engineering" />
                <span class="hint">Only you see this label.</span></div>
              <div class="field"><label for="pfrole">Role family</label><input id="pfrole" data-testid="pf-role" [(ngModel)]="roleFamily" maxlength="80" /></div>
              <div class="field"><label for="pftheme">Theme</label><select id="pftheme" data-testid="pf-theme" [(ngModel)]="theme"><option value="light">Light</option><option value="dark">Dark</option><option value="warm">Warm</option></select></div>
            </div>
            @if (touched() && !name.trim()) { <p class="error" role="alert">Give the portfolio a name.</p> }
          </section>
          <ng-container *ngTemplateOutlet="selector" />
          <div class="row">
            <button class="btn" data-testid="pf-create" (click)="create()" [disabled]="busy()">Create private portfolio</button>
            <button class="btn ghost" (click)="view.set('list')">Cancel</button>
          </div>
        }

        @if (view() === 'detail' && detail(); as d) {
          <button class="btn ghost sm" style="align-self:flex-start" (click)="close()" data-testid="back-portfolios"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon> All portfolios</button>
          <div class="page-head">
            <div><h1 class="wrap" data-testid="portfolio-heading">{{ d.name }}</h1>
              <p><span class="badge" [class.ok]="d.status === 'PUBLISHED'" [class.warn]="d.status === 'REVOKED'" data-testid="portfolio-status">{{ statusLabel(d.status) }}</span>
                @if (d.status === 'PUBLISHED' && d.expired) { <span class="badge warn" data-testid="portfolio-expired">Link expired</span> }
                <span class="muted small"> · {{ d.views }} visit{{ d.views === 1 ? '' : 's' }}</span></p></div>
            <button class="btn danger" (click)="remove(d)" data-testid="delete-portfolio"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Delete</button>
          </div>

          <section class="card" aria-labelledby="pub-h" data-testid="publish-panel">
            <h2 id="pub-h">Publishing</h2>
            @if (d.status === 'PUBLISHED') {
              <p data-testid="published-info">Live: version {{ d.publishedVersion }}{{ d.expiresAt ? ', expires ' + (d.expiresAt | date: 'medium') : ', no expiry' }}. Search engines are {{ d.noIndex ? 'asked not to index it' : 'allowed to index it' }}.</p>
              <div class="row">
                <button class="btn danger" (click)="revoke(d)" data-testid="revoke-btn">Revoke link now</button>
              </div>
              <div class="form-grid">
                <div class="field"><label for="pol-exp">Expiry</label><input id="pol-exp" type="date" data-testid="policy-expiry" [(ngModel)]="expiry" /></div>
                <div class="field"><label class="checkbox"><input type="checkbox" data-testid="policy-noindex" [(ngModel)]="noIndex" /> Ask search engines not to index</label></div>
              </div>
              <div class="form-grid">
                <div class="field"><label for="pol-pw">Visitor password ({{ d.passwordProtected ? 'currently on' : 'currently off' }})</label>
                  <input id="pol-pw" type="password" autocomplete="new-password" data-testid="policy-password" [(ngModel)]="policyPassword" maxlength="128" placeholder="At least 8 characters; leave blank to keep as is" /></div>
                @if (d.passwordProtected) { <div class="field"><label class="checkbox"><input type="checkbox" data-testid="policy-remove-password" [(ngModel)]="removePassword" /> Remove the password</label></div> }
              </div>
              <p class="hint">Share the password separately from the link. After five wrong tries the link locks for 15 minutes.</p>
              <div class="row"><button class="btn sm ghost" (click)="savePolicy(d)" data-testid="save-policy">Save share settings</button></div>
              <p class="hint">Publishing a different version again creates a new link and retires the old one.</p>
            }
            @if (d.status !== 'PUBLISHED') {
              <p class="muted small">{{ d.status === 'REVOKED' ? 'The previous link no longer works.' : 'Not published. Only you can see it.' }}</p>
            }
            @if (shareUrl()) {
              <div class="banner" role="status" data-testid="share-box">
                <p><strong>Your share link (shown once, copy it now):</strong></p>
                <p class="wrap" data-testid="share-link">{{ shareUrl() }}</p>
                <button class="btn sm" (click)="copyLink()" data-testid="copy-link"><ion-icon name="copy-outline" aria-hidden="true"></ion-icon> Copy link</button>
              </div>
            }
            <h3>{{ d.status === 'PUBLISHED' ? 'Publish another version' : 'Publish a version' }}</h3>
            <div class="form-grid">
              <div class="field"><label for="pub-ver">Version</label>
                <select id="pub-ver" data-testid="publish-version" [(ngModel)]="pubVersion">@for (v of d.versions; track v.id) { <option [ngValue]="v.versionNumber">v{{ v.versionNumber }} · {{ v.disclosedCount }} fields shared{{ v.published ? ' (live)' : '' }}</option> }</select></div>
              <div class="field"><label for="pub-exp">Expires on (optional)</label><input id="pub-exp" type="date" data-testid="publish-expiry" [min]="today" [(ngModel)]="pubExpiry" /><span class="hint">Max one year.</span></div>
            </div>
            <label class="checkbox"><input type="checkbox" data-testid="publish-noindex" [(ngModel)]="pubNoIndex" /> Ask search engines not to index it (recommended)</label>
            <label class="checkbox"><input type="checkbox" data-testid="publish-confirm" [(ngModel)]="pubConfirm" /> I reviewed the preview. Anyone with the link can see exactly these fields.</label>
            <div class="row"><button class="btn" data-testid="publish-btn" (click)="publish(d)" [disabled]="!pubConfirm || busy()"><ion-icon name="globe-outline" aria-hidden="true"></ion-icon> Publish</button></div>
          </section>

          <section class="card" aria-labelledby="ver-h">
            <h2 id="ver-h">Versions</h2>
            <p class="muted small">Each version is a frozen snapshot. Facts you add to your profile later are not shown until you create a new version and publish it.</p>
            <ul class="list" data-testid="version-list">
              @for (v of d.versions; track v.id) {
                <li class="row between item-card" [attr.data-testid]="'version-' + v.versionNumber">
                  <span>v{{ v.versionNumber }} · {{ v.disclosedCount }} fields · {{ v.createdAt | date: 'medium' }}{{ v.changeSummary ? ' · ' + v.changeSummary : '' }} @if (v.published) { <span class="badge ok">Live</span> }</span>
                  <span class="row"><button class="btn ghost sm" (click)="previewVersion(d, v.versionNumber)" data-testid="preview-version"><ion-icon name="eye-outline" aria-hidden="true"></ion-icon> Preview</button>
                    <button class="btn ghost sm" (click)="editFrom(v.selection)" data-testid="edit-from-version">Edit as new</button></span>
                </li>
              }
            </ul>
          </section>

          <section class="card" aria-labelledby="nv-h">
            <h2 id="nv-h">New version</h2>
            <p class="muted small">Change what is shared, then save as a new snapshot taken from your current profile.</p>
            <ng-container *ngTemplateOutlet="selector" />
            <div class="field"><label for="nv-sum">What changed (optional)</label><input id="nv-sum" data-testid="version-summary" [(ngModel)]="summary" maxlength="200" /></div>
            <div class="row">
              <button class="btn" data-testid="save-version" (click)="saveVersion(d)" [disabled]="busy()">Save as new version</button>
            </div>
          </section>
        }

        @if (previewSnap(); as snap) {
          <section class="card" aria-labelledby="pv-h" data-testid="preview-pane">
            <div class="row between"><h2 id="pv-h">Preview: what a visitor sees</h2><button class="btn ghost sm" (click)="previewSnap.set(null)" data-testid="close-preview">Close preview</button></div>
            <app-portfolio-render [snapshot]="snap" [theme]="previewTheme()" />
          </section>
        }
      </div>

      <ng-template #selector>
        <section class="card" aria-labelledby="sel-h" data-testid="selector">
          <h2 id="sel-h">What to share</h2>
          <fieldset class="stack"><legend class="label">Header details</legend>
            @for (f of headerFields; track f) {
              <div class="row between">
                <label [for]="'hv-' + f">{{ headerLabels[f] }}</label>
                <select [id]="'hv-' + f" [attr.data-testid]="'header-vis-' + f" [ngModel]="vis(f)" (ngModelChange)="setVis(f, $event)">
                  <option value="hidden">Hidden</option><option value="public">Public</option>
                  @if (maskable.includes(f)) { <option value="masked">Masked</option> }
                </select>
              </div>
            }
          </fieldset>
          @for (k of sectionKeys; track k) {
            <fieldset class="stack"><legend class="label">{{ sectionLabels[k] }}</legend>
              @if (itemsFor(k).length === 0) { <p class="muted small">None in your profile.</p> }
              @else {
                <label class="checkbox"><input type="checkbox" [attr.data-testid]="'pick-all-' + k" [checked]="allPicked(k)" (change)="pickAll(k, $any($event.target).checked)" /> Select all</label>
                @for (it of itemsFor(k); track it.id) {
                  <label class="checkbox"><input type="checkbox" [attr.data-testid]="'pick-' + k" [checked]="picked(k, it.id)" (change)="toggle(k, it.id)" /> <span class="wrap">{{ it.label }}</span></label>
                }
                @if (k === 'experience') { <label class="checkbox"><input type="checkbox" data-testid="include-bullets" [checked]="!!sel.experience?.includeBullets" (change)="setBullets($any($event.target).checked)" /> Include my confirmed bullet points</label> }
              }
            </fieldset>
          }
          <div class="row">
            <button class="btn ghost" data-testid="preview-btn" (click)="previewDraft()" [disabled]="busy()"><ion-icon name="eye-outline" aria-hidden="true"></ion-icon> Preview selection</button>
            <span class="muted small" data-testid="selected-count">{{ selectedCount() }} item{{ selectedCount() === 1 ? '' : 's' }} selected</span>
          </div>
        </section>
      </ng-template>
    </ion-content>
  `,
})
export class PortfolioPage implements OnInit {
  readonly headerFields = HEADER_FIELDS;
  readonly headerLabels = HEADER_LABELS;
  readonly sectionKeys = SECTION_KEYS;
  readonly sectionLabels = SECTION_LABELS;
  readonly maskable = MASKABLE;
  readonly today = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  view = signal<'list' | 'new' | 'detail'>('list');
  items = signal<PortfolioSummary[]>([]);
  detail = signal<PortfolioDetail | null>(null);
  profile = signal<ProfileLike | null>(null);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  noProfile = signal(false);
  touched = signal(false);
  previewSnap = signal<PortfolioSnapshot | null>(null);
  previewTheme = signal('light');
  shareUrl = signal('');

  name = ''; roleFamily = ''; theme = 'light'; summary = '';
  sel: PortfolioSelection = { header: {} };
  pubVersion = 1; pubExpiry = ''; pubNoIndex = true; pubConfirm = false;
  expiry = ''; noIndex = true; policyPassword = ''; removePassword = false;

  constructor(private api: ProfileToolsApi, private profiles: ApiService, private notify: NotifyService) {
    addIcons({ addOutline, arrowBackOutline, copyOutline, eyeOutline, globeOutline, trashOutline });
  }

  ngOnInit() { this.reload(); }
  ionViewWillEnter() { if (!this.loading() && this.view() === 'list') this.reload(); }

  statusLabel(s: string) { return s === 'PUBLISHED' ? 'Published' : s === 'REVOKED' ? 'Revoked' : 'Private draft'; }

  reload() {
    this.api.listPortfolios().subscribe({
      next: (p) => { this.items.set(p); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
    this.profiles.getProfile().subscribe({
      next: (p) => { this.profile.set(p as unknown as ProfileLike); this.noProfile.set(false); },
      error: (e) => { this.profile.set(null); this.noProfile.set(e.status === 404); },
    });
  }

  // ---- selection helpers ----
  itemsFor(k: SectionKey): Item[] {
    const p = this.profile(); if (!p) return [];
    const label: Record<SectionKey, (x: any) => string> = {
      experience: (x) => `${x.jobTitle} at ${x.employerName}`, projects: (x) => x.name, skills: (x) => x.name,
      education: (x) => `${x.degree}, ${x.institution}`, certifications: (x) => x.name, languages: (x) => x.name,
    };
    const rows: any[] = p[PROFILE_KEY[k]] ?? [];
    return rows.filter((r) => r.id).map((r) => ({ id: r.id, label: label[k](r) }));
  }
  vis(f: HeaderField): Visibility { return this.sel.header[f] ?? 'hidden'; }
  setVis(f: HeaderField, v: Visibility) { this.sel = { ...this.sel, header: { ...this.sel.header, [f]: v } }; }
  picked(k: SectionKey, id: string) { return !!this.sel[k]?.ids.includes(id); }
  allPicked(k: SectionKey) { const it = this.itemsFor(k); return it.length > 0 && it.every((x) => this.picked(k, x.id)); }
  toggle(k: SectionKey, id: string) {
    const cur = new Set(this.sel[k]?.ids ?? []);
    cur.has(id) ? cur.delete(id) : cur.add(id);
    this.sel = { ...this.sel, [k]: { ...(this.sel[k] ?? {}), ids: [...cur] } };
  }
  pickAll(k: SectionKey, on: boolean) { this.sel = { ...this.sel, [k]: { ...(this.sel[k] ?? {}), ids: on ? this.itemsFor(k).map((x) => x.id) : [] } }; }
  setBullets(on: boolean) { this.sel = { ...this.sel, experience: { ids: this.sel.experience?.ids ?? [], includeBullets: on } }; }
  selectedCount() {
    return HEADER_FIELDS.filter((f) => this.vis(f) !== 'hidden').length + SECTION_KEYS.reduce((n, k) => n + (this.sel[k]?.ids.length ?? 0), 0);
  }
  private cleanSelection(): PortfolioSelection {
    const out: PortfolioSelection = { header: { ...this.sel.header } };
    for (const k of SECTION_KEYS) if (this.sel[k]?.ids.length) out[k] = { ids: this.sel[k]!.ids, ...(k === 'experience' ? { includeBullets: !!this.sel.experience?.includeBullets } : {}) };
    return out;
  }
  editFrom(s: PortfolioSelection) { this.sel = JSON.parse(JSON.stringify(s)); void this.notify.toast('Selection loaded into "New version"'); }

  // ---- actions ----
  startNew() { this.sel = { header: {} }; this.name = ''; this.roleFamily = ''; this.theme = 'light'; this.touched.set(false); this.previewSnap.set(null); this.view.set('new'); }

  create() {
    this.touched.set(true);
    if (!this.name.trim()) return;
    this.busy.set(true);
    this.api.createPortfolio({ name: this.name.trim(), roleFamily: this.roleFamily.trim() || undefined, selection: this.cleanSelection(), theme: this.theme }).subscribe({
      next: (p) => { this.busy.set(false); void this.notify.toast('Private portfolio created'); this.previewSnap.set(null); this.open(p.id); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  open(id: string) {
    this.api.getPortfolio(id).subscribe({
      next: (d) => {
        this.detail.set(d); this.view.set('detail'); this.shareUrl.set(''); this.pubConfirm = false; this.previewSnap.set(null);
        this.pubVersion = d.currentVersion; this.noIndex = d.noIndex; this.pubNoIndex = true;
        this.expiry = d.expiresAt ? d.expiresAt.slice(0, 10) : '';
        this.sel = JSON.parse(JSON.stringify(d.versions.find((v) => v.versionNumber === d.currentVersion)?.selection ?? { header: {} }));
      },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }
  close() { this.detail.set(null); this.previewSnap.set(null); this.view.set('list'); this.reload(); }

  previewDraft() {
    const run = (id: string) => this.api.previewPortfolio(id, { selection: this.cleanSelection() });
    const id = this.detail()?.id;
    if (!id) { this.previewLocal(); return; }
    this.busy.set(true);
    run(id).subscribe({
      next: (r) => { this.busy.set(false); this.previewTheme.set(r.theme); this.previewSnap.set(r.snapshot); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }
  /** Before the first save there is no portfolio to ask, so the same allowlist is applied locally for the preview. */
  private previewLocal() {
    const p = this.profile(); if (!p) return;
    const snap: PortfolioSnapshot = { schemaVersion: 1, header: {}, sections: {} };
    const mask = (f: HeaderField, v: string) => (f === 'email' ? `${v.split('@')[0].slice(0, 1)}***@${v.split('@')[1] ?? ''}` : `${'*'.repeat(Math.max(0, v.length - 2))}${v.slice(-2)}`);
    for (const f of HEADER_FIELDS) {
      const v = this.vis(f); if (f === 'links' || v === 'hidden' || !p[f]) continue;
      snap.header[f] = v === 'masked' && MASKABLE.includes(f) ? mask(f, String(p[f])) : v === 'public' ? p[f] : undefined;
      if (snap.header[f] === undefined) delete snap.header[f];
    }
    if (this.vis('links') === 'public' && Array.isArray(p['links'])) snap.header['links'] = p['links'].filter((l: any) => /^https?:\/\//i.test(l.url));
    for (const k of SECTION_KEYS) {
      const rows: any[] = p[PROFILE_KEY[k]] ?? [];
      const out = rows.filter((r) => this.picked(k, r.id)).map((r) => (k === 'experience' ? { ...r, bullets: this.sel.experience?.includeBullets ? (r.bullets ?? []).map((b: any) => b.content) : [] } : r));
      if (out.length) snap.sections[k] = out;
    }
    this.previewTheme.set(this.theme); this.previewSnap.set(snap);
  }
  previewVersion(d: PortfolioDetail, versionNumber: number) {
    this.api.previewPortfolio(d.id, { versionNumber }).subscribe({
      next: (r) => { this.previewTheme.set(r.theme); this.previewSnap.set(r.snapshot); },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }

  saveVersion(d: PortfolioDetail) {
    this.busy.set(true);
    this.api.createPortfolioVersion(d.id, { selection: this.cleanSelection(), theme: d.versions[0]?.theme, changeSummary: this.summary.trim() || undefined }).subscribe({
      next: (v) => { this.busy.set(false); this.summary = ''; void this.notify.toast(`Saved version ${v.versionNumber}. The live page is unchanged.`); this.open(d.id); },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  publish(d: PortfolioDetail) {
    this.busy.set(true);
    this.api.publishPortfolio(d.id, {
      versionNumber: Number(this.pubVersion), confirm: true, noIndex: this.pubNoIndex,
      expiresAt: this.pubExpiry ? new Date(`${this.pubExpiry}T23:59:59`).toISOString() : undefined,
    }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.api.getPortfolio(d.id).subscribe((nd) => { this.detail.set(nd); this.expiry = nd.expiresAt ? nd.expiresAt.slice(0, 10) : ''; this.noIndex = nd.noIndex; });
        this.shareUrl.set(`${window.location.origin}${r.sharePath}`);
        this.pubConfirm = false;
        void this.notify.toast('Published');
      },
      error: (e) => { this.busy.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  async revoke(d: PortfolioDetail) {
    if (!(await this.notify.confirm('Revoke link?', 'The link stops working immediately for everyone.', 'Revoke'))) return;
    this.api.revokePortfolio(d.id).subscribe({
      next: () => { this.shareUrl.set(''); void this.notify.toast('Link revoked'); this.open(d.id); },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }

  savePolicy(d: PortfolioDetail) {
    const pw = this.policyPassword.trim() ? this.policyPassword : undefined;
    if (pw && pw.length < 8) { void this.notify.toast('Use at least 8 characters for the password.', 'error'); return; }
    this.api.portfolioPolicy(d.id, {
      expiresAt: this.expiry ? new Date(`${this.expiry}T23:59:59`).toISOString() : null, noIndex: this.noIndex,
      ...(pw ? { password: pw } : this.removePassword ? { password: null } : {}),
    }).subscribe({
      next: () => { this.policyPassword = ''; this.removePassword = false; void this.notify.toast('Share settings saved'); this.open(d.id); },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }

  async copyLink() {
    try { await navigator.clipboard.writeText(this.shareUrl()); void this.notify.toast('Link copied'); }
    catch { void this.notify.toast('Copy failed. Select the link text and copy it manually.', 'error'); }
  }

  async remove(d: PortfolioDetail) {
    if (!(await this.notify.confirm('Delete portfolio?', `"${d.name}", all its versions and its share link will be permanently deleted.`))) return;
    this.api.deletePortfolio(d.id).subscribe({
      next: () => { void this.notify.toast('Portfolio deleted'); this.close(); },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }
}
