import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { LocaleCode, LocaleService } from '../core/i18n/locale.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { errorMessage } from '../core/notify.service';
import { PreferencesService } from '../core/preferences.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [IonContent, FormsModule, TranslatePipe],
  template: `
    <ion-content>
      <div class="page-shell reading" style="min-height:100%;justify-content:center">
        <div class="stack">
          <div class="row"><span class="brand-mark" style="display:inline-grid;place-items:center;width:2.5rem;height:2.5rem;border-radius:10px;background:linear-gradient(90deg,#7c5cff,#f5a524);color:#1a1208;font-weight:800">X</span>
            <h1>XCron CV</h1></div>
          <p class="muted">{{ 'login.lead' | t }}</p>
          <div class="field"><label for="lang">{{ 'common.language' | t }}</label>
            <select id="lang" data-testid="login-language" [ngModel]="locale.locale()" (ngModelChange)="setLocale($event)">
              @for (l of locale.languages; track l.code) { <option [value]="l.code" [attr.lang]="l.code">{{ l.nativeName }}</option> }
            </select></div>
          @if (auth.sessionExpired()) { <p class="banner warn" role="status" data-testid="session-expired">{{ 'common.sessionExpired' | t }}</p> }
        </div>

        <section class="card" aria-labelledby="tok-h">
          <h2 id="tok-h">{{ 'login.tokenTitle' | t }}</h2>
          <p class="muted small">{{ 'login.tokenLead' | t }}</p>
          <div class="field">
            <label for="token">{{ 'login.tokenLabel' | t }}</label>
            <textarea id="token" data-testid="token-input" rows="3" [(ngModel)]="token" autocomplete="off" spellcheck="false"></textarea>
          </div>
          @if (error()) { <p class="error" role="alert" data-testid="login-error">{{ error() }}</p> }
          <button class="btn" data-testid="token-signin" (click)="signInToken()" [disabled]="!token.trim()">{{ 'login.signIn' | t }}</button>
        </section>

        @if (dev) {
          <section class="card flat" aria-labelledby="dev-h">
            <h2 id="dev-h">{{ 'login.devTitle' | t }} <span class="badge warn">{{ 'login.localOnly' | t }}</span></h2>
            <p class="muted small">{{ 'login.devLead' | t }}</p>
            <div class="form-grid">
              <div class="field"><label for="dsub">{{ 'login.subject' | t }}</label><input id="dsub" data-testid="dev-sub" [(ngModel)]="sub" /></div>
              <div class="field"><label for="dten">{{ 'login.tenant' | t }}</label><input id="dten" data-testid="dev-tenant" [(ngModel)]="tenant" /></div>
              <div class="field full"><label for="dsec">{{ 'login.devSecret' | t }}</label><input id="dsec" data-testid="dev-secret" type="password" [(ngModel)]="secret" autocomplete="off" /></div>
            </div>
            <button class="btn ghost" data-testid="dev-signin" (click)="signInDev()" [disabled]="busy()">{{ 'login.devSignIn' | t }}</button>
          </section>
        }
      </div>
    </ion-content>
  `,
})
export class LoginPage {
  dev = environment.devAuth;
  token = '';
  sub = 'dev-user-1';
  tenant = 'xcron-dev';
  secret = 'change-me-dev-only-secret-at-least-32-chars';
  error = signal('');
  busy = signal(false);

  constructor(public auth: AuthService, private router: Router, private route: ActivatedRoute, public locale: LocaleService, private prefs: PreferencesService) {
    if (this.auth.isAuthenticated()) void this.router.navigateByUrl('/dashboard');
  }

  setLocale(code: LocaleCode) { void this.prefs.setLocale(code); }

  private done() {
    const next = this.route.snapshot.queryParamMap.get('next');
    void this.router.navigateByUrl(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
  }

  signInToken() {
    this.error.set('');
    if (this.auth.signInWithToken(this.token)) this.done();
    else this.error.set(this.locale.t('login.invalid'));
  }

  async signInDev() {
    this.error.set(''); this.busy.set(true);
    try { await this.auth.devSignIn(this.secret, this.sub.trim() || 'dev-user-1', this.tenant.trim() || 'xcron-dev'); this.done(); }
    catch (e) { this.error.set(errorMessage(e)); }
    finally { this.busy.set(false); }
  }
}
