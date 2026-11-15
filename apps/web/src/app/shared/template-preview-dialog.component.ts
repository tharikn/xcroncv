import { Component, EventEmitter, HostListener, Input, OnInit, Output, inject, signal, ElementRef } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { registerFlowIcons } from '../core/flow.icons';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { RenderModel, TemplateSummary } from '../core/models';
import { TemplateSampleService } from '../core/template-sample.service';
import { ResumeSheetComponent } from './resume-sheet.component';

/** Full-size preview of ONE template with dummy data only (modal on desktop, full-screen on phones). */
@Component({
  selector: 'app-template-preview-dialog',
  standalone: true,
  imports: [IonIcon, TranslatePipe, ResumeSheetComponent],
  template: `
    <div class="backdrop" (click)="close.emit()" data-testid="preview-backdrop"></div>
    <div class="dlg" role="dialog" aria-modal="true" [attr.aria-label]="'tpl.previewTitle' | t: { name: template.name }" data-testid="template-preview">
      <header>
        <h2>{{ 'tpl.previewTitle' | t: { name: template.name } }}</h2>
        <button class="btn ghost sm icon" type="button" (click)="close.emit()" [attr.aria-label]="'tpl.close' | t" data-testid="preview-close"><ion-icon name="close-outline" aria-hidden="true"></ion-icon></button>
      </header>
      <p class="muted small note" data-testid="sample-note">{{ 'tpl.sampleNote' | t }}</p>
      <div class="body">
        @if (model(); as m) { <app-resume-sheet [model]="m" [fitWidth]="true" /> }
        @else if (failed()) { <p class="muted">{{ template.description }}</p> }
        @else { <p class="muted">{{ 'tpl.loadingSample' | t }}</p> }
      </div>
      <footer>
        <button class="btn" type="button" data-tour="step-template-action" data-testid="preview-use" (click)="use.emit()" [disabled]="busy">{{ 'tpl.useThis' | t }}</button>
        <button class="btn ghost" type="button" (click)="close.emit()">{{ 'tpl.close' | t }}</button>
      </footer>
    </div>
  `,
  styles: [`
    :host { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; }
    .backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.55); }
    .dlg { position: relative; display: flex; flex-direction: column; width: min(100%, 52rem); max-height: 100%; height: min(100%, 60rem); background: var(--c-bg); color: var(--c-text); border: 1px solid var(--c-border); border-radius: var(--radius); overflow: hidden; }
    header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--c-border); }
    header h2 { margin: 0; font-size: 1.1rem; }
    .note { margin: 0; padding: var(--space-2) var(--space-4); }
    .body { flex: 1 1 auto; overflow: auto; padding: var(--space-4); background: var(--c-surface); -webkit-overflow-scrolling: touch; }
    footer { display: flex; gap: var(--space-2); flex-wrap: wrap; padding: var(--space-3) var(--space-4); padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom)); border-top: 1px solid var(--c-border); }
    @media (max-width: 40rem) { .dlg { width: 100%; height: 100%; border-radius: 0; border: 0; } .body { padding: var(--space-2); } }
  `],
})
export class TemplatePreviewDialogComponent implements OnInit {
  @Input({ required: true }) template!: TemplateSummary;
  @Input() busy = false;
  @Output() close = new EventEmitter<void>();
  @Output() use = new EventEmitter<void>();
  model = signal<RenderModel | null>(null);
  failed = signal(false);
  private samples = inject(TemplateSampleService);
  private host = inject(ElementRef<HTMLElement>);

  constructor() { registerFlowIcons(); }
  ngOnInit() {
    this.samples.get(this.template.id).subscribe({ next: (m) => this.model.set(m), error: () => this.failed.set(true) });
    queueMicrotask(() => (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-testid=preview-close]')?.focus());
  }
  @HostListener('document:keydown.escape') onEsc() { this.close.emit(); }
}
