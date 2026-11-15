import { CanActivate, ExecutionContext, INestApplication, Injectable, NotFoundException, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildRenderModel, ProfileInput } from '../src/render-model/render-model.builder';
import { TEMPLATE_CATALOG } from '../src/templates/template.catalog';
import { ResumesService } from '../src/resumes/resumes.service';
import { ProvenanceController, ProvenanceService } from '../src/provenance/provenance.module';
import { analyzeRewrite, assess, Evidence, extractClaims, missingAcknowledgements, numbers, summarize, wordDiff } from '../src/provenance/provenance.logic';

const ev = (o: Partial<Evidence> & { id: string; text: string }): Evidence => ({ source: 'PROFILE', label: o.id, confirmed: true, origin: 'USER_ENTERED', ...o });
const claim = (kind: any, text: string, context?: any) => ({ key: 'k', section: 's', itemIndex: 0, kind, text, context });

describe('support assessment', () => {
  const E: Evidence[] = [
    ev({ id: 'b1', text: 'Reduced API latency by 40% using Redis caching' }),
    ev({ id: 'b2', text: 'Led migration of the billing service to Kubernetes', confirmed: false, origin: 'IMPORTED' }),
    ev({ id: 'x1', text: 'Developer at Acme', employer: 'Acme', title: 'Developer', start: '2020-01', end: '2022-06', current: false }),
    ev({ id: 's1', text: 'TypeScript', skills: ['TypeScript'] }),
    ev({ id: 's2', text: 'Go', skills: ['Go'], confirmed: false, origin: 'IMPORTED' }),
    ev({ id: 'edu', text: 'MSc Computer Science, TU Berlin' }),
  ];
  it('direct: same statement with the same numbers', () => {
    const a = assess(claim('bullet', 'Reduced API latency by 40% using Redis caching'), E);
    expect(a.support).toBe('direct'); expect(a.evidence[0].id).toBe('b1'); expect(a.origin).toBe('USER_ENTERED');
  });
  it('contradictory: same activity, different figure', () => {
    const a = assess(claim('bullet', 'Reduced API latency by 70% using Redis caching'), E);
    expect(a.support).toBe('contradictory'); expect(a.issues.join(' ')).toMatch(/differs from/);
  });
  it('partial: figure not found anywhere, or source unconfirmed', () => {
    const inv = assess(claim('bullet', 'Reduced API latency by 40% using Redis caching and saved $2m'), E);
    expect(inv.support).toBe('partial');
    const unconfirmed = assess(claim('bullet', 'Led migration of the billing service to Kubernetes'), E);
    expect(unconfirmed.support).toBe('partial'); expect(unconfirmed.issues.join(' ')).toMatch(/not been confirmed/); expect(unconfirmed.origin).toBe('IMPORTED');
  });
  it('absent: nothing backs the statement', () => {
    const a = assess(claim('bullet', 'Founded a nonprofit serving 500 schools'), E);
    expect(a.support).toBe('absent'); expect(a.evidence).toEqual([]);
  });
  it('ambiguous: several sources partly match and disagree', () => {
    const two = [ev({ id: 'p', text: 'Built payment service handling 10 million requests' }), ev({ id: 'q', text: 'Built payment service handling 3 million requests' })];
    expect(assess(claim('bullet', 'Built payment service handling requests at scale and reliability'), two).support).toBe('ambiguous');
  });
  it('skills: confirmed listing is direct; unconfirmed is partial; unknown is absent; aliases normalise', () => {
    expect(assess(claim('skill', 'TypeScript'), E).support).toBe('direct');
    expect(assess(claim('skill', 'ts'), E).support).toBe('direct');
    expect(assess(claim('skill', 'Go'), E).support).toBe('partial');
    expect(assess(claim('skill', 'Haskell'), E).support).toBe('absent');
  });
  it('dates compare to the profile role of the same employer', () => {
    const ok = assess(claim('date', 'Jan 2020 – Jun 2022', { employer: 'Acme' }), E);
    expect(ok.support).toBe('direct');
    const bad = assess(claim('date', 'Jan 2018 – Jun 2022', { employer: 'Acme' }), E);
    expect(bad.support).toBe('contradictory'); expect(bad.issues[0]).toMatch(/dates differ/);
    expect(assess(claim('date', 'Jan 2020 – Jun 2022', { employer: 'Nope' }), E).support).toBe('absent');
  });
  it('employers, titles and credentials match the profile', () => {
    expect(assess(claim('employer', 'Acme'), E).support).toBe('direct');
    expect(assess(claim('title', 'Developer'), E).support).toBe('direct');
    expect(assess(claim('title', 'Chief Architect'), E).support).toBe('absent');
    expect(assess(claim('credential', 'MSc Computer Science, TU Berlin'), E).support).toBe('direct');
    expect(assess(claim('credential', 'PhD Physics, MIT'), E).support).toBe('absent');
  });
  it('a user link upgrades absent to direct only for a confirmed fact, and never overrides a contradiction', () => {
    const linked = assess(claim('bullet', 'Founded a nonprofit serving 500 schools'), [...E, ev({ id: 'f9', source: 'FACT', text: 'Volunteer coordination', confirmed: true })], [{ factId: 'f9' }]);
    expect(linked.support).toBe('direct'); expect(linked.evidence[0].byUser).toBe(true);
    const contra = assess(claim('bullet', 'Reduced API latency by 70% using Redis caching'), E, [{ factId: 'b1' }]);
    expect(contra.support).toBe('contradictory');
  });
  it('number extraction normalises formats', () => { expect(numbers('cut 40 percent, saved $2m, 3x faster')).toEqual(expect.arrayContaining(['40%', '2m', '3x'])); });
});

