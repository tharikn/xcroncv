import { Component, Input, inject } from '@angular/core';
import { registerFlowIcons } from '../core/flow.icons';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '../core/i18n/translate.pipe';

export type StepId = 1 | 2 | 3 | 4;
export interface StepDef { id: StepId; key: string; tour: string }

/** The four resume-creation steps. `tour` values are stable `data-tour` hooks for the guided tour. */
export const STEPS: readonly StepDef[] = [
  { id: 1, key: 'stepper.profile', tour: 'stepper-step-profile' },
  { id: 2, key: 'stepper.template', tour: 'stepper-step-template' },
  { id: 3, key: 'stepper.edit', tour: 'stepper-step-edit' },
  { id: 4, key: 'stepper.export', tour: 'stepper-step-export' },
];

/** Where each step lives. Steps 3 and 4 need a resume; step 4 is the editor's export step. */
export function stepRoute(step: StepId, resumeId?: string | null): { commands: string[]; query?: Record<string, string> } | null {
  if (step === 1) return { commands: ['/profile'] };
  if (step === 2) return { commands: ['/templates'], query: resumeId ? { resumeId } : undefined };
  if (!resumeId) return null;
  return step === 3 ? { commands: ['/resumes', resumeId] } : { commands: ['/resumes', resumeId], query: { step: 'export' } };
}

/**
 * Reusable progress bar for the resume flow (web, mobile browser and Android share it).
 * Completed steps (and any step up to `reached`) are tappable; compact on narrow screens (numbers, current label only).
 */
@Component({
  selector: 'app-resume-stepper',
  standalone: true,
  imports: [IonIcon, TranslatePipe],
  template: `
    <nav class="stepper" data-tour="resume-stepper" [attr.aria-label]="'stepper.aria' | t">
      <ol>
        @for (s of steps; track s.id) {
          <li [class.current]="s.id === current" [class.done]="s.id < current">
            <button type="button" class="step" [attr.data-tour]="s.tour" [attr.data-testid]="'step-' + s.id"
                    [attr.aria-current]="s.id === current ? 'step' : null" [disabled]="!canGo(s.id)" (click)="go(s.id)">
              <span class="dot" aria-hidden="true">@if (s.id < current) { <ion-icon name="checkmark-outline"></ion-icon> } @else { {{ s.id }} }</span>
              <span class="lbl">{{ s.key | t }}</span>
            </button>
          </li>
        }
      </ol>
    </nav>
  `,
  styles: [`
    .stepper ol { display: flex; list-style: none; margin: 0 0 var(--space-4); padding: 0; gap: var(--space-1); }
    .stepper li { flex: 1 1 0; min-width: 0; display: flex; align-items: center; }
    .stepper li:not(:last-child)::after { content: ''; flex: 1 1 auto; height: 2px; background: var(--c-border); margin: 0 var(--space-1); min-width: 0.5rem; }
    .stepper li.done:not(:last-child)::after { background: var(--c-primary); }
    .step { display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--control-min-height); min-width: var(--control-min-height); padding: 0 var(--space-2); background: transparent; border: 0; border-radius: var(--radius); color: var(--c-muted); font: inherit; font-weight: 600; cursor: pointer; justify-content: center; }
    .step:disabled { cursor: default; opacity: 0.7; }
    .step:focus-visible { outline: 2px solid var(--c-focus); outline-offset: 2px; }
    .dot { display: inline-flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem; border-radius: 50%; border: 2px solid var(--c-border); background: var(--c-bg); color: var(--c-muted); font-size: 0.85rem; flex: none; }
    li.current .dot { border-color: var(--c-primary); background: var(--c-primary); color: var(--c-primary-text); }
    li.done .dot { border-color: var(--c-primary); color: var(--c-primary); }
    li.current .step { color: var(--c-text); }
    .lbl { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    @media (max-width: 40rem) {
      /* visually hidden (not display:none) so each compact step keeps its accessible name */
      .stepper li:not(.current) .lbl { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
      .stepper li.current { flex: 2 1 0; }
    }
  `],
})
export class ResumeStepperComponent {
  readonly steps = STEPS;
  constructor() { registerFlowIcons(); }
  private router = inject(Router);
  /** Plain fields (not signals): inputs are set during template binding, where signal writes are not allowed. */
  @Input({ required: true }) current: StepId = 1;
  /** Highest step the user may jump to (defaults to the current step). */
  @Input() reached = 0;
  @Input() set resumeId(v: string | null | undefined) { this._resumeId = v ?? null; }
  private _resumeId: string | null = null;

  canGo(step: StepId) {
    return step !== this.current && step <= Math.max(this.current, this.reached) && !!stepRoute(step, this._resumeId);
  }
  go(step: StepId) {
    const r = stepRoute(step, this._resumeId);
    if (!r || !this.canGo(step)) return;
    void this.router.navigate(r.commands, r.query ? { queryParams: r.query } : undefined);
  }
}
