import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { safeGet, safeSet } from '../../core/safe-storage';
import { TOUR_KEY_PREFIX, TOUR_STEPS, TourStep } from './tour.config';
import { TourFlow } from './tour.logic';

/**
 * First-time-only guided tour state. Completion is stored per user (token subject) in localStorage.
 * Note: the account preferences API only carries theme/locale today, so completion is device-local;
 * add a `tourDone` field there to sync across devices.
 */
@Injectable({ providedIn: 'root' })
export class TourService {
  private auth = inject(AuthService);
  private flow = new TourFlow(TOUR_STEPS.length, { get: (k) => safeGet('local', k), set: (k, v) => safeSet('local', k, v) },
    TOUR_KEY_PREFIX, () => this.auth.subject(), () => this.auth.isAuthenticated());
  private snap = signal(this.flow.snapshot());

  readonly steps: readonly TourStep[] = TOUR_STEPS;
  readonly active = computed(() => this.snap().active);
  readonly index = computed(() => this.snap().index);
  readonly step = computed(() => (this.active() ? this.steps[this.index()] ?? null : null));
  readonly isLast = computed(() => this.index() >= this.steps.length - 1);

  private sync() { this.snap.set(this.flow.snapshot()); }
  isDone(): boolean { return this.flow.isDone(); }
  /** Start automatically only if this user has never completed or skipped the tour. */
  maybeStart(): void { this.flow.maybeStart(); this.sync(); }
  /** Replay from Settings > Help; ignores the completion flag. */
  replay(): void { this.flow.replay(); this.sync(); }
  next(): void { this.flow.next(); this.sync(); }
  back(): void { this.flow.back(); this.sync(); }
  /** Skip and finish both mark the tour as seen so it never reappears on its own. */
  skip(): void { this.flow.skip(); this.sync(); }
  finish(): void { this.flow.finish(); this.sync(); }
}
