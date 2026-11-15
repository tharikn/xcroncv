import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PortfolioService, hashToken, newToken, TOKEN_RE } from '../src/portfolio/portfolio.service';
import { buildSnapshot, disclosedCount, maskEmail, maskPhone, selectionProblem } from '../src/portfolio/snapshot';

const profile: any = {
  id: 'p', fullName: 'Ada Lovelace', headline: 'Engineer', summary: 'Secret summary', email: 'ada@example.com', phone: '+44 20 7946 0000',
  location: 'London', links: [{ label: 'Site', url: 'https://ada.dev' }, { label: 'Bad', url: 'javascript:alert(1)' }],
  experiences: [
    { id: 'e1', employerName: 'Babbage & Co', jobTitle: 'Programmer', location: 'Oxford', startDate: '2020-01', endDate: null, isCurrent: true, description: 'private desc',
      bullets: [{ content: 'Wrote an algorithm', isUserConfirmed: true }, { content: 'Unconfirmed claim', isUserConfirmed: false }] },
    { id: 'e2', employerName: 'Hidden Ltd', jobTitle: 'Analyst', startDate: '2018-01', endDate: '2019-12', isCurrent: false, bullets: [] },
  ],
  skills: [{ id: 's1', name: 'Math', category: 'Core' }, { id: 's2', name: 'Secret skill' }],
  educations: [{ id: 'd1', institution: 'Home', degree: 'Maths', grade: 'First' }],
  projects: [{ id: 'pr1', name: 'Engine', url: 'https://x.dev', description: 'd', technologies: ['brass'] }],
  certifications: [], languages: [],
};

describe('portfolio snapshot (positive allowlist)', () => {
  it('includes nothing by default', () => {
    const s = buildSnapshot(profile, { header: {} });
    expect(disclosedCount(s)).toBe(0);
    expect(JSON.stringify(s)).not.toContain('Ada');
  });
  it('exposes only selected header fields and items, and never leaks the rest', () => {
    const s = buildSnapshot(profile, { header: { fullName: 'public', headline: 'public' }, experience: { ids: ['e1'] }, skills: { ids: ['s1'] } });
    const json = JSON.stringify(s);
    for (const secret of ['Secret summary', 'ada@example.com', '7946', 'London', 'Hidden Ltd', 'Secret skill', 'private desc', 'Unconfirmed', 'First', 'e1']) {
      expect(json).not.toContain(secret);
    }
    expect(s.header).toEqual({ fullName: 'Ada Lovelace', headline: 'Engineer' });
    expect(s.sections.experience).toHaveLength(1);
    expect(s.sections.experience![0]['bullets']).toEqual([]); // bullets are opt-in
  });
  it('includes only user-confirmed bullets when opted in', () => {
    const s = buildSnapshot(profile, { header: {}, experience: { ids: ['e1'], includeBullets: true } });
    expect(s.sections.experience![0]['bullets']).toEqual(['Wrote an algorithm']);
  });
  it('masks email and phone and drops masks it cannot apply', () => {
    const s = buildSnapshot(profile, { header: { email: 'masked', phone: 'masked', location: 'masked' as any } });
    expect(s.header['email']).toBe('a***@example.com');
    expect(String(s.header['phone'])).toMatch(/^\*+00$/);
    expect(s.header['location']).toBeUndefined();
    expect(maskEmail('x')).toBe('***');
    expect(maskPhone('12')).toBe('***');
  });
  it('rejects masking a field that cannot be masked', () => {
    expect(selectionProblem({ header: { summary: 'masked' } })).toMatch(/cannot be masked/);
    expect(selectionProblem({ header: { email: 'masked' } })).toBeNull();
  });
  it('drops non-http links', () => {
    const s = buildSnapshot(profile, { header: { links: 'public' }, projects: { ids: ['pr1'] } });
    expect(s.header['links']).toEqual([{ label: 'Site', url: 'https://ada.dev' }]);
  });
  it('ignores ids that are not in the profile', () => {
    expect(disclosedCount(buildSnapshot(profile, { header: {}, experience: { ids: ['foreign-id'] } }))).toBe(0);
  });
});

