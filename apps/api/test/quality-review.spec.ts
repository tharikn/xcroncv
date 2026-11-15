import { NotFoundException } from '@nestjs/common';
import { compareReviews, Finding, QUALITY_VERSION, reviewResume, runQualityRules, scoreFindings, QUALITY_DIMENSIONS } from '../src/quality-review/quality-engine';
import { QualityReviewService } from '../src/quality-review/quality-review.service';
import { AUTH, OTHER, deepFreeze, sampleModel } from './fixtures/resume-fixtures';
import { RenderModel } from '../src/render-model/render-model.types';
import { featureEnabled } from '../src/common/features';

const NOW = new Date('2026-06-01');
const rules = (m: RenderModel) => runQualityRules(m, NOW);
const has = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id);
const withExp = (bullets: string[], meta = 'Jan 2020 – Present', title = 'Engineer'): RenderModel => {
  const m = sampleModel();
  m.sections[1] = { type: 'experience', title: 'Experience', items: [{ title, subtitle: 'Acme', meta, bullets }] };
  return m;
};

describe('quality rules', () => {
  it('a clean resume has no warnings or criticals', () => {
    const r = reviewResume(sampleModel(), NOW);
    expect(r.counts.critical).toBe(0);
    expect(r.counts.warning).toBe(0);
    expect(r.readiness).toBe('ready');
  });
  it('flags repeated words, first person, weak phrases and lowercase starts with evidence locations', () => {
    const fs = rules(withExp(['I was responsible for the the billing system.', 'built dashboards for finance teams.']));
    expect(has(fs, 'WRITING.REPEATED_WORD')[0].evidence).toMatchObject({ section: 'experience', itemIndex: 0, field: 'bullets', bulletIndex: 0 });
    expect(has(fs, 'WRITING.FIRST_PERSON')).toHaveLength(1);
    expect(has(fs, 'WRITING.WEAK_PHRASE')).toHaveLength(1);
    expect(has(fs, 'WRITING.LOWERCASE_START')[0].evidence.bulletIndex).toBe(1);
  });
  it('flags present-tense verbs in finished roles only', () => {
    const ended = rules(withExp(['Manages a team of five.'], 'Jan 2018 – Dec 2019'));
    expect(has(ended, 'WRITING.TENSE_MISMATCH')).toHaveLength(1);
    const current = rules(withExp(['Manages a team of five.'], 'Jan 2018 – Present'));
    expect(has(current, 'WRITING.TENSE_MISMATCH')).toHaveLength(0);
  });
  it('flags unsupported superlatives and asks for confirmation of large figures', () => {
    const fs = rules(withExp(['Delivered world-class results.', 'Grew revenue by 900% in a year.']));
    expect(has(fs, 'CONTENT.SUPERLATIVE')[0].requiresUserConfirmation).toBe(true);
    expect(has(fs, 'CONTENT.CONFIRM_METRIC')).toHaveLength(1);
  });
  it('detects near-duplicate bullets and roles without detail', () => {
    const dup = rules(withExp(['Built payment APIs for merchants across Europe quickly.', 'Built payment APIs for merchants across Europe quickly!']));
    expect(has(dup, 'CONTENT.DUPLICATE_BULLET')).toHaveLength(1);
    const empty = rules(withExp([]));
    expect(has(empty, 'CONTENT.ROLE_NO_DETAIL')).toHaveLength(1);
  });
  it('reports skills listed without supporting work (info only)', () => {
    const f = has(rules(sampleModel()), 'CONTENT.SKILL_NO_EVIDENCE');
    expect(f.map((x) => x.evidence.text)).toContain('Kubernetes');
    expect(f.every((x) => x.severity === 'info')).toBe(true);
  });
  it('treats gaps neutrally and overlaps as information', () => {
    const m = sampleModel();
    (m.sections[1].items as { meta?: string }[])[1].meta = 'Jan 2014 – Dec 2016'; // overlaps? 2014-2016 vs 2020-present: gap
    const gap = has(rules(m), 'STRUCTURE.DATE_GAP');
    expect(gap).toHaveLength(1);
    expect(gap[0].severity).toBe('info');
    expect(gap[0].explanation).toMatch(/not a defect/i);
  });
  it('treats an end date before the start date as critical', () => {
    const fs = rules(withExp(['Did things for the company.'], 'Jan 2022 – Jan 2020'));
    expect(has(fs, 'STRUCTURE.DATE_ORDER')[0].severity).toBe('critical');
  });
  it('flags mixed date formats and inconsistent technology spelling', () => {
    const m = withExp(['Built services in Javascript and JavaScript.']);
    m.sections[1].items!.push({ title: 'Dev', subtitle: 'Old', meta: '2016-01 - 2018-01', bullets: ['Wrote code for the old platform daily.'] });
    const fs = rules(m);
    expect(has(fs, 'CONSISTENCY.DATE_FORMAT')).toHaveLength(1);
    expect(has(fs, 'CONSISTENCY.TECH_SPELLING')[0].evidence.text).toMatch(/Javascript/);
  });
  it('flags missing contact data and malformed links', () => {
    const m = sampleModel({ header: { name: 'Ada', contacts: ['London'], links: [{ label: 'x', url: 'ht tp://bad' }] } });
    const fs = rules(m);
    expect(has(fs, 'STRUCTURE.NO_EMAIL')).toHaveLength(1);
    expect(has(fs, 'EXPORT.LINK_MALFORMED')).toHaveLength(1);
  });
  it('warns when text contains characters the PDF font cannot draw', () => {
    const fs = rules(withExp(['Built systems for 北京 customers daily and weekly.']));
    expect(has(fs, 'EXPORT.GLYPH_RISK')).toHaveLength(1);
  });
  it('an empty resume is a critical export failure', () => {
    const r = reviewResume(sampleModel({ sections: [], header: { name: 'Ada', contacts: [], links: [] } }), NOW);
    expect(has(r.findings, 'EXPORT.NO_CONTENT')[0].severity).toBe('critical');
    expect(r.readiness).toBe('needs_attention');
  });
  it('gives every finding a stable id, rule version, evidence and recommendation', () => {
    const a = reviewResume(withExp(['I helped with reports.']), NOW).findings;
    const b = reviewResume(withExp(['I helped with reports.']), NOW).findings;
    expect(a.map((f) => f.id)).toEqual(b.map((f) => f.id));
    expect(a.every((f) => f.ruleVersion && f.recommendation && f.evidence.section && f.source)).toBe(true);
    expect(new Set(a.map((f) => f.id)).size).toBe(a.length);
  });
  it('never mutates the resume it reviews', () => {
    expect(() => reviewResume(deepFreeze(sampleModel()), NOW)).not.toThrow();
  });
});

