import { NgStyle, NgTemplateOutlet } from '@angular/common';
import { AfterViewChecked, Component, ElementRef, HostListener, input, output, signal } from '@angular/core';
import { RenderModel } from '../../core/models';
import { DOC_FONTS } from '../../core/resume-doc';
import { PAGE_PX, planAutoBreaks, type BreakCandidate } from '../../core/preview-layout';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { cssFor } from './doc.ops';

/** What the user pointed at: a block (header / section / item) and optionally one text or image element inside it. */
export interface Target {
  kind: 'header' | 'section' | 'item';
  secId?: string;
  itemId?: string;
  /** Element key (also the style key), e.g. `i.<id>.title`, `s.<id>.title`, `header.name`, `header.photo`, `i.<id>.image`. */
  el?: string;
  bullet?: number;
}
export const sameTarget = (a: Target | null, b: Target | null) =>
  !!a && !!b && a.kind === b.kind && a.secId === b.secId && a.itemId === b.itemId && a.el === b.el && a.bullet === b.bullet;

const LINE = { compact: 1.25, normal: 1.4, relaxed: 1.6 } as const;

/**
 * The editable page. Renders the SAME render model the export uses (shared builder output + applyDoc), as text nodes
 * only. Click selects a block/element, a second click (or Enter) edits text in place via contenteditable.
 * Layout markup mirrors the Preview route so what you edit is what you export.
 */
