import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/** Language-neutral phrase the user must type before a destructive profile reset is enabled. */
export const RESET_CONFIRM_PHRASE = 'RESET';

/**
 * Shared typed-confirmation dialog for the profile reset action (used on /profile and /settings).
 * The confirm button stays disabled until the phrase matches, and every label comes from i18n.
 */
@Component({
  selector: 'app-reset-profile-dialog',
  standalone: true,
  imports: [FormsModule, IonIcon, TranslatePipe],
  template: `
    @if (open) {
      <div class="rp-backdrop" (click)="cancel()" (keydown.escape)="cancel()" tabindex="-1">
        <section class="card rp-dialog" role="dialog" aria-modal="true"
                 [attr.aria-labelledby]="domId + '-title'" [attr.aria-describedby]="domId + '-body'"
                 (click)="$event.stopPropagation()">
          <div class="rp-head">
            <h2 [id]="domId + '-title'">{{ 'profile.reset.title' | t }}</h2>
            <button type="button" class="btn ghost sm" data-testid="reset-dialog-close"
                    [attr.aria-label]="'common.cancel' | t" [disabled]="busy" (click)="cancel()">
              <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
            </button>
          </div>
          <p class="muted" [id]="domId + '-body'">{{ 'profile.reset.body' | t }}</p>
          <p class="banner warn" role="note">{{ 'profile.reset.warning' | t }}</p>
          <div class="field">
            <label [for]="domId + '-input'">{{ 'profile.reset.confirmPrompt' | t: { phrase: phrase } }}</label>
            <input [id]="domId + '-input'" data-testid="reset-confirm-input" [(ngModel)]="typed"
                   autocomplete="off" autocapitalize="characters" spellcheck="false" [disabled]="busy" />
          </div>
          <div class="row rp-actions">
            <button type="button" class="btn ghost" data-testid="reset-cancel" [disabled]="busy" (click)="cancel()">{{ 'common.cancel' | t }}</button>
            <button type="button" class="btn danger" data-testid="reset-confirm"
                    [disabled]="busy || !matches" (click)="confirm()">
              {{ busy ? ('profile.reset.busy' | t) : ('profile.reset.confirm' | t) }}
            </button>
          </div>
        </section>
      </div>
    }
  `,
  styles: [`
    .rp-backdrop { position: fixed; inset: 0; z-index: 2000; display: flex; align-items: center; justify-content: center;
      padding: var(--space-4); background: rgba(10, 6, 25, 0.55); }
    .rp-dialog { width: min(30rem, 100%); max-height: 90vh; overflow: auto; padding: var(--space-5);
      display: flex; flex-direction: column; gap: var(--space-3); box-shadow: 0 18px 48px rgba(0, 0, 0, 0.25); }
    .rp-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
    .rp-actions { justify-content: flex-end; flex-wrap: wrap; margin-top: var(--space-2); }
  `],
})
export class ResetProfileDialogComponent {
  private _open = false;
  @Input() set open(v: boolean) { this._open = !!v; if (this._open) this.typed = ''; }
  get open() { return this._open; }

  @Input() busy = false;
  /** Distinguishes the two host pages' dialogs for assistive-tech labels and tests. */
  @Input() domId = 'reset-profile';
  @Output() cancelRequest = new EventEmitter<void>();
  @Output() confirmRequest = new EventEmitter<void>();

  readonly phrase = RESET_CONFIRM_PHRASE;
  typed = '';

  get matches() { return this.typed.trim().toUpperCase() === this.phrase; }

  cancel() { this._open = false; this.typed = ''; this.cancelRequest.emit(); }
  confirm() {
    if (this.busy || !this.matches) return;
    this.confirmRequest.emit();
  }
}
