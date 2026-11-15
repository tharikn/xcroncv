import { BadRequestException, GoneException, NotFoundException } from '@nestjs/common';
import {
  decryptId, effectiveStatus, encryptId, endOfDate, normalizeProviderResult, projectCredential, recheckDue, VerificationProvider,
} from '../src/evidence-wallet/credential-logic';
import { credentialView, EvidenceWalletService } from '../src/evidence-wallet/evidence-wallet.service';
import { featureEnabled } from '../src/common/features';

const NOW = new Date('2026-06-01T00:00:00Z');
const rec = (over: any = {}) => ({
  id: 'c1', tenantId: 't1', userId: 'u1', kind: 'CERTIFICATION', name: 'AWS SA', issuer: 'Amazon', issuedOn: '2024-01', expiresOn: '2027-01',
  credentialIdEnc: encryptId('ABC-123456'), credentialIdLast4: '3456', verificationUrl: 'https://v.example/abc', status: 'SELF_REPORTED',
  statusSource: 'USER', statusAt: new Date('2026-01-01T00:00:00Z'), recheckAfter: null, createdAt: NOW, updatedAt: NOW, ...over,
});

describe('credential identifier encryption', () => {
  it('round-trips and is not plaintext', () => {
    const enc = encryptId('ABC-123456');
    expect(enc).not.toContain('ABC');
    expect(decryptId(enc)).toBe('ABC-123456');
    expect(encryptId('ABC-123456')).not.toBe(enc); // random IV
  });
  it('fails on tampering or a different key', () => {
    const enc = encryptId('secret', 'k1');
    expect(() => decryptId(enc, 'k2')).toThrow();
    const buf = Buffer.from(enc, 'base64'); buf[buf.length - 1] ^= 1;
    expect(() => decryptId(buf.toString('base64'), 'k1')).toThrow();
  });
});

describe('status rules', () => {
  it('derives EXPIRED from the expiry date, but revoked always wins', () => {
    expect(effectiveStatus({ status: 'ISSUER_VERIFIED', expiresOn: '2026-05' }, NOW)).toBe('EXPIRED');
    expect(effectiveStatus({ status: 'ISSUER_VERIFIED', expiresOn: '2026-06' }, NOW)).toBe('ISSUER_VERIFIED'); // valid through end of June
    expect(effectiveStatus({ status: 'REVOKED', expiresOn: '2020-01' }, NOW)).toBe('REVOKED');
    expect(effectiveStatus({ status: 'SELF_REPORTED' }, NOW)).toBe('SELF_REPORTED');
  });
  it('parses dates strictly', () => {
    expect(endOfDate('2026-02')!.getUTCDate()).toBe(28);
    expect(endOfDate('2026-02-30')).toBeNull();
    expect(endOfDate('2026-13')).toBeNull();
    expect(endOfDate('nope')).toBeNull();
  });
  it('flags recheck only for verified standings', () => {
    const past = new Date('2026-01-01');
    expect(recheckDue({ status: 'DOCUMENT_REVIEWED', recheckAfter: past }, NOW)).toBe(true);
    expect(recheckDue({ status: 'SELF_REPORTED', recheckAfter: past }, NOW)).toBe(false);
  });
  it('provider results never upgrade beyond what was attested', () => {
    expect(normalizeProviderResult({ outcome: 'VALID' }, NOW).status).toBe('ISSUER_VERIFIED');
    expect(normalizeProviderResult({ outcome: 'REVOKED' }, NOW).status).toBe('REVOKED');
    expect(normalizeProviderResult({ outcome: 'EXPIRED' }, NOW).status).toBe('EXPIRED');
    expect(normalizeProviderResult({ outcome: 'NOT_FOUND' }, NOW).status).toBe('UNABLE_TO_VERIFY');
    expect(normalizeProviderResult({ outcome: 'ERROR' }, NOW).status).toBe('UNABLE_TO_VERIFY');
    const soon = new Date(NOW.getTime() + 10 * 86_400_000);
    expect(normalizeProviderResult({ outcome: 'VALID', validUntil: soon }, NOW).recheckAfter).toEqual(soon);
  });
});

