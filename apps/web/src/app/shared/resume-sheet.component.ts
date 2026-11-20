import { NgStyle, NgTemplateOutlet } from '@angular/common';
import { AfterViewChecked, Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, Output, ViewChild, inject, signal } from '@angular/core';
import { RenderModel } from '../core/models';
import { cssFor, DOC_FONTS } from '../core/resume-doc';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { PAGE_PX, pageCount, planAutoBreaks, type BreakCandidate } from '../core/preview-layout';

/** Gap (px) shown between page cards in the preview — purely visual, not part of the printed output. */
const PAGE_GAP_PX = 24;

/**
 * The one on-screen renderer of the shared render model (preview page, public share, template gallery cards,
 * template preview). Text nodes only (no innerHTML). Either pass an explicit `scale`, or set `fitWidth` to
 * scale the page to the host's width.
 *
 * Page-break rendering: an invisible "measure" sheet drives scrollHeight → page count. The visible output
 * is N separate page-cards (one per page), each exactly pageH() tall with overflow:hidden. The content
 * inside each card is translated upward by (pageIndex * pageH()), revealing only that page's window —
 * no content duplication, no overlapping guide lines.
 *
 * Layout is computed ONCE from the measure sheet and applied verbatim to every card, so a spacer can never
 * get a different height in the preview than in the measurement that determined the page count.
 */
