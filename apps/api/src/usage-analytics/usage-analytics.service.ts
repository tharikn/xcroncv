import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { RecordUsageDto, UsageQueryDto } from './dto/usage.dto';
import { usageReport, UsageFilters } from './usage-aggregate';

const MAX_ROWS = 50_000;
const RETENTION_DAYS = 400; // documented raw-event retention

@Injectable()
export class UsageAnalyticsService {
  constructor(private prisma: PrismaService) {}

  /** Idempotent ingest keyed by (userId, eventId). userId/tenantId come from the token. */
  async record(u: AuthUser, dto: RecordUsageDto) {
    const limit = Date.now() + 86_400_000;
    if (dto.events.some((e) => new Date(e.occurredAt).getTime() > limit)) throw new BadRequestException('Events cannot be dated in the future');
    const res = await this.prisma.usageEvent.createMany({
      skipDuplicates: true,
      data: dto.events.map((e) => ({
        eventId: e.eventId, name: e.name, occurredAt: new Date(e.occurredAt), tenantId: u.tenantId, userId: u.userId,
        sessionId: e.sessionId, platform: e.platform, appVersion: e.appVersion, templateId: e.templateId, templateVersion: e.templateVersion,
        resumeId: e.resumeId, exportFormat: e.exportFormat, status: e.status, failureCategory: e.failureCategory, durationMs: e.durationMs,
      })),
    });
    return { created: res.count, duplicates: dto.events.length - res.count };
  }

  filters(q: UsageQueryDto): UsageFilters {
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    if (from && to && from > to) throw new BadRequestException('"from" must be before "to"');
    return { from, to, platform: q.platform, templateId: q.templateId, templateVersion: q.templateVersion, exportFormat: q.exportFormat, feature: q.feature };
  }

  async report(q: UsageQueryDto) {
    const f = this.filters(q);
    const since = f.from ?? new Date(Date.now() - 30 * 86_400_000);
    const range = { gte: since, ...(f.to ? { lte: f.to } : {}) };
    const [rows, ai] = await Promise.all([
      this.prisma.usageEvent.findMany({
        where: { occurredAt: range },
        select: { name: true, occurredAt: true, userId: true, sessionId: true, platform: true, templateId: true, templateVersion: true, exportFormat: true, status: true, failureCategory: true, durationMs: true },
        take: MAX_ROWS, orderBy: { occurredAt: 'desc' },
      }),
      this.prisma.aiUsageEvent.findMany({ where: { createdAt: range }, select: { feature: true, status: true, costMicros: true, userId: true, createdAt: true }, take: MAX_ROWS }),
    ]);
    return { ...usageReport(rows, { ...f, from: since }, ai), truncated: rows.length >= MAX_ROWS, retentionDays: RETENTION_DAYS };
  }
}
