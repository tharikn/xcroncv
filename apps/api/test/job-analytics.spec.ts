import { BadRequestException } from '@nestjs/common';
import { activity, applyFilters, EventRow, funnel, MIN_COHORT, overview, resumeVersions, weekStart } from '../src/job-analytics/aggregate';
import { JobAnalyticsService, toFilters } from '../src/job-analytics/job-analytics.service';

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const ev = (type: string, ref: string, day: string, extra: Partial<EventRow> = {}): EventRow => ({ type, applicationRef: ref, occurredAt: d(day), source: 'MANUAL', ...extra });

const rows: EventRow[] = [
  ev('SAVED', 'a', '2026-01-01'), ev('APPLIED', 'a', '2026-01-02'), ev('RESPONSE', 'a', '2026-01-06'), ev('INTERVIEW', 'a', '2026-01-10'), ev('OFFER', 'a', '2026-01-20'),
  ev('APPLIED', 'b', '2026-01-03'), ev('REJECTED', 'b', '2026-01-04'),
  ev('APPLIED', 'c', '2026-01-05'),
  ev('SAVED', 'd', '2026-01-05'),
];

describe('funnel', () => {
  const f = funnel(rows);
  it('reports numerator, denominator and sample size per stage', () => {
    const applied = f.stages.find((s) => s.stage === 'APPLIED')!;
    expect(applied).toMatchObject({ count: 3, numerator: 2, denominator: 3, sampleSize: 3 }); // a, b responded of a, b, c
    expect(applied.rate).toBeCloseTo(0.667, 3);
  });
  it('returns null rates (not NaN/0) when the denominator is zero', () => {
    const empty = funnel([]);
    expect(empty.stages.every((s) => s.rate === null || s.stage === 'OFFER')).toBe(true);
  });
  it('labels the data-quality gap and carries a no-causation note', () => {
    const g = funnel([ev('RESPONSE', 'x', '2026-01-02'), ...rows]);
    expect(g.quality.missingAppliedEvent).toBe(1);
    expect(g.quality.notes.join(' ')).toMatch(/not what caused/i);
  });
});

describe('overview', () => {
  const o = overview(rows, {}, { open: 2, overdue: 1, done: 0 });
  it('counts distinct applications per stage and passes follow-up stats through', () => {
    expect(o.totals).toEqual({ saved: 2, applied: 3, responses: 2, interviews: 1, offers: 1, rejections: 1 });
    expect(o.followUps.overdue).toBe(1);
  });
  it('time-to-response uses only applications with both events and states its sample', () => {
    expect(o.timeToResponseDays.sampleSize).toBe(2);
    expect(o.timeToResponseDays.median).toBe(2.5); // a: 4 days, b: 1 day
  });
  it('flags manual-only coverage as incomplete', () => {
    expect(o.coverage.incomplete).toBe(true);
    expect(o.coverage.note).toMatch(/no authorised job portal/i);
    const host = overview([ev('APPLIED', 'h', '2026-01-01', { source: 'HOST' })], {}, { open: 0, overdue: 0, done: 0 });
    expect(host.coverage.incomplete).toBe(false);
  });
  it('is honest about an empty dataset', () => {
    const e = overview([], {}, { open: 0, overdue: 0, done: 0 });
    expect(e.timeToResponseDays.median).toBeNull();
    expect(e.freshness.lastEventAt).toBeNull();
  });
});

describe('filters', () => {
  const tagged = [
    ev('APPLIED', 'a', '2026-01-02', { roleFamily: 'Engineering', geography: 'UK' }), ev('RESPONSE', 'a', '2026-01-05'),
    ev('APPLIED', 'b', '2026-02-02', { roleFamily: 'Design', geography: 'US' }),
  ];
  it('applies role/geography attributes to every event of the application', () => {
    expect(applyFilters(tagged, { roleFamily: 'engineering' }).map((r) => r.type)).toEqual(['APPLIED', 'RESPONSE']);
    expect(applyFilters(tagged, { geography: 'US' })).toHaveLength(1);
  });
  it('applies a date window', () => {
    expect(applyFilters(tagged, { from: d('2026-02-01') })).toHaveLength(1);
    expect(funnel(tagged, { to: d('2026-01-31') }).window.to).toBe(d('2026-01-31').toISOString());
  });
  it('rejects an inverted window', () => {
    expect(() => toFilters({ from: '2026-02-01', to: '2026-01-01' })).toThrow(BadRequestException);
  });
});