describe('views and projections never expose the identifier', () => {
  it('credentialView masks the id and omits ciphertext', () => {
    const v: any = credentialView(rec() as any, NOW);
    expect(v.credentialIdMasked).toBe('••••3456');
    expect(JSON.stringify(v)).not.toMatch(/credentialIdEnc|ABC-123456/);
  });
  it('projection contains only granted fields; status carries source and time', () => {
    const p = projectCredential(rec() as any, ['name', 'status'], NOW);
    expect(Object.keys(p).sort()).toEqual(['name', 'status', 'statusAsOf', 'statusSource']);
    expect(projectCredential(rec() as any, ['credentialIdMasked'], NOW)).toEqual({ credentialIdMasked: '••••3456' });
    expect(JSON.stringify(projectCredential(rec() as any, ['name', 'issuer', 'issuedOn', 'expiresOn', 'verificationUrl', 'credentialIdMasked', 'status'], NOW))).not.toContain('ABC-123456');
  });
});

describe('EvidenceWalletService', () => {
  const user = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
  const mk = (over: any = {}, providers: VerificationProvider[] = []) => {
    const prisma: any = {
      credentialRecord: {
        findFirst: jest.fn().mockResolvedValue(rec()), create: jest.fn().mockImplementation(async (a: any) => rec(a.data)),
        update: jest.fn().mockImplementation(async (a: any) => rec(a.data)), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(),
        ...over.credentialRecord,
      },
      evidenceReference: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockImplementation(async (a: any) => a.data), findFirst: jest.fn(), delete: jest.fn() },
      credentialVerification: { create: jest.fn().mockImplementation(async (a: any) => a.data), findMany: jest.fn().mockResolvedValue([]) },
      credentialDisclosureGrant: {
        create: jest.fn().mockImplementation(async (a: any) => ({ id: 'g1', revokedAt: null, createdAt: NOW, ...a.data })),
        findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockImplementation(async (a: any) => ({ id: 'g1', ...a.data })),
        ...over.credentialDisclosureGrant,
      },
      project: { findFirst: jest.fn().mockResolvedValue({ id: 'pr' }) },
      skill: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    return { svc: new EvidenceWalletService(prisma, providers), prisma };
  };

  it('filters every owner lookup by tenant AND user and hides foreign records', async () => {
    const { svc, prisma } = mk({ credentialRecord: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(svc.get(user, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.credentialRecord.findFirst).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't1', userId: 'u1' } });
    await expect(svc.createGrant(user, 'x', { purpose: 'RESUME', fields: ['name'], confirm: true })).rejects.toBeInstanceOf(NotFoundException);
  });
  it('creates self-reported credentials with an encrypted identifier and owner from the token', async () => {
    const { svc, prisma } = mk();
    await svc.create(user, { name: 'AWS SA', issuer: 'Amazon', credentialId: 'ABC-123456' });
    const data = prisma.credentialRecord.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: 'u1', tenantId: 't1', credentialIdLast4: '3456' });
    expect(data.status).toBeUndefined(); // default SELF_REPORTED; never client supplied
    expect(data.credentialIdEnc).not.toContain('ABC-123456');
  });
  it('rejects expiry before issue date', async () => {
    await expect(mk().svc.create(user, { name: 'a', issuer: 'b', issuedOn: '2025-01', expiresOn: '2024-01' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('editing verified facts resets the standing to self-reported; cosmetic edits do not', async () => {
    const verified = { credentialRecord: { findFirst: jest.fn().mockResolvedValue(rec({ status: 'DOCUMENT_REVIEWED' })) } };
    const a = mk(verified);
    await a.svc.update(user, 'c1', { name: 'Different' });
    expect(a.prisma.credentialRecord.update.mock.calls[0][0].data).toMatchObject({ status: 'SELF_REPORTED', recheckAfter: null });
    const b = mk(verified);
    await b.svc.update(user, 'c1', { verificationUrl: 'https://x.example' });
    expect(b.prisma.credentialRecord.update.mock.calls[0][0].data.status).toBeUndefined();
    const c = mk(verified);
    await c.svc.update(user, 'c1', { name: 'AWS SA' }); // unchanged value
    expect(c.prisma.credentialRecord.update.mock.calls[0][0].data.status).toBeUndefined();
  });

  describe('evidence', () => {
    it('links only to profile items the caller owns', async () => {
      const { svc, prisma } = mk();
      await svc.addEvidence(user, 'c1', { kind: 'PROFILE_ITEM', label: 'Project', profileItemType: 'PROJECT', profileItemId: 'pr' });
      expect(prisma.project.findFirst).toHaveBeenCalledWith({ where: { id: 'pr', profile: { userId: 'u1', tenantId: 't1' } } });
      await expect(svc.addEvidence(user, 'c1', { kind: 'PROFILE_ITEM', label: 'x', profileItemType: 'SKILL', profileItemId: 'foreign' })).rejects.toBeInstanceOf(NotFoundException);
    });
    it('a link needs a URL; local notes store no URL', async () => {
      const { svc, prisma } = mk();
      await expect(svc.addEvidence(user, 'c1', { kind: 'LINK', label: 'x' })).rejects.toBeInstanceOf(BadRequestException);
      await svc.addEvidence(user, 'c1', { kind: 'LOCAL_NOTE', label: 'PDF in Documents/Certs', url: 'https://ignored.example' });
      expect(prisma.evidenceReference.create.mock.calls[0][0].data.url).toBeNull();
    });
  });

  describe('verification', () => {
    it('needs explicit consent', async () => {
      await expect(mk().svc.requestVerification(user, 'c1', { consent: false, method: 'SELF_DOCUMENT_REVIEW' })).rejects.toBeInstanceOf(BadRequestException);
    });
    it('self review is labelled as user-sourced, never issuer-verified', async () => {
      const { svc, prisma } = mk();
      await svc.requestVerification(user, 'c1', { consent: true, method: 'SELF_DOCUMENT_REVIEW' }, NOW);
      expect(prisma.credentialRecord.update.mock.calls[0][0].data).toMatchObject({ status: 'DOCUMENT_REVIEWED', statusSource: 'USER' });
    });
    it('with no provider connected the attempt is recorded as unable-to-verify (manual workflow unaffected)', async () => {
      const { svc, prisma } = mk();
      const r = await svc.requestVerification(user, 'c1', { consent: true, method: 'PROVIDER', provider: 'acme' }, NOW);
      expect(r.verification.status).toBe('UNABLE_TO_VERIFY');
      expect(prisma.credentialRecord.update.mock.calls[0][0].data.status).toBe('UNABLE_TO_VERIFY');
    });
    it('a failed attempt never downgrades an earned standing but is kept in history', async () => {
      const { svc, prisma } = mk({ credentialRecord: { findFirst: jest.fn().mockResolvedValue(rec({ status: 'DOCUMENT_REVIEWED' })) } });
      const r = await svc.requestVerification(user, 'c1', { consent: true, method: 'PROVIDER', provider: 'none' }, NOW);
      expect(r.applied).toBe(false);
      expect(prisma.credentialRecord.update).not.toHaveBeenCalled();
      expect(prisma.credentialVerification.create).toHaveBeenCalled();
    });
    it('a connected provider can attest issuer verification, with source and decrypted id passed only to it', async () => {
      const provider: VerificationProvider = { id: 'acme', verify: jest.fn().mockResolvedValue({ outcome: 'VALID' }) };
      const { svc, prisma } = mk({}, [provider]);
      await svc.requestVerification(user, 'c1', { consent: true, method: 'PROVIDER', provider: 'acme' }, NOW);
      expect((provider.verify as jest.Mock).mock.calls[0][0].credentialId).toBe('ABC-123456');
      expect(prisma.credentialRecord.update.mock.calls[0][0].data).toMatchObject({ status: 'ISSUER_VERIFIED', statusSource: 'PROVIDER:acme' });
    });
    it('a provider outage degrades to unable-to-verify without throwing', async () => {
      const provider: VerificationProvider = { id: 'acme', verify: jest.fn().mockRejectedValue(new Error('down')) };
      const { svc } = mk({}, [provider]);
      const r = await svc.requestVerification(user, 'c1', { consent: true, method: 'PROVIDER', provider: 'acme' }, NOW);
      expect(r.verification.status).toBe('UNABLE_TO_VERIFY');
    });
  });

  describe('disclosure grants', () => {
    it('require confirmation (nothing is disclosed by default)', async () => {
      await expect(mk().svc.createGrant(user, 'c1', { purpose: 'RESUME', fields: ['name'], confirm: false })).rejects.toBeInstanceOf(BadRequestException);
    });
    it('create a bounded, purpose-bound grant with a minimal projection', async () => {
      const { svc, prisma } = mk();
      const g: any = await svc.createGrant(user, 'c1', { purpose: 'RECRUITER_SHARE', recipientLabel: 'Acme recruiter', fields: ['name', 'issuer'], expiresInDays: 7, confirm: true }, NOW);
      const data = prisma.credentialDisclosureGrant.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ userId: 'u1', tenantId: 't1', purpose: 'RECRUITER_SHARE' });
      expect(data.expiresAt.getTime() - NOW.getTime()).toBe(7 * 86_400_000);
      expect(g.projection).toEqual({ name: 'AWS SA', issuer: 'Amazon' });
    });
    it('projection is 410 once expired or revoked and 404 for foreign grants', async () => {
      const grant = (over: any) => ({ credentialDisclosureGrant: { findFirst: jest.fn().mockResolvedValue({ id: 'g1', credentialId: 'c1', fields: ['name'], purpose: 'RESUME', expiresAt: new Date('2027-01-01'), revokedAt: null, ...over }) } });
      expect((await mk(grant({})).svc.grantProjection(user, 'g1', NOW)).projection).toEqual({ name: 'AWS SA' });
      await expect(mk(grant({ expiresAt: new Date('2026-01-01') })).svc.grantProjection(user, 'g1', NOW)).rejects.toBeInstanceOf(GoneException);
      await expect(mk(grant({ revokedAt: NOW })).svc.grantProjection(user, 'g1', NOW)).rejects.toBeInstanceOf(GoneException);
      await expect(mk().svc.grantProjection(user, 'g1', NOW)).rejects.toBeInstanceOf(NotFoundException);
    });
    it('revoke is owner-scoped and idempotent', async () => {
      const one = { credentialDisclosureGrant: { findFirst: jest.fn().mockResolvedValue({ id: 'g1', revokedAt: null, expiresAt: new Date('2027-01-01') }) } };
      const a = mk(one);
      expect((await a.svc.revokeGrant(user, 'g1', NOW)).state).toBe('REVOKED');
      expect(a.prisma.credentialDisclosureGrant.findFirst).toHaveBeenCalledWith({ where: { id: 'g1', tenantId: 't1', userId: 'u1' } });
      const done = mk({ credentialDisclosureGrant: { findFirst: jest.fn().mockResolvedValue({ id: 'g1', revokedAt: NOW, expiresAt: new Date('2027-01-01') }) } });
      await done.svc.revokeGrant(user, 'g1', NOW);
      expect(done.prisma.credentialDisclosureGrant.update).not.toHaveBeenCalled();
    });
  });

  it('can be disabled by feature flag', () => { expect(featureEnabled('evidence-wallet', 'x,evidence-wallet')).toBe(false); });
});
