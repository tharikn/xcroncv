import { Component, ElementRef, HostListener, OnInit, ViewChild, input, output, signal } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { DocImage, LOGO_RANGE, PHOTO_RANGE } from '../../core/resume-doc';
import { centeredCrop, clampCrop, coverScale, CropState, touchDistance, zoomCrop } from './geometry';
import { LoadedImage, renderCrop } from './image-process';

/**
 * Square crop + scale dialog for a profile photo or logo. Drag to pan, pinch / slider / wheel to zoom (touch + mouse),
 * arrow keys nudge. The result is a small cropped data URI; the original file is never uploaded or stored.
 */
@Component({
  selector: 've-image-crop',
  standalone: true,
  imports: [TranslatePipe],
  styles: [`
    .scrim { position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 1000; display: grid; place-items: center; padding: var(--space-3); }
    .dlg { background: var(--c-bg); color: var(--c-text); border: 1px solid var(--c-border); border-radius: var(--radius, 12px); padding: var(--space-4); width: min(92vw, 360px); display: grid; gap: var(--space-3); max-height: 94vh; overflow: auto; }
    .box { position: relative; overflow: hidden; margin: 0 auto; background: var(--c-surface); touch-action: none; cursor: grab; border: 1px solid var(--c-border); }
    .box.round { border-radius: 50%; }
    .box img { position: absolute; left: 0; top: 0; max-width: none; user-select: none; -webkit-user-drag: none; transform-origin: 0 0; pointer-events: none; }
    .actions { display: flex; gap: var(--space-2); justify-content: flex-end; flex-wrap: wrap; }
    input[type=range] { width: 100%; }
    .err { color: var(--c-danger); }
  `],
  template: `
    <div class="scrim" (click)="onScrim($event)" data-testid="ve-crop">
      <div class="dlg" role="dialog" aria-modal="true" [attr.aria-label]="(kind() === 'photo' ? 've.crop.titlePhoto' : 've.crop.titleLogo') | t" tabindex="-1" #dlg>
        <h2 style="margin:0;font-size:1.1rem">{{ (kind() === 'photo' ? 've.crop.titlePhoto' : 've.crop.titleLogo') | t }}</h2>
        <p class="muted small" style="margin:0">{{ 've.crop.hint' | t }}</p>
        <div class="box" [class.round]="kind() === 'photo'" #box [style.width.px]="BOX" [style.height.px]="BOX" tabindex="0" role="img" [attr.aria-label]="'ve.crop.boxLabel' | t"
             (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)" (pointercancel)="up($event)" (wheel)="wheel($event)" (keydown)="key($event)" data-testid="ve-crop-box">
          <img [src]="image().url" alt="" [style.width.px]="image().w" [style.height.px]="image().h" [style.transform]="transform()" />
        </div>
        <label class="small" for="crop-zoom">{{ 've.crop.zoom' | t }}
          <input id="crop-zoom" type="range" min="1" max="4" step="0.01" [value]="crop().zoom" (input)="setZoom(+$any($event.target).value)" data-testid="ve-crop-zoom" /></label>
        @if (error()) { <p class="err small" role="alert">{{ error() | t }}</p> }
        <div class="actions">
          <button class="btn ghost" type="button" (click)="cancelled.emit()" data-testid="ve-crop-cancel">{{ 'common.cancel' | t }}</button>
          <button class="btn" type="button" (click)="apply()" data-testid="ve-crop-apply">{{ 've.crop.apply' | t }}</button>
        </div>
      </div>
    </div>
  `,
})
export class VeImageCropComponent implements OnInit {
  image = input.required<LoadedImage>();
  kind = input<'photo' | 'logo'>('photo');
  done = output<DocImage>();
  cancelled = output<void>();

  readonly BOX = 260;
  crop = signal<CropState>({ zoom: 1, ox: 0, oy: 0 });
  error = signal('');
  @ViewChild('dlg') dlg?: ElementRef<HTMLElement>;
  private pts = new Map<number, { x: number; y: number }>();
  private start: { crop: CropState; dist: number; x: number; y: number } | null = null;

  ngOnInit() {
    const i = this.image();
    this.crop.set(centeredCrop(i.w, i.h, this.BOX));
    setTimeout(() => this.dlg?.nativeElement.focus());
  }

  transform() {
    const i = this.image(); const c = this.crop();
    return `translate(${c.ox}px, ${c.oy}px) scale(${coverScale(i.w, i.h, this.BOX) * c.zoom})`;
  }

  down(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.rebase();
  }
  private rebase() {
    const p = [...this.pts.values()];
    this.start = { crop: this.crop(), dist: p.length === 2 ? touchDistance({ clientX: p[0].x, clientY: p[0].y }, { clientX: p[1].x, clientY: p[1].y }) : 0, x: p[0]?.x ?? 0, y: p[0]?.y ?? 0 };
  }
  move(e: PointerEvent) {
    if (!this.pts.has(e.pointerId) || !this.start) return;
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const i = this.image(); const p = [...this.pts.values()];
    if (p.length === 2 && this.start.dist > 0) {
      const d = touchDistance({ clientX: p[0].x, clientY: p[0].y }, { clientX: p[1].x, clientY: p[1].y });
      this.crop.set(zoomCrop(this.start.crop, this.start.crop.zoom * (d / this.start.dist), i.w, i.h, this.BOX));
    } else if (p.length === 1) {
      const c = this.start.crop;
      this.crop.set(clampCrop({ zoom: c.zoom, ox: c.ox + (p[0].x - this.start.x), oy: c.oy + (p[0].y - this.start.y) }, i.w, i.h, this.BOX));
    }
  }
  up(e: PointerEvent) { this.pts.delete(e.pointerId); if (this.pts.size) this.rebase(); else this.start = null; }
  wheel(e: WheelEvent) { e.preventDefault(); this.setZoom(this.crop().zoom * (e.deltaY < 0 ? 1.08 : 0.93)); }
  setZoom(z: number) { const i = this.image(); this.crop.set(zoomCrop(this.crop(), z, i.w, i.h, this.BOX)); }
  key(e: KeyboardEvent) {
    const step = 8; const i = this.image(); const c = this.crop();
    const d: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (d[e.key]) { e.preventDefault(); this.crop.set(clampCrop({ ...c, ox: c.ox + d[e.key][0], oy: c.oy + d[e.key][1] }, i.w, i.h, this.BOX)); }
    else if (e.key === '+' || e.key === '=') this.setZoom(c.zoom + 0.1);
    else if (e.key === '-') this.setZoom(c.zoom - 0.1);
  }
  onScrim(e: MouseEvent) { if (e.target === e.currentTarget) this.cancelled.emit(); }
  @HostListener('document:keydown.escape') esc() { this.cancelled.emit(); }

  apply() {
    try {
      const photo = this.kind() === 'photo';
      this.done.emit(renderCrop(this.image(), this.crop(), this.BOX, photo ? 320 : 192, photo ? PHOTO_RANGE.def : LOGO_RANGE.def));
    } catch { this.error.set('ve.crop.failed'); }
  }
}