describe('resume version insights', () => {
  const many = (v: string, n: number, responded: number): EventRow[] =>
    Array.from({ length: n }, (_, i) => [ev('APPLIED', `${v}${i}`, '2026-01-02', { resumeVersionId: v }), ...(i < responded ? [ev('RESPONSE', `${v}${i}`, '2026-01-04')] : [])]).flat();
  it('withholds rates for small cohorts and never claims causation', () => {
    const r = resumeVersions([...many('v1', MIN_COHORT, 2), ...many('v2', MIN_COHORT - 1, 4)]);
    const v1 = r.versions.find((x) => x.resumeVersionId === 'v1')!;
    const v2 = r.versions.find((x) => x.resumeVersionId === 'v2')!;
    expect(v1.sufficientSample).toBe(true);
    expect(v1.responseRate).toMatchObject({ numerator: 2, denominator: MIN_COHORT });
    expect(v2.sufficientSample).toBe(false);
    expect(v2.responseRate).toBeNull();
    expect(v2.note).toMatch(/hidden/i);
    expect(r.caveat).toMatch(/correlations/i);
  });
  it('ignores applications without a bound resume version', () => {
    expect(resumeVersions([ev('APPLIED', 'x', '2026-01-02')]).versions).toEqual([]);
  });
});

describe('activity', () => {
  it('buckets by Monday-start week', () => {
    expect(weekStart(d('2026-11-15'))).toBe('2026-11-09'); // Sunday
    expect(weekStart(d('2026-11-09'))).toBe('2026-11-09');
    const a = activity([ev('APPLIED', 'a', '2026-11-09'), ev('RESPONSE', 'a', '2026-11-15'), ev('APPLIED', 'b', '2026-11-16')]);
    expect(a.weeks).toEqual([
      { weekStart: '2026-11-09', counts: { APPLIED: 1, RESPONSE: 1 }, total: 2 },
      { weekStart: '2026-11-16', counts: { APPLIED: 1 }, total: 1 },
    ]);
  });
});

describe('JobAnalyticsService', () => {
  const u1 = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
  const mk = () => {
    const created: any[] = [];
    const prisma: any = { jobSearchEvent: {
      findFirst: jest.fn(async ({ where }: any) => created.find((c) => c.idempotencyKey === where.idempotencyKey && c.userId === where.userId) ?? null),
      create: jest.fn(async ({ data }: any) => { created.push(data); return data; }),
      findMany: jest.fn(async () => []), deleteMany: jest.fn(async () => ({ count: 3 })),
    } };
    return { svc: new JobAnalyticsService(prisma, { taskStats: jest.fn() } as any), prisma, created };
  };
  const e = (extra: any = {}) => ({ type: 'APPLIED', occurredAt: '2026-01-02T00:00:00Z', applicationRef: 'a1', ...extra });

  it('takes identity from the token and is idempotent on retries', async () => {
    const { svc, created } = mk();
    expect(await svc.record(u1, [e({ idempotencyKey: 'k1' })])).toEqual({ created: 1, duplicates: 0 });
    expect(await svc.record(u1, [e({ idempotencyKey: 'k1' })])).toEqual({ created: 0, duplicates: 1 });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ userId: 'u1', tenantId: 't1', source: 'MANUAL' });
  });
  it('rejects future-dated events', async () => {
    await expect(mk().svc.record(u1, [e({ occurredAt: '2999-01-01T00:00:00Z' })])).rejects.toBeInstanceOf(BadRequestException);
  });
  it('deletes only the caller\'s events', async () => {
    const { svc, prisma } = mk();
    expect(await svc.deleteEvents(u1, 'a1')).toEqual({ deleted: 3 });
    expect(prisma.jobSearchEvent.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 't1', userId: 'u1', applicationRef: 'a1' } });
  });
  it('stores no resume text, contacts or JD text (event shape is minimal)', async () => {
    const { svc, created } = mk();
    await svc.record(u1, [e()]);
    expect(Object.keys(created[0]).sort()).toEqual(['applicationRef', 'geography', 'idempotencyKey', 'occurredAt', 'resumeVersionId', 'roleFamily', 'seniority', 'source', 'sourceName', 'tenantId', 'type', 'userId'].sort());
  });
});

