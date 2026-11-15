import { CanActivate, ExecutionContext, INestApplication, Injectable, NotFoundException, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { strToU8, zipSync } from 'fflate';
import { renderDocx } from '../src/import-export/docx.renderer';
import { buildRenderModel } from '../src/render-model/render-model.builder';
import { ParsingTestController, ParsingTestService } from '../src/parsing-test/parsing-test.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ResumesService } from '../src/resumes/resumes.service';
import { TEMPLATE_CATALOG } from '../src/templates/template.catalog';

const model = buildRenderModel({
  fullName: 'Ada Lovelace', email: 'ada@example.com', phone: '+44 20 7946 0000', summary: 'Engineer of analytical engines and programs for many years.',
  experiences: [{ employerName: 'Babbage & Co', jobTitle: 'Programmer', startDate: '2020-01', isCurrent: true, bullets: [{ content: 'Wrote algorithms.' }] }],
  skills: [{ name: 'Maths' }], educations: [], projects: [], certifications: [], languages: [],
}, TEMPLATE_CATALOG[0], undefined, {});

/** In-memory stand-in for the one Prisma table this module uses. */
function fakePrisma() {
  const rows: any[] = [];
  return {
    rows,
    parsingTestReport: {
      create: async ({ data }: any) => { const r = { id: crypto.randomUUID(), createdAt: new Date(), ...data }; rows.push(r); return r; },
      findFirst: async ({ where }: any) => rows.find((r) => r.id === where.id && r.tenantId === where.tenantId && r.userId === where.userId) ?? null,
      findMany: async ({ where }: any) => rows.filter((r) => r.tenantId === where.tenantId && r.userId === where.userId && (where.resumeId === undefined || r.resumeId === where.resumeId)),
      deleteMany: async ({ where }: any) => { const n = rows.length; const keep = rows.filter((r) => !(r.id === where.id && r.tenantId === where.tenantId && r.userId === where.userId)); rows.length = 0; rows.push(...keep); return { count: n - rows.length }; },
    },
  };
}

let current = { userId: 'u1', tenantId: 't1' };
@Injectable() class FakeAuth implements CanActivate { canActivate(c: ExecutionContext) { c.switchToHttp().getRequest().user = current; return true; } }

describe('parsing-test HTTP', () => {
  let app: INestApplication; let base: string; const prisma = fakePrisma();
  const RID = '11111111-1111-4111-8111-111111111111';
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
      controllers: [ParsingTestController],
      providers: [
        ParsingTestService, { provide: PrismaService, useValue: prisma },
        { provide: ResumesService, useValue: { renderModel: async (_u: unknown, id: string) => { if (id !== RID) throw new NotFoundException('Resume not found'); return { model, name: 'Ada CV' }; } } },
        { provide: APP_GUARD, useClass: ThrottlerGuard }, { provide: APP_GUARD, useClass: FakeAuth },
      ],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0);
    base = (await app.getUrl()).replace('[::1]', 'localhost');
  });
  afterAll(async () => { await app.close(); });

  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const upload = (bytes: Uint8Array | Buffer, extra?: Record<string, string>) => { const f = new FormData(); f.append('file', new Blob([bytes]), 'secret-name-resume.docx'); for (const [k, v] of Object.entries(extra ?? {})) f.append(k, v); return fetch(`${base}/parsing-tests/upload`, { method: 'POST', body: f }); };

  it('tests a generated resume, stores metadata only, and serves it back', async () => {
    const r = await post(`/resumes/${RID}/parsing-tests`, { format: 'docx' });
    expect(r.status).toBe(201);
    const body: any = await r.json();
    expect(body.report.source).toBe('GENERATED');
    expect(body.report.score).toBeGreaterThanOrEqual(85);
    expect(body.preview.length).toBeGreaterThan(0);
    const stored = prisma.rows.at(-1);
    expect(stored.score).toBe(body.report.score);
    expect(JSON.stringify(stored)).not.toContain('Wrote algorithms'); // no document text persisted
    expect(stored).not.toHaveProperty('preview');
    const g = await fetch(`${base}/parsing-tests/${body.id}`);
    expect(g.status).toBe(200);
    expect(g.headers.get('cache-control')).toBe('no-store');
    const got: any = await g.json();
    expect(got.report.suiteVersion).toBe('parsing-suite-1');
    expect(got.preview).toBeUndefined();
    const list: any[] = await (await fetch(`${base}/resumes/${RID}/parsing-tests`)).json();
    expect(list[0]).toMatchObject({ id: body.id, format: 'docx', source: 'GENERATED' });
  });

  it('tests a generated PDF too', async () => {
    const r = await post(`/resumes/${RID}/parsing-tests`, { format: 'pdf', parserProfiles: ['pdf-geometric-v1'] });
    expect(r.status).toBe(201);
    const body: any = await r.json();
    expect(body.report.adapters.map((a: any) => a.id)).toEqual(['pdf-geometric-v1']);
  }, 30_000);

  it('validates the request body', async () => {
    expect((await post(`/resumes/${RID}/parsing-tests`, { format: 'exe' })).status).toBe(400);
    expect((await post(`/resumes/${RID}/parsing-tests`, { format: 'pdf', parserProfiles: ['docx-xml-v1'] })).status).toBe(400);
    expect((await post(`/resumes/${RID}/parsing-tests`, { format: 'pdf', evil: 1 })).status).toBe(400);
    expect((await post('/resumes/22222222-2222-4222-8222-222222222222/parsing-tests', { format: 'pdf' })).status).toBe(404);
  });

  it('upload: diagnostics only, no score, file name never stored', async () => {
    const r = await upload(renderDocx(model));
    expect(r.status).toBe(201);
    const body: any = await r.json();
    expect(body.report.source).toBe('UPLOAD');
    expect(body.report.score).toBeNull();
    expect(body.resumeId).toBeNull();
    expect(JSON.stringify(prisma.rows)).not.toContain('secret-name-resume');
    const uploads: any[] = await (await fetch(`${base}/parsing-tests/uploads`)).json();
    expect(uploads.some((u) => u.id === body.id)).toBe(true);
  });

  it('upload rejects bad input with the right status codes', async () => {
    expect((await fetch(`${base}/parsing-tests/upload`, { method: 'POST', body: new FormData() })).status).toBe(400);
    expect((await upload(Buffer.from('MZ not a document at all'))).status).toBe(415);
    expect((await upload(Buffer.alloc(5 * 1024 * 1024 + 10, 0x41))).status).toBe(413);
    expect((await upload(Buffer.from(zipSync({ 'word/document.xml': new Uint8Array(30 * 1024 * 1024) })))).status).toBe(400);
    expect((await upload(Buffer.from(zipSync({ 'a.txt': strToU8('hello hello') })))).status).toBe(400);
    expect((await upload(renderDocx(model), { userId: 'someone' })).status).toBeGreaterThanOrEqual(400);
  });

  it('isolates reports by owner and tenant; delete removes history', async () => {
    const mine: any = await (await post(`/resumes/${RID}/parsing-tests`, { format: 'docx' })).json();
    current = { userId: 'u2', tenantId: 't1' };
    expect((await fetch(`${base}/parsing-tests/${mine.id}`)).status).toBe(404);
    expect((await fetch(`${base}/parsing-tests/${mine.id}`, { method: 'DELETE' })).status).toBe(404);
    current = { userId: 'u1', tenantId: 't2' };
    expect((await fetch(`${base}/parsing-tests/${mine.id}`)).status).toBe(404);
    current = { userId: 'u1', tenantId: 't1' };
    expect((await fetch(`${base}/parsing-tests/${mine.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await fetch(`${base}/parsing-tests/${mine.id}`)).status).toBe(404);
    expect((await fetch(`${base}/parsing-tests/not-a-uuid`)).status).toBe(400);
  });
});
