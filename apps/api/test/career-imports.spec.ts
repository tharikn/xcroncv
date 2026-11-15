import { CanActivate, ExecutionContext, INestApplication, Injectable, NotFoundException, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CareerProfileService } from '../src/career-profile/career-profile.service';
import { CareerImportsController, CareerImportsService, ProviderConnectionsController } from '../src/career-imports/career-imports.module';
import { classify, csvToSuggestion, jsonToSuggestion, parseCsv, planMerge, ProfileDto, StagedField, toFields, emptyProfileDto } from '../src/career-imports/staging';
import { renderDocx } from '../src/import-export/docx.renderer';
import { buildRenderModel } from '../src/render-model/render-model.builder';
import { PrismaService } from '../src/prisma/prisma.service';
import { TEMPLATE_CATALOG } from '../src/templates/template.catalog';

const NOW = '2026-01-01T00:00:00.000Z';
const fieldsFrom = (s: ReturnType<typeof jsonToSuggestion>, accept = true): StagedField[] => toFields(s, 'json', NOW).map((f) => ({ ...f, status: accept ? 'accepted' : 'pending' }));
const profile = (over: Partial<ProfileDto> = {}): ProfileDto => ({
  ...emptyProfileDto(), fullName: 'Ada Lovelace', email: 'ada@example.com',
  experiences: [{ employerName: 'Babbage & Co', jobTitle: 'Programmer', startDate: '2020-01', isCurrent: true, bullets: [{ kind: 'RESPONSIBILITY', content: 'Wrote algorithms.', isUserConfirmed: true }] }],
  skills: [{ name: 'Maths' }], ...over,
});

describe('structured sources', () => {
  it('reads the platform JSON shape and normalises dates, dropping what it cannot understand', () => {
    const s = jsonToSuggestion(JSON.stringify({
      fullName: ' Ada ', email: 'ada@example.com', links: [{ label: 'Site', url: 'example.com/ada' }, { label: 'Bad', url: 'javascript:alert(1)' }],
      experiences: [{ employerName: 'Acme', jobTitle: 'Dev', startDate: 'Jan 2020', endDate: '03/2022', bullets: ['Built things', { content: 'Shipped' }] }, { employerName: 'NoTitle', startDate: '2020-01' }],
      skills: ['Go', { name: 'Redis', category: 'Data' }], educations: [{ institution: 'MIT', degree: 'BSc', startDate: 'not a date' }],
    }));
    expect(s.fullName).toBe('Ada');
    expect(s.links).toEqual([{ label: 'Site', url: 'https://example.com/ada' }]);
    expect(s.experiences).toHaveLength(1);
    expect(s.experiences[0]).toMatchObject({ startDate: '2020-01', endDate: '2022-03', isCurrent: false, confidence: 'high' });
    expect(s.experiences[0].bullets.map((b) => b.content)).toEqual(['Built things', 'Shipped']);
    expect(s.educations[0].startDate).toBeUndefined();
    expect(s.warnings.join(' ')).toMatch(/needs an employer/);
    expect(s.warnings.join(' ')).toMatch(/was not understood/);
    expect(s.warnings.join(' ')).toMatch(/without a valid web address/);
  });
  it('reads JSON Resume (basics/work/education/skills/certificates)', () => {
    const s = jsonToSuggestion(JSON.stringify({
      basics: { name: 'Grace Hopper', label: 'Rear Admiral', email: 'g@example.com', location: { city: 'NYC', countryCode: 'US' }, profiles: [{ network: 'GitHub', url: 'https://github.com/g' }] },
      work: [{ name: 'Navy', position: 'Officer', startDate: '1943-12-01', highlights: ['Built compiler'] }],
      education: [{ institution: 'Yale', studyType: 'PhD', area: 'Math' }], skills: [{ name: 'Languages', keywords: ['COBOL', 'FLOW-MATIC'] }],
      certificates: [{ name: 'Medal', issuer: 'US' }],
    }));
    expect(s).toMatchObject({ fullName: 'Grace Hopper', headline: 'Rear Admiral', location: 'NYC, US' });
    expect(s.experiences[0]).toMatchObject({ employerName: 'Navy', jobTitle: 'Officer', startDate: '1943-12', isCurrent: true });
    expect(s.skills.map((k) => k.name)).toEqual(['COBOL', 'FLOW-MATIC']);
    expect(s.certifications[0]).toMatchObject({ name: 'Medal', issuer: 'US' });
  });
  it('rejects invalid JSON, empty objects, nothing-importable and oversize input', () => {
    expect(() => jsonToSuggestion('{nope')).toThrow(/not valid JSON/);
    expect(() => jsonToSuggestion('[]')).toThrow(/profile object/);
    expect(() => jsonToSuggestion('{"hello":1}')).toThrow(/Nothing importable/);
    expect(() => jsonToSuggestion(JSON.stringify({ summary: 'x'.repeat(1024 * 1024 + 5) }))).toThrow(/1 MB/);
  });
  it('parses CSV with quotes, requires a type column and reports row problems without echoing content', () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'he said "hi"']]);
    expect(() => parseCsv('a,"b')).toThrow(/unclosed/);
    expect(() => csvToSuggestion('name\nGo')).toThrow(/"type" column/);
    const s = csvToSuggestion([
      'type,employerName,jobTitle,startDate,endDate,bullets,name,institution,degree,url,label',
      'profile,,,,,,,,,,',
      'experience,"Acme, Inc",Dev,2020-01,,"Built A|Built B",,,,,',
      'experience,Bad,,2020-01,,,,,,,',
      'skill,,,,,,Go,,,,',
      'education,,,,,,,MIT,BSc,,',
      'link,,,,,,,,,https://example.com,Site',
      'wat,,,,,,,,,,',
    ].join('\n'));
    expect(s.experiences).toHaveLength(1);
    expect(s.experiences[0]).toMatchObject({ employerName: 'Acme, Inc', isCurrent: false });
    expect(s.experiences[0].bullets).toHaveLength(2);
    expect(s.skills[0].name).toBe('Go'); expect(s.educations).toHaveLength(1); expect(s.links).toHaveLength(1);
    expect(s.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/^Row 4: a job needs/), expect.stringMatching(/^Row 8: unknown type/)]));
    expect(s.warnings.join(' ')).not.toMatch(/Bad/);
  });
});

