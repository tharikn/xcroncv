import { Component, booleanAttribute, computed, input } from '@angular/core';
import { MessageKey } from '../../core/i18n/en';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

export type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';
export type SpinnerTone = 'primary' | 'brand' | 'light';

const SIZE_PX: Record<SpinnerSize, string> = { sm: '1rem', md: '1.5rem', lg: '2.25rem', xl: '3.25rem' };

/**
 * Circular loading indicator. Use inline (with an optional translated label), inside a button,
 * or as an overlay that blocks a region / the whole app while an action completes.
 */
@Component({
  selector: 'app-spinner',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    @if (overlay()) {
      <div class="x-loading-overlay" [class.x-loading-overlay--global]="global()" role="status" aria-live="polite">
        <div class="x-loading-overlay__card">
          <span class="x-spin" [class.x-spin--sm]="size() === 'sm'" [class.x-spin--lg]="size() === 'lg'"
                [class.x-spin--xl]="size() === 'xl'" [class.x-spin--brand]="tone() === 'brand'"
                [class.x-spin--light]="tone() === 'light'" [style.--x-spin-size]="spinSize()" aria-hidden="true"></span>
          <span>{{ labelKey() | t }}</span>
        </div>
      </div>
    } @else {
      <span class="x-spinner" [class.x-spinner--stack]="stack()" role="status" aria-live="polite">
        <span class="x-spin" [class.x-spin--sm]="size() === 'sm'" [class.x-spin--lg]="size() === 'lg'"
              [class.x-spin--xl]="size() === 'xl'" [class.x-spin--brand]="tone() === 'brand'"
              [class.x-spin--light]="tone() === 'light'" [style.--x-spin-size]="spinSize()" aria-hidden="true"></span>
        @if (showLabel()) { <span>{{ labelKey() | t }}</span> }
      </span>
    }
  `,
})
export class SpinnerComponent {
  readonly size = input<SpinnerSize>('md');
  readonly tone = input<SpinnerTone>('primary');
  /** Translation key for the accessible / visible label (never a hardcoded string). */
  readonly labelKey = input<MessageKey>('common.loading');
  readonly showLabel = input(true, { transform: booleanAttribute });
  readonly stack = input(false, { transform: booleanAttribute });
  /** Render a blocking overlay instead of an inline spinner. */
  readonly overlay = input(false, { transform: booleanAttribute });
  /** With `overlay`, cover the viewport instead of the nearest positioned ancestor. */
  readonly global = input(false, { transform: booleanAttribute });
  /** Optional diameter override in pixels. */
  readonly diameter = input<number | null>(null);

  readonly spinSize = computed(() => this.diameter() != null ? `${this.diameter()}px` : SIZE_PX[this.size()]);
}
