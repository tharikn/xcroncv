import { BadRequestException, NotFoundException } from '@nestjs/common';
import { validateClaims, unsupportedCount } from '../src/cover-letters/claim-validator';
import { buildDraft } from '../src/cover-letters/draft-builder';
import { renderLetterHtml } from '../src/cover-letters/cover-letter.render';
import { COVER_LETTER_TEMPLATES, getTemplate } from '../src/cover-letters/cover-letter.templates';
import { CoverLettersService, factsFromProfile } from '../src/cover-letters/cover-letters.service';
import { ProfileFacts } from '../src/cover-letters/cover-letter.types';
import { featureEnabled } from '../src/common/features';

const facts: ProfileFacts = {
  fullName: 'Ada Lovelace', headline: 'Engineer', employers: ['Babbage & Co'], titles: ['Programmer'],
  skills: ['TypeScript', 'Postgres', 'Go'], bullets: ['Cut p95 latency by 40% on the billing API.', 'Led 5 engineers through a migration.'], yearsExperience: 6,
};
const sec = (text: string, id = 's1') => ({ id, heading: 'H', text, origin: 'USER' as const });

describe('claim validation', () => {
  it('supports employers, skills and metrics found in the profile', () => {
    const c = validateClaims([sec('At Babbage & Co I used TypeScript and cut latency by 40% over 5 years.')], facts);
    expect(c.find((x) => x.kind === 'employer')?.status).toBe('SUPPORTED');
    expect(c.find((x) => x.kind === 'skill' && x.text === 'TypeScript')?.status).toBe('SUPPORTED');
    expect(c.filter((x) => x.kind === 'metric').every((x) => x.status === 'SUPPORTED')).toBe(true);
  });
  it('flags invented metrics as UNSUPPORTED', () => {
    const c = validateClaims([sec('I increased revenue by 300% and managed 50 engineers.')], facts);
    expect(c.filter((x) => x.kind === 'metric').map((x) => x.status)).toEqual(['UNSUPPORTED', 'UNSUPPORTED']);
    expect(unsupportedCount(c)).toBe(2);
  });
  it('rejects more years than the profile shows', () => {
    expect(validateClaims([sec('I have 15 years of experience.')], facts)[0].status).toBe('UNSUPPORTED');
  });
  it('labels metrics the user typed themselves as USER_AUTHORED', () => {
    const c = validateClaims([sec('We grew signups by 12%.')], facts, ['12%']);
    expect(c[0].status).toBe('USER_AUTHORED');
  });
  it('never accepts an invented referral or employer research', () => {
    const c = validateClaims([sec('I was referred by Grace Hopper. I have long admired your company.')], facts);
    expect(c.map((x) => [x.kind, x.status])).toEqual([['referral', 'UNSUPPORTED'], ['research', 'UNSUPPORTED']]);
  });
  it('accepts a referral only when the user supplied the referrer', () => {
    const c = validateClaims([sec('I was referred by Grace Hopper.')], facts, ['Grace Hopper']);
    expect(c[0].status).toBe('USER_AUTHORED');
  });
  it('does not match skills inside longer words', () => {
    expect(validateClaims([sec('I enjoy Gone with the wind.')], facts).filter((x) => x.kind === 'skill')).toHaveLength(0);
  });
});

