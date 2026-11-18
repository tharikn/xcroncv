import { AfterViewInit, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { DocSection } from '../../core/resume-doc';
import { registerVisualEditorIcons } from './visual-editor.icons';

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export type RearrangeLayout = 'single-column' | 'two-column' | 'timeline';
export type RearrangeColumnKey = 'main' | 'side';
export interface RearrangeColumn { key: RearrangeColumnKey; sections: DocSection[] }

/**
 * Full-screen rearrangement board (doc 16): the resume page is drawn as one big sheet — a locked header box, then one
 * box per section in the exact place it prints (two columns for two-column templates). Boxes are numbered 1,2,3… in
 * reading order. Dragging a box (or Arrow keys on a focused box) reorders that column only.
 */
@Component({
  selector: 've-rearrange',
  standalone: true,
  imports: [IonIcon, TranslatePipe],
  template: `
    <div class="rr-backdrop" (click)="closed.emit()" data-testid="ve-rearrange-backdrop"></div>
    <section class="rr-dlg" role="dialog" aria-modal="true" aria-labelledby="rr-title" data-testid="ve-rearrange"
             [attr.data-layout]="layout()" (keydown)="onKeydown($event)">
      <button class="rr-close" type="button" (click)="closed.emit()" [attr.aria-label]="'common.dismiss' | t" data-testid="ve-rearrange-close">
        <ion-icon name="close-outline" aria-hidden="true"></ion-icon></button>

      <div class="rr-body">
        <h2 class="rr-title" id="rr-title">{{ 've.rearrange' | t }}</h2>
        <div class="rr-paper" data-testid="ve-rearrange-sheet" [class.two]="twoCol()">
          <div class="rr-block rr-locked" data-testid="ve-rearrange-header">
            <ion-icon name="lock-closed-outline" aria-hidden="true"></ion-icon>
            <span>{{ 've.rearrangeHeader' | t }}</span>
          </div>

          <div class="rr-cols">
            @for (col of columns(); track col.key) {
              <ol class="rr-col" [attr.data-col]="col.key" [attr.aria-label]="col.key === 'side' ? ('ve.rearrangeSide' | t) : ('ve.rearrangeMain' | t)">
                @for (s of col.sections; track s.id; let i = $index) {
                  <li class="rr-box" [attr.data-testid]="'ve-tile-' + s.type" [attr.data-type]="s.type" [attr.data-sec-id]="s.id" [attr.data-col]="col.key"
                      [class.hidden-sec]="s.hidden" [class.current]="focusId() === s.id" [class.dragging]="active() === s.id"
                      [class.drop-before]="dropSide(col.key, i, s.id) === 'before'" [class.drop-after]="dropSide(col.key, i, s.id) === 'after'" tabindex="0"
                      (pointerdown)="startDrag($event, s, col.key)"
                      (keydown.arrowup)="nudge($event, s.id, -1)" (keydown.arrowdown)="nudge($event, s.id, 1)"
                      (keydown.arrowleft)="moveColumn($event, s.id, 'main')" (keydown.arrowright)="moveColumn($event, s.id, 'side')">
                    <span class="rr-grip" aria-hidden="true" data-grip><ion-icon name="apps-outline"></ion-icon></span>
                    <span class="rr-n" aria-hidden="true">{{ nums().get(s.id) }}</span>
                    <span class="rr-t">{{ s.title || ('ve.untitled' | t) }}</span>
                    @if (s.hidden) { <ion-icon class="rr-off" name="eye-off-outline" [attr.aria-label]="'ve.block.hide' | t"></ion-icon> }
                  </li>
                }
              </ol>
            }
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host { position: fixed; inset: 0; z-index: 1000; display: flex; }
    .rr-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.55); }
    .rr-dlg {
      position: relative; margin: auto; display: flex; flex-direction: column; width: min(60rem, calc(100vw - 2rem));
      height: min(88vh, 54rem); background: #fff; color: #111827; border-radius: 12px; overflow: hidden;
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.4);
    }
    .rr-close {
      position: absolute; top: var(--space-3); right: var(--space-3); z-index: 2;
      display: inline-grid; place-items: center; width: 2.5rem; height: 2.5rem; border: 0; border-radius: 8px;
      background: transparent; color: #6b7280; cursor: pointer;
    }
    .rr-close:hover { background: #f3f4f6; color: #111827; }
    .rr-close ion-icon { font-size: 1.5rem; }

    .rr-body { flex: 1 1 auto; overflow: auto; padding: var(--space-6) var(--space-4); background: #fff; -webkit-overflow-scrolling: touch; }
    .rr-title { margin: 0 0 var(--space-4); font-size: clamp(1.4rem, 3vw, 2rem); font-weight: 700; text-align: center; color: #111827; }

    /* The page: one big sheet, header locked at the top, columns flow like the printed resume. */
    .rr-paper {
      margin: 0 auto; width: min(30rem, 100%); background: #fff; border: 1px solid #e5e7eb; border-radius: 6px;
      padding: var(--space-4); box-shadow: 0 2px 12px rgba(17, 24, 39, 0.08); display: grid; gap: var(--space-3);
    }
    .rr-paper.two { width: min(36rem, 100%); }
    .rr-cols { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-3); align-items: stretch; }
    .rr-paper.two .rr-cols { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }

    .rr-block {
      position: relative; display: grid; place-items: center; text-align: center; min-height: 4.6rem;
      padding: var(--space-3); border-radius: 8px; user-select: none;
    }
    .rr-locked {
      background: #e5e7eb; color: #4b5563; font-size: 1.05rem; font-weight: 500; border: 1px solid #d1d5db;
    }
    .rr-locked ion-icon { position: absolute; left: 0.6rem; top: 0.6rem; font-size: 1.05rem; color: #6b7280; }

    .rr-col { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3); align-content: start; min-width: 0; min-height: 5.5rem; }
    .rr-col[data-col='side'] { border-left: 1px dashed #e5e7eb; padding-left: var(--space-3); }

    .rr-box {
      position: relative; display: grid; place-items: center; min-height: 6.25rem; padding: var(--space-4) var(--space-3);
      border: 1px solid transparent; border-radius: 8px; background: #eceff4; color: #374151;
      cursor: grab; touch-action: pan-y; min-width: 0; transition: border-color 0.12s ease, background 0.12s ease;
    }
    .rr-box[data-type='experience'], .rr-box[data-type='projects'] { min-height: 8rem; }
    .rr-box[data-type='education'], .rr-box[data-type='summary'] { min-height: 5.5rem; }
    .rr-box:hover, .rr-box:focus-visible { border-color: var(--c-primary); background: #e8eaf0; }
    .rr-box:focus-visible { outline: 2px solid var(--c-primary); outline-offset: 1px; }
    .rr-box.current { border-color: var(--c-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--c-primary) 35%, transparent) inset; }
    .rr-box.dragging { opacity: 0.65; cursor: grabbing; background: color-mix(in srgb, var(--c-primary) 55%, #eceff4); color: #fff; }
    .rr-box.hidden-sec .rr-t { color: #9ca3af; text-decoration: line-through; }
    .rr-t { font-size: 1.15rem; font-weight: 500; text-align: center; overflow-wrap: anywhere; max-width: 100%; }

    .rr-grip {
      position: absolute; left: 0.45rem; top: 0.4rem; color: #9ca3af; line-height: 0; touch-action: none; cursor: grab;
      padding: 0.35rem; border-radius: 6px;
    }
    .rr-grip:hover { color: #374151; background: rgba(17, 24, 39, 0.06); }
    .rr-grip ion-icon { font-size: 1.25rem; }
    .rr-n {
      position: absolute; top: 0.4rem; right: 0.4rem; display: inline-grid; place-items: center;
      width: 1.6rem; height: 1.6rem; border-radius: 50%; background: var(--c-primary); color: var(--c-primary-text);
      font-size: 0.8rem; font-weight: 700; font-variant-numeric: tabular-nums;
    }
    .rr-off { position: absolute; bottom: 0.4rem; right: 0.35rem; color: #9ca3af; font-size: 1.05rem; }

    .rr-box.drop-before::after, .rr-box.drop-after::after {
      content: ''; position: absolute; left: 0; right: 0; height: 4px; border-radius: 4px; background: var(--c-primary);
    }
    .rr-box.drop-before::after { top: -3px; }
    .rr-box.drop-after::after { bottom: -3px; }

    @media (max-width: 40rem) {
      :host { align-items: stretch; }
      .rr-dlg { width: 100%; height: 100%; border-radius: 0; }
      .rr-body { padding: var(--space-8) var(--space-3) var(--space-4); }
      .rr-paper, .rr-paper.two { width: 100%; }
      .rr-paper.two .rr-cols { grid-template-columns: minmax(0, 1fr); }
      .rr-col[data-col='side'] { padding-left: 0; border-left: 0; border-top: 1px dashed #e5e7eb; padding-top: var(--space-3); }
    }
  `],
})
export class VeRearrangeComponent implements AfterViewInit {
  sections = input.required<readonly DocSection[]>();
  layout = input<RearrangeLayout>('single-column');
  sideSections = input<readonly string[]>([]);
  /** Section to highlight (the current selection); otherwise the first box takes focus. */
  focusId = input<string | null>(null);

