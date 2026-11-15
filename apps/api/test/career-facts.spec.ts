import { CanActivate, ExecutionContext, INestApplication, Injectable, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AchievementDraftsController, CareerFactsController, CareerFactsService, SkillTaxonomyController } from '../src/career-facts/career-facts.module';
import { buildAchievementDraft, metricProblem, validateFactData } from '../src/career-facts/facts.logic';
import { PrismaService } from '../src/prisma/prisma.service';

describe('facts logic', () => {
  it('validates achievements, trims, drops unknown keys and de-duplicates skills', () => {
    const d: any = validateFactData('ACHIEVEMENT', { action: '  Cut build time  ', skills: ['Go', 'go', 'Docker'], evil: 1, period: { start: '2021', end: '2022-03' } });
    expect(d).toEqual({ action: 'Cut build time', skills: ['Go', 'Docker'], period: { start: '2021', end: '2022-03' } });
    expect(d.evil).toBeUndefined();
  });
  it('reports every problem at once', () => {
    try { validateFactData('ACHIEVEMENT', { action: '', skills: 'x', period: { start: '2022-05', end: '2021' }, metric: { value: '' } }); fail('should throw'); }
    catch (e: any) { const m = e.getResponse().message as string[]; expect(m.length).toBeGreaterThanOrEqual(4); expect(m.join(' ')).toMatch(/What you did is required/); expect(m.join(' ')).toMatch(/end date is before/i); }
  });
  it('supports partial dates and career breaks without judgement fields', () => {
    expect(validateFactData('CAREER_BREAK', { start: '2020', end: '2021-06', note: 'Caring for family' })).toEqual({ start: '2020', end: '2021-06', note: 'Caring for family' });
    expect(() => validateFactData('CAREER_BREAK', { start: '20-1' })).toThrow();
  });
  it('validates preferences', () => {
    expect(validateFactData('PREFERENCE', { roles: ['Backend'], workModes: ['Remote'] })).toMatchObject({ workModes: ['remote'] });
    expect(() => validateFactData('PREFERENCE', { workModes: ['moon'] })).toThrow();
  });
  it('a metric blocks confirmation until confirmed', () => {
    expect(metricProblem('ACHIEVEMENT', { action: 'x', skills: [], metric: { value: '40%', label: 'faster', confirmed: false } })).toMatch(/Confirm the number/);
    expect(metricProblem('ACHIEVEMENT', { action: 'x', skills: [], metric: { value: '40%', label: 'faster', confirmed: true } })).toBeUndefined();
    expect(metricProblem('PREFERENCE', {})).toBeUndefined();
  });
  it('drafts never invent: detected numbers are unconfirmed candidates, skills come only from the text', () => {
    const d = buildAchievementDraft('Reduced API latency by 40% using Redis and Go for the checkout team');
    expect(d.data.metric).toEqual({ value: '40%', label: 'Detected in your text', confirmed: false });
    expect(d.data.skills).toEqual(expect.arrayContaining(['Redis']));
    expect(d.data.context).toBeUndefined();
    expect(d.missing).toContain('context');
    expect(d.missing).not.toContain('outcome');
    expect(d.hints[0]).toMatch(/only a suggestion/);
    expect(buildAchievementDraft('Wrote internal docs for onboarding').data.metric).toBeUndefined();
    expect(() => buildAchievementDraft('hi')).toThrow();
  });
});

