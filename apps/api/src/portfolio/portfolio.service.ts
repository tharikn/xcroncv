import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { CareerProfileService } from '../career-profile/career-profile.service';
import { AuthUser } from '../common/auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePortfolioDto, CreatePortfolioVersionDto, PreviewDto, PublishDto, SharePolicyDto,
} from './dto/portfolio.dto';
import { hashPassword, LOCK_MS, MAX_FAILED_ATTEMPTS, passwordProblem, verifyPassword } from './password';
import { buildSnapshot, disclosedCount, Selection, selectionProblem, Snapshot } from './snapshot';

export const MAX_EXPIRY_DAYS = 365;
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url'); // 43 chars, 256 bits

type PortfolioRow = { tokenHash?: string | null; passwordHash?: string | null; passwordFailCount?: number; passwordLockedUntil?: Date | null } & Record<string, unknown>;
/** The hash never leaves the service; callers only learn whether a link is active. */
const strip = ({ tokenHash, passwordHash, passwordFailCount, passwordLockedUntil, ...rest }: PortfolioRow) => ({ ...rest, hasActiveLink: !!tokenHash, passwordProtected: !!passwordHash });

@Injectable()
export class PortfolioService {
  private log = new Logger('Portfolio');
  constructor(private prisma: PrismaService, private profiles: CareerProfileService) {}

  /** Tenant AND owner on every lookup; foreign ids look like missing ones. */
  private async owned(user: AuthUser, id: string) {
    const p = await this.prisma.portfolio.findFirst({ where: { id, tenantId: user.tenantId, userId: user.userId } });
    if (!p) throw new NotFoundException('Portfolio not found');
    return p;
  }

  private async snapshotFor(user: AuthUser, selection: Selection): Promise<Snapshot> {
    const problem = selectionProblem(selection);
    if (problem) throw new BadRequestException(problem);
    return buildSnapshot(await this.profiles.get(user), selection); // 404 when no profile
  }

