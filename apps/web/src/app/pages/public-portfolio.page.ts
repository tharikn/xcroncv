import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { PortfolioView, ProfileToolsApi } from '../core/profile-tools.api';
import { PortfolioRenderComponent } from '../shared/portfolio-render.component';

/**
 * Anonymous portfolio view (doc 41), reachable only by unguessable token. It is outside the authenticated shell and calls
 * the single public API route. Any failure (unknown, expired, revoked) shows the same neutral message.
 */
@Component({
  selector: 'app-public-portfolio',
  standalone: true,
  imports: [PortfolioRenderComponent, FormsModule],
  template: `
    <main class="public-wrap" id="main">
      @if (view(); as v) {
        <app-portfolio-render [snapshot]="v.snapshot" [theme]="v.theme" />
        <p class="muted small foot" data-testid="public-foot">Shared by the owner through XCron CV. Content is chosen and approved by them.</p>
      } @else if (needsPassword()) {
        <form class="card gate" (ngSubmit)="submit()" data-testid="password-gate">
          <h1>This portfolio is protected</h1>
          <p class="muted">Enter the password the owner shared with you.</p>
          <div class="field"><label for="pw">Password</label><input id="pw" name="pw" type="password" autocomplete="off" data-testid="gate-password" [(ngModel)]="password" maxlength="128" /></div>
          @if (gateError()) { <p class="err" role="alert" data-testid="gate-error">{{ gateError() }}</p> }
          <button class="btn" type="submit" [disabled]="!password || loading()" data-testid="gate-submit">View portfolio</button>
        </form>
      } @else if (loading()) {
        <p class="muted" role="status" data-testid="public-loading">Loading portfolio…</p>
      } @else {
        <div class="empty" role="alert" data-testid="public-unavailable">
          <h1>Portfolio unavailable</h1>
          <p class="muted">This link is not active. It may have expired or been withdrawn by its owner.</p>
        </div>
      }
    </main>
  `,
  styles: [`.public-wrap { width: min(100% - 2rem, 52rem); margin: 0 auto; padding: 1.5rem 0 3rem; display: flex; flex-direction: column; gap: 1rem; } .foot { text-align: center; }`],
})
export class PublicPortfolioPage implements OnInit {
  loading = signal(true);
  view = signal<PortfolioView | null>(null);
  needsPassword = signal(false);
  gateError = signal('');
  password = '';
  private token = '';

  constructor(private route: ActivatedRoute, private api: ProfileToolsApi, private meta: Meta) {}

  ngOnInit() {
    // Never ask search engines to index a share link, regardless of the server header.
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    this.meta.updateTag({ name: 'referrer', content: 'no-referrer' });
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    this.load();
  }

  submit() { this.load(this.password); }

  private load(password?: string) {
    this.loading.set(true);
    this.api.publicPortfolio(this.token, password).subscribe({
      next: (v) => { this.password = ''; this.needsPassword.set(false); this.view.set(v); this.loading.set(false); },
      error: (e) => {
        this.loading.set(false); this.view.set(null);
        if (e?.status === 401 && e?.error?.passwordRequired) {
          this.needsPassword.set(true); this.gateError.set(password ? 'Incorrect password.' : ''); this.password = '';
        } else if (e?.status === 429) { this.needsPassword.set(true); this.gateError.set('Too many incorrect attempts. Try again later.'); }
        else this.needsPassword.set(false);
      },
    });
  }
}
