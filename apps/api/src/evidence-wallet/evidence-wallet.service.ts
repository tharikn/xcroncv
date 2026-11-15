import { BadRequestException, GoneException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptId, effectiveStatus, encryptId, maskedId, normalizeProviderResult, projectCredential, recheckDue, recheckFromNow,
  VERIFICATION_PROVIDERS, VerificationProvider,
} from './credential-logic';
import {
  AddEvidenceDto, CreateCredentialDto, CreateGrantDto, UpdateCredentialDto, VerificationRequestDto,
} from './dto/credential.dto';

type Rec = Awaited<ReturnType<PrismaService['credentialRecord']['findFirstOrThrow']>>;

/** Public shape: the encrypted identifier is never returned, only a masked tail. */
export function credentialView(c: Rec, now = new Date()) {
  return {
    id: c.id, kind: c.kind, name: c.name, issuer: c.issuer, issuedOn: c.issuedOn, expiresOn: c.expiresOn,
    credentialIdMasked: maskedId(c.credentialIdLast4), hasCredentialId: !!c.credentialIdEnc, verificationUrl: c.verificationUrl,
    status: c.status, effectiveStatus: effectiveStatus(c, now), statusSource: c.statusSource, statusAt: c.statusAt,
    recheckAfter: c.recheckAfter, recheckDue: recheckDue(c, now), createdAt: c.createdAt, updatedAt: c.updatedAt,
  };
}

const PROFILE_DELEGATE: Record<string, string> = {
  EXPERIENCE: 'experience', PROJECT: 'project', SKILL: 'skill', EDUCATION: 'education', CERTIFICATION: 'certification',
};
const MATERIAL_FIELDS = ['name', 'issuer', 'issuedOn', 'expiresOn', 'credentialId'] as const;

@Injectable()
export class EvidenceWalletService {
  constructor(private prisma: PrismaService, @Optional() @Inject(VERIFICATION_PROVIDERS) private providers: VerificationProvider[] = []) {}

  /** Tenant AND owner on every lookup; foreign ids look like missing ones. */
  private async owned(user: AuthUser, id: string) {
    const c = await this.prisma.credentialRecord.findFirst({ where: { id, tenantId: user.tenantId, userId: user.userId } });
    if (!c) throw new NotFoundException('Credential not found');
    return c;
  }

  private idFields(raw: string | undefined) {
    const id = raw?.trim();
    return id ? { credentialIdEnc: encryptId(id), credentialIdLast4: id.slice(-4) } : { credentialIdEnc: null, credentialIdLast4: null };
  }

  private checkDates(issuedOn?: string | null, expiresOn?: string | null) {
    if (issuedOn && expiresOn && expiresOn < issuedOn) throw new BadRequestException('Expiry cannot be before the issue date');
  }

  async create(user: AuthUser, dto: CreateCredentialDto) {
    this.checkDates(dto.issuedOn, dto.expiresOn);
    const c = await this.prisma.credentialRecord.create({
      data: {
        tenantId: user.tenantId, userId: user.userId, kind: dto.kind ?? 'CERTIFICATION', name: dto.name, issuer: dto.issuer,
        issuedOn: dto.issuedOn ?? null, expiresOn: dto.expiresOn ?? null, verificationUrl: dto.verificationUrl ?? null,
        ...this.idFields(dto.credentialId), // status is always SELF_REPORTED at creation; it can only be raised by verification
      },
    });
    return credentialView(c);
  }

  async list(user: AuthUser, page = 1, pageSize = 25) {
    const rows = await this.prisma.credentialRecord.findMany({
      where: { tenantId: user.tenantId, userId: user.userId }, orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize, take: Math.min(pageSize, 50),
    });
    return rows.map((r) => credentialView(r));
  }

  async get(user: AuthUser, id: string) {
    const c = await this.owned(user, id);
    const evidence = await this.prisma.evidenceReference.findMany({ where: { credentialId: id }, orderBy: { createdAt: 'asc' } });
    const items = await Promise.all(evidence.map(async (e) => ({
      id: e.id, kind: e.kind, label: e.label, url: e.url, profileItemType: e.profileItemType, profileItemId: e.profileItemId,
      createdAt: e.createdAt,
      // profile saves recreate items, so a link can go stale; flag it instead of hiding it
      profileLinkValid: e.kind === 'PROFILE_ITEM' ? await this.profileItemExists(user, e.profileItemType, e.profileItemId) : undefined,
    })));
    return { ...credentialView(c), evidence: items };
  }