describe('draft builder', () => {
  it('uses only profile facts and passes its own validation (no unsupported claims)', () => {
    for (const t of COVER_LETTER_TEMPLATES) {
      const draft = buildDraft(facts, { kind: t.id, tone: 'professional', length: 'medium', company: 'Acme', jobTitle: 'Backend Engineer', referrerName: 'Grace Hopper' });
      expect(draft.length).toBeGreaterThan(1);
      expect(unsupportedCount(validateClaims(draft, facts, ['Grace Hopper']))).toBe(0);
    }
  });
  it('prefers skills and bullets that match the pasted JD', () => {
    const d = buildDraft(facts, { kind: 'standard', tone: 'direct', length: 'short', jdText: 'We need Postgres and billing experience' });
    expect(d.find((s) => s.id === 'fit')!.text).toContain('Postgres');
    expect(d.find((s) => s.id === 'achievements')!.text).toContain('billing');
  });
  it('shorter length means fewer achievements', () => {
    const short = buildDraft(facts, { kind: 'standard', tone: 'warm', length: 'short' });
    const long = buildDraft(facts, { kind: 'standard', tone: 'warm', length: 'long' });
    const n = (s: typeof short) => (s.find((x) => x.id === 'achievements')!.text.match(/^- /gm) ?? []).length;
    expect(n(short)).toBeLessThan(n(long));
  });
  it('templates are frozen and versioned', () => {
    expect(Object.isFrozen(getTemplate('standard'))).toBe(true);
    expect(COVER_LETTER_TEMPLATES.every((t) => t.version >= 1)).toBe(true);
  });
});

describe('html export', () => {
  it('escapes content and emits no script', () => {
    const h = renderLetterHtml('<b>x</b>', [sec('<script>alert(1)</script>')]);
    expect(h).not.toMatch(/<script/i);
    expect(h).toContain('&lt;script&gt;');
  });
});

describe('factsFromProfile', () => {
  it('derives employers, skills, bullets and years', () => {
    const f = factsFromProfile({
      fullName: 'A', headline: null,
      experiences: [{ employerName: 'X', jobTitle: 'Dev', startDate: '2020-01', bullets: [{ content: 'Did a thing' }] }],
      skills: [{ name: 'Go' }],
    } as any, new Date('2026-06-01'));
    expect(f).toMatchObject({ employers: ['X'], titles: ['Dev'], skills: ['Go'], bullets: ['Did a thing'], yearsExperience: 6 });
  });
});

describe('CoverLettersService authorisation and rules', () => {
  const user = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
  const mk = (over: any = {}) => {
    const prisma: any = {
      coverLetter: { findFirst: jest.fn().mockResolvedValue(null), ...over.coverLetter },
      coverLetterVersion: { findUnique: jest.fn().mockResolvedValue({ versionNumber: 1 }), ...over.coverLetterVersion },
      coverLetterApplicationBinding: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'b' }) },
    };
    return { svc: new CoverLettersService(prisma, { get: jest.fn() } as any), prisma };
  };

  it('filters every owner lookup by tenant AND user and hides foreign records', async () => {
    const { svc, prisma } = mk();
    await expect(svc.get(user, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.coverLetter.findFirst).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't1', userId: 'u1' } });
  });
  it('refuses to bind without explicit confirmation', async () => {
    const { svc, prisma } = mk();
    await expect(svc.bind(user, 'app-1', { coverLetterId: 'c', versionNumber: 1, confirm: false })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.coverLetterApplicationBinding.create).not.toHaveBeenCalled();
  });
  it('binds an exact version for the caller', async () => {
    const { svc, prisma } = mk({ coverLetter: { findFirst: jest.fn().mockResolvedValue({ id: 'c' }) } });
    await svc.bind(user, 'app-1', { coverLetterId: 'c', versionNumber: 1, confirm: true });
    expect(prisma.coverLetterApplicationBinding.create.mock.calls[0][0].data).toMatchObject({ userId: 'u1', tenantId: 't1', applicationRef: 'app-1', versionNumber: 1 });
  });
  it('a referral draft requires a user-supplied referrer', async () => {
    const { svc } = mk();
    await expect(svc.createDraft(user, { title: 't', kind: 'referral' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('feature flags', () => {
  it('disables only the listed modules', () => {
    expect(featureEnabled('crm', 'cover-letters, CRM')).toBe(false);
    expect(featureEnabled('job-analytics', 'cover-letters, crm')).toBe(true);
    expect(featureEnabled('crm', undefined)).toBe(true);
  });
});
