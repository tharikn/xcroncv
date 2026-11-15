import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { analyzePosting, contentHash, normalizeUrl, sanitizeText } from '../src/job-clipper/clip-logic';
import { JobClipperService } from '../src/job-clipper/job-clipper.service';

describe('sanitising captured content', () => {
  it('strips scripts, tags, entities and control characters', () => {
    const t = sanitizeText('<div>Hello <script>alert(1)</script><b>World</b>&nbsp;&amp; co\u0000</div>');
    expect(t).toBe('Hello World & co');
    expect(t).not.toMatch(/script|alert|</);
  });
  it('caps length', () => { expect(sanitizeText('a'.repeat(50_000)).length).toBe(20_000); });
});

describe('url normalisation', () => {
  it('accepts http(s), drops fragment and tracking params', () => {
    expect(normalizeUrl('https://jobs.example.com/p/1?utm_source=x&id=7#apply')).toEqual({ url: 'https://jobs.example.com/p/1?id=7', hostname: 'jobs.example.com' });
  });
  for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://x.com', 'https://user:pw@x.com', 'nope', `https://x.com/${'a'.repeat(600)}`]) {
    it(`rejects ${bad.slice(0, 30)}`, () => expect(normalizeUrl(bad)).toBeNull());
  }
});

describe('posting analysis', () => {
  it('lists known terms and separates recorded from not recorded, with no score', () => {
    const r = analyzePosting('We use Docker and Kubernetes on AWS. Experience with PostgreSQL required.', ['Docker', 'PostgreSQL']);
    const by = Object.fromEntries(r.terms.map((t) => [t.label, t.inProfile]));
    expect(by['Docker']).toBe(true);
    expect(by['Kubernetes']).toBe(false);
    expect(by['SQL']).toBe(true);
    expect(r.notRecorded).toBeGreaterThan(0);
    expect(JSON.stringify(r)).not.toMatch(/score/i.test('x') ? '^$' : /"score"/);
    expect(r.notes.join(' ')).toMatch(/not a match score/);
  });
  it('hashes content case/whitespace-insensitively', () => {
    expect(contentHash('A', 'B', 'x  y')).toBe(contentHash('a', 'b', 'X Y'));
  });
});

