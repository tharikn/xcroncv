import { NotFoundException } from '@nestjs/common';
import { buildProjection, scrub } from '../src/recruiter-view/recruiter-projection';
import { RecruiterViewService } from '../src/recruiter-view/recruiter-view.service';
import { runQualityRules } from '../src/quality-review/quality-engine';
import { AUTH, OTHER, deepFreeze, sampleModel } from './fixtures/resume-fixtures';
import { featureEnabled } from '../src/common/features';

const NOW = new Date('2026-06-01');
const manyRoles = () => {
  const m = sampleModel();
  m.sections[1].items = Array.from({ length: 5 }, (_, i) => ({ title: `Engineer ${i}`, subtitle: `Co ${i}`, meta: `Jan ${2010 + i} – Dec ${2011 + i}`, bullets: ['One did something.', 'Two did another thing.', 'Three shipped it 40% faster.', 'Four kept the lights on.', 'Five wrote docs for others.'] }));
  m.sections[2].items = [{ tags: Array.from({ length: 20 }, (_, i) => `Skill${i}`) }];
  return m;
};
const proj = (m = sampleModel(), o: Partial<Parameters<typeof buildProjection>[1]> = {}) => buildProjection(m, { mode: 'full', anonymize: false, now: NOW, ...o });

describe('recruiter projection', () => {
  it('is read-only: never mutates its input and is marked readOnly', () => {
    const frozen = deepFreeze(manyRoles());
    expect(() => proj(frozen, { mode: 'quick', anonymize: true, annotations: runQualityRules(frozen, NOW) })).not.toThrow();
    expect(proj().readOnly).toBe(true);
  });
  it('full mode shows all content with nothing hidden', () => {
    const p = proj(manyRoles(), { mode: 'full' });
    const exp = p.sections.find((s) => s.type === 'experience')!;
    expect(exp.items).toHaveLength(5);
    expect(exp.items.every((i) => !i.collapsed && i.bullets.length === 5)).toBe(true);
    expect(p.sections.find((s) => s.type === 'skills')!.items[0].tags).toHaveLength(20);
    expect(p.collapsedSummary).toMatchObject({ hiddenItems: 0, hiddenBullets: 0, hiddenTags: 0 });
    expect(p.collapsedSummary.message).toMatch(/nothing is hidden/i);
  });
  it('quick scan collapses but always says what it collapsed', () => {
    const p = proj(manyRoles(), { mode: 'quick' });
    const exp = p.sections.find((s) => s.type === 'experience')!;
    expect(exp.items.filter((i) => !i.collapsed)).toHaveLength(3);
    expect(exp.items[0].bullets).toHaveLength(3);
    expect(exp.items[0].hiddenBullets).toBe(2);
    expect(exp.hiddenItems).toBe(2);
    expect(exp.totalItems).toBe(5);
    expect(p.sections.find((s) => s.type === 'skills')!.items[0].hiddenTags).toBe(8);
    expect(p.collapsedSummary.message).toMatch(/Quick scan collapsed 2 entries/);
    // Titles of collapsed entries stay visible: nothing is silently dropped.
    expect(exp.items[4].title).toBe('Engineer 4');
  });
  it('highlights bullets with figures and target-role keywords without reordering the source', () => {
    const p = proj(manyRoles(), { mode: 'full', keywords: ['docs'] });
    const b = p.sections.find((s) => s.type === 'experience')!.items[0].bullets;
    expect(b.map((x) => x.text)).toEqual(['One did something.', 'Two did another thing.', 'Three shipped it 40% faster.', 'Four kept the lights on.', 'Five wrote docs for others.']);
    expect(b[2].highlight).toBe(true);
    expect(b[4]).toMatchObject({ highlight: true, matched: ['docs'] });
    expect(b[0].highlight).toBe(false);
  });
  it('builds an overview from stated facts only', () => {
    const p = proj();
    expect(p.overview).toMatchObject({ currentRole: 'Senior Backend Engineer', roleCount: 2, statedLevel: 'senior' });
    expect(p.overview.statedExperienceYears).toBeGreaterThan(9);
    const undated = sampleModel(); (undated.sections[1].items as { meta?: string }[]).forEach((i) => { i.meta = undefined; });
    expect(proj(undated).overview.statedExperienceYears).toBeNull();
    expect(proj(undated).overview.note).toMatch(/no explicit dates/);
  });
  it('anonymisation masks contact details, links and contacts embedded in text', () => {
    const m = sampleModel();
    m.sections[0] = { type: 'summary', title: 'Summary', text: 'Reach me at ada@example.com or +44 20 7946 0000 or https://ada.dev/cv.' };
    const p = proj(m, { anonymize: true });
    const text = JSON.stringify(p);
    expect(p.anonymized).toBe(true);
    expect(text).not.toMatch(/ada@example\.com|7946|ada\.dev/);
    expect(p.contacts).toEqual(['[email hidden]', '[phone hidden]', '[location hidden]']);
    expect(p.links).toEqual([{ label: 'Site' }]);
    expect(p.identity.name).toBe('Ada Lovelace');
    expect(proj(m, { anonymize: false }).contacts).toContain('ada@example.com');
  });
  it('scrub keeps date ranges and years intact', () => {
    expect(scrub('Worked 2019-2021 and 2020-01 to 2021-03, call 07700 900123')).toBe('Worked 2019-2021 and 2020-01 to 2021-03, call [phone hidden]');
  });
  it('annotations link to quality-review findings by id and add no score', () => {
    const m = sampleModel(); (m.sections[1].items as { bullets: string[] }[])[0].bullets.push('I was responsible for tooling.');
    const findings = runQualityRules(m, NOW);
    const p = proj(m, { annotations: findings });
    const a = p.annotations.find((x) => x.ruleId === 'WRITING.FIRST_PERSON')!;
    expect(findings.map((f) => f.id)).toContain(a.id);
    expect(p.sections.find((s) => s.type === 'experience')!.items[0].annotationIds).toContain(a.id);
    expect(JSON.stringify(p)).not.toMatch(/"score"|totalScore/);
    expect(proj(m).annotations).toEqual([]); // hidden unless requested
  });
  it('does not leak annotation evidence text when anonymised', () => {
    const m = sampleModel(); (m.sections[1].items as { bullets: string[] }[])[0].bullets.push('I mailed ada@example.com the report.');
    const p = proj(m, { anonymize: true, annotations: runQualityRules(m, NOW) });
    expect(JSON.stringify(p)).not.toContain('ada@example.com');
    expect(p.annotations.every((a) => a.text === undefined)).toBe(true);
  });
});