  reordered = output<DocSection[]>();
  closed = output<void>();

  readonly active = signal<string | null>(null);
  private readonly over = signal<{ col: RearrangeColumnKey; index: number } | null>(null);

  private host = inject(ElementRef<HTMLElement>);
  private drag: { id: string; col: RearrangeColumnKey; x: number; y: number; moved: boolean; stop: () => void } | null = null;

  readonly twoCol = computed(() => this.layout() === 'two-column');
  /** A section may be explicitly placed in the main or side column; otherwise its type decides (template default). */
  placement(s: DocSection): RearrangeColumnKey {
    if (s.column === 'main' || s.column === 'side') return s.column;
    return this.twoCol() && new Set(this.sideSections()).has(s.type) ? 'side' : 'main';
  }
  readonly columns = computed<RearrangeColumn[]>(() => {
    const all = this.sections();
    if (!this.twoCol()) return [{ key: 'main', sections: [...all] }];
    return [
      { key: 'main', sections: all.filter((s) => this.placement(s) === 'main') },
      { key: 'side', sections: all.filter((s) => this.placement(s) === 'side') },
    ];
  });
  /** Numbers follow the visual reading order: main column first, then the side rail. */
  readonly nums = computed(() => {
    const map = new Map<string, number>(); let n = 1;
    for (const col of this.columns()) for (const s of col.sections) map.set(s.id, n++);
    return map;
  });