/* ---------- HTTP-level tests with an in-memory table ---------- */
function fakePrisma() {
  const facts: any[] = []; const revs: any[] = [];
  const match = (r: any, w: any) => Object.entries(w).every(([k, v]) => (v && typeof v === 'object' && 'not' in (v as any) ? r[k] !== (v as any).not : r[k] === v));
  const prisma: any = {
    facts, revs,
    careerFact: {
      create: async ({ data }: any) => { const { revisions, ...d } = data; const row = { id: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date(), revision: 1, confirmedAt: null, ...d }; facts.push(row); if (revisions) revs.push({ factId: row.id, createdAt: new Date(), ...revisions.create }); return row; },
      findFirst: async ({ where }: any) => { const r = facts.find((x) => match(x, where)); return r ? { ...r } : null; },
      findMany: async ({ where, include }: any) => facts.filter((r) => match(r, where)).map((r) => (include ? { ...r, revisions: revs.filter((v) => v.factId === r.id) } : r)),
      update: async ({ where, data }: any) => { const r = facts.find((x) => x.id === where.id); Object.assign(r, data, { updatedAt: new Date() }); return r; },
      delete: async ({ where }: any) => { const i = facts.findIndex((x) => x.id === where.id); facts.splice(i, 1); for (let j = revs.length - 1; j >= 0; j--) if (revs[j].factId === where.id) revs.splice(j, 1); },
      deleteMany: async ({ where }: any) => { const keep = facts.filter((r) => !match(r, where)); const n = facts.length - keep.length; facts.length = 0; facts.push(...keep); return { count: n }; },
    },
    careerFactRevision: {
      create: async ({ data }: any) => { const r = { createdAt: new Date(), ...data }; revs.push(r); return r; },
      findMany: async ({ where }: any) => revs.filter((r) => r.factId === where.factId).sort((a, b) => b.revision - a.revision),
      findUnique: async ({ where }: any) => revs.find((r) => r.factId === where.factId_revision.factId && r.revision === where.factId_revision.revision) ?? null,
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return prisma;
}

let current = { userId: 'u1', tenantId: 't1' };
@Injectable() class FakeAuth implements CanActivate { canActivate(c: ExecutionContext) { c.switchToHttp().getRequest().user = current; return true; } }

describe('career facts HTTP', () => {
  let app: INestApplication; let base: string; const prisma = fakePrisma();
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10_000 }])],
      controllers: [CareerFactsController, AchievementDraftsController, SkillTaxonomyController],
      providers: [CareerFactsService, { provide: PrismaService, useValue: prisma }, { provide: APP_GUARD, useClass: ThrottlerGuard }, { provide: APP_GUARD, useClass: FakeAuth }],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0); base = (await app.getUrl()).replace('[::1]', 'localhost');
  });
  afterAll(async () => { await app.close(); });
  const call = (method: string, path: string, body?: unknown) => fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = async (r: Response) => (await r.json()) as any;
  const ach = { kind: 'ACHIEVEMENT', title: 'Cut latency', data: { action: 'Cut p99 latency', outcome: 'Faster checkout', skills: ['Redis'], metric: { value: '40%', label: 'latency', confirmed: false } } };

  it('creates facts as drafts; imported/AI facts can never be confirmed on creation; EXTERNALLY_VERIFIED is refused', async () => {
    const f = await json(await call('POST', '/career-facts', ach));
    expect(f).toMatchObject({ status: 'DRAFT', origin: 'USER_ENTERED', revision: 1 });
    expect((await call('POST', '/career-facts', { ...ach, origin: 'AI_REWRITTEN', confirmNow: true })).status).toBe(400);
    expect((await call('POST', '/career-facts', { ...ach, origin: 'EXTERNALLY_VERIFIED' })).status).toBe(400);
    expect((await call('POST', '/career-facts', { ...ach, extra: 1 })).status).toBe(400);
    expect((await call('POST', '/career-facts', { ...ach, confirmNow: true })).status).toBe(400); // unconfirmed metric
  });

  it('confirmation needs explicit metric confirmation; editing the metric requires re-confirmation; edits add revisions', async () => {
    const f = await json(await call('POST', '/career-facts', ach));
    expect((await call('POST', `/career-facts/${f.id}/confirm`, {})).status).toBe(400);
    const c = await json(await call('POST', `/career-facts/${f.id}/confirm`, { confirmMetric: true }));
    expect(c.status).toBe('CONFIRMED'); expect(c.data.metric.confirmed).toBe(true); expect(c.revision).toBe(2);
    const u = await json(await call('PATCH', `/career-facts/${f.id}`, { data: { ...c.data, outcome: 'Even faster' } }));
    expect(u.status).toBe('CONFIRMED'); expect(u.revision).toBe(3);
    const changed = await json(await call('PATCH', `/career-facts/${f.id}`, { data: { ...u.data, metric: { value: '55%', label: 'latency', confirmed: true } } }));
    expect(changed.status).toBe('DRAFT'); expect(changed.data.metric.confirmed).toBe(false); expect(changed.confirmedAt).toBeNull();
    const revs = await json(await call('GET', `/career-facts/${f.id}/revisions`));
    expect(revs.map((r: any) => r.revision)).toEqual([4, 3, 2, 1]);
    expect(revs[0].note).toMatch(/needs confirmation/);
  });

  it('restore appends a new revision and keeps history intact', async () => {
    const f = await json(await call('POST', '/career-facts', { ...ach, data: { action: 'First wording' } }));
    await call('PATCH', `/career-facts/${f.id}`, { data: { action: 'Second wording' } });
    const r = await json(await call('POST', `/career-facts/${f.id}/restore`, { revision: 1 }));
    expect(r.data.action).toBe('First wording'); expect(r.revision).toBe(3);
    const revs = await json(await call('GET', `/career-facts/${f.id}/revisions`));
    expect(revs).toHaveLength(3);
    expect(revs.find((x: any) => x.revision === 2).snapshot.data.action).toBe('Second wording');
    expect((await call('POST', `/career-facts/${f.id}/restore`, { revision: 99 })).status).toBe(404);
  });

  it('achievement drafts: structured from rough text, number stays unconfirmed, listed as drafts', async () => {
    const d = await json(await call('POST', '/achievement-drafts', { text: 'Reduced build times by 35% using Docker caching', experienceRef: 'Acme' }));
    expect(d.fact.status).toBe('DRAFT'); expect(d.fact.data.metric.confirmed).toBe(false); expect(d.missing).toContain('context');
    expect(d.fact.data.skills).toContain('Docker');
    const list = await json(await call('GET', '/achievement-drafts'));
    expect(list.some((x: any) => x.id === d.fact.id)).toBe(true);
    expect((await call('POST', '/achievement-drafts', { text: 'x' })).status).toBe(400);
  });

  it('filters by kind, status, skill (via taxonomy aliases) and text; archived facts are hidden by default', async () => {
    const a = await json(await call('POST', '/career-facts', { kind: 'ACHIEVEMENT', title: 'JS work', data: { action: 'Built UI', skills: ['JavaScript'] } }));
    expect((await json(await call('GET', '/career-facts?skill=js'))).some((x: any) => x.id === a.id)).toBe(true);
    expect((await json(await call('GET', '/career-facts?q=built%20ui'))).some((x: any) => x.id === a.id)).toBe(true);
    await call('POST', `/career-facts/${a.id}/archive`);
    expect((await json(await call('GET', '/career-facts'))).some((x: any) => x.id === a.id)).toBe(false);
    expect((await json(await call('GET', '/career-facts?status=ARCHIVED'))).some((x: any) => x.id === a.id)).toBe(true);
    const br = await json(await call('POST', '/career-facts', { kind: 'CAREER_BREAK', title: 'Career break', data: { start: '2020', end: '2021', note: 'Travel' } }));
    expect((await json(await call('GET', '/career-facts?kind=CAREER_BREAK'))).map((x: any) => x.id)).toContain(br.id);
  });

  it('skill taxonomy: search, normalise (unknown stays unmatched) and detect', async () => {
    const s = await json(await call('GET', '/skill-taxonomy?q=type'));
    expect(s.skills.map((x: any) => x.label)).toContain('TypeScript');
    const n = await json(await call('POST', '/skill-taxonomy/normalize', { names: ['js', 'Totally Made Up'] }));
    expect(n.results[0]).toMatchObject({ matched: true, label: 'JavaScript' });
    expect(n.results[1]).toMatchObject({ matched: false });
    const d = await json(await call('POST', '/skill-taxonomy/detect', { text: 'We use Python and Postgres' }));
    expect(d.skills.map((x: any) => x.label)).toContain('Python');
  });

  it('isolates facts by owner/tenant; export contains revisions; delete-all needs confirmation', async () => {
    const mine = await json(await call('POST', '/career-facts', ach));
    current = { userId: 'u2', tenantId: 't1' };
    expect((await call('GET', `/career-facts/${mine.id}`)).status).toBe(404);
    expect((await call('PATCH', `/career-facts/${mine.id}`, { title: 'x' })).status).toBe(404);
    expect((await call('DELETE', `/career-facts/${mine.id}`)).status).toBe(404);
    expect((await json(await call('GET', '/career-facts'))).length).toBe(0);
    current = { userId: 'u1', tenantId: 't2' };
    expect((await call('GET', `/career-facts/${mine.id}`)).status).toBe(404);
    current = { userId: 'u1', tenantId: 't1' };
    const ex = await call('GET', '/career-facts/export');
    expect(ex.headers.get('content-disposition')).toContain('career-facts.json');
    const exj = await json(ex);
    expect(exj.facts.find((f: any) => f.id === mine.id).revisions.length).toBeGreaterThanOrEqual(1);
    expect((await call('DELETE', '/career-facts')).status).toBe(400);
    const del = await json(await call('DELETE', '/career-facts?confirm=all'));
    expect(del.deleted).toBeGreaterThan(0);
    expect(prisma.facts.filter((f: any) => f.userId === 'u2').length).toBe(0);
  });
});