describe('JobClipperService', () => {
  const user = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
  const NOW = new Date('2026-06-01T10:00:00Z');
  const row = (over: any = {}) => ({ id: 'c1', tenantId: 't1', userId: 'u1', title: 'Engineer', company: 'Acme', url: null, hostname: null, description: 'Build things with Docker and AWS daily.', source: 'MANUAL', status: 'NEW', contentHash: 'h', createdAt: NOW, updatedAt: NOW, ...over });
  const mk = (over: any = {}) => {
    const prisma: any = {
      clippedJob: {
        findFirst: jest.fn().mockImplementation(async (a: any) => (a.where.idempotencyKey ? over.idem ?? null : a.where.contentHash ? over.same ?? null : over.clip === undefined ? row() : over.clip)),
        count: jest.fn().mockResolvedValue(over.count ?? 0), findMany: jest.fn().mockResolvedValue([row()]),
        create: jest.fn().mockImplementation(async (a: any) => row(a.data)), update: jest.fn().mockImplementation(async (a: any) => row(a.data)), delete: jest.fn(),
      },
      extensionSession: {
        findFirst: jest.fn().mockResolvedValue(over.session === undefined ? null : over.session), count: jest.fn().mockResolvedValue(over.active ?? 0),
        create: jest.fn().mockImplementation(async (a: any) => ({ id: 's1', revokedAt: null, createdAt: NOW, ...a.data })), findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockImplementation(async (a: any) => ({ id: 's1', label: 'x', expiresAt: NOW, createdAt: NOW, ...a.data })),
      },
      captureAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const profiles: any = { get: jest.fn().mockResolvedValue({ skills: [{ name: 'Docker', isUserConfirmed: true }, { name: 'AWS', isUserConfirmed: false }] }) };
    return { svc: new JobClipperService(prisma, profiles), prisma };
  };
  const dto = (o: any = {}) => ({ title: 'Engineer', company: 'Acme', description: 'Build things with Docker and AWS daily.', source: 'MANUAL' as const, reviewed: true, ...o });

  it('stores nothing unless the user reviewed and confirmed', async () => {
    const { svc, prisma } = mk();
    await expect(svc.create(user, dto({ reviewed: false }))).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.clippedJob.create).not.toHaveBeenCalled();
  });
  it('sanitises, takes the owner from the token, audits ids only', async () => {
    const { svc, prisma } = mk();
    const r: any = await svc.create(user, dto({ description: '<p>Build <script>x()</script>things with Docker daily</p>', url: 'https://x.com/j?utm_medium=a' }));
    const d = prisma.clippedJob.create.mock.calls[0][0].data;
    expect(d).toMatchObject({ tenantId: 't1', userId: 'u1', url: 'https://x.com/j', hostname: 'x.com' });
    expect(d.description).not.toMatch(/script|x\(\)|<p>/);
    expect(r.duplicate).toBe(false);
    expect(JSON.stringify(prisma.captureAuditEvent.create.mock.calls[0][0])).not.toContain('Docker');
  });
  it('is idempotent by key and by content', async () => {
    expect(((await mk({ idem: row() }).svc.create(user, dto({ idempotencyKey: 'k1' }))) as any).duplicate).toBe(true);
    const a = mk({ same: row() });
    expect(((await a.svc.create(user, dto())) as any).duplicate).toBe(true);
    expect(a.prisma.clippedJob.create).not.toHaveBeenCalled();
  });
  it('rejects bad URLs, short text and over-limit libraries', async () => {
    await expect(mk().svc.create(user, dto({ url: 'javascript:alert(1)' }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(mk().svc.create(user, dto({ description: '<b>hi</b>' }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(mk({ count: 500 }).svc.create(user, dto())).rejects.toBeInstanceOf(ConflictException);
  });
  it('an expired, revoked or foreign extension session cannot clip', async () => {
    await expect(mk({ session: null }).svc.create(user, dto({ sessionId: 's1' }), NOW)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(mk({ session: { id: 's1', revokedAt: NOW, expiresAt: new Date(NOW.getTime() + 1e6) } }).svc.create(user, dto({ sessionId: 's1' }), NOW)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(mk({ session: { id: 's1', revokedAt: null, expiresAt: new Date(NOW.getTime() - 1) } }).svc.create(user, dto({ sessionId: 's1' }), NOW)).rejects.toBeInstanceOf(ForbiddenException);
    const ok = mk({ session: { id: 's1', revokedAt: null, expiresAt: new Date(NOW.getTime() + 1e6) } });
    await ok.svc.create(user, dto({ sessionId: 's1' }), NOW);
    expect(ok.prisma.clippedJob.create).toHaveBeenCalled();
  });
  it('sessions are short-lived, limited, revocable', async () => {
    const a = mk();
    const s: any = await a.svc.createSession(user, { label: 'Chrome' }, NOW);
    expect(s.expiresAt.getTime() - NOW.getTime()).toBe(30 * 60_000);
    expect(s.state).toBe('ACTIVE');
    await expect(mk({ active: 5 }).svc.createSession(user, { label: 'x' }, NOW)).rejects.toBeInstanceOf(ConflictException);
    await expect(mk({ session: null }).svc.revokeSession(user, 's1')).rejects.toBeInstanceOf(NotFoundException);
    const rev: any = await mk({ session: { id: 's1', revokedAt: null } }).svc.revokeSession(user, 's1');
    expect(rev.state).toBe('REVOKED');
  });
  it('filters by tenant AND owner; foreign clips look missing; delete and analyze work for owners', async () => {
    const miss = mk({ clip: null });
    await expect(miss.svc.get(user, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(miss.prisma.clippedJob.findFirst).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't1', userId: 'u1' } });
    await expect(miss.svc.remove(user, 'x')).rejects.toBeInstanceOf(NotFoundException);
    const a = mk();
    const an: any = await a.svc.analyze(user, 'c1');
    expect(an.terms.find((t: any) => t.label === 'Docker').inProfile).toBe(true);
    expect(an.terms.find((t: any) => t.label === 'Cloud platform').inProfile).toBe(false); // unconfirmed skill ignored
    await a.svc.remove(user, 'c1');
    expect(a.prisma.clippedJob.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });
});
