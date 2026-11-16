/** Pure step definitions/routes for the resume flow (no Angular imports, so Jest can test them). */
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