@Component({
  selector: 've-sheet',
  standalone: true,
  imports: [NgStyle, NgTemplateOutlet, TranslatePipe],
  styles: [`
    :host { display: block; }
    .sheet { background: #fff; color: #111; box-shadow: var(--shadow, 0 2px 12px rgba(0,0,0,.18)); position: relative; transform-origin: top left; box-sizing: border-box; overflow-wrap: anywhere; }
    [data-el] { cursor: pointer; border-radius: 2px; min-height: 1em; white-space: pre-wrap; }
    [data-el]:empty::before { content: attr(data-ph); color: #8a8a8a; font-style: italic; font-weight: 400; }
    [data-el]:hover { outline: 1px dashed var(--c-primary); outline-offset: 1px; }
    [data-el].sel, [data-el].sel:hover { outline: 2px solid var(--c-primary); outline-offset: 1px; }
    [data-el].editing { outline: 2px solid var(--c-primary); outline-offset: 1px; background: color-mix(in srgb, var(--c-primary) 8%, #fff); cursor: text; }
    [data-sec].sel-block, [data-item].sel-block, [data-header].sel-block { box-shadow: -4px 0 0 0 var(--c-primary); }
    [data-item] { position: relative; }
    img { object-fit: cover; cursor: pointer; }
    img.sel { outline: 2px solid var(--c-primary); outline-offset: 2px; }
    .page-guide { position: absolute; left: 0; right: 0; border-top: 1px dashed #b0b0b0; pointer-events: none; }
    .page-guide span { position: absolute; right: 4px; top: -1.1em; font: 10px sans-serif; color: #888; }
    ul { margin: 3pt 0 3pt 16pt; padding: 0; } p { margin: 3pt 0; } h1 { margin: 0; }
    .doc-section h2 { margin: 14pt 0 4pt; font-size: 1.05em; }
    .row { display: flex; justify-content: space-between; gap: 8pt; }
    .page-break-spacer { position: relative; width: 100%; pointer-events: none; }
    .page-break-spacer::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; border-top: 1px dashed #b0b0b0; }
  `],
  template: `
    @if (model(); as m) {
      <div class="sheet" #sheet data-testid="ve-sheet" [style.width.px]="pageW()" [style.min-height.px]="pageH()" [style.padding.pt]="m.page.marginPt"
           [style.font-family]="font(m)" [style.font-size.pt]="m.theme.baseSizePt" [style.line-height]="LINE[m.theme.density ?? 'normal']"
           [attr.data-layout]="m.layout" [attr.data-template]="m.template.id" [style.transform]="'scale(' + scale() + ')'">
        <header data-header [style.text-align]="m.theme.headerAlign" [class.band]="m.theme.headerBand" data-testid="doc-header"
                [style.background]="m.theme.headerBand ? m.theme.accent : null" [style.color]="m.theme.headerBand ? '#fff' : null"
                [style.margin]="m.theme.headerBand ? '-' + m.page.marginPt + 'pt -' + m.page.marginPt + 'pt 12pt' : null"
                [style.padding]="m.theme.headerBand ? '14pt ' + m.page.marginPt + 'pt' : null" style="margin-bottom:12pt">
          @if (m.header.photo; as ph) {
            <img data-el="header.photo" [src]="ph.src" [alt]="'ve.photo.alt' | t" tabindex="0" data-testid="ve-photo"
                 [style.width.pt]="ph.sizePt" [style.height.pt]="ph.sizePt" style="float:right;border-radius:50%;margin:0 0 6pt 12pt" />
          }
          <h1 [ngStyle]="css(m, 'header.name', { 'font-size': (m.theme.nameScale ?? 1.8) + 'em', color: m.theme.headerBand ? '#fff' : m.theme.accent })">
            <span data-el="header.name" tabindex="0" data-testid="ve-name" [attr.data-ph]="'ve.ph.name' | t" [textContent]="m.header.name"></span></h1>
          @if (m.header.headline || editable('header.headline')) {
            <p [ngStyle]="css(m, 'header.headline', { 'font-size': '1.1em' })"><span data-el="header.headline" tabindex="0" [attr.data-ph]="'ve.ph.headline' | t" [textContent]="m.header.headline ?? ''"></span></p>
          }
          <p [ngStyle]="css(m, 'header.contacts', { 'font-size': '0.95em' })">
            <span data-el="header.contacts" tabindex="0" data-testid="ve-contacts" [attr.data-ph]="'ve.ph.contacts' | t" [textContent]="m.header.contacts.join(' · ')"></span>@if (m.header.links.length) { <span> · @for (l of m.header.links; track l.url; let last = $last) { <span>{{ l.label }}: {{ l.url }}{{ last ? '' : ' · ' }}</span> }</span> }
          </p>
        </header>

        <ng-template #sec let-s let-theme="theme" let-tl="timeline">
          <section class="doc-section" data-testid="ve-section" [attr.data-sec]="s.id" [attr.data-type]="s.type" [class.timeline]="tl"
                   [style.border-left]="tl ? '2px solid ' + theme.accent : null" [style.padding-left.pt]="tl ? 10 : null">
            <h2 [style.border-bottom]="theme.sectionRule ? '1px solid ' + theme.accent : 'none'"
                [style.border-left]="theme.headingStyle === 'bar' ? '4px solid ' + theme.accent : null" [style.padding-left.pt]="theme.headingStyle === 'bar' ? 6 : null"
                [style.background]="theme.headingStyle === 'tint' ? theme.accent + '1a' : null" [style.padding]="theme.headingStyle === 'tint' ? '2pt 6pt' : null"
                [style.display]="theme.headingStyle === 'short' ? 'inline-block' : null" [style.border-bottom-width]="theme.headingStyle === 'short' ? '3px' : null"
                [style.border-bottom-style]="theme.headingStyle === 'short' ? 'solid' : null" [style.border-bottom-color]="theme.headingStyle === 'short' ? theme.accent : null"
                [style.text-transform]="theme.headingTransform === 'upper' ? 'uppercase' : 'none'" [ngStyle]="css(model()!, 's.' + s.id + '.title', { color: theme.accent })">
              <span [attr.data-el]="'s.' + s.id + '.title'" tabindex="0" [attr.data-ph]="'ve.ph.sectionTitle' | t" [attr.data-testid]="'ve-title-' + s.id" [textContent]="s.title"></span></h2>
            @if (s.text !== undefined && s.text !== null) {
              <p [ngStyle]="css(model()!, 's.' + s.id + '.text')"><span [attr.data-el]="'s.' + s.id + '.text'" tabindex="0" [attr.data-ph]="'ve.ph.text' | t" [textContent]="s.text"></span></p>
            }
            @for (it of s.items ?? []; track it.id) {
              <div class="doc-item" [attr.data-item]="it.id" data-testid="ve-item">
                @if (it.image; as im) {
                  <img [attr.data-el]="'i.' + it.id + '.image'" [src]="im.src" [alt]="'ve.logo.alt' | t" tabindex="0" [style.width.pt]="im.sizePt" [style.height.pt]="im.sizePt" style="float:right;margin:0 0 4pt 8pt;object-fit:contain" />
                }
                @if (it.title !== undefined || it.meta !== undefined) {
                  <div class="row">
                    <strong [ngStyle]="css(model()!, 'i.' + it.id + '.title')"><span [attr.data-el]="'i.' + it.id + '.title'" tabindex="0" [attr.data-ph]="'ve.ph.itemTitle' | t" [textContent]="it.title ?? ''"></span></strong>
                    @if (it.meta !== undefined) { <span [ngStyle]="css(model()!, 'i.' + it.id + '.meta', { 'font-size': '0.9em' })"><span [attr.data-el]="'i.' + it.id + '.meta'" tabindex="0" [attr.data-ph]="'ve.ph.meta' | t" [textContent]="it.meta"></span></span> }
                  </div>
                }
                @if (it.subtitle !== undefined) { <div [ngStyle]="css(model()!, 'i.' + it.id + '.subtitle')" style="font-style:italic"><span [attr.data-el]="'i.' + it.id + '.subtitle'" tabindex="0" [attr.data-ph]="'ve.ph.subtitle' | t" [textContent]="it.subtitle"></span></div> }
                @if (it.text !== undefined) { <p [ngStyle]="css(model()!, 'i.' + it.id + '.text')"><span [attr.data-el]="'i.' + it.id + '.text'" tabindex="0" [attr.data-ph]="'ve.ph.text' | t" [textContent]="it.text"></span></p> }
                @if (it.bullets?.length) {
                  <ul [ngStyle]="css(model()!, 'i.' + it.id + '.bullets')" [attr.data-bullets]="it.id">
                    @for (b of it.bullets; track bi; let bi = $index) { <li><span [attr.data-el]="'i.' + it.id + '.bullets'" [attr.data-bullet]="bi" tabindex="0" [attr.data-ph]="'ve.ph.bullet' | t" [textContent]="b"></span></li> }
                  </ul>
                }
                @if (it.tags?.length) { <p [ngStyle]="css(model()!, 'i.' + it.id + '.tags', { 'font-size': '0.9em' })"><span [attr.data-el]="'i.' + it.id + '.tags'" tabindex="0" [attr.data-ph]="'ve.ph.tags' | t" [textContent]="it.tags!.join(', ')"></span></p> }
                @if (it.url) { <p [ngStyle]="css(model()!, 'i.' + it.id + '.url', { 'font-size': '0.9em' })"><span [attr.data-el]="'i.' + it.id + '.url'" tabindex="0" [attr.data-ph]="'ve.ph.url' | t" [textContent]="it.url"></span></p> }
              </div>
            }
          </section>
        </ng-template>

        @if (m.layout === 'two-column') {
          <div class="cols" data-testid="doc-columns" style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:18pt">
            <div data-col="main" data-testid="doc-main">@for (s of m.sections; track s.id) { @if (!isSide(s)) { @if (s.pageBreakBefore || autoBefore(s.id)) { <div class="page-break-spacer" data-pb></div> }<ng-container *ngTemplateOutlet="sec; context: { $implicit: s, theme: m.theme, timeline: false }"></ng-container> } }</div>
            <aside data-col="side" data-testid="doc-side">@for (s of m.sections; track s.id) { @if (isSide(s)) { @if (s.pageBreakBefore || autoBefore(s.id)) { <div class="page-break-spacer" data-pb></div> }<ng-container *ngTemplateOutlet="sec; context: { $implicit: s, theme: m.theme, timeline: false }"></ng-container> } }</aside>
          </div>
        } @else {
          <div data-col="main">@for (s of m.sections; track s.id) { @if (s.pageBreakBefore || autoBefore(s.id)) { <div class="page-break-spacer" data-pb></div> }<ng-container *ngTemplateOutlet="sec; context: { $implicit: s, theme: m.theme, timeline: m.layout === 'timeline' }"></ng-container> }</div>
        }
        @for (g of guides(); track g) { <div class="page-guide" [style.top.px]="g * pageH()"><span>{{ 've.page' | t: { n: g + 1 } }}</span></div> }
      </div>
    }
  `,
})
export class VeSheetComponent implements AfterViewChecked {
  model = input.required<RenderModel | null>();
  selection = input<Target | null>(null);
  editing = input(false);
  scale = input(1);
  pages = input(1);

