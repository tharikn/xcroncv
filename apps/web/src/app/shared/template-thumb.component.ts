import { Component, Input } from '@angular/core';
import { TemplateSummary } from '../core/models';

/**
 * Lightweight CSS mock of a template's declarative layout (header band/alignment, rules, columns, timeline, density).
 * Driven entirely by the template manifest, so every catalogue entry gets its own thumbnail. Real fidelity: Preview route.
 */
@Component({
  selector: 'app-template-thumb',
  standalone: true,
  template: `
    <div class="thumb" [class.band]="band" [class.timeline]="template.layout === 'timeline'" [class.dense]="density === 'compact'" [class.airy]="density === 'relaxed'" [class.hs-bar]="hs === 'bar'" [class.hs-tint]="hs === 'tint'" [class.hs-short]="hs === 'short'"
         [style.--accent]="template.theme?.accent || '#111'" role="img" [attr.aria-label]="template.name + ' layout preview'" [attr.data-layout]="template.layout">
      <div class="hd" [class.c]="center" [class.r]="right">
        <i class="h" [class.c]="center" [class.r]="right"></i>
        <i class="s w70" [class.c]="center" [class.r]="right"></i>
      </div>
      @if (template.layout === 'two-column') {
        <div class="cols">
          <div class="main">
            <i class="k"></i> @if (rule) { <i class="rule"></i> } <i class="s"></i><i class="s w85"></i><i class="s w70"></i>
            <i class="k"></i> @if (rule) { <i class="rule"></i> } <i class="s w85"></i><i class="s"></i>
          </div>
          <div class="side"><i class="k"></i><i class="s"></i><i class="s w70"></i><i class="k"></i><i class="s w85"></i></div>
        </div>
      } @else {
        <i class="k"></i>
        @if (rule) { <i class="rule"></i> }
        <i class="s"></i><i class="s w85"></i><i class="s"></i>
        <i class="k"></i>
        @if (rule) { <i class="rule"></i> }
        <i class="s w70"></i><i class="s w85"></i>
      }
    </div>
  `,
})
export class TemplateThumbComponent {
  @Input({ required: true }) template!: TemplateSummary;
  get band() { return !!this.template.theme?.headerBand; }
  get center() { return this.template.theme?.headerAlign === 'center'; }
  get right() { return this.template.theme?.headerAlign === 'right'; }
  get hs() { return this.template.theme?.headingStyle ?? 'plain'; }
  get rule() { return !!this.template.theme?.sectionRule; }
  get density() { return this.template.theme?.density ?? 'normal'; }
}