describe('share token', () => {
  it('is 256-bit url-safe, unique and stored only as a hash', () => {
    const a = newToken(); const b = newToken();
    expect(a).not.toBe(b);
    expect(TOKEN_RE.test(a)).toBe(true);
    expect(hashToken(a)).toHaveLength(64);
    expect(hashToken(a)).not.toContain(a);
  });
});

describe('PortfolioService', () => {
  const user = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
  const snap = buildSnapshot(profile, { header: { fullName: 'public' } });
  const empty = buildSnapshot(profile, { header: {} });
  const mk = (over: any = {}) => {
    const prisma: any = {
      portfolio: {
        findFirst: jest.fn().mockResolvedValue({ id: 'x', currentVersion: 1 }),
        update: jest.fn().mockImplementation(async (a: any) => ({ id: 'x', status: 'PUBLISHED', ...a.data })),
        create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(),
        ...over.portfolio,
      },
      portfolioVersion: { create: jest.fn().mockResolvedValue({ id: 'v', versionNumber: 2 }), findUnique: jest.fn().mockResolvedValue({ versionNumber: 1, snapshot: snap, theme: 'light' }), findMany: jest.fn().mockResolvedValue([]), ...over.portfolioVersion },
      portfolioEvent: { create: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    return { svc: new PortfolioService(prisma, { get: jest.fn().mockResolvedValue(profile) } as any), prisma };
  };

  it('filters every owner lookup by tenant AND user and hides foreign records', async () => {
    const { svc, prisma } = mk({ portfolio: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(svc.get(user, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.portfolio.findFirst).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't1', userId: 'u1' } });
  });
  it('lists only the caller own portfolios and strips the token hash', async () => {
    const { svc, prisma } = mk({ portfolio: { findMany: jest.fn().mockResolvedValue([{ id: 'a', tokenHash: 'h' }]) } });
    const rows: any[] = await svc.list(user);
    expect(prisma.portfolio.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', userId: 'u1' });
    expect(rows[0].tokenHash).toBeUndefined();
    expect(rows[0].hasActiveLink).toBe(true);
  });
  it('refuses to publish without explicit confirmation', async () => {
    const { svc, prisma } = mk();
    await expect(svc.publish(user, 'x', { versionNumber: 1, confirm: false })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.portfolio.update).not.toHaveBeenCalled();
  });
  it('refuses to publish an empty snapshot', async () => {
    const { svc } = mk({ portfolioVersion: { findUnique: jest.fn().mockResolvedValue({ versionNumber: 1, snapshot: empty }) } });
    await expect(svc.publish(user, 'x', { versionNumber: 1, confirm: true })).rejects.toThrow(/Nothing is selected/);
  });
  it('publishes: returns the raw token once, stores only its hash, defaults to noindex', async () => {
    const { svc, prisma } = mk();
    const r: any = await svc.publish(user, 'x', { versionNumber: 1, confirm: true });
    const data = prisma.portfolio.update.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(hashToken(r.token));
    expect(data.status).toBe('PUBLISHED');
    expect(data.noIndex).toBe(true);
    expect(r.tokenHash).toBeUndefined();
    expect(r.sharePath).toBe(`/p/${r.token}`);
  });
  it('validates expiry: past and beyond a year are rejected', async () => {
    const { svc } = mk();
    await expect(svc.publish(user, 'x', { versionNumber: 1, confirm: true, expiresAt: '2000-01-01T00:00:00Z' })).rejects.toThrow(/future/);
    const far = new Date(Date.now() + 400 * 86_400_000).toISOString();
    await expect(svc.publish(user, 'x', { versionNumber: 1, confirm: true, expiresAt: far })).rejects.toThrow(/365/);
  });
  it('revoke clears the token hash and unpublishes immediately', async () => {
    const { svc, prisma } = mk();
    await svc.revoke(user, 'x');
    expect(prisma.portfolio.update.mock.calls[0][0].data).toMatchObject({ status: 'REVOKED', tokenHash: null, publishedVersion: null });
  });
  it('a new version never changes what is published', async () => {
    const { svc, prisma } = mk();
    await svc.createVersion(user, 'x', { selection: { header: { fullName: 'public' } } as any });
    const data = prisma.portfolio.update.mock.calls[0][0].data;
    expect(data).toEqual({ currentVersion: 2 });
  });
  it('share policy can clear expiry and toggle noindex', async () => {
    const { svc, prisma } = mk();
    await svc.updateSharePolicy(user, 'x', { expiresAt: null, noIndex: false });
    expect(prisma.portfolio.update.mock.calls[0][0].data).toEqual({ expiresAt: null, noIndex: false });
  });

  describe('public view', () => {
    const published = (over: any = {}) => ({ id: 'x', status: 'PUBLISHED', publishedVersion: 1, expiresAt: null, noIndex: true, publishedAt: new Date(), ...over });
    it('rejects malformed tokens without touching the database', async () => {
      const { svc, prisma } = mk();
      await expect(svc.publicView('short')).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.publicView('../etc/passwd')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.portfolio.findFirst).not.toHaveBeenCalled();
    });
    it('looks the token up by hash among published portfolios only', async () => {
      const t = newToken();
      const { svc, prisma } = mk({ portfolio: { findFirst: jest.fn().mockResolvedValue(published()) } });
      const r = await svc.publicView(t);
      expect(prisma.portfolio.findFirst).toHaveBeenCalledWith({ where: { tokenHash: hashToken(t), status: 'PUBLISHED' } });
      expect(r.view.snapshot).toEqual(snap);
      expect(JSON.stringify(r)).not.toMatch(/tokenHash|userId|tenantId|"name"/);
    });
    it('uniform 404 for unknown, revoked and expired', async () => {
      const t = newToken();
      const unknown = mk({ portfolio: { findFirst: jest.fn().mockResolvedValue(null) } }).svc;
      const expired = mk({ portfolio: { findFirst: jest.fn().mockResolvedValue(published({ expiresAt: new Date(Date.now() - 1000) })) } }).svc;
      const noVersion = mk({ portfolio: { findFirst: jest.fn().mockResolvedValue(published({ publishedVersion: null })) } }).svc;
      for (const s of [unknown, expired, noVersion]) {
        await expect(s.publicView(t)).rejects.toThrow('Portfolio not found');
      }
    });
    it('a failing view-event write never breaks the visitor response', async () => {
      const { svc, prisma } = mk({ portfolio: { findFirst: jest.fn().mockResolvedValue(published()) } });
      prisma.portfolioEvent.create.mockRejectedValue(new Error('db'));
      await expect(svc.publicView(newToken())).resolves.toBeDefined();
    });
  });
});

describe('portfolio password protection', () => {
  const { hashPassword, verifyPassword, passwordProblem } = require('../src/portfolio/password');
  const user = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
  const snap = buildSnapshot(profile, { header: { fullName: 'public' } });
  const NOW = new Date('2026-06-01T00:00:00Z');
  const mk = (row: any) => {
    const prisma: any = {
      portfolio: { findFirst: jest.fn().mockResolvedValue(row), update: jest.fn().mockImplementation(async (a: any) => ({ id: 'x', ...a.data })) },
      portfolioVersion: { findUnique: jest.fn().mockResolvedValue({ versionNumber: 1, snapshot: snap, theme: 'light' }) },
      portfolioEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    return { svc: new PortfolioService(prisma, { get: jest.fn() } as any), prisma };
  };
  const base = { id: 'x', status: 'PUBLISHED', publishedVersion: 1, expiresAt: null, noIndex: true, publishedAt: NOW, passwordFailCount: 0, passwordLockedUntil: null };

  it('hashes with a salt, verifies, and rejects wrong or malformed values', async () => {
    const a = await hashPassword('correct horse'); const b = await hashPassword('correct horse');
    expect(a).not.toBe(b); expect(a).not.toContain('correct');
    expect(await verifyPassword('correct horse', a)).toBe(true);
    expect(await verifyPassword('Correct horse', a)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
    expect(passwordProblem('short')).toMatch(/at least 8/);
    expect(passwordProblem('x'.repeat(129))).toMatch(/at most/);
    expect(passwordProblem('long enough pw')).toBeNull();
  });
  it('sets and removes the password through the share policy and never returns the hash', async () => {
    const { svc, prisma } = mk({ id: 'x' });
    const set: any = await svc.updateSharePolicy(user, 'x', { password: 'correct horse' });
    expect(prisma.portfolio.update.mock.calls[0][0].data.passwordHash).toMatch(/^s1\$/);
    expect(set.passwordProtected).toBe(true);
    expect(JSON.stringify(set)).not.toMatch(/passwordHash|s1\$/);
    await expect(svc.updateSharePolicy(user, 'x', { password: 'short' })).rejects.toBeInstanceOf(BadRequestException);
    const cleared: any = await svc.updateSharePolicy(user, 'x', { password: null });
    expect(prisma.portfolio.update.mock.calls[1][0].data).toMatchObject({ passwordHash: null, passwordFailCount: 0 });
    expect(cleared.passwordProtected).toBe(false);
  });
  it('requires the password without revealing the snapshot; wrong guesses are counted; right one passes', async () => {
    const hash = await hashPassword('correct horse');
    const { svc, prisma } = mk({ ...base, passwordHash: hash, passwordFailCount: 2 });
    await expect(svc.publicView(newToken(), NOW)).rejects.toMatchObject({ response: { passwordRequired: true } });
    expect(prisma.portfolioVersion.findUnique).not.toHaveBeenCalled();
    expect(prisma.portfolio.update).not.toHaveBeenCalled(); // a missing password is not a failed guess
    await expect(svc.publicView(newToken(), NOW, 'wrong password')).rejects.toMatchObject({ response: { message: 'Incorrect password.' } });
    expect(prisma.portfolio.update.mock.calls[0][0].data).toEqual({ passwordFailCount: 3 });
    const ok = await svc.publicView(newToken(), NOW, 'correct horse');
    expect(ok.view.snapshot).toEqual(snap);
    expect(prisma.portfolio.update.mock.calls[1][0].data).toEqual({ passwordFailCount: 0 });
  });
  it('locks the link for 15 minutes after five misses, even for the right password', async () => {
    const hash = await hashPassword('correct horse');
    const a = mk({ ...base, passwordHash: hash, passwordFailCount: 4 });
    await expect(a.svc.publicView(newToken(), NOW, 'nope nope nope')).rejects.toMatchObject({ response: { passwordRequired: true } });
    const d = a.prisma.portfolio.update.mock.calls[0][0].data;
    expect(d.passwordLockedUntil).toEqual(new Date(NOW.getTime() + 15 * 60_000));
    const locked = mk({ ...base, passwordHash: hash, passwordLockedUntil: new Date(NOW.getTime() + 1000) });
    await expect(locked.svc.publicView(newToken(), NOW, 'correct horse')).rejects.toMatchObject({ status: 429 });
  });
  it('expired or unknown links stay a uniform 404 even when password protected', async () => {
    const hash = await hashPassword('correct horse');
    const { svc } = mk({ ...base, passwordHash: hash, expiresAt: new Date(NOW.getTime() - 1) });
    await expect(svc.publicView(newToken(), NOW)).rejects.toThrow('Portfolio not found');
  });
});