  /** Sections that must start on a new page: user-forced (`pageBreakBefore`) + auto-planned for overflow. */
  autoBreaks = signal<Set<string>>(new Set<string>());

  pick = output<Target | null>();
  startEdit = output<Target>();
  commit = output<{ target: Target; text: string; enter: boolean }>();
  cancel = output<void>();
  measured = output<number>();

  readonly LINE = LINE;
  private lastH = 0;
  private editEl: HTMLElement | null = null;
  private orig = '';

  constructor(private host: ElementRef<HTMLElement>) {}

  pageW() { return PAGE_PX[this.model()?.page.size ?? 'A4'].w; }
  pageH() { return PAGE_PX[this.model()?.page.size ?? 'A4'].h; }
  guides() { return Array.from({ length: Math.max(0, this.pages() - 1) }, (_, i) => i + 1); }
  font(m: RenderModel) { return DOC_FONTS.find((f) => f.id === m.theme.fontFamily)?.css ?? DOC_FONTS[0].css; }
  /** Template default `base` overridden only by the properties the user actually set (null = unset). */
  css(m: RenderModel, key: string, base: Record<string, string> = {}) {
    const out: Record<string, string> = { ...base };
    for (const [k, v] of Object.entries(cssFor(m.styles?.[key], m.theme.accent))) if (v !== null) out[k] = v;
    return out;
  }
  /** Empty headline is still editable when it is the current selection (placeholder shows). */
  editable(key: string) { return this.selection()?.el === key; }

