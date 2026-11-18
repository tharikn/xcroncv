import { Component, ElementRef, Input, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { TemplateSampleService } from '../core/template-sample.service';
import { RenderModel, TemplateSummary } from '../core/models';
import { ResumeSheetComponent } from './resume-sheet.component';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/**
 * Live thumbnail of a template: the real shared render model filled with dummy data (GET /templates/:id/sample),
 * fetched only once the card scrolls into view. If the sample cannot be loaded, the card is a tap target that opens
 * the full-size preview; the rendered dummy resume is the only thumbnail shown. There is no static mock.
 */
@Component({
  selector: 'app-template-live-card',
  standalone: true,
  imports: [ResumeSheetComponent, TranslatePipe],
  template: `
    <div class="live" [attr.data-testid]="'live-' + template.id" [attr.aria-label]="template.name" role="img">
      @if (model(); as m) { <app-resume-sheet [model]="m" [fitWidth]="true" /> }
      @else if (failed()) { <p class="muted small ph" data-testid="sample-unavailable">{{ 'tpl.unavailable' | t }}</p> }
      @else { <p class="muted small ph">{{ 'tpl.loadingSample' | t }}</p> }
    </div>
  `,
  styles: [`
    .live { aspect-ratio: 794 / 900; overflow: hidden; border: 0; border-radius: var(--radius); background: transparent; pointer-events: none; user-select: none; }
    .ph { padding: var(--space-4); text-align: center; }
  `],
})
export class TemplateLiveCardComponent implements OnInit, OnDestroy {
  @Input({ required: true }) template!: TemplateSummary;
  model = signal<RenderModel | null>(null);
  failed = signal(false);
  private host = inject(ElementRef<HTMLElement>);
  private samples = inject(TemplateSampleService);
  private io?: IntersectionObserver;
  private started = false;

  ngOnInit() {
    if (typeof IntersectionObserver === 'undefined') { this.load(); return; }
    this.io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { this.load(); this.io?.disconnect(); } }, { rootMargin: '200px' });
    this.io.observe(this.host.nativeElement);
  }
  private load() {
    if (this.started) return;
    this.started = true;
    this.failed.set(false);
    this.samples.get(this.template.id).subscribe({ next: (m) => this.model.set(m), error: () => this.failed.set(true) });
  }
  ngOnDestroy() { this.io?.disconnect(); }
}