  constructor() { registerVisualEditorIcons(); }

  ngAfterViewInit() {
    queueMicrotask(() => {
      const root = this.host.nativeElement as HTMLElement;
      const wanted = this.focusId();
      const el = (wanted ? root.querySelector<HTMLElement>(`[data-sec-id="${wanted}"]`) : null)
        ?? root.querySelector<HTMLElement>('.rr-box')
        ?? root.querySelector<HTMLElement>('.rr-close');
      el?.focus({ preventScroll: true });
    });
  }

  /** Keyboard: Arrow keys move the focused box inside its column. */
  nudge(e: Event, id: string, delta: -1 | 1) {
    e.preventDefault(); e.stopPropagation();
    for (const col of this.columns()) {
      const from = col.sections.findIndex((s) => s.id === id);
      if (from < 0) continue;
      const to = from + delta;
      if (to < 0 || to >= col.sections.length) return;
      const next = [...col.sections];
      [next[from], next[to]] = [next[to], next[from]];
      this.emitColumn(col.key, next);
      this.focusBox(id); // the keyed list may blur the moved box while re-rendering
      return;
    }
  }

  /** Keyboard: Arrow keys move the focused box to the other column (only meaningful on the two-column layout). */
  moveColumn(e: Event, id: string, target: RearrangeColumnKey) {
    e.preventDefault(); e.stopPropagation();
    if (!this.twoCol()) return;
    const source = this.columns().find((c) => c.sections.some((s) => s.id === id));
    if (!source || source.key === target) return;
    const from = source.sections.findIndex((s) => s.id === id);
    const moved = source.sections[from];
    const dest = this.columns().find((c) => c.key === target)!;
    const at = clamp(from, 0, dest.sections.length);
    const next = [...dest.sections]; next.splice(at, 0, { ...moved, column: target });
    this.emitColumns(this.columns().map((c): RearrangeColumn => {
      if (c.key === source.key) return { key: c.key, sections: c.sections.filter((s) => s.id !== id) };
      if (c.key === target) return { key: target, sections: next };
      return c;
    }));
    this.focusBox(id);
  }

  /** Keep keyboard reordering going: refocus the moved box once the host has applied the new order. */
  private focusBox(id: string) {
    setTimeout(() => {
      const el = (this.host.nativeElement as HTMLElement).querySelector(`[data-sec-id="${id}"]`) as HTMLElement | null;
      el?.focus({ preventScroll: true });
    });
  }