describe('claims extraction', () => {
  const profile: ProfileInput = { fullName: 'Ada', email: 'a@x.com', summary: 'Engineer. Builds things.', experiences: [{ employerName: 'Acme', jobTitle: 'Dev', startDate: '2020-01', isCurrent: true, bullets: [{ content: 'Did X.' }] }],
    skills: [{ name: 'Go', category: 'L' }], educations: [{ institution: 'MIT', degree: 'BSc' }], projects: [], certifications: [], languages: [] };
  it('finds titles, employers, dates, bullets, skills, credentials and summary sentences with stable keys', () => {
    const m = buildRenderModel(profile, TEMPLATE_CATALOG[0], undefined, {});
    const a = extractClaims(m); const b = extractClaims(m);
    expect(a.map((c) => c.kind).sort()).toEqual(['bullet', 'credential', 'date', 'employer', 'skill', 'summary', 'summary', 'title']);
    expect(a.map((c) => c.key)).toEqual(b.map((c) => c.key));
    expect(new Set(a.map((c) => c.key)).size).toBe(a.length);
  });
});

describe('rewrite guard', () => {
  const corpus = ['Reduced API latency by 40% using Redis caching', 'Worked with Acme payments team'];
  it('safe when the rewrite only rewords', () => {
    const r = analyzeRewrite('Reduced API latency by 40% using Redis caching', 'Cut API latency by 40% with Redis caching', corpus);
    expect(r.verdict).toBe('safe'); expect(r.unsupported).toEqual([]);
    expect(r.diff.some((d) => d.op === 'add') && r.diff.some((d) => d.op === 'remove')).toBe(true);
  });
  it('flags invented numbers, skills, leadership, credentials and names', () => {
    const r = analyzeRewrite('Worked on the checkout service', 'Led a team of 12 engineers, cutting costs by 60% with Kubernetes at Globex as a certified architect', corpus);
    expect(r.verdict).toBe('needs-approval');
    const types = r.unsupported.map((u) => u.type);
    expect(types).toEqual(expect.arrayContaining(['number', 'skill', 'leadership', 'credential', 'name']));
    expect(r.unsupported.find((u) => u.type === 'skill')!.text).toBe('Kubernetes');
    expect(r.unsupported.every((u) => u.reason.length > 10)).toBe(true);
  });
  it('things already in the original or evidence are not flagged', () => {
    const r = analyzeRewrite('Managed the Acme payments team', 'Managed the Acme payments team and used Redis caching to cut latency by 40%', corpus);
    expect(r.unsupported).toEqual([]);
  });
  it('unchanged text', () => { expect(analyzeRewrite('Same text.', 'same   text', []).verdict).toBe('unchanged'); });
  it('acknowledgements must cover every unsupported item', () => {
    const u = analyzeRewrite('x y', 'x y 99%', []).unsupported;
    expect(missingAcknowledgements(u, []).length).toBe(1);
    expect(missingAcknowledgements(u, ['99%'])).toEqual([]);
  });
  it('word diff keeps shared words in order', () => { expect(wordDiff('a b c', 'a x c').map((s) => `${s.op}:${s.text}`)).toEqual(['keep:a', 'remove:b', 'add:x', 'keep:c']); });
  it('summary counts', () => { expect(summarize([assess(claim('skill', 'Haskell'), []), assess(claim('skill', 'TypeScript'), [ev({ id: 's', text: 'TypeScript', skills: ['TypeScript'] })])])).toMatchObject({ total: 2, direct: 1, absent: 1, needsAttention: 1 }); });
});

