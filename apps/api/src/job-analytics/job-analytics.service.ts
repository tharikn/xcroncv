import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CrmService } from '../crm/crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { activity, EventRow, Filters, funnel, overview, resumeVersions } from './aggregate';
import { AnalyticsQueryDto, EventDto } from './dto/analytics.dto';
import { eventsFromVault, HOST_EVENT_CONNECTOR, HostEventConnector, notConfiguredConnector } from './ingest';

const MAX_ROWS = 5000;

export function toFilters(q: AnalyticsQueryDto): Filters {
  const from = q.from ? new Date(q.from) : undefined;
  const to = q.to ? new Date(q.to) : undefined;
  if (from && to && from > to) throw new BadRequestException('"from" must be before "to"');
  return { from, to, roleFamily: q.roleFamily, geography: q.geography, seniority: q.seniority, sourceName: q.sourceName };
}

@Injectable()
export class JobAnalyticsService {
  private host: HostEventConnector;
  constructor(private prisma: PrismaService, private crm: CrmService, @Optional() @Inject(HOST_EVENT_CONNECTOR) host?: HostEventConnector) { this.host = host ?? notConfiguredConnector; }

  private scope(u: AuthUser) { return { tenantId: u.tenantId, userId: u.userId }; }

  private load(u: AuthUser): Promise<EventRow[]> {
    return this.prisma.jobSearchEvent.findMany({ where: this.scope(u), orderBy: { occurredAt: 'asc' }, take: MAX_ROWS });
  }

  /** Idempotent ingest: an event with a known idempotencyKey is returned, not duplicated. userId/tenantId come from the token. */
  async record(u: AuthUser, events: EventDto[]) {
    const now = Date.now() + 86_400_000;
    if (events.some((e) => new Date(e.occurredAt).getTime() > now)) throw new BadRequestException('Events cannot be dated in the future');
    let created = 0; let duplicates = 0;
    for (const e of events) {
      if (e.idempotencyKey) {
        const found = await this.prisma.jobSearchEvent.findFirst({ where: { userId: u.userId, idempotencyKey: e.idempotencyKey } });
        if (found) { duplicates++; continue; }
      }
      await this.prisma.jobSearchEvent.create({
        data: {
          ...this.scope(u), type: e.type, occurredAt: new Date(e.occurredAt), source: e.source ?? 'MANUAL', applicationRef: e.applicationRef,
          roleFamily: e.roleFamily, geography: e.geography, seniority: e.seniority, sourceName: e.sourceName,
          resumeVersionId: e.resumeVersionId, idempotencyKey: e.idempotencyKey,
        },
      });
      created++;
    }
    return { created, duplicates };
  }

  /**
   * Builds events from the caller's own application vault (module 33). Explicit confirmation required; idempotent, so it is safe to re-run.
   * Only the vault's stage and dates are used; no employer data is contacted.
   */
  async ingestFromVault(u: AuthUser, now = new Date()) {
    const rows = await this.prisma.applicationResumeEntry.findMany({
      where: this.scope(u), select: { id: true, appliedOn: true, stage: true, resumeVersionId: true, updatedAt: true }, orderBy: { appliedOn: 'desc' }, take: 500,
    });
    const events = eventsFromVault(rows, now);
    let created = 0; let duplicates = 0;
    for (let i = 0; i < events.length; i += 100) { const r = await this.record(u, events.slice(i, i + 100)); created += r.created; duplicates += r.duplicates; }
    return { applications: rows.length, created, duplicates };
  }

  /** Host-portal ingestion goes through the connector boundary. Without a configured connector this is an honest no-op. */
  async ingestFromHost(u: AuthUser) {
    if (!this.host.available()) return { available: false, connector: this.host.id, created: 0, duplicates: 0, reason: 'No job portal is connected to this installation yet. Use manual events or the application vault.' };
    const events = (await this.host.fetchEvents({ tenantId: u.tenantId, userId: u.userId })).map((e) => ({ ...e, source: 'HOST' as const }));
    let created = 0; let duplicates = 0;
    for (let i = 0; i < events.length; i += 100) { const r = await this.record(u, events.slice(i, i + 100)); created += r.created; duplicates += r.duplicates; }
    return { available: true, connector: this.host.id, created, duplicates };
  }

  async overview(u: AuthUser, q: AnalyticsQueryDto) {
    return overview(await this.load(u), toFilters(q), await this.crm.taskStats(u));
  }
  async funnel(u: AuthUser, q: AnalyticsQueryDto) { return funnel(await this.load(u), toFilters(q)); }
  async resumeVersions(u: AuthUser, q: AnalyticsQueryDto) { return resumeVersions(await this.load(u), toFilters(q)); }
  async activity(u: AuthUser, q: AnalyticsQueryDto) { return activity(await this.load(u), toFilters(q)); }

  /** Synchronous JSON export of the user's own events and aggregates. Streamed, never stored. */
  async export(u: AuthUser, q: AnalyticsQueryDto) {
    const rows = await this.load(u);
    const f = toFilters(q);
    return { exportedAt: new Date().toISOString(), events: rows, overview: overview(rows, f, await this.crm.taskStats(u)), funnel: funnel(rows, f) };
  }

  /** Deletes only the caller's events (optionally for one application). */
  async deleteEvents(u: AuthUser, applicationRef?: string) {
    const r = await this.prisma.jobSearchEvent.deleteMany({ where: { ...this.scope(u), ...(applicationRef ? { applicationRef } : {}) } });
    return { deleted: r.count };
  }
}