describe('classification and merge planning', () => {
  it('marks new, duplicate and conflicting fields against the profile', () => {
    const s = jsonToSuggestion(JSON.stringify({
      fullName: 'Ada Lovelace', email: 'other@example.com', phone: '123',
      experiences: [
        { employerName: 'Babbage & Co', jobTitle: 'Programmer', startDate: '2020-01' }, // current in profile -> imported has no end: duplicate
        { employerName: 'Babbage & Co', jobTitle: 'Programmer', startDate: '2020-01', endDate: '2022-01' }, // end differs: conflict
        { employerName: 'Analytical Engines', jobTitle: 'Lead', startDate: '2018-01' }, // new
      ],
      skills: ['maths', 'Go'],
    }));
    const { fields, conflicts } = classify(toFields(s, 'json', NOW), profile());
    const by = (label: string) => fields.find((f) => f.label.includes(label))!;
    expect(by('email').classification).toBe('conflict');
    expect(by('phone').classification).toBe('new');
    expect(by('Lovelace').classification).toBe('duplicate');
    expect(fields.filter((f) => f.section === 'experience').map((f) => f.classification)).toEqual(['duplicate', 'conflict', 'new']);
    expect(by('Maths') ?? fields.find((f) => f.value.name === 'maths')!).toMatchObject({ classification: 'duplicate' });
    expect(fields.find((f) => f.value.name === 'Go')!.classification).toBe('new');
    const expConflict = conflicts.find((c) => c.section === 'experience')!;
    expect(expConflict.differences).toEqual([{ field: 'endDate', existing: 'present', imported: '2022-01' }]);
    expect(expConflict.choices).toEqual(['keep_existing', 'use_imported', 'keep_both']);
    expect(conflicts.find((c) => c.section === 'profile')!.choices).toEqual(['keep_existing', 'use_imported']);
  });

  it('only accepted fields are merged; conflicts need an explicit decision; nothing is invented', () => {
    const s = jsonToSuggestion(JSON.stringify({ email: 'other@example.com', skills: ['Go'], experiences: [{ employerName: 'Babbage & Co', jobTitle: 'Programmer', startDate: '2020-01', endDate: '2022-01', bullets: ['New bullet'] }] }));
    const all = fieldsFrom(s, false);
    expect(planMerge(profile(), all, {}).changes).toEqual([]); // nothing accepted
    const accepted = all.map((f) => ({ ...f, status: 'accepted' as const }));
    const p0 = planMerge(profile(), accepted, {});
    expect(p0.unresolved.sort()).toEqual(accepted.filter((f) => f.section !== 'skill').map((f) => `c-${f.id}`).sort());
    const decisions = Object.fromEntries(p0.unresolved.map((id) => [id, id.includes('f1') ? 'keep_existing' : 'use_imported'])) as any;
    const plan = planMerge(profile(), accepted, decisions);
    expect(plan.unresolved).toEqual([]);
    expect(plan.profile.email).toBe('ada@example.com'); // kept
    expect(plan.profile.skills.map((k) => k.name)).toEqual(['Maths', 'Go']);
    const exp = plan.profile.experiences[0];
    expect(exp.endDate).toBe('2022-01'); expect(exp.isCurrent).toBe(false);
    expect(exp.bullets.map((b) => b.content)).toEqual(['Wrote algorithms.', 'New bullet']);
    expect(exp.bullets[1]).toMatchObject({ isUserConfirmed: true, kind: 'RESPONSIBILITY' });
  });

  it('keep_both adds the imported item next to the existing one; the input profile is never mutated', () => {
    const s = jsonToSuggestion(JSON.stringify({ experiences: [{ employerName: 'Babbage & Co', jobTitle: 'Programmer', startDate: '2020-01', endDate: '2022-01' }] }));
    const f = fieldsFrom(s); const orig = profile(); const snapshot = JSON.stringify(orig);
    const plan = planMerge(orig, f, { [`c-${f[0].id}`]: 'keep_both' });
    expect(plan.profile.experiences).toHaveLength(2);
    expect(JSON.stringify(orig)).toBe(snapshot);
  });

  it('needs a full name for a brand new profile and respects section limits', () => {
    const s = jsonToSuggestion(JSON.stringify({ skills: ['Go'] }));
    expect(planMerge(null, fieldsFrom(s), {}).error).toMatch(/full name/);
    const withName = jsonToSuggestion(JSON.stringify({ fullName: 'New Person', skills: ['Go'] }));
    expect(planMerge(null, fieldsFrom(withName), {}).error).toBeUndefined();
    const full = profile({ links: Array.from({ length: 10 }, (_, i) => ({ label: 'L', url: `https://e.com/${i}` })) });
    const l = fieldsFrom(jsonToSuggestion(JSON.stringify({ links: [{ label: 'X', url: 'https://x.com' }] })));
    expect(planMerge(full, l, {}).changes[0]).toMatchObject({ action: 'skip', reason: expect.stringMatching(/maximum/) });
  });
});

