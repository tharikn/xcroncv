import { BadRequestException, ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { AutofillService, effectiveStatus, SESSION_TTL_MS } from '../src/autofill/autofill.service';
import { FORBIDDEN_RE, fieldOptions, resolveValue } from '../src/autofill/fields';
import { getAdapter, hostAllowed, normalizeHost, SITE_ADAPTERS } from '../src/autofill/site-adapters';
import { featureEnabled } from '../src/common/features';

const profile: any = {
  fullName: 'Ada Augusta Lovelace', headline: 'Engineer', email: 'ada@example.com', phone: '+44 20 7946 0000', location: 'London',
  links: [{ label: 'LinkedIn', url: 'https://linkedin.com/in/ada' }, { label: 'Site', url: 'https://ada.dev' }, { label: 'x', url: 'javascript:alert(1)' }],
  experiences: [{ employerName: 'Old', jobTitle: 'Analyst', isCurrent: false }, { employerName: 'Babbage & Co', jobTitle: 'Programmer', isCurrent: true }],
  educations: [{ institution: 'Home', degree: 'Maths' }],
  certifications: [{ id: 'c1', name: 'Cert A', issuer: 'Issuer' }],
};

describe('autofill field catalogue', () => {
  it('derives names, links and latest work from confirmed profile facts only', () => {
    expect(resolveValue(profile, 'firstName')).toBe('Ada Augusta');
    expect(resolveValue(profile, 'lastName')).toBe('Lovelace');
    expect(resolveValue(profile, 'linkedin')).toBe('https://linkedin.com/in/ada');
    expect(resolveValue(profile, 'website')).toBe('https://ada.dev');
    expect(resolveValue(profile, 'currentEmployer')).toBe('Babbage & Co');
    expect(resolveValue(profile, 'certification:c1')).toBe('Cert A (Issuer)');
    expect(resolveValue(profile, 'certification:other')).toBeUndefined();
    expect(resolveValue({ ...profile, links: [] }, 'website')).toBeUndefined();
  });
  it('field options expose masked previews, never full contact values', () => {
    const o = fieldOptions(profile);
    expect(o.find((f) => f.key === 'email')!.preview).toBe('a***@example.com');
    expect(o.find((f) => f.key === 'phone')!.preview).not.toContain('7946');
    expect(o.find((f) => f.key === 'phone')!.sensitive).toBe(true);
    expect(o.find((f) => f.key === 'certification:c1')).toBeDefined();
  });
  it('refuses secrets, identity numbers, eligibility and demographic keys', () => {
    for (const k of ['password', 'ssn', 'passportNumber', 'gender', 'workAuthorization', 'visaStatus', 'salaryExpectation', 'otp', 'dateOfBirth']) {
      expect(FORBIDDEN_RE.test(k)).toBe(true);
    }
    expect(FORBIDDEN_RE.test('email')).toBe(false);
  });
});

describe('site adapters', () => {
  it('are frozen and only manual copy is verified', () => {
    expect(Object.isFrozen(SITE_ADAPTERS)).toBe(true);
    expect(SITE_ADAPTERS.filter((a) => a.verified).map((a) => a.id)).toEqual(['manual-copy']);
  });
  it('never carry a submit selector', () => {
    for (const a of SITE_ADAPTERS) for (const sel of Object.values(a.selectors)) expect(sel).not.toMatch(/submit|button/i);
  });
  it('normalises hostnames only and enforces host patterns', () => {
    expect(normalizeHost(' Boards.Greenhouse.io ')).toBe('boards.greenhouse.io');
    for (const bad of ['https://x.com/path', 'x.com/a', 'localhost', 'a b.com', 'x.com:8080', 'user@x.com']) expect(normalizeHost(bad)).toBeNull();
    const gh = getAdapter('greenhouse-boards')!;
    expect(hostAllowed(gh, 'boards.greenhouse.io')).toBe(true);
    expect(hostAllowed(gh, 'evilgreenhouse.io')).toBe(false);
    expect(hostAllowed(gh, null)).toBe(false);
    expect(hostAllowed(getAdapter('manual-copy')!, null)).toBe(true);
  });
});

describe('AutofillService', () => {
  const user = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
  const live = (over: any = {}) => ({ id: 's', adapterId: 'html-autocomplete', targetHost: null, status: 'ACTIVE', consentedKeys: [], sensitiveConsent: false, expiresAt: new Date(Date.now() + 600_000), createdAt: new Date(), authorizedAt: null, revokedAt: null, ...over });
  const mk = (session: any = live()) => {
    const prisma: any = {
      autofillSession: {
        findFirst: jest.fn().mockResolvedValue(session),
        create: jest.fn().mockImplementation(async (a: any) => live(a.data)),
        update: jest.fn().mockImplementation(async (a: any) => ({ ...session, ...a.data })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      autofillAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    return { svc: new AutofillService(prisma, { get: jest.fn().mockResolvedValue(profile) } as any), prisma };
  };

  it('start needs explicit confirmation, a known adapter and a bare hostname', async () => {
    const { svc, prisma } = mk();
    await expect(svc.start(user, { adapterId: 'manual-copy', confirm: false })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.start(user, { adapterId: 'nope', confirm: true })).rejects.toThrow(/Unknown site adapter/);
    await expect(svc.start(user, { adapterId: 'manual-copy', targetHost: 'https://x.com/a?b=1', confirm: true })).rejects.toThrow(/hostname only/);
    await expect(svc.start(user, { adapterId: 'greenhouse-boards', targetHost: 'example.com', confirm: true })).rejects.toThrow(/only works on/);
    expect(prisma.autofillSession.create).not.toHaveBeenCalled();
  });
  it('start creates a short-lived session for the caller and audits it', async () => {
    const { svc, prisma } = mk();
    const now = new Date('2026-01-01T00:00:00Z');
    await svc.start(user, { adapterId: 'manual-copy', targetHost: 'boards.greenhouse.io', confirm: true }, now);
    const data = prisma.autofillSession.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: 'u1', tenantId: 't1', adapterId: 'manual-copy', targetHost: 'boards.greenhouse.io' });
    expect(data.expiresAt.getTime() - now.getTime()).toBe(SESSION_TTL_MS);
    expect(prisma.autofillAuditEvent.create.mock.calls[0][0].data.type).toBe('STARTED');
  });
  it('filters lookups by tenant AND owner; foreign sessions look missing', async () => {
    const { svc, prisma } = mk(null);
    await expect(svc.fieldOptions(user, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.autofillSession.findFirst).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't1', userId: 'u1' } });
  });
  it('authorize requires confirmation and rejects unknown or forbidden fields', async () => {
    const { svc } = mk();
    await expect(svc.authorize(user, 's', { fieldKeys: ['email'], confirm: false })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.authorize(user, 's', { fieldKeys: ['password'], confirm: true })).rejects.toThrow(/never filled/);
    await expect(svc.authorize(user, 's', { fieldKeys: ['workAuthorization'], confirm: true })).rejects.toThrow(/never filled/);
    await expect(svc.authorize(user, 's', { fieldKeys: ['favouriteColour'], confirm: true })).rejects.toThrow(/Unknown field/);
    await expect(svc.authorize(user, 's', { fieldKeys: ['certification:not-mine'], confirm: true })).rejects.toThrow(/Unknown field/);
  });
  it('sensitive fields need per-session consent', async () => {
    const { svc } = mk();
    await expect(svc.authorize(user, 's', { fieldKeys: ['email', 'phone'], confirm: true })).rejects.toThrow(/explicit consent/);
    const r = await svc.authorize(user, 's', { fieldKeys: ['email', 'phone'], confirm: true, sensitiveConsent: true });
    expect(r.fills.map((f) => f.fieldKey)).toEqual(['email', 'phone']);
  });
  it('releases only selected fields, maps selectors for FILL adapters, and never submits', async () => {
    const { svc, prisma } = mk();
    const r = await svc.authorize(user, 's', { fieldKeys: ['firstName', 'email', 'headline'], confirm: true });
    expect(r.fills).toEqual([
      { fieldKey: 'firstName', value: 'Ada Augusta', selector: 'input[autocomplete="given-name"]' },
      { fieldKey: 'email', value: 'ada@example.com', selector: 'input[autocomplete="email"]' },
      { fieldKey: 'headline', value: 'Engineer', selector: null }, // no mapping: stays copy-only, never guessed
    ]);
    expect(r.submit).toBe('never');
    expect(JSON.stringify(r)).not.toContain('7946'); // phone was not selected
    const audit = prisma.autofillAuditEvent.create.mock.calls[0][0].data;
    expect(audit.fieldKeys).toEqual(['firstName', 'email', 'headline']);
    expect(JSON.stringify(audit)).not.toContain('ada@example.com'); // audit holds keys, not values
  });
  it('fields with no confirmed value are skipped, not invented', async () => {
    const { svc } = mk();
    const r = await svc.authorize(user, 's', { fieldKeys: ['email', 'linkedin'], confirm: true });
    expect(r.skipped).toEqual([]);
    const { svc: s2 } = (() => { const m = mk(); return { svc: new AutofillService(m.prisma, { get: jest.fn().mockResolvedValue({ ...profile, links: [] }) } as any) }; })();
    const r2 = await s2.authorize(user, 's', { fieldKeys: ['email', 'linkedin'], confirm: true });
    expect(r2.skipped).toEqual(['linkedin']);
    expect(r2.fills.map((f) => f.fieldKey)).toEqual(['email']);
  });
  it('manual-copy sessions return values without selectors', async () => {
    const { svc } = mk(live({ adapterId: 'manual-copy' }));
    const r = await svc.authorize(user, 's', { fieldKeys: ['email'], confirm: true });
    expect(r.mode).toBe('COPY');
    expect(r.fills[0].selector).toBeNull();
  });
  it('refuses revoked and expired sessions', async () => {
    await expect(mk(live({ status: 'REVOKED' })).svc.authorize(user, 's', { fieldKeys: ['email'], confirm: true })).rejects.toBeInstanceOf(ConflictException);
    await expect(mk(live({ expiresAt: new Date(Date.now() - 1) })).svc.authorize(user, 's', { fieldKeys: ['email'], confirm: true })).rejects.toBeInstanceOf(GoneException);
    await expect(mk(live({ expiresAt: new Date(Date.now() - 1) })).svc.fieldOptions(user, 's')).rejects.toBeInstanceOf(GoneException);
  });
  it('revoke clears consent and is idempotent', async () => {
    const { svc, prisma } = mk(live({ status: 'AUTHORIZED', consentedKeys: ['email'] }));
    const r = await svc.revoke(user, 's');
    expect(prisma.autofillSession.update.mock.calls[0][0].data).toMatchObject({ status: 'REVOKED', consentedKeys: [], sensitiveConsent: false });
    expect(r.status).toBe('REVOKED');
    const again = mk(live({ status: 'REVOKED' }));
    await again.svc.revoke(user, 's');
    expect(again.prisma.autofillSession.update).not.toHaveBeenCalled();
  });
  it('derives EXPIRED status', () => {
    expect(effectiveStatus({ status: 'ACTIVE', expiresAt: new Date(0) })).toBe('EXPIRED');
    expect(effectiveStatus({ status: 'REVOKED', expiresAt: new Date(0) })).toBe('REVOKED');
  });
  it('can be disabled by feature flag', () => { expect(featureEnabled('autofill', 'autofill')).toBe(false); });
});
