import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import { ImportExportController } from '../src/import-export/import-export.module';
import { ResumesService } from '../src/resumes/resumes.service';
import { buildRenderModel } from '../src/render-model/render-model.builder';
import { TEMPLATE_CATALOG } from '../src/templates/template.catalog';
import { renderDocx } from '../src/import-export/docx.renderer';

const model = buildRenderModel({
  fullName: 'Ada Lovelace', email: 'ada@example.com', summary: 'Engineer of analytical engines and programs.',
  experiences: [{ employerName: 'Babbage & Co', jobTitle: 'Programmer', startDate: '2020-01', isCurrent: true, bullets: [{ content: 'Wrote algorithms.' }] }],
  skills: [{ name: 'Maths' }], educations: [], projects: [], certifications: [], languages: [],
}, TEMPLATE_CATALOG[0], undefined, {});

/** HTTP-level test of the module: multipart handling, size limits, error mapping, response headers. Auth/DB are stubbed. */
describe('import/export HTTP', () => {
  let app: INestApplication; let base: string;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
      controllers: [ImportExportController],
      providers: [{ provide: ResumesService, useValue: { renderModel: async () => ({ model, name: 'Ada CV' }) } }, { provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0);
    base = (await app.getUrl()).replace('[::1]', 'localhost');
  });
  afterAll(async () => { await app.close(); });

  const upload = (bytes: Uint8Array | Buffer, name = 'cv.docx', extra?: Record<string, string>) => {
    const f = new FormData(); f.append('file', new Blob([bytes]), name);
    for (const [k, v] of Object.entries(extra ?? {})) f.append(k, v);
    return fetch(`${base}/resume-imports/parse`, { method: 'POST', body: f });
  };

  it('parses a DOCX and returns suggestions with no-store caching', async () => {
    const r = await upload(renderDocx(model));
    expect(r.status).toBe(201);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const body: any = await r.json();
    expect(body.kind).toBe('docx');
    expect(body.suggestion.fullName).toBe('Ada Lovelace');
    expect(body.suggestion.experiences[0].employerName).toBe('Babbage & Co');
  });

  it('ignores the file name/extension and trusts the content', async () => {
    const r = await upload(renderDocx(model), 'resume.pdf');
    expect(r.status).toBe(201);
    expect(((await r.json()) as any).kind).toBe('docx');
  });

  it('rejects: no file, wrong type, oversized, zip bomb', async () => {
    expect((await fetch(`${base}/resume-imports/parse`, { method: 'POST', body: new FormData() })).status).toBe(400);
    expect((await upload(Buffer.from('MZ not a document at all'), 'x.pdf')).status).toBe(415);
    expect((await upload(Buffer.alloc(5 * 1024 * 1024 + 10, 0x41), 'big.pdf')).status).toBe(413);
    const bomb = Buffer.from(zipSync({ 'word/document.xml': new Uint8Array(30 * 1024 * 1024) }));
    expect((await upload(bomb)).status).toBe(400);
    expect((await upload(Buffer.from(zipSync({ 'a.txt': strToU8('hello hello') })))).status).toBe(400);
  });

  it('rejects extra form fields', async () => {
    expect((await upload(renderDocx(model), 'cv.docx', { userId: 'someone-else' })).status).toBeGreaterThanOrEqual(400);
  });

  it('exports DOCX and XLSX with attachment headers and valid packages', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const d = await fetch(`${base}/resumes/${id}/export/docx`, { method: 'POST' });
    expect(d.status).toBe(201);
    expect(d.headers.get('content-type')).toContain('wordprocessingml.document');
    expect(d.headers.get('content-disposition')).toBe('attachment; filename="Ada-CV.docx"');
    expect(d.headers.get('cache-control')).toBe('no-store');
    expect(Object.keys(unzipSync(new Uint8Array(await d.arrayBuffer())))).toContain('word/document.xml');
    const x = await fetch(`${base}/resumes/${id}/export/xlsx`, { method: 'POST' });
    expect(x.headers.get('content-type')).toContain('spreadsheetml.sheet');
    expect(Object.keys(unzipSync(new Uint8Array(await x.arrayBuffer())))).toContain('xl/workbook.xml');
    expect((await fetch(`${base}/resumes/not-a-uuid/export/docx`, { method: 'POST' })).status).toBe(400);
  });
});
