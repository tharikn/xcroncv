import { stepRoute, STEPS } from '../shared/resume-steps';
import { FLOW_EN } from './i18n/flow-messages';
import { EN } from './i18n/en';

describe('resume flow stepper routes', () => {
  it('defines the four steps with stable tour hooks', () => {
    expect(STEPS.map((s) => s.tour)).toEqual(['stepper-step-profile', 'stepper-step-template', 'stepper-step-edit', 'stepper-step-export']);
  });
  it('routes steps; edit/export need a resume', () => {
    expect(stepRoute(1)).toEqual({ commands: ['/profile'] });
    expect(stepRoute(2)).toEqual({ commands: ['/templates'], query: undefined });
    expect(stepRoute(2, 'r1')).toEqual({ commands: ['/templates'], query: { resumeId: 'r1' } });
    expect(stepRoute(3)).toBeNull();
    expect(stepRoute(3, 'r1')).toEqual({ commands: ['/resumes', 'r1'] });
    expect(stepRoute(4, 'r1')).toEqual({ commands: ['/resumes', 'r1'], query: { step: 'export' } });
  });
  it('flow strings are merged into the English catalogue', () => {
    for (const k of Object.keys(FLOW_EN)) expect((EN as Record<string, string>)[k]).toBe((FLOW_EN as Record<string, string>)[k]);
  });
});
