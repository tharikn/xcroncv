import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { SettingsService } from '../core/settings.service';
import { SpinnerComponent } from '../shared/loading/spinner.component';

/**
 * Host handoff landing (doc 39 section 6.2). X Cron redirects here with a one-time `code` and `nonce`.
 * The code is exchanged through our API (server-to-server with the host); no token is ever in a URL.
 */
@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [IonContent, TranslatePipe, SpinnerComponent],
  template: `
    <ion-content>
      <div class="page-shell reading" style="min-height:100%;justify-content:center">
        @if (failed()) {
          <p class="error" role="alert" data-testid="handoff-error">{{ 'handoff.failed' | t }}</p>
          <a class="btn ghost" data-testid="handoff-back" [href]="hostUrl">{{ 'handoff.back' | t }}</a>
        } @else {
          <div class="stack" style="align-items:center;gap:1rem" data-testid="handoff-progress">
            <app-spinner size="xl" tone="brand" [showLabel]="false" />
            <p class="muted" role="status" aria-live="polite">{{ 'handoff.signingIn' | t }}</p>
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class AuthCallbackPage implements OnInit {
  failed = signal(false);
  hostUrl = environment.hostUrl;

  constructor(
    private route: ActivatedRoute, private router: Router,
    private auth: AuthService, private settings: SettingsService,
  ) {}

  async ngOnInit() {
    const q = this.route.snapshot.queryParamMap;
    const code = q.get('code') ?? '';
    const nonce = q.get('nonce') ?? '';
    // Remove the single-use code from the address bar / history immediately.
    history.replaceState(null, '', location.pathname);
    if (!code || !nonce) return this.failed.set(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${this.settings.apiBase}/auth/exchange`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, nonce, redirectUri: `${location.origin}/auth/callback` }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('exchange failed');
      const body = (await res.json()) as { access_token?: string };
      if (!body.access_token || !this.auth.signInWithToken(body.access_token)) throw new Error('bad token');
      await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
    } catch {
      this.failed.set(true);
    } finally {
      clearTimeout(timeout);
    }
  }
}