describe('RecruiterViewService', () => {
  const mk = () => {
    const source: any = { load: jest.fn(async (_u: unknown, id: string) => { if (id === 'nope') throw new NotFoundException('Resume not found'); return { resumeId: id, name: 'CV', targetRole: 'Backend Engineer', model: sampleModel(), versionId: 'v1', versionNumber: 3, hash: 'h' }; }) };
    return { svc: new RecruiterViewService(source), source };
  };
  it('defaults to quick mode, not anonymised, no annotations, and uses the owner-checked source', async () => {
    const { svc, source } = mk();
    const out = await svc.view(AUTH, 'r1', {});
    expect(source.load).toHaveBeenCalledWith(AUTH, 'r1', undefined);
    expect(out).toMatchObject({ mode: 'quick', anonymized: false, annotations: [], resume: { id: 'r1', versionNumber: 3 } });
    expect(out.identity.targetRole).toBe('Backend Engineer');
  });
  it('passes the chosen version through and refuses other users resumes with 404', async () => {
    const { svc, source } = mk();
    await svc.view(AUTH, 'r1', { versionId: 'v9', mode: 'full', annotations: true });
    expect(source.load).toHaveBeenCalledWith(AUTH, 'r1', 'v9');
    await expect(svc.view(OTHER, 'nope', {})).rejects.toBeInstanceOf(NotFoundException);
  });
  it('has no write dependencies: the service only needs the resume source', () => {
    expect(RecruiterViewService.length).toBe(1);
  });
  it('can be disabled by feature flag', () => {
    expect(featureEnabled('recruiter-view', 'x,recruiter-view')).toBe(false);
  });
});
