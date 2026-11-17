import { Component, booleanAttribute, computed, input } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

export type SkeletonVariant = 'text' | 'title' | 'heading' | 'block' | 'avatar' | 'circle' | 'button' | 'card';

/** Content-shaped placeholders shown while data loads. Prefer these over spinners for page/section loads. */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    @switch (variant()) {
      @case ('card') {
        <div class="sk-card" role="status" aria-busy="true">
          <span class="sr-only">{{ 'common.loading' | t }}</span>
          <div class="sk-card__head">
            <span class="sk sk--avatar" [class.sk--static]="!animated()" [style.width]="width()" [style.height]="height()"></span>
            <div class="sk-card__lines"><span class="sk sk--title" [class.sk--static]="!animated()"></span><span class="sk" [class.sk--static]="!animated()"></span></div>
          </div>
          <span class="sk sk--rule" [class.sk--static]="!animated()"></span>
          <span class="sk" [class.sk--static]="!animated()"></span>
          <span class="sk" [class.sk--static]="!animated()"></span>
          <span class="sk sk--text" [class.sk--static]="!animated()"></span>
        </div>
      }
      @case ('text') {
        <div class="sk-stack" role="status" aria-busy="true">
          <span class="sr-only">{{ 'common.loading' | t }}</span>
          @for (line of linesArray(); track line) {
            <span class="sk" [class.sk--title]="heading() && line === 0" [class.sk--text]="line === linesArray().length - 1"
                  [class.sk--static]="!animated()" [style.width]="line === linesArray().length - 1 ? width() : null"></span>
          }
        </div>
      }
      @case ('title') {
        <span class="sk sk--title" role="status" aria-busy="true" [class.sk--static]="!animated()" [style.width]="width()"><span class="sr-only">{{ 'common.loading' | t }}</span></span>
      }
      @case ('heading') {
        <span class="sk sk--heading" role="status" aria-busy="true" [class.sk--static]="!animated()" [style.width]="width()"><span class="sr-only">{{ 'common.loading' | t }}</span></span>
      }
      @case ('block') {
        <span class="sk sk--block" role="status" aria-busy="true" [class.sk--static]="!animated()" [style.width]="width()" [style.height]="height()"><span class="sr-only">{{ 'common.loading' | t }}</span></span>
      }
      @case ('avatar') {
        <span class="sk sk--avatar" role="status" aria-busy="true" [class.sk--static]="!animated()" [style.width]="width()" [style.height]="height()"><span class="sr-only">{{ 'common.loading' | t }}</span></span>
      }
      @case ('circle') {
        <span class="sk sk--circle" role="status" aria-busy="true" [class.sk--static]="!animated()" [style.width]="width()" [style.height]="height()"><span class="sr-only">{{ 'common.loading' | t }}</span></span>
      }
      @case ('button') {
        <span class="sk sk--button" role="status" aria-busy="true" [class.sk--static]="!animated()" [style.width]="width()"><span class="sr-only">{{ 'common.loading' | t }}</span></span>
      }
    }
  `,
})
export class SkeletonComponent {
  readonly variant = input<SkeletonVariant>('text');
  readonly lines = input(3);
  readonly heading = input(false, { transform: booleanAttribute });
  readonly animated = input(true, { transform: booleanAttribute });
  /** Optional CSS width / height (e.g. '12rem') applied to the placeholder shape. */
  readonly width = input<string | null>(null);
  readonly height = input<string | null>(null);

  readonly linesArray = computed(() => Array.from({ length: Math.max(1, Math.min(12, this.lines())) }, (_, i) => i));
}
