import { NotFoundException } from '@nestjs/common';
import { analyse, mergeMilestones, mentions, ProfileEvidence, suggestMilestones, summarise } from '../src/readiness/readiness-logic';
import { ReadinessService, toEvidence } from '../src/readiness/readiness.service';

const profile: ProfileEvidence = {
  experiences: [{ id: 'e1', label: 'Engineer at Acme', text: 'Engineer\nBuilt REST APIs in NestJS and TypeScript\nOperated PostgreSQL in production' }],
  projects: [{ id: 'p1', label: 'Side app', text: 'Side app\nA small Docker based service' }],
  certifications: [{ id: 'c1', label: 'AWS Cloud Practitioner' }],
  skills: [{ id: 's1', name: 'Kubernetes' }, { id: 's2', name: 'NestJS' }],
};

describe('readiness logic', () => {
  it('matches whole terms, including symbol names, case-insensitively', () => {
    expect(mentions('Wrote C++ and C# code', 'c++')).toBe(true);
    expect(mentions('Wrote C++ code', 'c')).toBe(false);
    expect(mentions('uses Node.js daily', 'node.js')).toBe(true);
    expect(mentions('JavaScript only', 'java')).toBe(false);
  });

  it('assigns the strongest kind of recorded evidence and keeps sources', () => {
    const a = analyse(profile, [
      { name: 'NestJS', importance: 'required' }, { name: 'Docker', importance: 'required' }, { name: 'AWS', importance: 'preferred' },
      { name: 'Kubernetes', importance: 'required' }, { name: 'Rust', importance: 'preferred' },
    ]);
    const by = Object.fromEntries(a.map((x) => [x.skill, x]));
    expect(by['NestJS'].level).toBe('DEMONSTRATED'); // experience beats the listed skill
    expect(by['NestJS'].sources.map((s) => s.type)).toEqual(['EXPERIENCE', 'SKILL']);
    expect(by['Docker'].level).toBe('PROJECT');
    expect(by['AWS'].level).toBe('CERTIFICATION');
    expect(by['Kubernetes'].level).toBe('SELF_REPORTED');
    expect(by['Rust'].level).toBe('NONE');
  });

  it('phrases gaps as missing recorded evidence and never as lacking the skill', () => {
    const [rust] = analyse(profile, [{ name: 'Rust', importance: 'required' }]);
    expect(rust.statement).toMatch(/No recorded evidence/);
    expect(rust.statement).toMatch(/does not mean you lack it/);
  });

  it('links transferable skills to their source experience', () => {
    const [mysql] = analyse(profile, [{ name: 'MySQL', importance: 'required' }]);
    expect(mysql.level).toBe('NONE');
    expect(mysql.transferableFrom[0]).toMatchObject({ skill: 'postgresql', level: 'DEMONSTRATED' });
    expect(mysql.transferableFrom[0].sources[0]).toMatchObject({ type: 'EXPERIENCE', id: 'e1' });
  });

  it('de-duplicates targets and prefers required', () => {
    const a = analyse(profile, [{ name: 'docker', importance: 'preferred' }, { name: 'Docker', importance: 'required' }]);
    expect(a).toHaveLength(1);
    expect(a[0].importance).toBe('required');
  });

  it('summary is counts by kind with no score or prediction', () => {
    const s = summarise(analyse(profile, [{ name: 'Rust', importance: 'required' }, { name: 'NestJS', importance: 'required' }]));
    expect(s.counts).toMatchObject({ DEMONSTRATED: 1, NONE: 1 });
    expect(s.requiredWithoutEvidence).toEqual(['Rust']);
    expect(JSON.stringify(s)).not.toMatch(/score"|employab|probab|likelihood/i);
    expect(s.note).toMatch(/not a score/);
  });

  it('every recommendation is labelled and refresh keeps user edits and dismissals', () => {
    const a = analyse(profile, [{ name: 'Rust', importance: 'required' }, { name: 'Kubernetes', importance: 'preferred' }]);
    const m = suggestMilestones(a);
    expect(m.length).toBe(2);
    expect(m.every((x) => x.origin === 'RECOMMENDATION' && x.status === 'OPEN')).toBe(true);
    const edited = [{ ...m[0], status: 'DISMISSED' as const, title: 'My own wording' }];
    const merged = mergeMilestones(edited, m);
    expect(merged.find((x) => x.id === m[0].id)).toMatchObject({ status: 'DISMISSED', title: 'My own wording' });
    expect(merged).toHaveLength(2);
  });

  it('ignores unconfirmed skills and bullets when building evidence', () => {
    const ev = toEvidence({
      experiences: [{ id: 'e', jobTitle: 'Dev', employerName: 'X', bullets: [{ content: 'Used Go', isUserConfirmed: false }, { content: 'Used Rust', isUserConfirmed: true }] }],
      skills: [{ id: 's', name: 'Go', isUserConfirmed: false }], projects: [], certifications: [],
    });
    expect(ev.experiences[0].text).toContain('Rust');
    expect(ev.experiences[0].text).not.toContain('Go');
    expect(ev.skills).toHaveLength(0);
  });
});

describe('ReadinessService', () => {
  const user = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
  const mk = (prof: any = { id: 'p', experiences: [], projects: [], certifications: [], skills: [] }, plan: any = null) => {
    const prisma: any = {
      careerProfile: { findFirst: jest.fn().mockResolvedValue(prof) },
      readinessPlan: {
        create: jest.fn().mockImplementation(async (a: any) => ({ id: 'pl1', createdAt: new Date(), updatedAt: new Date(), ...a.data })),
        findFirst: jest.fn().mockResolvedValue(plan), findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockImplementation(async (a: any) => ({ ...plan, ...a.data })), delete: jest.fn(),
      },
    };
    return { svc: new ReadinessService(prisma), prisma };
  };

  it('needs a profile and filters by tenant and owner', async () => {
    const none = mk(null);
    await expect(none.svc.create(user, { targetRole: 'Dev', skills: [{ name: 'Go', importance: 'required' }] })).rejects.toBeInstanceOf(NotFoundException);
    expect(none.prisma.careerProfile.findFirst.mock.calls[0][0].where).toEqual({ userId: 'u1', tenantId: 't1' });
    await expect(none.svc.get(user, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(none.prisma.readinessPlan.findFirst).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't1', userId: 'u1' } });
  });

  it('creates a plan with evidence-backed analysis and labelled milestones for the token owner', async () => {
    const { svc, prisma } = mk();
    const v = await svc.create(user, { targetRole: 'Backend Engineer', skills: [{ name: 'Go', importance: 'required' }] });
    expect(prisma.readinessPlan.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', userId: 'u1', analysisVersion: 'readiness-1' });
    expect(v.analysis[0].level).toBe('NONE');
    expect(v.milestones[0].origin).toBe('RECOMMENDATION');
  });

  it('rejects an unknown milestone', async () => {
    const plan = { id: 'pl1', tenantId: 't1', userId: 'u1', targetRole: 'x', targetSkills: [], analysis: [], milestones: [], analysisVersion: 'readiness-1', createdAt: new Date(), updatedAt: new Date() };
    await expect(mk(undefined, plan).svc.updateMilestone(user, 'pl1', 'nope', { status: 'DONE' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('readiness import of target skills (docs 23/29 and 44)', () => {
  const { targetsFromJobDescription, targetsFromRole } = require('../src/readiness/readiness-import');
  const jd = {
    id: 'j1', title: 'Backend Engineer', requirements: [
      { type: 'required_skill', label: 'NestJS', included: true }, { type: 'preferred_skill', label: 'Kafka', included: true },
      { type: 'required_skill', label: 'Kafka', included: true }, { type: 'required_skill', label: 'Java', included: false },
      { type: 'responsibility', label: 'Own the roadmap', included: true }, { type: 'experience', label: '5 years', included: true },
    ],
  };
  it('imports only included skill requirements, deduplicated with required winning', () => {
    const t = targetsFromJobDescription(jd);
    expect(t.skills).toEqual([{ name: 'NestJS', importance: 'required' }, { name: 'Kafka', importance: 'required' }]);
    expect(t.targetRole).toBe('Backend Engineer');
    expect(t.note).toMatch(/nothing is added to your profile/);
  });
  it('imports taxonomy roles and labels them as typical, not a hiring prediction', () => {
    const t = targetsFromRole('backend-engineer');
    expect(t.skills.length).toBeGreaterThan(3);
    expect(t.note).toMatch(/not a guarantee/);
    expect(targetsFromRole('nope')).toBeNull();
  });
  it('preview is owner-scoped, read-only, and refuses empty or foreign sources', async () => {
    const jdFind = jest.fn().mockResolvedValue({ id: 'j1', title: 'X', requirements: jd.requirements });
    const prisma: any = { jobDescription: { findFirst: jdFind, findMany: jest.fn().mockResolvedValue([]) }, readinessPlan: { create: jest.fn() } };
    const svc = new ReadinessService(prisma);
    const out: any = await svc.importPreview({ userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' }, { source: 'JOB_DESCRIPTION', id: 'j1' });
    expect(jdFind.mock.calls[0][0].where).toEqual({ id: 'j1', tenantId: 't1', userId: 'u1' });
    expect(out.skills).toHaveLength(2);
    expect(prisma.readinessPlan.create).not.toHaveBeenCalled();
    jdFind.mockResolvedValueOnce(null);
    await expect(svc.importPreview({ userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' }, { source: 'JOB_DESCRIPTION', id: 'zz' })).rejects.toBeInstanceOf(NotFoundException);
    jdFind.mockResolvedValueOnce({ id: 'j2', title: 'Y', requirements: [{ type: 'responsibility', label: 'x', included: true }] });
    await expect(svc.importPreview({ userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' }, { source: 'JOB_DESCRIPTION', id: 'j2' })).rejects.toThrow(/no included skill/);
    await expect(svc.importPreview({ userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' }, { source: 'CAREER_PATH_ROLE', id: 'nope' })).rejects.toBeInstanceOf(NotFoundException);
    expect((await svc.importSources({ userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' })).roles.length).toBeGreaterThan(5);
  });
});
