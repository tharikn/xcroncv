import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CareerProfileService } from '../career-profile/career-profile.service';
import { PrismaService } from '../prisma/prisma.service';
import { analyzePosting, contentHash, MAX_SESSIONS, normalizeUrl, sanitizeText, SESSION_MINUTES } from './clip-logic';
import { CreateClipDto, CreateSessionDto, UpdateClipDto } from './dto/clip.dto';

type Clip = Awaited<ReturnType<PrismaService['clippedJob']['findFirstOrThrow']>>;
const MAX_CLIPS = 500;

export const clipView = (c: Clip, withBody = false) => ({
  id: c.id, title: c.title, company: c.company, url: c.url, hostname: c.hostname, source: c.source, status: c.status, createdAt: c.createdAt, updatedAt: c.updatedAt,
  descriptionLength: c.description.length, ...(withBody ? { description: c.description } : { excerpt: c.description.slice(0, 200) }),
});

@Injectable()
export class JobClipperService {
  constructor(private prisma: PrismaService, private profiles: CareerProfileService) {}

  private who(u: AuthUser) { return { tenantId: u.tenantId, userId: u.userId }; }
  private audit(u: AuthUser, action: string, ids: { clipId?: string; sessionId?: string } = {}) {
    return this.prisma.captureAuditEvent.create({ data: { ...this.who(u), action, ...ids } }); // ids only, never page content
  }
  private async owned(u: AuthUser, id: string) {
    const c = await this.prisma.clippedJob.findFirst({ where: { id, ...this.who(u) } });
    if (!c) throw new NotFoundException('Clipped job not found');
    return c;
  }

  async create(u: AuthUser, dto: CreateClipDto, now = new Date()) {
    if (dto.reviewed !== true) throw new BadRequestException('Review and confirm the details before saving. Nothing is stored without that.');
    if (dto.idempotencyKey) {
      const dup = await this.prisma.clippedJob.findFirst({ where: { ...this.who(u), idempotencyKey: dto.idempotencyKey } });
      if (dup) return { ...clipView(dup), duplicate: true };
    }
    let url: string | null = null; let hostname: string | null = null;
    if (dto.url) {
      const n = normalizeUrl(dto.url);
      if (!n) throw new BadRequestException('The URL must be http or https, without a username or password.');
      ({ url, hostname } = n);
    }
    if (dto.sessionId) {
      const s = await this.prisma.extensionSession.findFirst({ where: { id: dto.sessionId, ...this.who(u) } });
      if (!s || s.revokedAt || s.expiresAt <= now) throw new ForbiddenException('This extension session has expired or was revoked. Start a new one from the web app.');
    }
    const description = sanitizeText(dto.description);
    if (description.length < 20) throw new BadRequestException('The description is too short to analyse');
    const title = sanitizeText(dto.title, 200); const company = sanitizeText(dto.company, 200);
    if (!title || !company) throw new BadRequestException('Title and company are required');
    const hash = contentHash(title, company, description);
    const same = await this.prisma.clippedJob.findFirst({ where: { ...this.who(u), contentHash: hash } });
    if (same) return { ...clipView(same), duplicate: true };
    if ((await this.prisma.clippedJob.count({ where: this.who(u) })) >= MAX_CLIPS) throw new ConflictException(`You can keep up to ${MAX_CLIPS} clipped jobs. Delete some first.`);
    const c = await this.prisma.clippedJob.create({
      data: { ...this.who(u), title, company, url, hostname, description, source: dto.source, contentHash: hash, idempotencyKey: dto.idempotencyKey ?? null, sessionId: dto.sessionId ?? null },
    });
    await this.audit(u, 'CLIPPED', { clipId: c.id, sessionId: dto.sessionId });
    return { ...clipView(c), duplicate: false };
  }

  async list(u: AuthUser, page = 1) {
    const rows = await this.prisma.clippedJob.findMany({ where: this.who(u), orderBy: { createdAt: 'desc' }, skip: (page - 1) * 25, take: 25 });
    return rows.map((r) => clipView(r));
  }