describe('ingestion (vault and host connector)', () => {
  const { eventsFromVault, notConfiguredConnector } = require('../src/job-analytics/ingest');
  const { validate } = require('class-validator'); const { plainToInstance } = require('class-transformer');
  const u1 = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
  const NOW = new Date('2026-06-01T00:00:00Z');
  const row = (over: any = {}) => ({ id: 'e1', appliedOn: '2026-05-01', stage: 'APPLIED', resumeVersionId: 'v1', updatedAt: new Date('2026-05-20T00:00:00Z'), ...over });

  it('derives events from stages with stable idempotency keys and marks them as candidate-recorded', () => {
    const ev = eventsFromVault([row({ stage: 'INTERVIEWING' })], NOW);
    expect(ev.map((x: any) => x.type)).toEqual(['APPLIED', 'RESPONSE', 'INTERVIEW']);
    expect(ev.every((x: any) => x.source === 'MANUAL' && x.applicationRef === 'vault:e1' && x.resumeVersionId === 'v1')).toBe(true);
    expect(ev.map((x: any) => x.idempotencyKey)).toEqual(['vault:e1:APPLIED', 'vault:e1:RESPONSE', 'vault:e1:INTERVIEW']);
    expect(ev[0].occurredAt).toBe('2026-05-01T00:00:00.000Z');
  });
  it('never dates a later stage before the application or in the future', () => {
    const early = eventsFromVault([row({ stage: 'REJECTED', updatedAt: new Date('2026-04-01T00:00:00Z') })], NOW);
    expect(early[1].occurredAt).toBe('2026-05-01T00:00:00.000Z');
    const future = eventsFromVault([row({ stage: 'OFFER', updatedAt: new Date('2027-01-01T00:00:00Z') })], NOW);
    expect(new Date(future[3].occurredAt).getTime()).toBeLessThanOrEqual(NOW.getTime());
    expect(eventsFromVault([row({ stage: 'WITHDRAWN' })], NOW).map((x: any) => x.type)).toEqual(['APPLIED', 'WITHDRAWN']);
  });
  const mk = (rows: any[], host?: any) => {
    const created: any[] = [];
    const prisma: any = {
      applicationResumeEntry: { findMany: jest.fn(async () => rows) },
      jobSearchEvent: {
        findFirst: jest.fn(async ({ where }: any) => created.find((c) => c.idempotencyKey === where.idempotencyKey && c.userId === where.userId) ?? null),
        create: jest.fn(async ({ data }: any) => { created.push(data); return data; }),
      },
    };
    return { svc: new JobAnalyticsService(prisma, { taskStats: jest.fn() } as any, host), prisma, created };
  };
  it('vault ingest is owner-scoped and idempotent; a later stage change only adds its new event', async () => {
    const { svc, prisma, created } = mk([row({ stage: 'SCREENING' })]);
    expect(await svc.ingestFromVault(u1, NOW)).toEqual({ applications: 1, created: 2, duplicates: 0 });
    expect(prisma.applicationResumeEntry.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', userId: 'u1' });
    expect(await svc.ingestFromVault(u1, NOW)).toEqual({ applications: 1, created: 0, duplicates: 2 });
    prisma.applicationResumeEntry.findMany.mockResolvedValueOnce([row({ stage: 'INTERVIEWING' })]);
    expect(await svc.ingestFromVault(u1, NOW)).toEqual({ applications: 1, created: 1, duplicates: 2 });
    expect(created.every((c: any) => c.userId === 'u1' && c.tenantId === 't1')).toBe(true);
  });
  it('requires explicit confirmation', async () => {
    const { ConfirmIngestDto } = require('../src/job-analytics/dto/analytics.dto');
    expect((await validate(plainToInstance(ConfirmIngestDto, {}))).length).toBe(1);
    expect((await validate(plainToInstance(ConfirmIngestDto, { confirm: true }))).length).toBe(0);
  });
  it('host ingestion is an honest no-op without a connector, and tags HOST events when one exists', async () => {
    const none = await mk([]).svc.ingestFromHost(u1);
    expect(none).toMatchObject({ available: false, connector: 'none', created: 0 });
    expect(notConfiguredConnector.available()).toBe(false);
    const fetchEvents = jest.fn(async () => [{ type: 'APPLIED', occurredAt: '2026-05-01T00:00:00Z', applicationRef: 'h1', idempotencyKey: 'h1:A', source: 'MANUAL' }]);
    const { svc, created } = mk([], { id: 'mock', available: () => true, fetchEvents });
    expect(await svc.ingestFromHost(u1)).toMatchObject({ available: true, created: 1 });
    expect(fetchEvents).toHaveBeenCalledWith({ tenantId: 't1', userId: 'u1' });
    expect(created[0].source).toBe('HOST');
  });
});
