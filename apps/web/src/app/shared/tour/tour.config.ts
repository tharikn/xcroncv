/**
 * Onboarding tour step list. Targets are `data-tour="<name>"` hooks; the first name that exists in the DOM wins,
 * so a step can fall back to a nav item when the page-level button is not on screen.
 * Hook names are owned by the gallery/stepper and editor features (step-*-action, editor-side-panel, resume-stepper); the nav-* hooks live in the shell.
 */
export interface TourStep {
  id: string;
  /** data-tour values, tried in order. */
  targets: string[];
  titleKey: string;
  bodyKey: string;
  /** 'click': the user is invited to press the highlighted control (the click passes through and advances). 'info': Next only. */
  mode: 'click' | 'info';
}

export const TOUR_STEPS: readonly TourStep[] = [
  { id: 'profile', targets: ['step-profile-action', 'nav-profile'], titleKey: 'tour.profile.title', bodyKey: 'tour.profile.body', mode: 'click' },
  { id: 'template', targets: ['step-template-action', 'nav-templates'], titleKey: 'tour.template.title', bodyKey: 'tour.template.body', mode: 'click' },
  { id: 'panel', targets: ['editor-side-panel'], titleKey: 'tour.panel.title', bodyKey: 'tour.panel.body', mode: 'info' },
  { id: 'canvas', targets: ['editor-canvas'], titleKey: 'tour.canvas.title', bodyKey: 'tour.canvas.body', mode: 'info' },
  { id: 'export', targets: ['step-export-action'], titleKey: 'tour.export.title', bodyKey: 'tour.export.body', mode: 'click' },
];

export const TOUR_KEY_PREFIX = 'xcroncv.tour.done.';
