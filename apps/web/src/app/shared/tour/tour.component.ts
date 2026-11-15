import { Component, DestroyRef, ElementRef, HostListener, NgZone, OnInit, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Box, TipPos, isInViewport, nextFocusIndex, placeTip, resolveTarget, spotBox } from './tour.logic';
import { TourStep } from './tour.config';
import { TourService } from './tour.service';

const POLL_MS = 250;
const MISSING_GRACE_MS = 1200;

/**
 * Spotlight coach-mark overlay. Four dim panels surround the target so the target itself stays clickable
 * (click mode); the rest of the screen is blocked. Mounted once in AppComponent.
 */
@Component({
  selector: 'app-tour',
  standalone: true,
  imports: [TranslatePipe],
  styles: [`
    .tour { position: fixed; inset: 0; z-index: 10000; }
    .dim { position: fixed; background: color-mix(in srgb, var(--c-text) 72%, transparent); touch-action: none; }
    .blocker { position: fixed; touch-action: none; }
    .ring { position: fixed; pointer-events: none; border-radius: var(--radius); border: 3px solid var(--c-primary);
            box-shadow: 0 0 0 3px var(--c-primary-text), 0 0 18px 4px var(--c-primary); transition: top .2s, left .2s, width .2s, height .2s; }
    .ring.pulse { animation: tour-pulse 1.4s ease-in-out infinite; }
    @keyframes tour-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
    @media (prefers-reduced-motion: reduce) { .ring.pulse { animation: none; } .ring { transition: none; } }
    .tip { position: fixed; width: min(22rem, calc(100vw - 1rem)); box-sizing: border-box; background: var(--c-bg); color: var(--c-text);
           border: 1px solid var(--c-border); border-radius: var(--radius); padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-2);
           box-shadow: 0 10px 30px color-mix(in srgb, var(--c-text) 35%, transparent); max-height: calc(100vh - 1rem); overflow: auto; }
    .tip h2 { margin: 0; font-size: 1.05rem; }
    .tip p { margin: 0; color: var(--c-muted); }
    .tip .count { font-size: .8rem; color: var(--c-muted); }
    .tip .actions { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-2); }
    .tip button { min-height: var(--control-min-height); min-width: var(--control-min-height); }
  `],
  template: `
    @if (tour.step(); as s) {
      <div class="tour" data-testid="tour" (keydown)="onKey($event)">
        @if (spot(); as b) {
          <div class="dim" [style.top.px]="0" [style.left.px]="0" [style.right.px]="0" [style.height.px]="b.top"></div>
          <div class="dim" [style.top.px]="b.top + b.height" [style.left.px]="0" [style.right.px]="0" [style.bottom.px]="0"></div>
          <div class="dim" [style.top.px]="b.top" [style.left.px]="0" [style.width.px]="b.left" [style.height.px]="b.height"></div>
          <div class="dim" [style.top.px]="b.top" [style.left.px]="b.left + b.width" [style.right.px]="0" [style.height.px]="b.height"></div>
          @if (s.mode === 'info') {
            <div class="blocker" [style.top.px]="b.top" [style.left.px]="b.left" [style.width.px]="b.width" [style.height.px]="b.height"></div>
          }
          <div class="ring pulse" data-testid="tour-ring" aria-hidden="true"
               [style.top.px]="b.top" [style.left.px]="b.left" [style.width.px]="b.width" [style.height.px]="b.height"></div>
        } @else {
          <div class="dim" style="inset:0"></div>
        }
        <div #tip class="tip" role="dialog" aria-modal="true" aria-labelledby="tour-t" aria-describedby="tour-b" data-testid="tour-tip"
             [style.top.px]="pos().top" [style.left.px]="pos().left">
          <span class="count" aria-live="polite">{{ 'tour.progress' | t: { n: tour.index() + 1, total: tour.steps.length } }}</span>
          <h2 id="tour-t">{{ s.titleKey | t }}</h2>
          <p id="tour-b">{{ s.bodyKey | t }}</p>
          @if (s.mode === 'click' && spot()) { <p><strong>{{ 'tour.clickHint' | t }}</strong></p> }
          @if (!spot() && ready()) { <p>{{ 'tour.missing' | t }}</p> }
          <div class="actions">
            <button type="button" class="btn ghost" data-testid="tour-skip" (click)="tour.skip()">{{ 'tour.skip' | t }}</button>
            @if (tour.index() > 0) { <button type="button" class="btn ghost" data-testid="tour-back" (click)="tour.back()">{{ 'tour.back' | t }}</button> }
            <button type="button" class="btn" data-testid="tour-next" (click)="tour.next()">{{ (tour.isLast() ? 'tour.done' : 'tour.next') | t }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TourComponent implements OnInit {
  tour = inject(TourService);
  private router = inject(Router);
  private zone = inject(NgZone);
  private destroyRef = inject(DestroyRef);
  private tipEl = viewChild<ElementRef<HTMLElement>>('tip');

  spot = signal<Box | null>(null);
  pos = signal<TipPos>({ top: 8, left: 8, placement: 'center' });
  /** False during the grace period after a step starts, so a not-yet-rendered target does not flash the "missing" state. */
  ready = signal(false);

  private target: HTMLElement | null = null;
  private scrolledFor: HTMLElement | null = null;
  private stepStart = 0;
  private lastFocusStep = -1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private advanceTimer: ReturnType<typeof setTimeout> | null = null;
  private opener: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const s = this.tour.step();
      this.tour.index();
      untracked(() => this.onStepChange(s));
    });
  }

  private onStepChange(s: TourStep | null) {
    {
      this.ready.set(false);
      this.target = null; this.scrolledFor = null; this.stepStart = Date.now();
      if (s) {
        this.opener ??= document.activeElement as HTMLElement | null;
        this.zone.runOutsideAngular(() => {
          if (!this.timer) this.timer = setInterval(() => this.zone.run(() => this.measure()), POLL_MS);
        });
        queueMicrotask(() => this.measure());
      } else {
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        this.spot.set(null); this.lastFocusStep = -1;
        try { this.opener?.focus?.(); } catch { /* element gone */ }
        this.opener = null;
      }
    }
  }

  ngOnInit() {
    const sub = this.router.events.subscribe(() => { this.target = null; this.scrolledFor = null; queueMicrotask(() => this.measure()); });
    this.destroyRef.onDestroy(() => {
      sub.unsubscribe();
      if (this.timer) clearInterval(this.timer);
      if (this.advanceTimer) clearTimeout(this.advanceTimer);
    });
  }

  private vp() { return { width: window.innerWidth, height: window.innerHeight }; }

  private find(): HTMLElement | null {
    const s = this.tour.step();
    if (!s) return null;
    return resolveTarget<HTMLElement>(s, (q) => document.querySelector<HTMLElement>(q), (el) => {
      if (el.closest('.ion-page-hidden')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  measure() {
    const s = this.tour.step();
    if (!s) return;
    if (!this.target || !this.target.isConnected) this.target = this.find();
    const vp = this.vp();
    if (!this.target) {
      this.spot.set(null);
      if (Date.now() - this.stepStart > MISSING_GRACE_MS) this.ready.set(true);
    } else {
      let r = this.target.getBoundingClientRect();
      if (this.scrolledFor !== this.target) {
        this.scrolledFor = this.target;
        if (!isInViewport(r, vp)) {
          const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
          this.target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
          r = this.target.getBoundingClientRect();
        }
      }
      this.ready.set(true);
      this.spot.set(spotBox({ top: r.top, left: r.left, width: r.width, height: r.height }, vp));
    }
    const tip = this.tipEl()?.nativeElement;
    this.pos.set(placeTip(this.spot(), { width: tip?.offsetWidth ?? 352, height: tip?.offsetHeight ?? 180 }, vp));
    if (tip && this.lastFocusStep !== this.tour.index()) {
      this.lastFocusStep = this.tour.index();
      tip.querySelector<HTMLElement>('[data-testid="tour-next"]')?.focus();
    }
  }

  @HostListener('window:resize') @HostListener('window:orientationchange') onResize() { if (this.tour.active()) this.measure(); }
  @HostListener('window:scroll') onScroll() { if (this.tour.active()) this.measure(); }

  /** A click on the highlighted action (click mode) passes through to the page, then the tour advances. */
  @HostListener('document:click', ['$event'])
  onDocClick(e: Event) {
    const s = this.tour.step();
    if (!s || s.mode !== 'click' || !this.target) return;
    if (e.target instanceof Node && this.target.contains(e.target)) {
      if (this.advanceTimer) clearTimeout(this.advanceTimer);
      const idx = this.tour.index();
      this.advanceTimer = setTimeout(() => { if (this.tour.active() && this.tour.index() === idx) this.tour.next(); }, 450);
    }
  }

  onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.tour.skip(); return; }
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') { e.preventDefault(); this.tour.next(); return; }
    if (e.key === 'Tab') {
      const nodes = Array.from(this.tipEl()?.nativeElement.querySelectorAll<HTMLElement>('button') ?? []);
      if (!nodes.length) return;
      e.preventDefault();
      nodes[nextFocusIndex(nodes.indexOf(document.activeElement as HTMLElement), nodes.length, e.shiftKey)].focus();
    }
  }

  /** Keys typed while focus is outside the tooltip (e.g. the page behind the overlay) still reach the tour. */
  @HostListener('document:keydown', ['$event'])
  onDocKey(e: KeyboardEvent) {
    if (!this.tour.active()) return;
    const tip = this.tipEl()?.nativeElement;
    if (tip?.contains(e.target as Node)) return;
    if (e.key === 'Escape') { this.tour.skip(); return; }
    if (e.key === 'Tab') { e.preventDefault(); tip?.querySelector<HTMLElement>('[data-testid="tour-next"]')?.focus(); }
  }
}