/* ---------- HTTP-level tests with in-memory tables ---------- */
function fakeStores() {
  const jobs: any[] = []; const events: any[] = []; let prof: any = null; let tick = 0; let upserts = 0;
  const match = (r: any, w: any) => Object.entries(w).every(([k, v]) => (v && typeof v === 'object' && 'lt' in (v as any) ? r[k] < (v as any).lt : r[k] === v));
  const prisma: any = {
    jobs, events,
    careerImportJob: {
      create: async ({ data }: any) => { const row = { id: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date(), confirmedAt: null, result: null, undo: null, decisions: {}, ...data }; jobs.push(row); return row; },
      findFirst: async ({ where }: any) => { const r = jobs.find((x) => match(x, where)); return r ? { ...r } : null; },
      findMany: async ({ where, take }: any) => jobs.filter((r) => match(r, where)).sort((a, b) => +b.createdAt - +a.createdAt).slice(0, take ?? 100).map((r) => ({ ...r })),
      update: async ({ where, data }: any) => { const r = jobs.find((x) => x.id === where.id); for (const [k, v] of Object.entries(data)) r[k] = (v as any)?.constructor?.name === 'DbNull' || String(v) === 'DbNull' ? null : v; r.updatedAt = new Date(); return { ...r }; },
      delete: async ({ where }: any) => { jobs.splice(jobs.findIndex((x) => x.id === where.id), 1); },
      deleteMany: async ({ where }: any) => { const keep = jobs.filter((r) => !match(r, where)); const n = jobs.length - keep.length; jobs.length = 0; jobs.push(...keep); return { count: n }; },
    },
    importAuditEvent: {
      create: async ({ data }: any) => { events.push({ id: crypto.randomUUID(), createdAt: new Date(), ...data }); },
      findMany: async ({ where }: any) => events.filter((e) => match(e, where)),
    },
  };
  const toFull = (dto: any) => ({
    id: 'p1', userId: 'u1', tenantId: 't1', createdAt: new Date(), updatedAt: new Date(Date.UTC(2026, 0, 1) + ++tick * 1000),
    fullName: dto.fullName, email: dto.email ?? null, phone: dto.phone ?? null, location: dto.location ?? null, headline: dto.headline ?? null, summary: dto.summary ?? null, links: dto.links ?? [],
    experiences: (dto.experiences ?? []).map((e: any) => ({ employmentType: null, location: null, endDate: null, description: null, isCurrent: false, ...e, bullets: (e.bullets ?? []).map((b: any) => ({ kind: 'RESPONSIBILITY', isUserConfirmed: false, ...b })) })),
    skills: (dto.skills ?? []).map((s: any) => ({ category: null, proficiency: null, yearsUsed: null, ...s })),
    educations: (dto.educations ?? []).map((s: any) => ({ field: null, startDate: null, endDate: null, grade: null, ...s })),
    projects: (dto.projects ?? []).map((s: any) => ({ url: null, description: null, technologies: [], ...s })),
    certifications: (dto.certifications ?? []).map((s: any) => ({ issuer: null, issuedDate: null, expiryDate: null, ...s })),
    languages: (dto.languages ?? []).map((s: any) => ({ proficiency: null, ...s })),
  });
  const profiles = {
    get: async () => { if (!prof) throw new NotFoundException('Career profile not found'); return prof; },
    upsert: async (_u: any, dto: any) => { upserts++; prof = toFull(JSON.parse(JSON.stringify(dto))); return prof; },
    remove: async () => { prof = null; },
    set: (dto: any) => { prof = toFull(dto); }, current: () => prof, upserts: () => upserts,
  };
  return { prisma, profiles };
}

