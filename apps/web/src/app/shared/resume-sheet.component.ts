import { NgTemplateOutlet } from '@angular/common';
import { AfterViewChecked, Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, Output, ViewChild, inject, signal } from '@angular/core';
import { RenderModel } from '../core/models';
import { PAGE_PX } from '../core/preview-layout';

const FONT: Record<string, string> = {
  'Times-Roman': "'Times New Roman', Times, serif", Helvetica: "Helvetica, Arial, 'Liberation Sans', sans-serif",
  Courier: "'Courier New', monospace",
};

/**
 * The one on-screen renderer of the shared render model (preview page, editor preview, template gallery cards, template preview).
 * Text nodes only (no innerHTML). Either pass an explicit `scale`, or set `fitWidth` to scale the page to the host's width.
 */
@Component({
  selector: 'app-resume-sheet',
  standalone: true,
  imports: [NgTemplateOutlet],
  host: { style: 'display:block', '[style.width]': 'fitWidth ? "100%" : null' },
  template: `
    @if (model; as m) {
        <div class="sheet-wrap" [style.width.px]="pageW() * effScale()" [style.height.px]="sheetH() * effScale()">
          <div class="sheet" #sheet data-testid="sheet" [style.width.px]="pageW()" [style.min-height.px]="pageH()" [style.transform]="'scale(' + effScale() + ')'" style="transform-origin: top left"
               [style.padding.pt]="m.page.marginPt" [style.font-family]="font(m)" [style.font-size.pt]="m.theme.baseSizePt" [style.line-height]="lineHeight(m)" [attr.data-layout]="m.layout" [attr.data-template]="m.template.id">
            <header [style.text-align]="m.theme.headerAlign" [class.band]="m.theme.headerBand" data-testid="doc-header"
                    [style.background]="m.theme.headerBand ? m.theme.accent : null" [style.color]="m.theme.headerBand ? '#fff' : null"
                    [style.margin]="m.theme.headerBand ? '-' + m.page.marginPt + 'pt -' + m.page.marginPt + 'pt 12pt' : null" [style.padding]="m.theme.headerBand ? '14pt ' + m.page.marginPt + 'pt' : null">
              <h1 class="doc-name" [style.font-size.em]="m.theme.nameScale ?? null" [style.color]="m.theme.headerBand ? '#fff' : m.theme.accent" data-testid="doc-name">{{ m.header.name }}</h1>
              @if (m.header.headline) { <p>{{ m.header.headline }}</p> }
              @if (m.header.contacts.length) { <p class="small" style="font-size:0.9em">{{ m.header.contacts.join(' · ') }}</p> }
              @if (m.header.links.length) { <p style="font-size:0.9em">@for (l of m.header.links; track l.url; let last = $last) { <span>{{ l.label }}: {{ l.url }}{{ last ? '' : ' · ' }}</span> }</p> }
            </header>
            <ng-template #sec let-s let-theme="theme" let-tl="timeline">
              <section class="doc-section" [class.timeline]="tl" [style.border-left]="tl ? '2px solid ' + theme.accent : null" [style.padding-left.pt]="tl ? 10 : null" [attr.data-testid]="'doc-' + s.type">
                <h2 [style.color]="theme.accent" [style.border-bottom]="theme.sectionRule ? '1px solid ' + theme.accent : 'none'"
                    [style.border-left]="theme.headingStyle === 'bar' ? '4px solid ' + theme.accent : null" [style.padding-left.pt]="theme.headingStyle === 'bar' ? 6 : null"
                    [style.background]="theme.headingStyle === 'tint' ? theme.accent + '1a' : null" [style.padding]="theme.headingStyle === 'tint' ? '2pt 6pt' : null"
                    [style.display]="theme.headingStyle === 'short' ? 'inline-block' : null" [style.border-bottom-width]="theme.headingStyle === 'short' ? '3px' : null" [style.border-bottom-style]="theme.headingStyle === 'short' ? 'solid' : null" [style.border-bottom-color]="theme.headingStyle === 'short' ? theme.accent : null"
                    [style.text-transform]="theme.headingTransform === 'upper' ? 'uppercase' : 'none'">{{ s.title }}</h2>
                @if (s.text) { <p>{{ s.text }}</p> }
                @for (it of s.items ?? []; track $index) {
                  <div class="doc-item">
                    @if (it.title || it.meta) { <div style="display:flex;justify-content:space-between;gap:8pt"><strong>{{ it.title }}</strong><span style="font-size:0.9em">{{ it.meta }}</span></div> }
                    @if (it.subtitle) { <div><em>{{ it.subtitle }}</em></div> }
                    @if (it.text) { <p>{{ it.text }}</p> }
                    @if (it.bullets?.length) { <ul>@for (b of it.bullets; track $index) { <li>{{ b }}</li> }</ul> }
                    @if (it.tags?.length) { <p style="font-size:0.9em">{{ it.tags!.join(', ') }}</p> }
                    @if (it.url) { <p style="font-size:0.9em">{{ it.url }}</p> }
                  </div>
                }
              </section>
            </ng-template>
            @if (m.layout === 'two-column') {
              <div class="cols" data-testid="doc-columns" style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:18pt">
                <div data-testid="doc-main">@for (s of m.sections; track s.type) { @if (!m.sideSections.includes(s.type)) { <ng-container *ngTemplateOutlet="sec; context: { $implicit: s, theme: m.theme, timeline: false }"></ng-container> } }</div>
                <aside data-testid="doc-side">@for (s of m.sections; track s.type) { @if (m.sideSections.includes(s.type)) { <ng-container *ngTemplateOutlet="sec; context: { $implicit: s, theme: m.theme, timeline: false }"></ng-container> } }</aside>
              </div>
            } @else {
              @for (s of m.sections; track s.type) { <ng-container *ngTemplateOutlet="sec; context: { $implicit: s, theme: m.theme, timeline: m.layout === 'timeline' }"></ng-container> }
            }
            @for (g of guides(); track g) { <div class="page-guide" [style.top.px]="g * pageH()"><span>Page {{ g + 1 }}</span></div> }
          </div>
        </div>
    }
  `,
})
export class ResumeSheetComponent implements AfterViewChecked, OnDestroy {
  @Input() model: RenderModel | null = null;
  @Input() scale = 1;
  @Input() fitWidth = false;
  @Input() pages = 1;
  @Output() contentHeight = new EventEmitter<number>();
  @ViewChild('sheet') sheet?: ElementRef<HTMLElement>;