/* ---------------- HTTP ---------------- */
const RID = '11111111-1111-4111-8111-111111111111';
const FACT_OK = '22222222-2222-4222-8222-222222222222'; const FACT_DRAFT = '33333333-3333-4333-8333-333333333333';
const profile: ProfileInput = { fullName: 'Ada Lovelace', email: 'ada@example.com', summary: 'Engineer of analytical engines.',
  experiences: [{ employerName: 'Babbage & Co', jobTitle: 'Programmer', startDate: '2020-01', isCurrent: true, bullets: [{ content: 'Wrote the first published algorithm.' }, { content: 'Cut compute time by 90%.' }] }],
  skills: [{ name: 'Maths' }], educations: [], projects: [], certifications: [], languages: [] };
const model = buildRenderModel(profile, TEMPLATE_CATALOG[0], undefined, {});
const oldModel = buildRenderModel({ ...profile, experiences: [{ ...profile.experiences![0], bullets: [{ content: 'Wrote the first published algorithm.' }, { content: 'Invented a time machine.' }] }] }, TEMPLATE_CATALOG[0], undefined, {});

function fakePrisma() {
  const links: any[] = []; const props: any[] = [];
  const m = (r: any, w: any) => Object.entries(w).every(([k, v]) => r[k] === v);
  return {
    links, props,
    careerFact: {
      findMany: async () => [{ id: FACT_OK, title: 'Algorithm work', origin: 'USER_ENTERED', status: 'CONFIRMED', kind: 'ACHIEVEMENT', data: { action: 'Wrote the first published algorithm', skills: ['Maths'] } }],
      findFirst: async ({ where }: any) => (where.id === FACT_OK ? { id: FACT_OK, status: 'CONFIRMED' } : where.id === FACT_DRAFT ? { id: FACT_DRAFT, status: 'DRAFT' } : null),
    },
    careerProfile: { findUnique: async () => ({ tenantId: 't1', experiences: [{ id: 'e1', jobTitle: 'Programmer', employerName: 'Babbage & Co', startDate: '2020-01', endDate: null, isCurrent: true, bullets: [{ id: 'b1', content: 'Wrote the first published algorithm.', isUserConfirmed: true }, { id: 'b2', content: 'Cut compute time by 90%.', isUserConfirmed: false }] }], skills: [{ id: 's1', name: 'Maths', isUserConfirmed: true }], educations: [], certifications: [], projects: [] }) },
    resumeVersion: { findUnique: async ({ where }: any) => (where.resumeId_versionNumber.versionNumber === 1 ? { structuredSnapshot: oldModel } : null) },
    provenanceLink: {
      findMany: async ({ where }: any) => links.filter((l) => m(l, { tenantId: where.tenantId, userId: where.userId, resumeId: where.resumeId })),
      findFirst: async ({ where }: any) => links.find((l) => m(l, where)) ?? null,
      create: async ({ data }: any) => { const r = { id: crypto.randomUUID(), createdAt: new Date(), ...data }; links.push(r); return r; },
      deleteMany: async ({ where }: any) => { const n = links.length; const keep = links.filter((l) => !m(l, where)); links.length = 0; links.push(...keep); return { count: n - links.length }; },
    },
    rewriteProposal: {
      create: async ({ data }: any) => { const r = { id: crypto.randomUUID(), createdAt: new Date(), status: 'PENDING', acknowledged: null, decidedAt: null, ...data }; props.push(r); return r; },
      findFirst: async ({ where }: any) => { const r = props.find((x) => m(x, where)); return r ? { ...r } : null; },
      findMany: async ({ where }: any) => props.filter((x) => x.userId === where.userId && x.tenantId === where.tenantId && (!where.status || x.status === where.status)),
      update: async ({ where, data }: any) => { const r = props.find((x) => x.id === where.id); Object.assign(r, data); return { ...r }; },
    },
  };
}
let current = { userId: 'u1', tenantId: 't1' };
@Injectable() class FakeAuth implements CanActivate { canActivate(c: ExecutionContext) { c.switchToHttp().getRequest().user = current; return true; } }