let currentUser = { userId: 'u1', tenantId: 't1' };
@Injectable() class FakeAuth implements CanActivate { canActivate(c: ExecutionContext) { c.switchToHttp().getRequest().user = currentUser; return true; } }

describe('career imports HTTP', () => {
  let app: INestApplication; let base: string; const st = fakeStores();
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10_000 }])],
      controllers: [CareerImportsController, ProviderConnectionsController],
      providers: [CareerImportsService, { provide: PrismaService, useValue: st.prisma }, { provide: CareerProfileService, useValue: st.profiles }, { provide: APP_GUARD, useClass: ThrottlerGuard }, { provide: APP_GUARD, useClass: FakeAuth }],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0); base = (await app.getUrl()).replace('[::1]', 'localhost');
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { currentUser = { userId: 'u1', tenantId: 't1' }; st.profiles.set(profile()); });

  const upload = (bytes: Uint8Array | Buffer | string, name: string, headers: Record<string, string> = {}) => {
    const f = new FormData(); f.append('file', new Blob([bytes as BlobPart]), name);
    return fetch(`${base}/career-imports`, { method: 'POST', body: f, headers });
  };
  const call = (method: string, path: string, body?: unknown) => fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = async (r: Response) => (await r.json()) as any;
  const sample = JSON.stringify({
    email: 'other@example.com', phone: '555',
    experiences: [{ employerName: 'Babbage & Co', jobTitle: 'Programmer', startDate: '2020-01', endDate: '2022-01', bullets: ['New bullet'] }, { employerName: 'Engines Ltd', jobTitle: 'Lead', startDate: '2018-01', endDate: '2019-12' }],
    skills: ['Go', 'Maths'],
  });

  it('stages an upload as unconfirmed fields with provenance and leaves the profile untouched', async () => {
    const before = st.profiles.upserts();
    const r = await upload(sample, 'export.json');
    expect(r.status).toBe(201); expect(r.headers.get('cache-control')).toBe('no-store');
    const job = await j(r);
    expect(job).toMatchObject({ status: 'review_ready', sourceKind: 'json' });
    expect(job.fields.length).toBe(6);
    for (const f of job.fields) expect(f).toMatchObject({ status: 'pending', parserVersion: 'career-import-1.0.0', confidence: 'high' });
    expect(job.fields[0].sourceRef).toBeTruthy(); expect(job.fields[0].importedAt).toBeTruthy();
    expect(job.counts).toMatchObject({ total: 6, pending: 6, conflict: 2, duplicate: 1 });
    expect(st.profiles.upserts()).toBe(before);
    const stored = JSON.stringify(st.prisma.jobs.at(-1));
    expect(stored).not.toContain('export.json'); // the file name is not kept
  });

  it('is idempotent with an Idempotency-Key header', async () => {
    const a = await upload(sample, 'a.json', { 'idempotency-key': 'k-1' });
    const b = await upload(sample, 'a.json', { 'idempotency-key': 'k-1' });
    expect(a.status).toBe(201); expect(b.status).toBe(200);
    expect((await j(a)).id).toBe((await j(b)).id);
  });

  it('imports DOCX by content and CSV by extension; rejects everything else', async () => {
    const model = buildRenderModel({ fullName: 'Ada Lovelace', experiences: [{ employerName: 'Babbage & Co', jobTitle: 'Programmer', startDate: '2020-01', isCurrent: true, bullets: [{ content: 'Wrote algorithms.' }] }], skills: [{ name: 'Maths' }], educations: [], projects: [], certifications: [], languages: [] } as any, TEMPLATE_CATALOG[0], undefined, {});
    const d = await upload(renderDocx(model), 'cv.txt'); // name is irrelevant for DOCX
    expect(d.status).toBe(201); expect((await j(d)).sourceKind).toBe('docx');
    const c = await upload('type,name\nskill,Go\n', 'skills.csv');
    expect(c.status).toBe(201); expect((await j(c)).sourceKind).toBe('csv');
    expect((await upload('hello world, this is not importable', 'notes.txt')).status).toBe(415);
    expect((await upload(Buffer.from([1, 2, 0, 3, 4, 5, 6, 7]), 'x.json')).status).toBe(415);
    expect((await upload('{"a":', 'x.json')).status).toBe(400);
    expect((await upload(Buffer.alloc(1024 * 1024 + 10, 97), 'big.json')).status).toBe(400);
    expect((await fetch(`${base}/career-imports`, { method: 'POST', body: new FormData() })).status).toBe(400);
  });

  it('review -> resolve -> confirm merges only what was accepted, then can be undone', async () => {
    const job = await j(await upload(sample, 'e.json'));
    const id = job.id; const F = (pred: (f: any) => boolean) => job.fields.find(pred).id;
    const phone = F((f) => f.value.field === 'phone'); const email = F((f) => f.value.field === 'email'); const go = F((f) => f.value.name === 'Go');
    const babbage = F((f) => f.value.employerName === 'Babbage & Co'); const engines = F((f) => f.value.employerName === 'Engines Ltd');

    expect((await call('POST', `/career-imports/${id}/confirm`, { confirm: true })).status).toBe(400); // nothing accepted
    expect((await call('POST', `/career-imports/${id}/preview`, { accept: ['nope'] })).status).toBe(400);
    expect((await call('POST', `/career-imports/${id}/preview`, { accept: [go], reject: [go] })).status).toBe(400);
    const rv = await j(await call('POST', `/career-imports/${id}/preview`, { accept: [phone, email, go, babbage, engines], reject: [] }));
    expect(rv.counts.accepted).toBe(5);

    const mp = await j(await call('POST', `/career-imports/${id}/merge-preview`));
    expect(mp.unresolved.sort()).toEqual([`c-${babbage}`, `c-${email}`].sort());
    expect(st.profiles.current().phone).toBeNull(); // preview wrote nothing
    const c409 = await call('POST', `/career-imports/${id}/confirm`, { confirm: true });
    expect(c409.status).toBe(409); expect((await j(c409)).unresolved).toHaveLength(2);
    expect((await call('POST', `/career-imports/${id}/confirm`, { confirm: false })).status).toBe(400);

    expect((await call('POST', `/career-imports/${id}/resolve-conflicts`, { decisions: [{ conflictId: `c-${email}`, choice: 'keep_both' }] })).status).toBe(400); // not allowed for a profile field
    expect((await call('POST', `/career-imports/${id}/resolve-conflicts`, { decisions: [{ conflictId: 'c-zzz', choice: 'keep_existing' }] })).status).toBe(400);
    await call('POST', `/career-imports/${id}/resolve-conflicts`, { decisions: [{ conflictId: `c-${email}`, choice: 'keep_existing' }, { conflictId: `c-${babbage}`, choice: 'use_imported' }] });

    const done = await j(await call('POST', `/career-imports/${id}/confirm`, { confirm: true }));
    expect(done.status).toBe('confirmed'); expect(done.undoable).toBe(true);
    const p = st.profiles.current();
    expect(p.phone).toBe('555'); expect(p.email).toBe('ada@example.com');
    expect(p.skills.map((s: any) => s.name)).toEqual(['Maths', 'Go']);
    expect(p.experiences).toHaveLength(2);
    expect(p.experiences[0]).toMatchObject({ endDate: '2022-01', isCurrent: false });
    expect(done.fields.find((f: any) => f.id === go).status).toBe('merged');
    expect(done.result).toMatchObject({ add: 3, replace: 1 });
    expect((await call('POST', `/career-imports/${id}/confirm`, { confirm: true })).status).toBe(409); // already confirmed
    expect((await call('POST', `/career-imports/${id}/preview`, { accept: [go] })).status).toBe(409);

    const undone = await j(await call('POST', `/career-imports/${id}/undo`));
    expect(undone.status).toBe('review_ready');
    const q = st.profiles.current();
    expect(q.phone).toBeNull(); expect(q.skills.map((s: any) => s.name)).toEqual(['Maths']); expect(q.experiences).toHaveLength(1); expect(q.experiences[0].isCurrent).toBe(true);
    expect((await call('POST', `/career-imports/${id}/undo`)).status).toBe(409);
  });

  it('refuses to undo when the profile changed after the import', async () => {
    const job = await j(await upload(JSON.stringify({ phone: '999' }), 'p.json'));
    await call('POST', `/career-imports/${job.id}/preview`, { accept: [job.fields[0].id] });
    expect((await call('POST', `/career-imports/${job.id}/confirm`, { confirm: true })).status).toBe(200);
    await st.profiles.upsert({}, { ...st.profiles.current(), headline: 'Edited later' });
    expect((await call('POST', `/career-imports/${job.id}/undo`)).status).toBe(409);
    expect(st.profiles.current().phone).toBe('999');
  });

  it('creates a profile from an import when none exists, and undo removes it again', async () => {
    await st.profiles.remove();
    const job = await j(await upload(JSON.stringify({ fullName: 'New Person', skills: ['Go'] }), 'n.json'));
    await call('POST', `/career-imports/${job.id}/preview`, { accept: job.fields.map((f: any) => f.id) });
    expect((await call('POST', `/career-imports/${job.id}/confirm`, { confirm: true })).status).toBe(200);
    expect(st.profiles.current().fullName).toBe('New Person');
    await call('POST', `/career-imports/${job.id}/undo`);
    expect(st.profiles.current()).toBeNull();
  });

  it('enforces ownership, supports delete, expiry, listing and a content-free audit trail', async () => {
    const job = await j(await upload(JSON.stringify({ fullName: 'Secret Name', skills: ['Go'] }), 's.json'));
    currentUser = { userId: 'u2', tenantId: 't1' };
    expect((await call('GET', `/career-imports/${job.id}`)).status).toBe(404);
    expect((await call('POST', `/career-imports/${job.id}/confirm`, { confirm: true })).status).toBe(404);
    expect((await call('DELETE', `/career-imports/${job.id}`)).status).toBe(404);
    expect(await j(await call('GET', '/career-imports'))).toEqual([]);
    currentUser = { userId: 'u3', tenantId: 't2' };
    expect((await call('GET', `/career-imports/${job.id}`)).status).toBe(404);
    currentUser = { userId: 'u1', tenantId: 't1' };
    expect((await j(await call('GET', '/career-imports'))).some((x: any) => x.id === job.id)).toBe(true);
    const audit = await j(await call('GET', '/career-imports/audit'));
    expect(audit.map((e: any) => e.action)).toEqual(expect.arrayContaining(['received', 'review_ready']));
    expect(JSON.stringify(audit)).not.toContain('Secret Name');
    expect((await call('DELETE', `/career-imports/${job.id}`)).status).toBe(204);
    expect((await call('GET', `/career-imports/${job.id}`)).status).toBe(404);
    expect((await j(await call('GET', '/career-imports/audit'))).map((e: any) => e.action)).toContain('discarded');

    const old = await j(await upload(JSON.stringify({ skills: ['Go'] }), 'o.json'));
    st.prisma.jobs.find((x: any) => x.id === old.id).expiresAt = new Date(Date.now() - 1000);
    expect((await call('GET', `/career-imports/${old.id}`)).status).toBe(404);
    expect(st.prisma.jobs.find((x: any) => x.id === old.id)).toBeUndefined(); // purged
  });

  it('has no provider connections: authorize is an honest 501', async () => {
    const r = await call('POST', '/provider-connections/linkedin/authorize');
    expect(r.status).toBe(501);
    expect((await j(r)).message).toMatch(/export your data/i);
  });
});