@Component({
  selector: 'app-resume-sheet',
  standalone: true,
  imports: [NgTemplateOutlet, NgStyle, TranslatePipe],
  host: { style: 'display:block', '[style.width]': 'fitWidth ? "100%" : null' },
  styles: [`
    .sheet { background: #fff; color: #111; box-shadow: 0 1px 4px rgba(0,0,0,0.25); white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
    .sheet h1.doc-name { margin: 0; }
    .sheet .doc-section { margin-top: 12pt; }
    .sheet .doc-section h2 { font-size: 1.05em; margin: 14pt 0 4pt; padding-bottom: 2pt; break-after: avoid; page-break-after: avoid; }
    .sheet .doc-item { margin-bottom: 6pt; break-inside: avoid; page-break-inside: avoid; }
    .sheet .row { display: flex; justify-content: space-between; gap: 8pt; }
    .sheet ul { margin: 3pt 0 3pt 16pt; padding: 0; }
    .sheet li { break-inside: avoid; page-break-inside: avoid; }
    .page-break-spacer { width: 100%; pointer-events: none; }
  `],
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
            <span class="sheet--page-label">{{ 've.pageOf' | t: { n: pg + 1, total: effectivePages() } }}</span>
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
          @if (m.header.photo; as ph) {
            <img [src]="ph.src" alt="" data-testid="doc-photo"
                 [style.width.pt]="ph.sizePt" [style.height.pt]="ph.sizePt"
                 style="float:right;border-radius:50%;margin:0 0 6pt 12pt" />
          }
          <h1 class="doc-name" [ngStyle]="css(m, 'header.name', { 'font-size': (m.theme.nameScale ?? 1.8) + 'em', color: m.theme.headerBand ? '#fff' : m.theme.accent })" data-testid="doc-name">{{ m.header.name }}</h1>
          @if (m.header.headline) {
            <p [ngStyle]="css(m, 'header.headline', { 'font-size': '1.1em' })">{{ m.header.headline }}</p>
          }
          @if (m.header.contacts.length) {
            <p [ngStyle]="css(m, 'header.contacts', { 'font-size': '0.95em' })">{{ m.header.contacts.join(' · ') }}</p>
          }
          @if (m.header.links.length) {
            <p style="font-size:0.95em">
              @for (l of m.header.links; track l.url; let last = $last) { <span>{{ l.label }}: {{ l.url }}{{ last ? '' : ' · ' }}</span> }
            </p>
          }
        </header>
        <ng-template #sec let-s let-theme="theme" let-tl="timeline">
          <section class="doc-section" [class.timeline]="tl"
                   [style.border-left]="tl ? '2px solid ' + theme.accent : null"
                   [style.padding-left.pt]="tl ? 10 : null"
                   [attr.data-sec]="s.id"
                   [attr.data-testid]="'doc-' + s.type">
            <h2 [ngStyle]="css(m, 's.' + s.id + '.title', {
                  color: theme.accent,
                  'border-bottom': theme.sectionRule ? '1px solid ' + theme.accent : 'none',
                  'border-left': theme.headingStyle === 'bar' ? '4px solid ' + theme.accent : null,
                  'padding-left.pt': theme.headingStyle === 'bar' ? 6 : null,
                  background: theme.headingStyle === 'tint' ? theme.accent + '1a' : null,
                  padding: theme.headingStyle === 'tint' ? '2pt 6pt' : null,
                  display: theme.headingStyle === 'short' ? 'inline-block' : null,
                  'border-bottom-width': theme.headingStyle === 'short' ? '3px' : null,
                  'border-bottom-style': theme.headingStyle === 'short' ? 'solid' : null,
                  'border-bottom-color': theme.headingStyle === 'short' ? theme.accent : null,
                  'text-transform': theme.headingTransform === 'upper' ? 'uppercase' : 'none'
                })">{{ s.title }}</h2>
            @if (s.text) { <p [ngStyle]="css(m, 's.' + s.id + '.text')">{{ s.text }}</p> }
            @for (it of s.items ?? []; track $index) {
              <div class="doc-item">
                @if (it.image; as im) {
                  <img [src]="im.src" alt="" [style.width.pt]="im.sizePt" [style.height.pt]="im.sizePt"
                       style="float:right;margin:0 0 4pt 8pt;object-fit:contain" />
                }
                @if (it.title || it.meta) {
                  <div class="row">
                    <strong [ngStyle]="css(m, 'i.' + it.id + '.title')">{{ it.title }}</strong>
                    <span [ngStyle]="css(m, 'i.' + it.id + '.meta', { 'font-size': '0.9em', color: '#555555' })">{{ it.meta }}</span>
                  </div>
                }
                @if (it.subtitle) { <div [ngStyle]="css(m, 'i.' + it.id + '.subtitle', { 'font-style': 'italic' })">{{ it.subtitle }}</div> }
                @if (it.text) { <p [ngStyle]="css(m, 'i.' + it.id + '.text')">{{ it.text }}</p> }
                @if (it.bullets?.length) { <ul [ngStyle]="css(m, 'i.' + it.id + '.bullets')">@for (b of it.bullets; track $index) { <li>{{ b }}</li> }</ul> }
                @if (it.tags?.length) { <p [ngStyle]="css(m, 'i.' + it.id + '.tags', { 'font-size': '0.9em', color: '#555555' })">{{ it.tags!.join(', ') }}</p> }
                @if (it.url) { <p [ngStyle]="css(m, 'i.' + it.id + '.url', { 'font-size': '0.9em', color: '#555555' })">{{ it.url }}</p> }
              </div>
            }
          </section>
        </ng-template>
        @if (m.layout === 'two-column') {
          <div class="cols" data-testid="doc-columns" style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:18pt">
            <div data-col="main" data-testid="doc-main">
              @for (s of m.sections; track s.type) {
                @if (!isSide(s)) {
                  @if (s.pageBreakBefore || autoBefore(s.id)) { <div class="page-break-spacer" data-pb></div> }
                  <ng-container *ngTemplateOutlet="sec; context: { $implicit: s, theme: m.theme, timeline: false }"></ng-container>
                }
              }
            </div>
            <aside data-col="side" data-testid="doc-side">
              @for (s of m.sections; track s.type) {
                @if (isSide(s)) {
                  @if (s.pageBreakBefore || autoBefore(s.id)) { <div class="page-break-spacer" data-pb></div> }
                  <ng-container *ngTemplateOutlet="sec; context: { $implicit: s, theme: m.theme, timeline: false }"></ng-container>
                }
              }
            </aside>
          </div>
        } @else {
          <div data-col="main">
            @for (s of m.sections; track s.type) {
              @if (s.pageBreakBefore || autoBefore(s.id)) { <div class="page-break-spacer" data-pb></div> }
              <ng-container *ngTemplateOutlet="sec; context: { $implicit: s, theme: m.theme, timeline: m.layout === 'timeline' }"></ng-container>
            }
          </div>
        }
      </ng-template>
    }
  `,
})
export class ResumeSheetComponent implements AfterViewChecked, OnDestroy {
  @Input() model: RenderModel | null = null;
  @Input() scale = 1;
  @Input() fitWidth = false;
  /** 0 (default) = derive the page count from the measured content; > 0 = caller-supplied count. */
  @Input() pages = 0;
  @Output() contentHeight = new EventEmitter<number>();
  @ViewChild('sheet') sheet?: ElementRef<HTMLElement>;

  private host = inject(ElementRef<HTMLElement>);
  private zone = inject(NgZone);
  private ro?: ResizeObserver;
  private hostW = signal(0);
  contentH = signal(0);

  /** Sections that must start on a new page: user-forced (`pageBreakBefore`) + auto-planned for overflow. */
  autoBreaks = signal<Set<string>>(new Set<string>());

  effScale() {
    if (!this.fitWidth) return this.scale;
    return this.hostW() > 0 ? this.hostW() / this.pageW() : 0.3;
  }
  size() { return this.model?.page.size ?? 'A4'; }
  pageW() { return PAGE_PX[this.size()].w; }
  pageH() { return PAGE_PX[this.size()].h; }
  /** Auto-paginate when the host does not pass an explicit page count (gallery, dialog, public share). */
  effectivePages() { return this.pages > 0 ? this.pages : pageCount(this.contentH(), this.size()); }

  /** Array of page indices [0, 1, … pages-1] for the page-card loop. */
  pageRange() { return Array.from({ length: Math.max(1, this.effectivePages()) }, (_, i) => i); }

  /** Two-column placement: explicit per-section override wins, otherwise the template's type list applies. */
  isSide(s: { type: string; column?: 'main' | 'side' }) { return s.column ? s.column === 'side' : (this.model?.sideSections ?? []).includes(s.type); }

  /** Total width of the scaled page stack. */
  stackW() { return this.pageW() * this.effScale(); }

  /** Total height of the scaled page stack including inter-page gaps. */
  stackH() { return (this.pageH() * this.effectivePages() + PAGE_GAP_PX * (this.effectivePages() - 1)) * this.effScale(); }

  /** CSS transform for a page card: scale + vertical translate to stack pages with gaps. */
  pageCardTransform(pg: number) {
    const s = this.effScale();
    const topPx = pg * (this.pageH() + PAGE_GAP_PX) * s;
    return `translateY(${topPx}px) scale(${s})`;
  }

  lineHeight(m: RenderModel) { return { compact: 1.25, normal: 1.4, relaxed: 1.6 }[m.theme.density ?? 'normal']; }
  font(m: RenderModel) { return DOC_FONTS.find((f) => f.id === m.theme.fontFamily)?.css ?? DOC_FONTS[0].css; }
  /** Per-element formatting from the visual editor, layered over the template's defaults. */
  css(m: RenderModel, key: string, base: Record<string, string | number | null> = {}) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(base)) if (v !== null) out[k] = String(v);
    for (const [k, v] of Object.entries(cssFor(m.styles?.[key], m.theme.accent))) if (v !== null) out[k] = v;
    return out;
  }

  ngAfterViewChecked() {
    if (this.fitWidth && !this.ro && typeof ResizeObserver !== 'undefined') {
      const el = this.host.nativeElement as HTMLElement;
      this.hostW.set(el.clientWidth);
      this.zone.runOutsideAngular(() => {
        this.ro = new ResizeObserver(() => this.zone.run(() => this.hostW.set(el.clientWidth)));
        this.ro.observe(el);
      });
    }
    this.applyPageBreakSpacers();
    this.applyAutoBreaks();
    const el = this.sheet?.nativeElement;
    if (!el) return;
    const h = el.scrollHeight;
    if (h !== this.contentH()) queueMicrotask(() => { this.contentH.set(h); this.contentHeight.emit(h); });
  }

  /** The sheet used for all layout decisions (measure sheet, falling back to the first rendered sheet). */
  private sourceSheet(): HTMLElement | null {
    const host = this.host.nativeElement as HTMLElement;
    return host.querySelector<HTMLElement>('.sheet--measure') ?? host.querySelector<HTMLElement>('.sheet');
  }

  /**
   * Compute spacer heights on the measure sheet only, then copy those heights into every page card.
   * Measuring each card separately (old behaviour) produced inconsistent heights because card content is
   * translated by -pg * pageH, which made the same spacer land on a different modulo boundary.
   */
  private applyPageBreakSpacers() {
    const host = this.host.nativeElement as HTMLElement;
    const source = this.sourceSheet();
    if (!source) return;
    const heights = Array.from(source.querySelectorAll<HTMLElement>('[data-col]')).map((col) => {
      const colTop = col.offsetTop;
      const out: number[] = [];
      for (const sp of Array.from(col.querySelectorAll<HTMLElement>('.page-break-spacer'))) {
        const top = sp.offsetTop - colTop;
        const mod = ((top % this.pageH()) + this.pageH()) % this.pageH();
        let remaining = this.pageH() - mod;
        if (remaining >= this.pageH() - 1) remaining = 0; // already at a page boundary
        const px = Math.max(0, Math.round(remaining));
        sp.style.height = `${px}px`;
        void sp.offsetHeight; // reflow so the next spacer in this column sees the new position
        out.push(px);
      }
      return out;
    });
    const sheets = Array.from(host.querySelectorAll<HTMLElement>('.sheet'));
    for (const sheet of sheets) {
      if (sheet === source) continue;
      const cols = Array.from(sheet.querySelectorAll<HTMLElement>('[data-col]'));
      cols.forEach((col, ci) => {
        const values = heights[ci] ?? [];
        Array.from(col.querySelectorAll<HTMLElement>('.page-break-spacer')).forEach((sp, si) => {
          const px = values[si] ?? 0;
          if (sp.style.height !== `${px}px`) sp.style.height = `${px}px`;
        });
      });
    }
  }

  /** A section starts a new page when it does not fit into the remaining page content area (auto pagination). */
  autoBefore(id?: string): boolean { return !!id && this.autoBreaks().has(id); }

  /** Auto page-break planning measured from the single source sheet, including both page margins. */
  private applyAutoBreaks() {
    const m = this.model;
    const source = this.sourceSheet();
    if (!m || !source) return;
    const pageH = this.pageH();
    const marginPx = m.page.marginPt * 4 / 3; // 1pt = 4/3px; sheet padding is authored in pt
    const breaks = new Set<string>();
    for (const col of Array.from(source.querySelectorAll<HTMLElement>('[data-col]'))) {
      const colTop = col.offsetTop;
      const cands: BreakCandidate[] = [];
      for (const sec of Array.from(col.querySelectorAll<HTMLElement>('[data-sec]'))) {
        const id = sec.dataset['sec'];
        if (!id) continue;
        cands.push({ id, top: sec.offsetTop - colTop, height: sec.offsetHeight });
      }
      for (const id of planAutoBreaks(cands, pageH, marginPx * 2)) breaks.add(id);
    }
    const cur = this.autoBreaks();
    const same = cur.size === breaks.size && [...cur].every((k) => breaks.has(k));
    if (!same) this.autoBreaks.set(breaks);
  }

  ngOnDestroy() { this.ro?.disconnect(); }
}
