import { JdResumeGeneratorService } from '../src/jd-resume-generator/jd-resume-generator.service';
import { JdAnalysis } from '../src/resume-match/jd-analyzer';

/** The 2-step generator UI sends no job title, so `dto.jobTitle` is undefined in these cases. */
const service = new JdResumeGeneratorService({ get: jest.fn() } as any, null);

const ruleSummary = (jdAnalysis: JdAnalysis, dto: Record<string, unknown> = {}) =>
  (service as any).ruleSummary(
    { fullName: 'Ada Lovelace', experiences: [{}, {}] } as any,
    jdAnalysis,
    { jdText: 'x'.repeat(60), ...dto } as any,
    [],
  );

const jd = (overrides: Partial<JdAnalysis> = {}): JdAnalysis => ({
  requirements: [],
  warnings: [],
  ...overrides,
});

describe('JdResumeGeneratorService.ruleSummary', () => {
  it('does not repeat the level when the inferred title already states it', () => {
    const summary = ruleSummary(jd({ seniority: 'senior', detectedTitle: 'Senior Frontend Engineer' }));
    expect(summary).not.toMatch(/senior-level/i);
    expect(summary.startsWith('Senior Frontend Engineer')).toBe(true);
  });

  it('prefixes seniority when the title carries no level', () => {
    const summary = ruleSummary(jd({ seniority: 'senior', detectedTitle: 'Frontend Engineer' }));
    expect(summary.startsWith('senior-level Frontend Engineer')).toBe(true);
  });

  it('prefers an explicit job title over the inferred one', () => {
    const summary = ruleSummary(jd({ seniority: 'lead', detectedTitle: 'Engineer' }), { jobTitle: 'Staff Engineer' });
    expect(summary.startsWith('Staff Engineer')).toBe(true);
    expect(summary).not.toMatch(/lead-level/i);
  });

  it('keeps the deterministic skill and experience clauses', () => {
    const summary = ruleSummary(
      jd({
        seniority: 'senior',
        detectedTitle: 'Backend Engineer',
        requirements: [
          {
            id: 'r1',
            type: 'required_skill',
            label: 'Node.js',
            sourceText: 'Node.js',
            confidence: 0.9,
            included: true,
            origin: 'EXTRACTED',
          },
        ],
      }),
      { company: 'Acme' },
    );
    expect(summary).toContain('with 2 roles');
    expect(summary).toContain('Core competencies include: Node.js.');
    expect(summary).toContain('Eager to contribute to Acme.');
  });
});
