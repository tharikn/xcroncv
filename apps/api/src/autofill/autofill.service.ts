import { BadRequestException, ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CareerProfileService } from '../career-profile/career-profile.service';
import { AuthUser } from '../common/auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizeFieldsDto, StartSessionDto } from './dto/autofill.dto';
import { FORBIDDEN_RE, fieldOptions, isKnownKey, isSensitiveKey, resolveValue } from './fields';
import { getAdapter, hostAllowed, normalizeHost, SITE_ADAPTERS } from './site-adapters';

export const SESSION_TTL_MS = 15 * 60_000;

/** Status shown to clients: an unrevoked session past its expiry is EXPIRED. */
export const effectiveStatus = (s: { status: string; expiresAt: Date }, now = new Date()) =>
  s.status !== 'REVOKED' && s.expiresAt <= now ? 'EXPIRED' : s.status;

const view = (s: { id: string; adapterId: string; targetHost: string | null; status: string; consentedKeys: unknown; sensitiveConsent: boolean; expiresAt: Date; createdAt: Date; authorizedAt: Date | null; revokedAt: Date | null }) => ({
  id: s.id, adapterId: s.adapterId, targetHost: s.targetHost, status: effectiveStatus(s), consentedKeys: s.consentedKeys as string[],
  sensitiveConsent: s.sensitiveConsent, expiresAt: s.expiresAt, createdAt: s.createdAt, authorizedAt: s.authorizedAt, revokedAt: s.revokedAt,
});

@Injectable()
export class AutofillService {
  constructor(private prisma: PrismaService, private profiles: CareerProfileService) {}

  adapters() { return SITE_ADAPTERS; }

  /** Tenant AND owner on every lookup. */
  private async owned(user: AuthUser, id: string) {
    const s = await this.prisma.autofillSession.findFirst({ where: { id, tenantId: user.tenantId, userId: user.userId } });
    if (!s) throw new NotFoundException('Autofill session not found');
    return s;
  }

  private audit(sessionId: string, type: string, fieldKeys: string[] = []) {
    // Keys only. Values are never written to the database or logs.
    return this.prisma.autofillAuditEvent.create({ data: { sessionId, type, fieldKeys: fieldKeys as unknown as Prisma.InputJsonValue } });
  }

  async start(user: AuthUser, dto: StartSessionDto, now = new Date()) {
    if (dto.confirm !== true) throw new BadRequestException('Start an autofill session explicitly: confirmation is required');
    const adapter = getAdapter(dto.adapterId);
    if (!adapter) throw new BadRequestException('Unknown site adapter');
    let host: string | null = null;
    if (dto.targetHost?.trim()) {
      host = normalizeHost(dto.targetHost);
      if (!host) throw new BadRequestException('Enter the site hostname only, for example boards.greenhouse.io');
    }
    if (!hostAllowed(adapter, host)) throw new BadRequestException(`The "${adapter.name}" adapter only works on ${adapter.hostPatterns.join(', ')}`);
    await this.profiles.get(user); // a session needs a profile (404 otherwise)
    const s = await this.prisma.autofillSession.create({
      data: { tenantId: user.tenantId, userId: user.userId, adapterId: adapter.id, targetHost: host, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) },
    });
    await this.audit(s.id, 'STARTED');
    return view(s);
  }

  async list(user: AuthUser) {
    const rows = await this.prisma.autofillSession.findMany({
      where: { tenantId: user.tenantId, userId: user.userId }, orderBy: { createdAt: 'desc' }, take: 20,
    });
    return rows.map(view);
  }

  private assertUsable(s: { status: string; expiresAt: Date }, now: Date) {
    if (s.status === 'REVOKED') throw new ConflictException('This session was revoked. Start a new one.');
    if (s.expiresAt <= now) throw new GoneException('This session has expired. Start a new one.');
  }

  /** Review list: labels, sensitivity and masked previews only. No raw values leave until fields are authorised. */
  async fieldOptions(user: AuthUser, id: string, now = new Date()) {
    const s = await this.owned(user, id);
    this.assertUsable(s, now);
    const profile = await this.profiles.get(user);
    return { session: view(s), adapter: getAdapter(s.adapterId), fields: fieldOptions(profile) };
  }

  /**
   * Releases only the selected, confirmed fields. Unknown keys, forbidden categories (credentials, identity numbers,
   * eligibility, demographics, salary) and sensitive fields without explicit consent are rejected, never guessed.
   */
  async authorize(user: AuthUser, id: string, dto: AuthorizeFieldsDto, now = new Date()) {
    if (dto.confirm !== true) throw new BadRequestException('Review and confirm the selected fields before they are released');
    const s = await this.owned(user, id);
    this.assertUsable(s, now);
    const profile = await this.profiles.get(user);

    for (const key of dto.fieldKeys) {
      if (FORBIDDEN_RE.test(key)) throw new BadRequestException(`"${key}" is never filled by this assistant. Answer it yourself on the form.`);
      if (!isKnownKey(profile, key)) throw new BadRequestException(`Unknown field "${key}"`);
    }
    const sensitive = dto.fieldKeys.filter(isSensitiveKey);
    if (sensitive.length && dto.sensitiveConsent !== true) {
      throw new BadRequestException(`Sensitive fields need your explicit consent for this session: ${sensitive.join(', ')}`);
    }

    const adapter = getAdapter(s.adapterId)!;
    const fills: Array<{ fieldKey: string; value: string; selector: string | null }> = [];
    const skipped: string[] = [];
    for (const key of dto.fieldKeys) {
      const value = resolveValue(profile, key);
      if (value === undefined) { skipped.push(key); continue; } // nothing confirmed to fill; stays blank
      fills.push({ fieldKey: key, value, selector: adapter.mode === 'FILL' ? adapter.selectors[key] ?? null : null });
    }
    const granted = fills.map((f) => f.fieldKey);
    const updated = await this.prisma.autofillSession.update({
      where: { id },
      data: {
        status: 'AUTHORIZED', consentedKeys: granted as unknown as Prisma.InputJsonValue,
        sensitiveConsent: sensitive.length > 0 && dto.sensitiveConsent === true, authorizedAt: now,
      },
    });
    await this.audit(id, 'AUTHORIZED', granted);
    return { session: view(updated), mode: adapter.mode, fills, skipped, submit: 'never' as const };
  }

  /** Revocation clears the consent immediately; later authorise calls are refused. Idempotent. */
  async revoke(user: AuthUser, id: string) {
    const s = await this.owned(user, id);
    if (s.status === 'REVOKED') return view(s);
    const updated = await this.prisma.autofillSession.update({
      where: { id }, data: { status: 'REVOKED', consentedKeys: [] as unknown as Prisma.InputJsonValue, sensitiveConsent: false, revokedAt: new Date() },
    });
    await this.audit(id, 'REVOKED');
    return view(updated);
  }
}
