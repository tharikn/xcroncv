import { BadRequestException, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AnalyticsAdminGuard } from '../src/usage-analytics/analytics-admin.guard';
import { RecordUsageDto } from '../src/usage-analytics/dto/usage.dto';
import { MIN_GROUP, UsageRow, usageReport } from '../src/usage-analytics/usage-aggregate';
import { UsageAnalyticsService } from '../src/usage-analytics/usage-analytics.service';

const t = (day: string) => new Date(`${day}T10:00:00Z`);
const row = (name: string, userId: string, day: string, extra: Partial<UsageRow> = {}): UsageRow => ({ name, userId, occurredAt: t(day), platform: 'WEB', ...extra });

const rows: UsageRow[] = [
  row('RESUME_CREATED', 'u1', '2026-02-01', { templateId: 'modern', templateVersion: 1 }),
  row('RESUME_CREATED', 'u2', '2026-02-01', { templateId: 'modern', templateVersion: 1 }),
  row('RESUME_CREATED', 'u3', '2026-02-02', { templateId: 'modern', templateVersion: 1 }),
  row('RESUME_CREATED', 'u4', '2026-02-02', { templateId: 'rare', templateVersion: 1 }),
  row('DASHBOARD_OPENED', 'u9', '2026-02-02'), // page view only
  row('PREVIEW_RENDERED', 'u1', '2026-02-01', { sessionId: 's1' }),
  row('EXPORT_REQUESTED', 'u1', '2026-02-01', { sessionId: 's1' }),
  row('EXPORT_SUCCEEDED', 'u1', '2026-02-01', { exportFormat: 'PDF' }),
  row('EXPORT_FAILED', 'u2', '2026-02-02', { failureCategory: 'RENDER', platform: 'ANDROID' }),
  row('DOWNLOAD_INITIATED', 'u2', '2026-02-02'),
  row('LOCAL_SAVE_SUCCEEDED', 'u1', '2026-02-03'),
];

describe('usageReport', () => {
  const r = usageReport(rows, {});
  it('counts active designers from meaningful activity only, not page views', () => {
    expect(r.kpis.activeDesigners).toBe(1); // u9 only opened the dashboard
    expect(r.kpis.activeSessions).toBe(1);
  });
  it('keeps export generation, download initiated and confirmed local save separate', () => {
    expect(r.kpis).toMatchObject({ exportsSucceeded: 1, downloadsInitiated: 1, localSavesConfirmed: 1, uniqueSavers: 1 });
  });
  it('builds daily trend, funnel and failure categories', () => {
    expect(r.daily.map((d) => d.date)).toEqual(['2026-02-01', '2026-02-02', '2026-02-03']);
    expect(r.funnel.find((f) => f.stage === 'LOCAL_SAVE_SUCCEEDED')!.users).toBe(1);
    expect(r.failureCategories).toEqual({ RENDER: 1 });
    expect(r.exportFormats).toEqual({ PDF: 1 });
  });
  it('suppresses small template groups into "other"', () => {
    expect(MIN_GROUP).toBe(3);
    expect(r.templates.find((x) => x.templateId === 'modern')).toMatchObject({ users: 3, events: 3 });
    expect(r.templates.find((x) => x.templateId === 'rare')).toBeUndefined();
    expect(r.templates.find((x) => x.templateId === 'other')).toMatchObject({ events: 1, users: null });
  });
  it('filters by platform, date and template version', () => {
    expect(usageReport(rows, { platform: 'ANDROID' }).kpis.exportsSucceeded).toBe(0);
    expect(usageReport(rows, { from: t('2026-02-03') }).kpis.resumesCreated).toBe(0);
    expect(usageReport(rows, { templateId: 'modern', templateVersion: 2 }).kpis.resumesCreated).toBe(0);
  });
  it('sums AI usage and estimated cost without per-user data', () => {
    const a = usageReport([], {}, [
      { feature: 'REWRITE_BULLET', status: 'OK', costMicros: 100, userId: 'u1', createdAt: t('2026-02-01') },
      { feature: 'REWRITE_BULLET', status: 'TIMEOUT', costMicros: 0, userId: 'u2', createdAt: t('2026-02-01') },
    ]).ai;
    expect(a).toMatchObject({ requests: 2, failed: 1, estimatedCostMicros: 100 });
  });
  it('never exposes user ids or resume content in the response', () => {
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/"userId"|u1|u2|resumeId/);
  });
});

describe('AnalyticsAdminGuard', () => {
  const ctx = (user: unknown) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;
  const g = new AnalyticsAdminGuard();
  it('allows analytics_admin role only', () => {
    expect(g.canActivate(ctx({ roles: ['analytics_admin'] }))).toBe(true);
    expect(() => g.canActivate(ctx({ roles: ['member'] }))).toThrow(ForbiddenException);
    expect(() => g.canActivate(ctx({}))).toThrow(ForbiddenException);
    expect(() => g.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});

describe('RecordUsageDto allowlist', () => {
  const check = async (event: object) => validate(plainToInstance(RecordUsageDto, { events: [event] }), { whitelist: true, forbidNonWhitelisted: true });
  const base = { eventId: 'e1', name: 'EXPORT_SUCCEEDED', occurredAt: '2026-02-01T10:00:00Z', platform: 'WEB' };
  it('accepts a minimal event', async () => { expect(await check(base)).toHaveLength(0); });
  it('rejects content-like fields, unknown events and free-text paths', async () => {
    expect((await check({ ...base, resumeText: 'secret' })).length).toBeGreaterThan(0);
    expect((await check({ ...base, filePath: 'C:\\x\\cv.pdf' })).length).toBeGreaterThan(0);
    expect((await check({ ...base, name: 'RANDOM' })).length).toBeGreaterThan(0);
    expect((await check({ ...base, templateId: 'a b/../c' })).length).toBeGreaterThan(0);
  });
});

describe('UsageAnalyticsService', () => {
  const u = { userId: 'user-1', tenantId: 't1', issuer: 'i', subject: 's' };
  it('stamps userId/tenantId from the token and reports duplicates', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const svc = new UsageAnalyticsService({ usageEvent: { createMany } } as never);
    const out = await svc.record(u, { events: [
      { eventId: 'a', name: 'PREVIEW_RENDERED', occurredAt: '2026-02-01T00:00:00Z', platform: 'WEB' },
      { eventId: 'b', name: 'PREVIEW_RENDERED', occurredAt: '2026-02-01T00:00:00Z', platform: 'WEB' },
    ] });
    expect(out).toEqual({ created: 1, duplicates: 1 });
    expect(createMany.mock.calls[0][0].data.every((d: { userId: string; tenantId: string }) => d.userId === 'user-1' && d.tenantId === 't1')).toBe(true);
  });
  it('rejects future-dated events and inverted ranges', async () => {
    const svc = new UsageAnalyticsService({} as never);
    await expect(svc.record(u, { events: [{ eventId: 'a', name: 'PREVIEW_RENDERED', occurredAt: '2999-01-01T00:00:00Z', platform: 'WEB' }] })).rejects.toThrow(BadRequestException);
    expect(() => svc.filters({ from: '2026-03-01', to: '2026-02-01' })).toThrow(BadRequestException);
  });
});