describe('provenance HTTP', () => {
  let app: INestApplication; let base: string; const prisma = fakePrisma();
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10_000 }])], controllers: [ProvenanceController],
      providers: [ProvenanceService, { provide: PrismaService, useValue: prisma },
        { provide: ResumesService, useValue: { renderModel: async (_u: unknown, id: string) => { if (id !== RID) throw new NotFoundException('Resume not found'); return { model, name: 'CV' }; } } },
        { provide: APP_GUARD, useClass: ThrottlerGuard }, { provide: APP_GUARD, useClass: FakeAuth }],
    }).compile();
    app = mod.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0); base = (await app.getUrl()).replace('[::1]', 'localhost');
  });
  afterAll(async () => { await app.close(); });
  const call = (method: string, path: string, body?: unknown) => fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = async (r: Response) => (await r.json()) as any;

  it('checks a resume against confirmed evidence, flags unconfirmed sources, changes nothing', async () => {
    const r = await json(await call('POST', `/resumes/${RID}/provenance/check`, {}));
    expect(r.note).toMatch(/not that the statement is false/);
    const bySupport = (t: string) => r.claims.find((c: any) => c.text.includes(t));
    expect(bySupport('first published algorithm').support).toBe('direct');
    expect(bySupport('90%').support).toBe('partial');        // matches only an unconfirmed profile bullet
    expect(bySupport('90%').origin).toBe('IMPORTED');
    expect(bySupport('Programmer').support).toBe('direct');
    expect(r.summary.total).toBe(r.claims.length);
    expect(r.summary.needsAttention).toBeGreaterThan(0);
    expect(prisma.links).toHaveLength(0);
  });

  it('manual links: only confirmed facts, owner-scoped, idempotent, removable', async () => {
    const check = await json(await call('POST', `/resumes/${RID}/provenance/check`, {}));
    const key = check.claims.find((c: any) => c.text.includes('90%')).key;
    expect((await call('POST', `/resumes/${RID}/provenance/links`, { claimKey: key, factId: FACT_DRAFT })).status).toBe(400);
    expect((await call('POST', `/resumes/${RID}/provenance/links`, { claimKey: 'nonexistentkey', factId: FACT_OK })).status).toBe(404);
    const l1 = await json(await call('POST', `/resumes/${RID}/provenance/links`, { claimKey: key, factId: FACT_OK }));
    const l2 = await json(await call('POST', `/resumes/${RID}/provenance/links`, { claimKey: key, factId: FACT_OK }));
    expect(l2.id).toBe(l1.id);
    expect((await json(await call('GET', `/resumes/${RID}/provenance/links`))).length).toBe(1);
    const after = await json(await call('POST', `/resumes/${RID}/provenance/check`, {}));
    expect(after.claims.find((c: any) => c.key === key).evidence[0].byUser).toBe(true);
    current = { userId: 'u2', tenantId: 't1' };
    expect((await call('DELETE', `/resumes/${RID}/provenance/links/${l1.id}`)).status).toBe(404);
    current = { userId: 'u1', tenantId: 't1' };
    expect((await call('DELETE', `/resumes/${RID}/provenance/links/${l1.id}`)).status).toBe(204);
  });

  it('rewrite proposals: analysed, stored, and unsupported expansions cannot be silently approved', async () => {
    const p = await json(await call('POST', '/provenance/rewrites', { original: 'Wrote the first published algorithm.', proposed: 'Led a team of 8 to write the first published algorithm, saving $5m' }));
    expect(p).toMatchObject({ verdict: 'needs-approval', status: 'PENDING', origin: 'AI_REWRITTEN' });
    expect(p.unsupported.map((u: any) => u.type)).toEqual(expect.arrayContaining(['number', 'leadership']));
    const bad = await call('POST', `/provenance/rewrites/${p.id}/approve`, { acknowledged: [] });
    expect(bad.status).toBe(400);
    expect((await json(bad)).unacknowledged.length).toBe(p.unsupported.length);
    const partial = await call('POST', `/provenance/rewrites/${p.id}/approve`, { acknowledged: [p.unsupported[0].text] });
    expect(partial.status).toBe(400);
    const ok = await json(await call('POST', `/provenance/rewrites/${p.id}/approve`, { acknowledged: p.unsupported.map((u: any) => u.text) }));
    expect(ok.status).toBe('APPROVED'); expect(ok.finalText).toBe(p.proposed);
    expect((await call('POST', `/provenance/rewrites/${p.id}/approve`, { acknowledged: [] })).status).toBe(409);
  });

  it('safe rewrites need no acknowledgements; reject is final; lists and isolation work', async () => {
    const s = await json(await call('POST', '/provenance/rewrites', { original: 'Wrote the first published algorithm.', proposed: 'Authored the first published algorithm.', origin: 'USER_EDIT' }));
    expect(s.verdict).toBe('safe');
    expect((await json(await call('POST', `/provenance/rewrites/${s.id}/approve`, { acknowledged: [] }))).status).toBe('APPROVED');
    const r = await json(await call('POST', '/provenance/rewrites', { original: 'a b c d', proposed: 'a b c e' }));
    expect((await json(await call('POST', `/provenance/rewrites/${r.id}/reject`))).status).toBe('REJECTED');
    expect((await call('POST', `/provenance/rewrites/${r.id}/approve`, { acknowledged: [] })).status).toBe(409);
    expect((await json(await call('GET', '/provenance/rewrites?status=REJECTED'))).some((x: any) => x.id === r.id)).toBe(true);
    current = { userId: 'u2', tenantId: 't1' };
    expect((await call('GET', `/provenance/rewrites/${r.id}`)).status).toBe(404);
    expect((await json(await call('GET', '/provenance/rewrites'))).length).toBe(0);
    current = { userId: 'u1', tenantId: 't1' };
  });

  it('evidence diff between a saved version and the draft: added, removed, unchanged; read-only; owner-checked', async () => {
    const before = prisma.links.length;
    const d = await json(await call('GET', `/resumes/${RID}/provenance/compare?from=1&to=draft`));
    expect(d).toMatchObject({ from: 'Version 1', to: 'Working draft' });
    expect(d.note).toMatch(/does not mean a statement is false/);
    expect(d.added.map((e: any) => e.text)).toEqual(expect.arrayContaining([expect.stringContaining('90%')]));
    expect(d.added.find((e: any) => e.text.includes('90%')).support).toBe('partial');
    expect(d.removed.map((e: any) => e.text)).toEqual(expect.arrayContaining([expect.stringContaining('time machine')]));
    expect(d.removed.find((e: any) => e.text.includes('time machine')).support).toBe('absent');
    expect(d.addedNeedingEvidence).toBeGreaterThanOrEqual(1);
    expect(d.removedWithoutEvidence).toBeGreaterThanOrEqual(1);
    expect(d.unchanged).toBeGreaterThan(0);
    expect(d.toSummary.total).toBeGreaterThan(0);
    expect(prisma.links).toHaveLength(before);
    const same = await json(await call('GET', `/resumes/${RID}/provenance/compare?from=draft&to=draft`));
    expect(same.added).toEqual([]); expect(same.removed).toEqual([]); expect(same.changed).toEqual([]);
    expect((await call('GET', `/resumes/${RID}/provenance/compare?from=99&to=draft`)).status).toBe(404);
    expect((await call('GET', `/resumes/${RID}/provenance/compare?from=abc&to=draft`)).status).toBe(400);
    expect((await call('GET', `/resumes/22222222-2222-4222-8222-222222222222/provenance/compare?from=1&to=draft`)).status).toBe(404);
  });

  it('validates input and unknown resumes', async () => {
    expect((await call('POST', '/provenance/rewrites', { original: '', proposed: 'x' })).status).toBe(400);
    expect((await call('POST', '/provenance/rewrites', { original: 'x', proposed: 'y', evil: 1 })).status).toBe(400);
    expect((await call('POST', '/resumes/22222222-2222-4222-8222-222222222222/provenance/check', {})).status).toBe(404);
    expect((await call('POST', '/provenance/rewrites', { original: 'x', proposed: 'y', resumeId: '22222222-2222-4222-8222-222222222222' })).status).toBe(404);
  });
});
