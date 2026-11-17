import { Component, OnInit, signal } from '@angular/core';
import { ResetProfileDialogComponent } from '../shared/reset-profile-dialog.component';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ApiService } from '../core/api.service';
import { APP_VERSION, resolveAppVersion } from '../core/app-info';
import { AuthService } from '../core/auth.service';
import { LocaleCode, LocaleService } from '../core/i18n/locale.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { LocalFileService } from '../core/local-file.service';
import { errorMessage, NotifyService } from '../core/notify.service';
import { PreferencesService } from '../core/preferences.service';
import { SettingsService } from '../core/settings.service';
import { TourService } from '../shared/tour/tour.service';
import { THEMES, ThemePreference, ThemeService } from '../core/theme.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, ResetProfileDialogComponent, TranslatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>{{ 'settings.title' | t }}</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell reading">
        <h1>{{ 'settings.title' | t }}</h1>

        <section class="card" aria-labelledby="acct-h">
          <h2 id="acct-h">{{ 'settings.account' | t }}</h2>
          <p class="small muted">{{ 'settings.signedInAs' | t }}</p>
          <p class="wrap" data-testid="account-subject">{{ auth.subject() || ('settings.unknown' | t) }}</p>
          <div><button class="btn danger" data-testid="signout" (click)="auth.signOut()">
            <ion-icon name="log-out-outline" aria-hidden="true"></ion-icon> {{ 'settings.signOut' | t }}</button></div>
        </section>

        <section class="card" aria-labelledby="profile-data-h">
          <h2 id="profile-data-h">{{ 'settings.profileData' | t }}</h2>
          <p class="muted">{{ 'profile.reset.settingHint' | t }}</p>
          <div><button class="btn danger" data-testid="settings-reset-profile" (click)="openReset()" [disabled]="resetting()">
            <ion-icon name="refresh-outline" aria-hidden="true"></ion-icon> {{ 'profile.reset.button' | t }}</button></div>
        </section>

        <section class="card" aria-labelledby="look-h">
          <h2 id="look-h">{{ 'settings.appearance' | t }}</h2>
          <div class="field">
            <label for="lang">{{ 'common.language' | t }}</label>
            <select id="lang" data-testid="language-select" [ngModel]="locale.locale()" (ngModelChange)="setLocale($event)">
              @for (l of locale.languages; track l.code) { <option [value]="l.code" [attr.lang]="l.code">{{ l.nativeName }}</option> }
            </select>
            <span class="hint">{{ 'settings.languageHint' | t }}</span>
          </div>
          <div class="field" role="radiogroup" aria-labelledby="theme-l" data-testid="theme-group">
            <span class="label" id="theme-l">{{ 'settings.theme' | t }}</span>
            <div class="row">
              @for (th of themes; track th) {
                <button type="button" class="chip" role="radio" [attr.aria-checked]="theme.preference() === th" [attr.aria-pressed]="null"
                        [class.on]="theme.preference() === th" [attr.data-testid]="'theme-' + th" (click)="setTheme(th)">{{ 'theme.' + th | t }}</button>
              }
            </div>
            <span class="hint">{{ 'settings.themeHint' | t }}</span>
          </div>
        </section>

        <section class="card" aria-labelledby="help-h">
          <h2 id="help-h">{{ 'settings.help' | t }}</h2>
          <p class="muted">{{ 'settings.helpBody' | t }}</p>
          <div><button class="btn ghost" data-testid="replay-tour" (click)="tour.replay()">{{ 'tour.replay' | t }}</button></div>
        </section>

        <section class="card" aria-labelledby="api-h">
          <h2 id="api-h">{{ 'settings.server' | t }}</h2>
          <div class="field" [class.invalid]="!!urlError()">
            <label for="api">{{ 'settings.apiAddress' | t }}</label>
            <input id="api" data-testid="api-base" [(ngModel)]="apiBase" inputmode="url" autocapitalize="off" spellcheck="false" />
            <span class="hint">{{ 'settings.apiHint' | t }}</span>
            @if (urlError()) { <span class="error" role="alert">{{ urlError() }}</span> }
          </div>
          <div class="row">
            <button class="btn" data-testid="api-save" (click)="saveApi()">{{ 'settings.apiSave' | t }}</button>
            <button class="btn ghost" data-testid="api-test" (click)="test()">{{ 'settings.apiTest' | t }}</button>
          </div>
          @if (status()) { <p class="small" data-testid="api-status" role="status">{{ status() }}</p> }
        </section>

        <section class="card" aria-labelledby="files-h">
          <h2 id="files-h">{{ 'settings.files' | t }}</h2>
          <p class="muted">{{ 'settings.filesBody' | t }}</p>
          <p data-testid="files-target"><strong>{{ 'settings.saveLocation' | t }}</strong> {{ (files.isNative ? 'settings.locNative' : 'settings.locBrowser') | t }}</p>
        </section>

        <section class="card" aria-labelledby="about-h">
          <h2 id="about-h">{{ 'settings.about' | t }}</h2>
          <p class="muted small" data-testid="app-version">{{ 'settings.version' | t: { version: version() } }}</p>
        </section>
      </div>
    </ion-content>
    <app-reset-profile-dialog [open]="resetOpen()" [busy]="resetting()" domId="reset-profile-settings"
                              (cancelRequest)="closeReset()" (confirmRequest)="resetProfile()" />
  `,
})
export class SettingsPage implements OnInit {
  apiBase: string;
  urlError = signal('');
  status = signal('');
  version = signal(APP_VERSION);
  resetOpen = signal(false);
  resetting = signal(false);
  themes = THEMES;

  constructor(public auth: AuthService, public files: LocalFileService, private settings: SettingsService,
              private notify: NotifyService, private api: ApiService, public locale: LocaleService,
              public theme: ThemeService, private prefs: PreferencesService, public tour: TourService) {
    this.apiBase = settings.apiBase;
  }

  ngOnInit() { void resolveAppVersion().then((v) => this.version.set(v)); }

  setLocale(code: LocaleCode) { void this.prefs.setLocale(code); }
  setTheme(t: ThemePreference) { void this.prefs.setTheme(t); }

  saveApi() {
    const v = this.apiBase.trim();
    if (v && !SettingsService.isValidUrl(v)) { this.urlError.set(this.locale.t('settings.apiInvalid')); return; }
    this.urlError.set('');
    this.settings.setApiBase(v);
    this.apiBase = this.settings.apiBase;
    void this.notify.toast(this.locale.t('settings.apiSaved'));
  }

  test() {
    this.status.set(this.locale.t('settings.apiTesting'));
    this.api.listTemplates().subscribe({
      next: (t) => this.status.set(this.locale.t('settings.apiConnected', { n: t.length })),
      error: () => this.status.set(this.locale.t('settings.apiFailed')),
    });
  }

  openReset() { this.resetOpen.set(true); }
  closeReset() { this.resetOpen.set(false); }

  resetProfile() {
    if (this.resetting()) return;
    this.resetting.set(true);
    this.api.resetProfile().subscribe({
      next: () => {
        this.resetting.set(false);
        this.resetOpen.set(false);
        void this.notify.toast(this.locale.t('profile.reset.success'));
      },
      error: (e) => {
        this.resetting.set(false);
        this.resetOpen.set(false);
        void this.notify.toast(errorMessage(e), 'error');
      },
    });
  }
}
