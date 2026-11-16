import { NgTemplateOutlet } from '@angular/common';
import { AfterViewChecked, Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, Output, ViewChild, inject, signal } from '@angular/core';
import { RenderModel } from '../core/models';
import { PAGE_PX } from '../core/preview-layout';

/** Gap (px) shown between page cards in the preview — purely visual, not part of the printed output. */
const PAGE_GAP_PX = 24;

const FONT: Record<string, string> = {
  'Times-Roman': "'Times New Roman', Times, serif", Helvetica: "Helvetica, Arial, 'Liberation Sans', sans-serif",
  Courier: "'Courier New', monospace",
};

/**
 * The one on-screen renderer of the shared render model (preview page, editor preview, template gallery cards, template preview).
 * Text nodes only (no innerHTML). Either pass an explicit `scale`, or set `fitWidth` to scale the page to the host's width.
 *
 * Page-break rendering: an invisible "measure" sheet drives scrollHeight → page count. The visible output
 * is N separate page-cards (one per page), each exactly pageH() tall with overflow:hidden. The content
 * inside each card is translated upward by (pageIndex * pageH()), revealing only that page's window —
 * no content duplication, no overlapping guide lines.
 */
@Component({
  selector: 'app-resume-sheet',
  standalone: true,
  imports: [NgTemplateOutlet],
  host: { style: 'display:block', '[style.width]': 'fitWidth ? "100%" : null' },
  template: `
    @if (model; as m) {
      <!-- ① Invisible measure sheet — layout engine reads its scrollHeight to compute page count -->
      <div style="position:absolute;visibility:hidden;pointer-events:none;top:0;left:0;overflow:visible"
           [style.width.px]="pageW()">
        <div class="sheet sheet--measure" #sheet data-testid="sheet"
             [style.width.px]="pageW()" [style.min-height.px]="pageH()"
             [style.padding.pt]="m.page.marginPt" [style.font-family]="font(m)"
             [style.font-size.pt]="m.theme.baseSizePt" [style.line-height]="lineHeight(m)"
             [attr.data-layout]="m.layout" [attr.data-template]="m.template.id">
          <ng-container *ngTemplateOutlet="body; context: { $implicit: m }"></ng-container>
        </div>
      </div>

      <!-- ② Visible output: N page-cards, each clipping its own window into the content -->
      <div class="sheet-stack" data-testid="sheet-stack"
           [style.width.px]="stackW()"
           [style.height.px]="stackH()">
        @for (pg of pageRange(); track pg) {
          <div class="sheet sheet--page" data-testid="sheet-page"
               [style.width.px]="pageW()" [style.height.px]="pageH()"
               [style.transform]="pageCardTransform(pg)"
               style="transform-origin: top left; position: absolute; overflow: hidden; left: 0;">
            <!-- shift content up so only page pg is visible inside the card -->
            <div [style.margin-top.px]="-pg * pageH()"
                 [style.padding.pt]="m.page.marginPt" [style.font-family]="font(m)"
                 [style.font-size.pt]="m.theme.baseSizePt" [style.line-height]="lineHeight(m)"
                 [attr.data-layout]="m.layout" [attr.data-template]="m.template.id">
              <ng-container *ngTemplateOutlet="body; context: { $implicit: m }"></ng-container>
            </div>
            @if (pg > 0) {
              <span class="sheet--page-label">Page {{ pg + 1 }}</span>
            }
          </div>
        }
      </div>

      <!-- ③ Shared content template (used by both measure sheet and each page card) -->
      <ng-template #body let-m>
        <header [style.text-align]="m.theme.headerAlign" [class.band]="m.theme.headerBand" data-testid="doc-header"
                [style.background]="m.theme.headerBand ? m.theme.accent : null"
                [style.color]="m.theme.headerBand ? '#fff' : null"
                [style.margin]="m.theme.headerBand ? '-' + m.page.marginPt + 'pt -' + m.page.marginPt + 'pt 12pt' : null"
                [style.padding]="m.theme.headerBand ? '14pt ' + m.page.marginPt + 'pt' : null">
          <h1 class="doc-name" [style.font-size.em]="m.theme.nameScale ?? null"
              [style.color]="m.theme.headerBand ? '#fff' : m.theme.accent" data-testid="doc-name">{{ m.header.name }}</h1>
          @if (m.header.headline) { <p>{{ m.header.headline }}</p> }
          @if (m.header.contacts.length) { <p class="small" style="font-size:0.9em">{{ m.header.contacts.join(' · ') }}</p> }
          @if (m.header.links.length) {
            <p style="font-size:0.9em">
              @for (l of m.header.links; track l.url; let last = $last) { <span>{{ l.label }}: {{ l.url }}{{ last ? '' : ' · ' }}</span> }
            </p>
          }
        </header>
        <ng-template #sec let-s let-theme="theme" let-tl="timeline">
          <section class="doc-section" [class.timeline]="tl"
                   [style.border-left]="tl ? '2px solid ' + theme.accent : null"
                   [style.padding-left.pt]="tl ? 10 : null"
                   [attr.data-testid]="'doc-' + s.type">
            <h2 [style.color]="theme.accent"
                [style.border-bottom]="theme.sectionRule ? '1px solid ' + theme.accent : 'none'"
                [style.border-left]="theme.headingStyle === 'bar' ? '4px solid ' + theme.accent : null"
                [style.padding-left.pt]="theme.headingStyle === 'bar' ? 6 : null"
                [style.background]="theme.headingStyle === 'tint' ? theme.accent + '1a' : null"
                [style.padding]="theme.headingStyle === 'tint' ? '2pt 6pt' : null"
                [style.display]="theme.headingStyle === 'short' ? 'inline-block' : null"
                [style.border-bottom-width]="theme.headingStyle === 'short' ? '3px' : null"
                [style.border-bottom-style]="theme.headingStyle === 'short' ? 'solid' : null"
                [style.border-bottom-color]="theme.headingStyle === 'short' ? theme.accent : null"
                [style.text-transform]="theme.headingTransform === 'upper' ? 'uppercase' : 'none'">{{ s.title }}</h2>
            @if (s.text) { <p>{{ s.text }}</p> }
            @for (it of s.items ?? []; track $index) {
              <div class="doc-item">
                @if (it.title || it.meta) {
                  <div style="display:flex;justify-content:space-between;gap:8pt">
                    <strong>{{ it.title }}</strong><span style="font-size:0.9em">{{ it.meta }}</span>
                  </div>
                }
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
            <div data-testid="doc-main">
              @for (s of m.sections; track s.type) {
                @if (!m.sideSections.includes(s.type)) {
                  <ng-container *ngTemplateOutlet="sec; context: { $implicit: s, theme: m.theme, timeline: false }"></ng-container>
                }
              }
            </div>
            <aside data-testid="doc-side">
              @for (s of m.sections; track s.type) {
                @if (m.sideSections.includes(s.type)) {
                  <ng-container *ngTemplateOutlet="sec; context: { $implicit: s, theme: m.theme, timeline: false }"></ng-container>
                }
              }
            </aside>
          </div>
        } @else {
          @for (s of m.sections; track s.type) {
            <ng-container *ngTemplateOutlet="sec; context: { $implicit: s, theme: m.theme, timeline: m.layout === 'timeline' }"></ng-container>
          }
        }
      </ng-template>
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

  /** Array of page indices [0, 1, … pages-1] for the page-card loop. */
  pageRange() { return Array.from({ length: Math.max(1, this.pages) }, (_, i) => i); }

  /** Total width of the scaled page stack. */
  stackW() { return this.pageW() * this.effScale(); }

  /** Total height of the scaled page stack including inter-page gaps. */
  stackH() { return (this.pageH() * this.pages + PAGE_GAP_PX * (this.pages - 1)) * this.effScale(); }

  /** CSS transform for a page card: scale + vertical translate to stack pages with gaps. */
  pageCardTransform(pg: number) {
    const s = this.effScale();
    const topPx = pg * (this.pageH() + PAGE_GAP_PX) * s;
    return `translateY(${topPx}px) scale(${s})`;
  }

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