  dropSide(column: RearrangeColumnKey, index: number, _id?: string): 'before' | 'after' | null {
    const o = this.over();
    if (!o || o.col !== column) return null;
    if (o.index === index) return 'before';
    if (o.index === index + 1) return 'after';
    return null;
  }

  /** Drag to reorder: mouse grabs the box, touch grabs its grip dots. Boxes can move between the two columns. */
  startDrag(e: PointerEvent, s: DocSection, col: RearrangeColumnKey) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const tile = e.currentTarget as HTMLElement;
    const grip = (e.target as HTMLElement | null)?.closest('[data-grip]') as HTMLElement | null;
    if (e.pointerType !== 'mouse' && !grip) { /* touch: scroll the board unless the grip was used */ return; }
    e.preventDefault();
    tile.focus({ preventScroll: true });
    const move = (ev: PointerEvent) => this.onDragMove(ev);
    const up = () => this.endDrag(true);
    const cancel = () => this.endDrag(false);
    tile.setPointerCapture(e.pointerId);
    tile.addEventListener('pointermove', move);
    tile.addEventListener('pointerup', up);
    tile.addEventListener('pointercancel', cancel);
    this.drag = {
      id: s.id, col, x: e.clientX, y: e.clientY, moved: false,
      stop: () => { tile.removeEventListener('pointermove', move); tile.removeEventListener('pointerup', up); tile.removeEventListener('pointercancel', cancel); },
    };
    this.active.set(s.id);
  }

  private columnList(key: RearrangeColumnKey) { return this.columns().find((c) => c.key === key)?.sections.filter((s) => s.id !== this.drag?.id) ?? []; }

  private onDragMove(e: PointerEvent) {
    const d = this.drag; if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) d.moved = true;
    if (!d.moved) return;
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const tile = under?.closest('.rr-box') as HTMLElement | null;
    const colEl = (tile ?? under?.closest('.rr-col')) as HTMLElement | null;
    if (!colEl || !this.host.nativeElement.contains(colEl)) { this.over.set(null); return; }
    const target = colEl.dataset['col'] as RearrangeColumnKey | undefined;
    if (target !== 'main' && target !== 'side') { this.over.set(null); return; }
    if (!tile || tile.dataset['secId'] === d.id) { this.over.set({ col: target, index: this.columnList(target).length }); return; }
    const r = tile.getBoundingClientRect();
    const list = this.columnList(target);
    const idx = list.findIndex((s) => s.id === tile.dataset['secId']);
    const index = idx < 0 ? list.length : e.clientY > r.top + r.height / 2 ? idx + 1 : idx;
    this.over.set({ col: target, index });
  }

  private endDrag(apply: boolean) {
    const d = this.drag; const o = this.over();
    d?.stop();
    this.drag = null; this.over.set(null); this.active.set(null);
    if (apply && d && d.moved && o) this.drop(d, o);
  }

  private drop(d: NonNullable<typeof this.drag>, target: { col: RearrangeColumnKey; index: number }) {
    const cols: RearrangeColumn[] = this.columns().map((c) => ({ key: c.key, sections: c.sections.filter((s) => s.id !== d.id) }));
    const dest = cols.find((c) => c.key === target.col)!;
    const source = this.columns().find((c) => c.key === d.col)!;
    const moved = source.sections.find((s) => s.id === d.id)!;
    dest.sections.splice(clamp(target.index, 0, dest.sections.length), 0, { ...moved, column: target.col });
    this.emitColumns(cols);
  }

  /** Emit the full, flat document order: main column in reading order, then the side rail. */
  private emitColumns(cols: RearrangeColumn[]) {
    const main = cols.find((c) => c.key === 'main')?.sections ?? [];
    const side = cols.find((c) => c.key === 'side')?.sections ?? [];
    this.reordered.emit([...main, ...side]);
  }
  /** Replace one column's order (used by keyboard moves); emits the resulting document. */
  private emitColumn(column: RearrangeColumnKey, next: DocSection[]) {
    this.emitColumns(this.columns().map((c) => (c.key === column ? { key: column, sections: next } : c)));
  }

  onKeydown(e: Event) { if ((e as KeyboardEvent).key === 'Escape') { e.stopPropagation(); this.closed.emit(); } }
}
