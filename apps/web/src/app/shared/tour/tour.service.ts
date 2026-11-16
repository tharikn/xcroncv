import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { safeGet, safeSet } from '../../core/safe-storage';
import { EDITOR_TOUR_KEY_PREFIX, TOUR_KEY_PREFIX, TourFlowId, TourStep, stepsFor } from './tour.config';
import { TourFlow, TourStore } from './tour.logic';

/**
 * Guided tour state. Two flows: 'main' (first sign-in) and 'editor' (edit-resume guide, first visit + replay any time).
 * Completion is stored per user (token subject) in localStorage. The preferences API only carries theme/locale,
 * so completion is device-local; add a `tourDone` field there to sync across devices.
 */
@Injectable({ providedIn: 'root' })
export class TourService {
  private auth = inject(AuthService);
  private store: TourStore = { get: (k) => safeGet('local', k), set: (k, v) => safeSet('local', k, v) };
  private flows: Record<TourFlowId, TourFlow> = {
    main: new TourFlow(stepsFor('main').length, this.store, TOUR_KEY_PREFIX, () => this.auth.subject(), () => this.auth.isAuthenticated()),
    editor: new TourFlow(stepsFor('editor').length, this.store, EDITOR_TOUR_KEY_PREFIX, () => this.auth.subject(), () => this.auth.isAuthenticated()),
  };
  private current = signal<TourFlowId>('main');
  private snap = signal({ active: false, index: 0 });

  readonly steps = computed<readonly TourStep[]>(() => stepsFor(this.current()));
  readonly active = computed(() => this.snap().active);
  readonly index = computed(() => this.snap().index);
  readonly step = computed(() => (this.active() ? this.steps()[this.index()] ?? null : null));
  readonly isLast = computed(() => this.index() >= this.steps().length - 1);

  private f() { return this.flows[this.current()]; }
  private sync() { const s = this.f().snapshot(); this.snap.set({ active: s.active, index: s.index }); }
  private use(id: TourFlowId) { this.current.set(id); }

  isDone(): boolean { return this.flows.main.isDone(); }
  isEditorDone(): boolean { return this.flows.editor.isDone(); }

  /** Start the first-sign-in tour only if this user has never completed or skipped it. */
  maybeStart(): void { if (this.active()) return; this.use('main'); this.f().maybeStart(); this.sync(); }
  /** Start the edit-resume guide on the user's first editor visit. */
  maybeStartEditor(): void { if (this.active()) return; this.use('editor'); this.f().maybeStart(); this.sync(); }
  /** Replay from Settings > Help. */
  replay(): void { this.use('main'); this.f().replay(); this.sync(); }
  /** The editor's Guide button: always available. */
  replayEditor(): void { this.use('editor'); this.f().replay(); this.sync(); }

  next(): void { this.f().next(); this.afterEnd(); }
  back(): void { this.f().back(); this.sync(); }
  /** Skip and finish both mark the flow as seen. Ending the main tour also marks the editor guide seen (the user has been guided). */
  skip(): void { this.finish(); }
  finish(): void { this.f().finish(); this.afterEnd(true); }

  private afterEnd(force = false) {
    if (this.current() === 'main' && (force || !this.f().active)) this.flows.editor.finish();
    this.sync();
  }
}