  private host = inject(ElementRef<HTMLElement>);
  private zone = inject(NgZone);
  private ro?: ResizeObserver;
  private hostW = signal(0);
  contentH = signal(0);

  effScale() {
    if (!this.fitWidth) return this.scale;
    return this.hostW() > 0 ? this.hostW() / this.pageW() : 0.3;
  }
  size() { return this.model?.page.size ?? 'A4'; }
  pageW() { return PAGE_PX[this.size()].w; }
  pageH() { return PAGE_PX[this.size()].h; }
  sheetH() { return Math.max(this.contentH(), this.pageH()); }
  guides() { return Array.from({ length: Math.max(0, this.pages - 1) }, (_, i) => i + 1); }
  lineHeight(m: RenderModel) { return { compact: 1.25, normal: 1.4, relaxed: 1.6 }[m.theme.density ?? 'normal']; }
  font(m: RenderModel) { return FONT[m.theme.fontFamily] ?? FONT['Helvetica']; }

  ngAfterViewChecked() {
    if (this.fitWidth && !this.ro && typeof ResizeObserver !== 'undefined') {
      const el = this.host.nativeElement as HTMLElement;
      this.hostW.set(el.clientWidth);
      this.zone.runOutsideAngular(() => {
        this.ro = new ResizeObserver(() => this.zone.run(() => this.hostW.set(el.clientWidth)));
        this.ro.observe(el);
      });
    }
    const el = this.sheet?.nativeElement;
    if (!el) return;
    const h = el.scrollHeight;
    if (h !== this.contentH()) queueMicrotask(() => { this.contentH.set(h); this.contentHeight.emit(h); });
  }
  ngOnDestroy() { this.ro?.disconnect(); }
}