  /* ---------- selection / editing plumbing ---------- */
  private root(): HTMLElement | null { return this.host.nativeElement.querySelector('.sheet'); }

  targetFrom(node: EventTarget | null): Target | null {
    const n = node as HTMLElement | null;
    if (!n?.closest) return null;
    const secEl = n.closest('[data-sec]') as HTMLElement | null;
    const itemEl = n.closest('[data-item]') as HTMLElement | null;
    const elEl = n.closest('[data-el]') as HTMLElement | null;
    const header = n.closest('[data-header]');
    const secId = secEl?.dataset['sec']; const itemId = itemEl?.dataset['item'];
    if (elEl) {
      const el = elEl.dataset['el']!;
      const bullet = elEl.dataset['bullet'] !== undefined ? +elEl.dataset['bullet']! : undefined;
      if (el.startsWith('header.')) return { kind: 'header', el };
      if (el.startsWith('i.')) return { kind: 'item', secId, itemId, el, bullet };
      return { kind: 'section', secId, el };
    }
    if (itemId) return { kind: 'item', secId, itemId };
    if (secId) return { kind: 'section', secId };
    if (header) return { kind: 'header' };
    return null;
  }

  @HostListener('click', ['$event']) onClick(e: MouseEvent) {
    if (this.editEl?.contains(e.target as Node)) return; // caret moves inside the edited element
    const t = this.targetFrom(e.target);
    if (!t) { this.pick.emit(null); return; }
    if (this.editing()) return; // blur already committed; next click picks
    const textEl = !!t.el && !t.el.endsWith('.photo') && !t.el.endsWith('.image');
    if (textEl && sameTarget(t, this.selection())) { this.startEdit.emit(t); return; }
    this.pick.emit(t);
  }
  @HostListener('keydown', ['$event']) onKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    if (this.editEl && el === this.editEl) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) document.execCommand('insertText', false, '\n'); // Shift+Enter = line break within the field
        else this.finish(true);
      } else if (e.key === 'Escape') { e.preventDefault(); this.abort(); }
      return;
    }
    if (e.key === 'Enter' && el?.dataset?.['el'] && !this.editing()) {
      e.preventDefault();
      const t = this.targetFrom(el); if (!t) return;
      if (sameTarget(t, this.selection()) && !t.el!.endsWith('.photo') && !t.el!.endsWith('.image')) this.startEdit.emit(t); else this.pick.emit(t);
    } else if (e.key === ' ' && el?.dataset?.['el'] && !this.editing()) {
      e.preventDefault(); const t = this.targetFrom(el); if (t) this.pick.emit(t);
    }
  }
  @HostListener('focusout', ['$event']) onBlur(e: FocusEvent) { if (this.editEl && e.target === this.editEl) this.finish(false); }
  @HostListener('paste', ['$event']) onPaste(e: ClipboardEvent) {
    if (!this.editEl || e.target !== this.editEl) return;
    e.preventDefault();
    // Preserve line breaks so multi-line content (e.g. imported summaries) survives paste.
    const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n');
    document.execCommand('insertText', false, text);
  }

  /** Called by the parent after it flips `editing` on: make the element editable and focus it with the caret at the end. */
  beginEditing(t: Target) {
    const el = this.elementFor(t);
    if (!el) return;
    this.editEl = el; this.orig = el.textContent ?? '';
    el.classList.add('editing');
    el.setAttribute('contenteditable', 'plaintext-only');
    if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true'); // Firefox < 136
    el.setAttribute('role', 'textbox');
    el.focus();
    const sel = window.getSelection(); const r = document.createRange();
    r.selectNodeContents(el); r.collapse(false); sel?.removeAllRanges(); sel?.addRange(r);
  }
  private teardown(el: HTMLElement) {
    el.removeAttribute('contenteditable'); el.removeAttribute('role'); el.classList.remove('editing');
    this.editEl = null;
  }
  private finish(enter: boolean) {
    const el = this.editEl; if (!el) return;
    const target = this.targetFrom(el)!;
    // Keep internal line breaks; trim only leading/trailing whitespace on each line.
    const text = (el.textContent ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).join('\n').trim();
    this.teardown(el);
    if (text === this.orig) { this.cancel.emit(); return; }
    this.commit.emit({ target, text, enter });
  }
  private abort() {
    const el = this.editEl; if (!el) return;
    el.textContent = this.orig; this.teardown(el); this.cancel.emit();
    el.focus({ preventScroll: true });
  }

  /** Keyboard users keep their place after Enter commits an edit. */
  focusTarget(t: Target) { this.elementFor(t)?.focus({ preventScroll: true }); }

  /* ---------- queries used by the parent ---------- */
  elementFor(t: Target): HTMLElement | null {
    const root = this.root(); if (!root || !t.el) return null;
    const esc = (s: string) => CSS.escape(s);
    const bullet = t.bullet !== undefined ? `[data-bullet="${t.bullet}"]` : '';
    return root.querySelector<HTMLElement>(`[data-el="${esc(t.el)}"]${bullet}`);
  }
  blockFor(t: Target): HTMLElement | null {
    const root = this.root(); if (!root) return null;
    if (t.kind === 'header') return root.querySelector('[data-header]');
    if (t.kind === 'item') return root.querySelector(`[data-item="${t.itemId}"]`);
    return root.querySelector(`[data-sec="${t.secId}"]`);
  }
  /** Viewport rect of the selected element, or its block. */
  rectOf(t: Target | null): DOMRect | null {
    if (!t) return null;
    return (this.elementFor(t) ?? this.blockFor(t))?.getBoundingClientRect() ?? null;
  }
  /** Sibling blocks the selected block can be reordered among (items of one section, or sections of one column). */
  siblings(t: Target): Array<{ id: string; el: HTMLElement }> {
    const root = this.root(); if (!root) return [];
    if (t.kind === 'item') {
      const sec = root.querySelector(`[data-sec="${t.secId}"]`);
      return Array.from(sec?.querySelectorAll<HTMLElement>('[data-item]') ?? []).map((el) => ({ id: el.dataset['item']!, el }));
    }
    const mine = root.querySelector(`[data-sec="${t.secId}"]`);
    const col = mine?.closest('[data-col]');
    return Array.from(col?.querySelectorAll<HTMLElement>('[data-sec]') ?? []).map((el) => ({ id: el.dataset['sec']!, el }));
  }

  ngAfterViewChecked() {
    const root = this.root(); if (!root) return;
    this.applyPageBreakSpacers(root);
    this.applyAutoBreaks(root);
    const h = root.scrollHeight;
    if (h !== this.lastH) { this.lastH = h; queueMicrotask(() => this.measured.emit(h)); }
    const t = this.selection();
    root.querySelectorAll('.sel, .sel-block').forEach((n) => n.classList.remove('sel', 'sel-block'));
    if (!t) return;
    this.blockFor(t)?.classList.add('sel-block');
    if (t.el) this.elementFor(t)?.classList.add('sel');
  }

  /**
   * Give each page-break spacer exactly the height needed to push the following section onto the next page.
   * Spacers are processed top-to-bottom per column (forced reflow between each) so earlier spacers shift later ones.
   */
  private applyPageBreakSpacers(root: HTMLElement) {
    const pageH = this.pageH();
    for (const col of Array.from(root.querySelectorAll<HTMLElement>('[data-col]'))) {
      const colTop = col.offsetTop;
      for (const sp of Array.from(col.querySelectorAll<HTMLElement>('.page-break-spacer'))) {
        const top = sp.offsetTop - colTop;
        let remaining = pageH - (top % pageH);
        if (remaining >= pageH - 1) remaining = 0; // already at a page boundary
        const px = Math.max(0, Math.round(remaining));
        if (sp.style.height !== `${px}px`) {
          sp.style.height = `${px}px`;
          void sp.offsetHeight; // force reflow so the next spacer sees the new flow
        }
      }
    }
  }

  /** A section starts a new page when it does not fit into the remaining page content area (auto pagination). */
  autoBefore(id?: string): boolean { return !!id && this.autoBreaks().has(id); }

  /** Two-column placement: explicit per-section override wins, otherwise the template's type list applies. */
  isSide(s: { type: string; column?: 'main' | 'side' }) { return s.column ? s.column === 'side' : this.model()!.sideSections.includes(s.type); }

  /**
   * Auto page-break planning: any section whose box crosses the printable content-area bottom
   * (page height - top padding) is moved to the next page by giving its spacer the remaining height.
   * Recomputed after every layout pass; explicit `pageBreakBefore` spacers are honoured alongside these.
   */
  private applyAutoBreaks(root: HTMLElement) {
    const m = this.model(); if (!m) return;
    const pageH = this.pageH();
    const topPad = m.page.marginPt * 4 / 3; // 1pt = 4/3px; sheet padding is authored in pt
    const breaks = new Set<string>();
    for (const col of Array.from(root.querySelectorAll<HTMLElement>('[data-col]'))) {
      const colTop = col.offsetTop;
      const cands: BreakCandidate[] = [];
      for (const sec of Array.from(col.querySelectorAll<HTMLElement>('[data-sec]'))) {
        const id = sec.dataset['sec'];
        if (!id) continue;
        cands.push({ id, top: sec.offsetTop - colTop, height: sec.offsetHeight });
      }
      for (const id of planAutoBreaks(cands, pageH, topPad)) breaks.add(id);
    }
    const cur = this.autoBreaks();
    const same = cur.size === breaks.size && [...cur].every((k) => breaks.has(k));
    if (!same) this.autoBreaks.set(breaks);
  }
}
