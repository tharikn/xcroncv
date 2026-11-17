import { Component, booleanAttribute, computed, input } from '@angular/core';
import { MessageKey } from '../../core/i18n/en';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { clampProgress, isIndeterminateProgress } from './loading.utils';

export type ProgressVariant = 'brand' | 'primary';

/**
 * Linear progress indicator. Pass `value` (0..100) for determinate work, or `null` for an
 * indeterminate sliding bar when the total is unknown. Accessible via role="progressbar".
 */
@Component({
  selector: 'app-progress-bar',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="x-progress" [class.x-progress--sm]="size() === 'sm'" [class.x-progress--primary]="variant() === 'primary'"
         [class.x-progress--indeterminate]="indeterminate()" role="progressbar"
         [attr.aria-valuemin]="0" [attr.aria-valuemax]="100"
         [attr.aria-valuenow]="indeterminate() ? null : percent()"
         [attr.aria-label]="(labelKey() ?? 'common.progress') | t">
      @if (labelKey(); as key) {
        <div class="x-progress__meta">
          <span>{{ key | t }}</span>
          @if (showValue() && !indeterminate()) { <span class="x-progress__value">{{ percent() }}%</span> }
        </div>
      } @else if (showValue() && !indeterminate()) {
        <div class="x-progress__meta"><span class="x-progress__value">{{ percent() }}%</span></div>
      }
      <div class="x-progress__track" [style.--x-progress]="percent()"><span class="x-progress__fill"></span></div>
    </div>
  `,
})
export class ProgressBarComponent {
  /** 0..100 for determinate progress; `null` for indeterminate. */
  readonly value = input<number | null>(0);
  readonly labelKey = input<MessageKey | null>(null);
  readonly variant = input<ProgressVariant>('brand');
  readonly size = input<'sm' | 'md'>('md');
  readonly showValue = input(true, { transform: booleanAttribute });

  /** Clamped value used by both the CSS fill and ARIA. */
  readonly percent = computed(() => clampProgress(this.value()));
  readonly indeterminate = computed(() => isIndeterminateProgress(this.value()));
}
