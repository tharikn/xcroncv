/**
 * Onboarding tour step list. Targets are `data-tour="<name>"` hooks; the first name that exists in the DOM wins,
 * so a step can fall back to a nav item when the page-level button is not on screen.
 * Hook names are owned by the gallery/stepper and editor features (step-*-action, editor-side-panel, ve-*); the nav-* hooks live in the shell.
 *
 * Two flows share one step list:
 *  - 'main'   : first sign-in walkthrough (profile -> template -> editing -> export).
 *  - 'editor' : the edit-resume guide only. Shown on the first visit to the editor and from the editor's "Guide" button, any time.
 */
export type TourPage = 'profile' | 'templates' | 'editor' | 'export';
export type TourFlowId = 'main' | 'editor';

export interface TourStep {
  id: string;
  page: TourPage;
  flows: readonly TourFlowId[];
  /** data-tour values, tried in order. */
  targets: string[];
  titleKey: string;
  bodyKey: string;
  /** 'click': the user is invited to press the highlighted control (the click passes through and advances). 'info': Next only. */
  mode: 'click' | 'info';
}

const BOTH = ['main', 'editor'] as const;

export const TOUR_STEPS: readonly TourStep[] = [
  { id: 'import', page: 'profile', flows: ['main'], targets: ['import-resume-action'], titleKey: 'tour.import.title', bodyKey: 'tour.import.body', mode: 'info' },
  { id: 'profile', page: 'profile', flows: ['main'], targets: ['step-profile-action', 'nav-profile'], titleKey: 'tour.profile.title', bodyKey: 'tour.profile.body', mode: 'click' },
  { id: 'template', page: 'templates', flows: ['main'], targets: ['step-template-action', 'nav-templates'], titleKey: 'tour.template.title', bodyKey: 'tour.template.body', mode: 'click' },
  // Editing text mirrors the visual editor: click selects, a second click or Enter edits in place, a floating toolbar formats.
  { id: 'canvas', page: 'editor', flows: BOTH, targets: ['ve-canvas', 'editor-canvas'], titleKey: 'tour.canvas.title', bodyKey: 'tour.canvas.body', mode: 'info' },
  { id: 'bar', page: 'editor', flows: BOTH, targets: ['editor-bar', 've-bar'], titleKey: 'tour.bar.title', bodyKey: 'tour.bar.body', mode: 'info' },
  { id: 'outline', page: 'editor', flows: BOTH, targets: ['editor-sections-btn', 've-outline-btn'], titleKey: 'tour.outline.title', bodyKey: 'tour.outline.body', mode: 'info' },
  { id: 'rearrange', page: 'editor', flows: BOTH, targets: ['editor-rearrange-btn', 've-rearrange-open'], titleKey: 'tour.rearrange.title', bodyKey: 'tour.rearrange.body', mode: 'info' },
  { id: 'panel', page: 'editor', flows: BOTH, targets: ['editor-side-panel'], titleKey: 'tour.panel.title', bodyKey: 'tour.panel.body', mode: 'info' },
  { id: 'quality', page: 'editor', flows: BOTH, targets: ['editor-quality-btn'], titleKey: 'tour.quality.title', bodyKey: 'tour.quality.body', mode: 'info' },
  { id: 'version', page: 'editor', flows: BOTH, targets: ['editor-save-version', 've-save-version'], titleKey: 'tour.version.title', bodyKey: 'tour.version.body', mode: 'info' },
  { id: 'continue', page: 'editor', flows: BOTH, targets: ['step-edit-action'], titleKey: 'tour.continue.title', bodyKey: 'tour.continue.body', mode: 'info' },
  { id: 'export', page: 'export', flows: ['main'], targets: ['step-export-action'], titleKey: 'tour.export.title', bodyKey: 'tour.export.body', mode: 'click' },
];

export function stepsFor(flow: TourFlowId): readonly TourStep[] { return TOUR_STEPS.filter((s) => s.flows.includes(flow)); }

export const TOUR_KEY_PREFIX = 'xcroncv.tour.done.';
export const EDITOR_TOUR_KEY_PREFIX = 'xcroncv.tour.editor.done.';