  async get(u: AuthUser, id: string) { return clipView(await this.owned(u, id), true); }

  async update(u: AuthUser, id: string, dto: UpdateClipDto) {
    const c = await this.owned(u, id);
    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data['title'] = sanitizeText(dto.title, 200);
    if (dto.company !== undefined) data['company'] = sanitizeText(dto.company, 200);
    if (dto.description !== undefined) data['description'] = sanitizeText(dto.description);
    if (dto.status !== undefined) data['status'] = dto.status;
    if (dto.url !== undefined) {
      if (dto.url === '') { data['url'] = null; data['hostname'] = null; } else {
        const n = normalizeUrl(dto.url); if (!n) throw new BadRequestException('The URL must be http or https, without a username or password.');
        data['url'] = n.url; data['hostname'] = n.hostname;
      }
    }
    if (data['title'] !== undefined || data['company'] !== undefined || data['description'] !== undefined) {
      data['contentHash'] = contentHash((data['title'] as string) ?? c.title, (data['company'] as string) ?? c.company, (data['description'] as string) ?? c.description);
    }
    const row = await this.prisma.clippedJob.update({ where: { id }, data });
    await this.audit(u, 'UPDATED', { clipId: id });
    return clipView(row, true);
  }

  async remove(u: AuthUser, id: string) {
    await this.owned(u, id);
    await this.prisma.clippedJob.delete({ where: { id } });
    await this.audit(u, 'DELETED', { clipId: id });
  }

  /** Deterministic, offline analysis against confirmed profile skills. Works with no AI and no provider. */
  async analyze(u: AuthUser, id: string) {
    const c = await this.owned(u, id);
    let skills: string[] = [];
    try { skills = (await this.profiles.get(u)).skills.filter((s) => s.isUserConfirmed).map((s) => s.name); } catch { /* no profile: everything is "not recorded" */ }
    await this.audit(u, 'ANALYZED', { clipId: id });
    return { clipId: id, ...analyzePosting(c.description, skills) };
  }

  // ---- extension sessions: short-lived, user-scoped, revocable ----
  async createSession(u: AuthUser, dto: CreateSessionDto, now = new Date()) {
    const active = await this.prisma.extensionSession.count({ where: { ...this.who(u), revokedAt: null, expiresAt: { gt: now } } });
    if (active >= MAX_SESSIONS) throw new ConflictException(`You can have up to ${MAX_SESSIONS} active extension sessions. Revoke one first.`);
    const s = await this.prisma.extensionSession.create({ data: { ...this.who(u), label: sanitizeText(dto.label, 60), expiresAt: new Date(now.getTime() + SESSION_MINUTES * 60_000) } });
    await this.audit(u, 'SESSION_CREATED', { sessionId: s.id });
    return this.sessionView(s, now);
  }
  private sessionView(s: { id: string; label: string; expiresAt: Date; revokedAt: Date | null; createdAt: Date }, now = new Date()) {
    return { id: s.id, label: s.label, expiresAt: s.expiresAt, createdAt: s.createdAt, state: s.revokedAt ? 'REVOKED' : s.expiresAt <= now ? 'EXPIRED' : 'ACTIVE' };
  }
  async sessions(u: AuthUser) {
    const rows = await this.prisma.extensionSession.findMany({ where: this.who(u), orderBy: { createdAt: 'desc' }, take: 20 });
    return rows.map((s) => this.sessionView(s));
  }
  async revokeSession(u: AuthUser, id: string) {
    const s = await this.prisma.extensionSession.findFirst({ where: { id, ...this.who(u) } });
    if (!s) throw new NotFoundException('Session not found');
    const row = await this.prisma.extensionSession.update({ where: { id }, data: { revokedAt: s.revokedAt ?? new Date() } });
    await this.audit(u, 'SESSION_REVOKED', { sessionId: id });
    return this.sessionView(row);
  }
}