describe('quality scoring', () => {
  it('weights sum to 100', () => { expect(QUALITY_DIMENSIONS.reduce((a, d) => a + d.weight, 0)).toBe(100); });
  it('records the scoring version and is deterministic', () => {
    const a = reviewResume(sampleModel(), NOW); const b = reviewResume(sampleModel(), NOW);
    expect(a.scoringVersion).toBe(QUALITY_VERSION);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('excludes dimensions that cannot be evaluated and renormalises the rest, disclosing it', () => {
    const m = sampleModel({ sections: [{ type: 'skills', title: 'Skills', items: [{ tags: ['TypeScript'] }] }] });
    const s = scoreFindings(m, []);
    expect(s.dimensions.find((d) => d.id === 'writing')!.applicable).toBe(false);
    expect(s.dimensions.find((d) => d.id === 'content')!.applicable).toBe(false);
    expect(s.dimensions.filter((d) => d.applicable).reduce((a, d) => a + d.effectiveWeight, 0)).toBeCloseTo(100, 0);
    expect(s.coverage.limitations.join(' ')).toMatch(/redistributed/);
    expect(s.coverage.dimensionsApplicable).toBeLessThan(s.coverage.dimensionsTotal);
  });
  it('caps repeated deductions per rule so one issue cannot zero a dimension', () => {
    const lots = Array.from({ length: 12 }, (_, i) => `i helped with task number ${i} for the team.`);
    const r = reviewResume(withExp(lots), NOW);
    expect(r.dimensions.find((d) => d.id === 'writing')!.score).toBeGreaterThanOrEqual(60);
  });
  it('shows a readiness warning for a critical defect even when the numeric score is high', () => {
    const m = withExp(['Led the platform rebuild and cut deploy time by 60%.', 'Built APIs serving 2M requests per day.', 'Mentored four engineers.'], 'Jan 2022 – Jan 2020');
    const r = reviewResume(m, NOW);
    expect(r.counts.critical).toBeGreaterThan(0);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.readiness).toBe('needs_attention');
  });
  it('is explicitly not a job match or ATS score', () => {
    expect(reviewResume(sampleModel(), NOW).disclaimer).toMatch(/not a job match score/i);
  });
});

describe('regression comparison', () => {
  const f = (id: string, severity: Finding['severity'] = 'warning'): Finding => ({ id, ruleId: 'X.' + id, ruleVersion: '1', category: 'content', severity, title: id, explanation: '', evidence: { section: 's' }, recommendation: '', confidence: 1, source: 'deterministic_rule', requiresUserConfirmation: false });
  it('lists new and resolved findings with the score delta', () => {
    const c = compareReviews({ id: 'p', score: 80, scoringVersion: '1.0.0', findings: [f('a'), f('b')] }, { score: 70, scoringVersion: '1.0.0', findings: [f('b'), f('c')] });
    expect(c.scoreDelta).toBe(-10);
    expect(c.newFindings.map((x) => x.id)).toEqual(['c']);
    expect(c.resolvedFindings.map((x) => x.id)).toEqual(['a']);
    expect(c.message).toMatch(/Down 10 points/);
  });
  it('does not diff scores across scoring versions', () => {
    const c = compareReviews({ id: 'p', score: 80, scoringVersion: '0.9.0', findings: [] }, { score: 70, scoringVersion: '1.0.0', findings: [] });
    expect(c.scoreDelta).toBeNull();
    expect(c.scoringVersionChanged).toBe(true);
    expect(c.message).toMatch(/not compared/);
  });
});

describe('QualityReviewService', () => {
  const mk = (previous: unknown = null) => {
    const prisma: any = { qualityReview: {
      findFirst: jest.fn().mockResolvedValue(previous), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(),
      create: jest.fn(async ({ data }: any) => ({ id: 'q-new', createdAt: new Date(), ...data })),
    } };
    const resumes: any = { get: jest.fn().mockResolvedValue({ id: 'r1' }) };
    const source: any = { load: jest.fn().mockResolvedValue({ resumeId: 'r1', name: 'CV', model: sampleModel(), versionId: null, versionNumber: null, hash: 'h1' }) };
    return { svc: new QualityReviewService(prisma, resumes, source), prisma, source, resumes };
  };
  it('stores the report under tenant and owner and returns a comparison to the previous review', async () => {
    const prev = { id: 'q-old', score: 10, scoringVersion: QUALITY_VERSION, findings: [] };
    const { svc, prisma } = mk(prev);
    const out: any = await svc.run(AUTH, 'r1');
    expect(prisma.qualityReview.findFirst.mock.calls[0][0].where).toEqual({ resumeId: 'r1', tenantId: 't1', userId: 'u1' });
    expect(prisma.qualityReview.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', userId: 'u1', resumeId: 'r1', scoringVersion: QUALITY_VERSION, resumeContentHash: 'h1' });
    expect(out.comparison.previousId).toBe('q-old');
    expect(out.score).toBeGreaterThan(10);
    expect(out.disclaimer).toBeDefined();
  });
  it('has no comparison on the first review and keeps the quality score separate (no match fields)', async () => {
    const { svc } = mk(null);
    const out: any = await svc.run(AUTH, 'r1');
    expect(out.comparison).toBeNull();
    expect(Object.keys(out)).not.toEqual(expect.arrayContaining(['totalScore', 'items']));
  });
  it('scopes get/delete/list by tenant and owner; 404 does not disclose', async () => {
    const { svc, prisma, resumes } = mk();
    await expect(svc.get(OTHER, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.qualityReview.findFirst.mock.calls[0][0].where).toEqual({ id: 'x', tenantId: 't2', userId: 'u2' });
    await expect(svc.remove(OTHER, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.qualityReview.delete).not.toHaveBeenCalled();
    await svc.list(AUTH, 'r1');
    expect(resumes.get).toHaveBeenCalledWith(AUTH, 'r1');
    expect(prisma.qualityReview.findMany.mock.calls[0][0].where).toEqual({ resumeId: 'r1', tenantId: 't1', userId: 'u1' });
  });
  it('can be disabled by feature flag', () => {
    expect(featureEnabled('quality-review', 'quality-review')).toBe(false);
  });
});

describe('real PDF/DOCX extraction checks', () => {
  const { checkExtraction } = require('../src/quality-review/export-check');
  const mkSvc = (model: RenderModel) => {
    const prisma: any = { qualityReview: { create: jest.fn() } };
    const source: any = { load: jest.fn().mockResolvedValue({ resumeId: 'r1', name: 'CV', model, versionId: null, versionNumber: 3, hash: 'h' }) };
    return { svc: new QualityReviewService(prisma, { get: jest.fn() } as any, source), prisma, source };
  };
  it('generates PDF and DOCX in memory, reads them back and finds the content intact', async () => {
    const { svc, prisma, source } = mkSvc(sampleModel());
    const out: any = await svc.exportCheck(AUTH, 'r1');
    expect(source.load).toHaveBeenCalledWith(AUTH, 'r1', undefined);
    expect(out.checks.map((c: any) => c.format)).toEqual(['pdf', 'docx']);
    for (const c of out.checks) {
      expect(c.wordCoverage).toBeGreaterThanOrEqual(0.95);
      expect(c.replacementChars).toBe(0);
      expect(c.readingOrderOk).not.toBe(false);
    }
    expect(out.checks[0].pages).toBeGreaterThanOrEqual(1);
    expect(out.note).toMatch(/not an employer ATS/);
    expect(prisma.qualityReview.create).not.toHaveBeenCalled(); // nothing is persisted and the quality score is untouched
    expect(JSON.stringify(out)).not.toMatch(/"score"/);
  }, 60_000);
  it('reports coverage loss, scrambled order and encoding damage when extraction is poor', () => {
    const m = sampleModel();
    const lossy = checkExtraction(m, 'pdf', ['Experience', 'only some words survive'], 1);
    expect(lossy.ok).toBe(false);
    expect(lossy.wordCoverage).toBeLessThan(0.5);
    expect(lossy.findings.map((f: any) => f.id)).toEqual(expect.arrayContaining(['EXTRACT.PDF.COVERAGE', 'EXTRACT.PDF.READING_ORDER']));
    const bad = checkExtraction(m, 'docx', [`�� ${m.header.name}`], null);
    expect(bad.findings.some((f: any) => f.id === 'EXTRACT.DOCX.ENCODING')).toBe(true);
    const ordered = checkExtraction(m, 'docx', [m.header.name, ...m.sections.map((s) => s.title)], null);
    expect(ordered.readingOrderOk).toBe(true);
  });
});
