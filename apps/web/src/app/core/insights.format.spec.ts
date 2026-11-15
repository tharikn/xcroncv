import { deltaText, evidenceLocation, findingLocation, groupRequirements, includedCount, newRequirement, reportToText, scoreBand, toRequirementInput } from './insights.format';
import { Finding, Requirement } from './insights.api';

const req = (over: Partial<Requirement> = {}): Requirement => ({ id: 'r1', type: 'required_skill', label: 'NestJS', normalized: 'nestjs', sourceText: 'src', confidence: 0.9, included: true, origin: 'EXTRACTED', ...over });

describe('insights formatting', () => {
  it('scoreBand groups scores visually without implying probability', () => {
    expect([scoreBand(90), scoreBand(60), scoreBand(20)]).toEqual(['strong', 'fair', 'weak']);
  });
  it('describes evidence locations', () => {
    expect(evidenceLocation({ section: 'experience', itemIndex: 0, itemTitle: 'Engineer', field: 'bullets', bulletIndex: 1, excerpt: 'x' })).toBe('Experience: Engineer, bullet 2');
    expect(evidenceLocation({ section: 'skills', itemIndex: 0, field: 'tags', excerpt: 'x' })).toBe('Skills');
    const f = { evidence: { section: 'summary' } } as Finding;
    expect(findingLocation(f)).toBe('Summary');
  });
  it('toRequirementInput sends only fields the API accepts (no normalized/degreeLevel/unknown props)', () => {
    const out = toRequirementInput(req({ normalized: 'nestjs', degreeLevel: 2 })) as unknown as Record<string, unknown>;
    expect(out['normalized']).toBeUndefined();
    expect(out['degreeLevel']).toBeUndefined();
    expect(out['label']).toBe('NestJS');
  });
  it('groups requirements in a stable order and hides empty groups', () => {
    const groups = groupRequirements([req({ id: 'a', type: 'responsibility' }), req({ id: 'b' }), req({ id: 'c', type: 'preferred_skill' })]);
    expect(groups.map((g) => g.type)).toEqual(['required_skill', 'preferred_skill', 'responsibility']);
  });
  it('newRequirement is user-origin, included, with full confidence', () => {
    const r = newRequirement('required_skill', '  Rust ');
    expect(r).toMatchObject({ label: 'Rust', origin: 'USER', included: true, confidence: 1 });
  });
  it('counts included requirements', () => {
    expect(includedCount([req(), req({ id: 'x', included: false })])).toBe(1);
  });
  it('deltaText handles null, zero and signs', () => {
    expect([deltaText(null), deltaText(0), deltaText(5), deltaText(-3)]).toEqual(['not comparable', 'no change', '+5', '-3']);
  });
  it('reportToText includes the disclaimer and no document content beyond labels', () => {
    const t = reportToText({ job: { title: 'Dev', company: 'Acme' }, totalScore: 70, resumeName: 'CV', resumeVersionNumber: null, summary: { strong: ['A'], partial: [], related: [], missing: ['B'], nextActions: ['B: add if true'], disclaimer: 'Not a hiring probability.' } });
    expect(t).toContain('Match score: 70 / 100');
    expect(t).toContain('working draft');
    expect(t).toContain('Not found in this resume');
    expect(t).toContain('Not a hiring probability.');
  });
});