  /** Changing facts that were verified invalidates that verification: the status returns to self-reported. */
  async update(user: AuthUser, id: string, dto: UpdateCredentialDto) {
    const c = await this.owned(user, id);
    this.checkDates(dto.issuedOn === undefined ? c.issuedOn : dto.issuedOn, dto.expiresOn === undefined ? c.expiresOn : dto.expiresOn);
    const data: Prisma.CredentialRecordUpdateInput = {};
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.issuer !== undefined) data.issuer = dto.issuer;
    if (dto.issuedOn !== undefined) data.issuedOn = dto.issuedOn;
    if (dto.expiresOn !== undefined) data.expiresOn = dto.expiresOn;
    if (dto.verificationUrl !== undefined) data.verificationUrl = dto.verificationUrl;
    if (dto.credentialId !== undefined) Object.assign(data, this.idFields(dto.credentialId));
    const changed = MATERIAL_FIELDS.some((f) => dto[f] !== undefined && (f === 'credentialId' ? true : dto[f] !== (c as Record<string, unknown>)[f]));
    if (changed && c.status !== 'SELF_REPORTED') {
      Object.assign(data, { status: 'SELF_REPORTED', statusSource: 'USER', statusAt: new Date(), recheckAfter: null });
    }
    return credentialView(await this.prisma.credentialRecord.update({ where: { id }, data }));
  }

  async remove(user: AuthUser, id: string) {
    await this.owned(user, id);
    await this.prisma.credentialRecord.delete({ where: { id } }); // evidence, verifications and grants cascade
  }

  // ---- evidence references (metadata only) ----
  private async profileItemExists(user: AuthUser, type?: string | null, itemId?: string | null) {
    const delegate = type ? PROFILE_DELEGATE[type] : undefined;
    if (!delegate || !itemId) return false;
    const found = await (this.prisma as unknown as Record<string, { findFirst(a: unknown): Promise<unknown> }>)[delegate].findFirst({
      where: { id: itemId, profile: { userId: user.userId, tenantId: user.tenantId } },
    });
    return !!found;
  }

  async addEvidence(user: AuthUser, id: string, dto: AddEvidenceDto) {
    await this.owned(user, id);
    if (dto.kind === 'LINK' && !dto.url) throw new BadRequestException('A link needs a URL');
    if (dto.kind === 'PROFILE_ITEM') {
      if (!dto.profileItemType || !dto.profileItemId) throw new BadRequestException('Choose the profile item to link');
      if (!(await this.profileItemExists(user, dto.profileItemType, dto.profileItemId))) throw new NotFoundException('Profile item not found');
    }
    const e = await this.prisma.evidenceReference.create({
      data: {
        credentialId: id, kind: dto.kind, label: dto.label,
        url: dto.kind === 'LINK' ? dto.url : null,
        profileItemType: dto.kind === 'PROFILE_ITEM' ? dto.profileItemType : null,
        profileItemId: dto.kind === 'PROFILE_ITEM' ? dto.profileItemId : null,
      },
    });
    return e;
  }

  async removeEvidence(user: AuthUser, id: string, evidenceId: string) {
    await this.owned(user, id);
    const e = await this.prisma.evidenceReference.findFirst({ where: { id: evidenceId, credentialId: id } });
    if (!e) throw new NotFoundException('Evidence not found');
    await this.prisma.evidenceReference.delete({ where: { id: evidenceId } });
  }

  // ---- verification ----
  async requestVerification(user: AuthUser, id: string, dto: VerificationRequestDto, now = new Date()) {
    if (dto.consent !== true) throw new BadRequestException('Verification is only attempted with your explicit consent');
    const c = await this.owned(user, id);
    let status: string; let source: string; let recheckAfter: Date | null; let note: string | null = dto.note ?? null;

    if (dto.method === 'SELF_DOCUMENT_REVIEW') {
      // Labelled honestly: the owner attests they reviewed the original. This is never "issuer verified".
      status = 'DOCUMENT_REVIEWED'; source = 'USER'; recheckAfter = recheckFromNow(now);
    } else {
      const provider = this.providers?.find((p) => p.id === dto.provider);
      if (!provider) {
        status = 'UNABLE_TO_VERIFY'; source = 'PROVIDER:none'; recheckAfter = null;
        note = 'No verification provider is connected. Your credential keeps its current standing.';
      } else {
        let result;
        try {
          result = await provider.verify({
            name: c.name, issuer: c.issuer, verificationUrl: c.verificationUrl ?? undefined,
            credentialId: c.credentialIdEnc ? decryptId(c.credentialIdEnc) : undefined,
          });
        } catch { result = { outcome: 'ERROR' as const }; } // provider outage never blocks manual use
        ({ status, recheckAfter } = normalizeProviderResult(result, now));
        source = `PROVIDER:${provider.id}`;
      }
    }

    // A failed attempt is recorded in history but never downgrades a standing the user already earned.
    const applies = status !== 'UNABLE_TO_VERIFY' || c.status === 'SELF_REPORTED';
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.credentialVerification.create({ data: { credentialId: id, status, source, note, checkedAt: now, recheckAfter } });
      if (applies) await tx.credentialRecord.update({ where: { id }, data: { status, statusSource: source, statusAt: now, recheckAfter } });
      return { verification: v, applied: applies };
    });
  }

  async verification(user: AuthUser, id: string, now = new Date()) {
    const c = await this.owned(user, id);
    const history = await this.prisma.credentialVerification.findMany({ where: { credentialId: id }, orderBy: { checkedAt: 'desc' }, take: 20 });
    return {
      status: c.status, effectiveStatus: effectiveStatus(c, now), source: c.statusSource, asOf: c.statusAt,
      recheckAfter: c.recheckAfter, recheckDue: recheckDue(c, now), history,
    };
  }

  // ---- disclosure grants ----
  private grantState(g: { revokedAt: Date | null; expiresAt: Date }, now = new Date()) {
    return g.revokedAt ? 'REVOKED' : g.expiresAt <= now ? 'EXPIRED' : 'ACTIVE';
  }

  async createGrant(user: AuthUser, id: string, dto: CreateGrantDto, now = new Date()) {
    if (dto.confirm !== true) throw new BadRequestException('Confirm what you are disclosing; nothing is shared by default');
    const c = await this.owned(user, id);
    const expiresAt = new Date(now.getTime() + (dto.expiresInDays ?? 30) * 86_400_000);
    const g = await this.prisma.credentialDisclosureGrant.create({
      data: {
        tenantId: user.tenantId, userId: user.userId, credentialId: id, purpose: dto.purpose, recipientLabel: dto.recipientLabel ?? null,
        fields: dto.fields as unknown as Prisma.InputJsonValue, expiresAt,
      },
    });
    return { ...g, state: this.grantState(g, now), projection: projectCredential(c, dto.fields, now) };
  }

  async listGrants(user: AuthUser, id: string, now = new Date()) {
    await this.owned(user, id);
    const rows = await this.prisma.credentialDisclosureGrant.findMany({ where: { credentialId: id, tenantId: user.tenantId, userId: user.userId }, orderBy: { createdAt: 'desc' } });
    return rows.map((g) => ({ ...g, state: this.grantState(g, now) }));
  }

  private async ownedGrant(user: AuthUser, grantId: string) {
    const g = await this.prisma.credentialDisclosureGrant.findFirst({ where: { id: grantId, tenantId: user.tenantId, userId: user.userId } });
    if (!g) throw new NotFoundException('Disclosure not found');
    return g;
  }

  /** What the recipient may see right now. Expired or revoked grants disclose nothing (410). */
  async grantProjection(user: AuthUser, grantId: string, now = new Date()) {
    const g = await this.ownedGrant(user, grantId);
    if (this.grantState(g, now) !== 'ACTIVE') throw new GoneException('This disclosure is no longer active');
    const c = await this.owned(user, g.credentialId);
    return { purpose: g.purpose, recipientLabel: g.recipientLabel, expiresAt: g.expiresAt, projection: projectCredential(c, g.fields as unknown as string[], now) };
  }

  async revokeGrant(user: AuthUser, grantId: string, now = new Date()) {
    const g = await this.ownedGrant(user, grantId);
    if (g.revokedAt) return { ...g, state: 'REVOKED' };
    const u = await this.prisma.credentialDisclosureGrant.update({ where: { id: grantId }, data: { revokedAt: now } });
    return { ...u, state: 'REVOKED' };
  }
}