  private checkExpiry(iso: string | null | undefined, now = new Date()): Date | null | undefined {
    if (iso === undefined) return undefined;
    if (iso === null) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime()) || d <= now) throw new BadRequestException('Expiry must be a future date');
    if (d.getTime() - now.getTime() > MAX_EXPIRY_DAYS * 86_400_000) throw new BadRequestException(`Expiry cannot be more than ${MAX_EXPIRY_DAYS} days away`);
    return d;
  }

  private event(portfolioId: string, type: string, versionNumber?: number) {
    return this.prisma.portfolioEvent.create({ data: { portfolioId, type, versionNumber } });
  }

  async create(user: AuthUser, dto: CreatePortfolioDto) {
    const snapshot = await this.snapshotFor(user, dto.selection as unknown as Selection);
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.portfolio.create({
        data: { tenantId: user.tenantId, userId: user.userId, name: dto.name, roleFamily: dto.roleFamily, currentVersion: 1 },
      });
      const v = await tx.portfolioVersion.create({
        data: {
          portfolioId: p.id, versionNumber: 1, theme: dto.theme ?? 'light', changeSummary: 'Initial snapshot',
          selection: dto.selection as unknown as Prisma.InputJsonValue, snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.portfolioEvent.create({ data: { portfolioId: p.id, type: 'CREATED', versionNumber: 1 } });
      return { ...strip(p), version: { versionNumber: v.versionNumber, disclosedCount: disclosedCount(snapshot) } };
    });
  }

  async list(user: AuthUser, page = 1, pageSize = 20) {
    const rows = await this.prisma.portfolio.findMany({
      where: { tenantId: user.tenantId, userId: user.userId }, orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize, take: Math.min(pageSize, 50),
    });
    return rows.map((r) => strip(r));
  }

  async get(user: AuthUser, id: string) {
    const p = await this.owned(user, id);
    const versions = await this.prisma.portfolioVersion.findMany({
      where: { portfolioId: id }, orderBy: { versionNumber: 'desc' },
    });
    const views = await this.prisma.portfolioEvent.count({ where: { portfolioId: id, type: 'VIEWED' } });
    const expired = !!p.expiresAt && p.expiresAt <= new Date();
    return {
      ...strip(p), expired, views,
      versions: versions.map((v) => ({
        id: v.id, versionNumber: v.versionNumber, theme: v.theme, changeSummary: v.changeSummary, createdAt: v.createdAt,
        selection: v.selection, disclosedCount: disclosedCount(v.snapshot as unknown as Snapshot),
        published: p.status === 'PUBLISHED' && p.publishedVersion === v.versionNumber,
      })),
    };
  }

  /** Snapshots are immutable and never change what is already published; facts added later are not exposed. */
  async createVersion(user: AuthUser, id: string, dto: CreatePortfolioVersionDto) {
    const p = await this.owned(user, id);
    const snapshot = await this.snapshotFor(user, dto.selection as unknown as Selection);
    const versionNumber = p.currentVersion + 1;
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.portfolioVersion.create({
        data: {
          portfolioId: id, versionNumber, theme: dto.theme ?? 'light', changeSummary: dto.changeSummary ?? null,
          selection: dto.selection as unknown as Prisma.InputJsonValue, snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.portfolio.update({ where: { id }, data: { currentVersion: versionNumber } });
      await tx.portfolioEvent.create({ data: { portfolioId: id, type: 'VERSIONED', versionNumber } });
      return { id: v.id, versionNumber, disclosedCount: disclosedCount(snapshot) };
    });
  }

  /** Private preview of exactly what an anonymous visitor would see. Nothing is stored. */
  async preview(user: AuthUser, id: string, dto: PreviewDto) {
    const p = await this.owned(user, id);
    if (dto.selection) {
      return { theme: 'light', snapshot: await this.snapshotFor(user, dto.selection as unknown as Selection), draft: true };
    }
    const v = await this.prisma.portfolioVersion.findUnique({
      where: { portfolioId_versionNumber: { portfolioId: id, versionNumber: dto.versionNumber ?? p.currentVersion } },
    });
    if (!v) throw new NotFoundException('Version not found');
    return { theme: v.theme, snapshot: v.snapshot as unknown as Snapshot, versionNumber: v.versionNumber, draft: false };
  }

  /** Returns the raw share token once. Only its hash is stored, so it cannot be shown again. */
  async publish(user: AuthUser, id: string, dto: PublishDto) {
    if (dto.confirm !== true) throw new BadRequestException('Explicit confirmation is required to publish a portfolio');
    await this.owned(user, id);
    const expiresAt = this.checkExpiry(dto.expiresAt);
    const v = await this.prisma.portfolioVersion.findUnique({
      where: { portfolioId_versionNumber: { portfolioId: id, versionNumber: dto.versionNumber } },
    });
    if (!v) throw new NotFoundException('Version not found');
    if (disclosedCount(v.snapshot as unknown as Snapshot) === 0) throw new BadRequestException('Nothing is selected to publish. Choose at least one field.');
    const token = newToken();
    const p = await this.prisma.portfolio.update({
      where: { id },
      data: {
        status: 'PUBLISHED', publishedVersion: v.versionNumber, publishedAt: new Date(), revokedAt: null,
        tokenHash: hashToken(token), expiresAt: expiresAt ?? null, noIndex: dto.noIndex ?? true,
      },
    });
    await this.event(id, 'PUBLISHED', v.versionNumber);
    return { ...strip(p), token, sharePath: `/p/${token}` };
  }

  /** Immediate: the hash is removed, so the link stops resolving on the next request. */
  async revoke(user: AuthUser, id: string) {
    await this.owned(user, id);
    const p = await this.prisma.portfolio.update({
      where: { id }, data: { status: 'REVOKED', tokenHash: null, revokedAt: new Date(), publishedVersion: null },
    });
    await this.event(id, 'REVOKED');
    return strip(p);
  }

  /**
   * Password gate on the SAME anonymous route (no new public route). Holding a valid token already proves the link exists, so a 401 with
   * passwordRequired reveals nothing new. Failed guesses are counted per portfolio and lock the link for 15 minutes after 5 misses,
   * on top of the per-IP throttle. The snapshot is never read before the check passes.
   */
  private async checkPassword(p: { id: string; passwordHash: string | null; passwordFailCount: number; passwordLockedUntil: Date | null }, password: string | undefined, now: Date) {
    if (p.passwordLockedUntil && p.passwordLockedUntil > now) throw new HttpException('Too many incorrect attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    if (!password) throw new UnauthorizedException({ message: 'This portfolio is password protected.', passwordRequired: true });
    if (password.length > 128 || !(await verifyPassword(password, p.passwordHash as string))) {
      const fails = (p.passwordFailCount ?? 0) + 1;
      await this.prisma.portfolio.update({ where: { id: p.id }, data: fails >= MAX_FAILED_ATTEMPTS ? { passwordFailCount: 0, passwordLockedUntil: new Date(now.getTime() + LOCK_MS) } : { passwordFailCount: fails } });
      throw new UnauthorizedException({ message: 'Incorrect password.', passwordRequired: true });
    }
    if (p.passwordFailCount) await this.prisma.portfolio.update({ where: { id: p.id }, data: { passwordFailCount: 0 } });
  }

  async updateSharePolicy(user: AuthUser, id: string, dto: SharePolicyDto) {
    await this.owned(user, id);
    const data: Prisma.PortfolioUpdateInput = {};
    const exp = this.checkExpiry(dto.expiresAt);
    if (exp !== undefined) data.expiresAt = exp;
    if (dto.noIndex !== undefined) data.noIndex = dto.noIndex;
    if (dto.password !== undefined) {
      if (dto.password === null || dto.password === '') { data.passwordHash = null; data.passwordFailCount = 0; data.passwordLockedUntil = null; }
      else {
        const problem = passwordProblem(dto.password);
        if (problem) throw new BadRequestException(problem);
        data.passwordHash = await hashPassword(dto.password); data.passwordFailCount = 0; data.passwordLockedUntil = null;
      }
    }
    const p = await this.prisma.portfolio.update({ where: { id }, data });
    await this.event(id, 'POLICY_CHANGED');
    return strip(p);
  }

  async remove(user: AuthUser, id: string) {
    await this.owned(user, id);
    await this.prisma.portfolio.delete({ where: { id } }); // versions + events cascade
  }

  /**
   * Anonymous read by unguessable token. Every failure (bad format, unknown, revoked, expired, unpublished) is the same
   * 404 so tokens cannot be probed. Returns only the allowlisted snapshot, never ids, owner or internal names.
   */
  async publicView(token: string, now = new Date(), password?: string) {
    const notFound = () => new NotFoundException('Portfolio not found');
    if (!TOKEN_RE.test(token)) throw notFound();
    const p = await this.prisma.portfolio.findFirst({ where: { tokenHash: hashToken(token), status: 'PUBLISHED' } });
    if (!p || p.publishedVersion == null) throw notFound();
    if (p.expiresAt && p.expiresAt <= now) throw notFound();
    if (p.passwordHash) await this.checkPassword(p, password, now);
    const v = await this.prisma.portfolioVersion.findUnique({
      where: { portfolioId_versionNumber: { portfolioId: p.id, versionNumber: p.publishedVersion } },
    });
    if (!v) throw notFound();
    this.event(p.id, 'VIEWED', v.versionNumber).catch(() => this.log.warn('view event failed')); // best effort, no visitor data
    return {
      noIndex: p.noIndex, view: {
        schemaVersion: 1, theme: v.theme, publishedAt: p.publishedAt, expiresAt: p.expiresAt, snapshot: v.snapshot as unknown as Snapshot,
      },
    };
  }
}
