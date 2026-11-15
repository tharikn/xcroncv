import { CanActivate, ExecutionContext, INestApplication, Injectable, NotFoundException, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { unzipSync } from 'fflate';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildRenderModel, ProfileInput } from '../src/render-model/render-model.builder';
import { ResumeVariantsController, ResumeVersionsController, ResumeVersionsService } from '../src/resume-versions/resume-versions.module';
import { contentHash, diffModels, layoutFrom } from '../src/resume-versions/version-diff';
import { ResumesService } from '../src/resumes/resumes.service';
import { TEMPLATE_CATALOG } from '../src/templates/template.catalog';

const base: ProfileInput = {
  fullName: 'Ada Lovelace', email: 'ada@example.com', headline: 'Programmer', summary: 'Engineer of analytical engines.',
  experiences: [
    { employerName: 'Babbage & Co', jobTitle: 'Programmer', startDate: '2020-01', isCurrent: true, bullets: [{ content: 'Wrote algorithms.' }, { content: 'Mentored two juniors.' }] },
    { employerName: 'Old Corp', jobTitle: 'Clerk', startDate: '2015-01', endDate: '2019-12', isCurrent: false, bullets: [] },
  ],
  skills: [{ name: 'Maths', category: 'Core' }, { name: 'Logic', category: 'Core' }], educations: [{ institution: 'Home', degree: 'Mathematics' }], projects: [], certifications: [], languages: [],
};
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const model = (p: ProfileInput, tpl = TEMPLATE_CATALOG[0], sections?: any, ov: any = {}) => buildRenderModel(p, tpl, sections, ov);

describe('diffModels', () => {
  const a = model(base);
  it('identical models have no changes', () => { expect(diffModels(a, clone(a))).toMatchObject({ identical: true }); });
  it('reports section, item, bullet, skill, date, header and design changes separately', () => {
    const p = clone(base);
    p.headline = 'Lead Programmer';
    p.experiences[0].bullets = [{ content: 'Wrote algorithms.' }, { content: 'Led the engine team.' }];
    p.experiences[0].isCurrent = false; p.experiences[0].endDate = '2023-05';
    p.experiences.pop(); p.skills = [{ name: 'Maths', category: 'Core' }, { name: 'Poetry', category: 'Core' }];
    const b = model(p, TEMPLATE_CATALOG[1], undefined, { accent: '#112233' });
    const d = diffModels(a, b);
    expect(d.identical).toBe(false);
    expect(d.header).toEqual([{ field: 'headline', before: 'Programmer', after: 'Lead Programmer' }]);
    expect(d.items.find((i) => i.label.includes('Clerk'))!.change).toBe('removed');
    const prog = d.items.find((i) => i.label.includes('Programmer'))!;
    expect(prog.change).toBe('changed'); expect(prog.bulletsAdded).toEqual(['Led the engine team.']); expect(prog.bulletsRemoved).toEqual(['Mentored two juniors.']);
    expect(prog.datesChanged!.after).toContain('May 2023');
    expect(d.skills).toEqual({ added: ['Poetry'], removed: ['Logic'] });
    expect(d.design.map((x) => x.field)).toEqual(expect.arrayContaining(['template', 'accent']));
    expect(d.counts).toMatchObject({ skills: 2, dates: 1, header: 1 });
  });
  it('detects added, removed and moved sections', () => {
    const noEdu = model(base, TEMPLATE_CATALOG[0], [{ type: 'summary', visible: true }, { type: 'experience', visible: true }, { type: 'skills', visible: true }]);
    const d = diffModels(a, noEdu);
    expect(d.sections.find((s) => s.type === 'education')!.change).toBe('removed');
    const back = diffModels(noEdu, a);
    expect(back.sections.find((s) => s.type === 'education')!.change).toBe('added');
    const reordered = model(base, TEMPLATE_CATALOG[0], [{ type: 'skills', visible: true }, { type: 'summary', visible: true }, { type: 'experience', visible: true }, { type: 'education', visible: true }]);
    expect(diffModels(a, reordered).sections.some((s) => s.change === 'moved')).toBe(true);
  });
  it('hash ignores key order and detects any content change', () => {
    expect(contentHash({ a: 1, b: { c: 2, d: 3 } })).toBe(contentHash({ b: { d: 3, c: 2 }, a: 1 }));
    expect(contentHash(a)).not.toBe(contentHash({ ...a, header: { ...a.header, name: 'Ada L.' } }));
  });
  it('layoutFrom marks absent sections hidden', () => {
    const l = layoutFrom(model(base, TEMPLATE_CATALOG[0], [{ type: 'summary', visible: true }, { type: 'skills', visible: true }]), ['summary', 'experience', 'skills', 'education']);
    expect(l.sections.filter((s) => !s.visible).map((s) => s.type)).toEqual(expect.arrayContaining(['experience', 'education']));
    expect(l.templateId).toBe(TEMPLATE_CATALOG[0].id);
  });
});

/* ---------------- HTTP with stateful fakes ---------------- */
const RID = '11111111-1111-4111-8111-111111111111';
function world() {
  const state: any = {
    profile: clone(base), profileUpdatedAt: new Date('2026-01-01T00:00:00Z'),
    resume: { id: RID, profileId: 'p1', tenantId: 't1', name: 'Engineer CV', targetRole: 'Backend', templateId: TEMPLATE_CATALOG[0].id, templateVersion: TEMPLATE_CATALOG[0].version, sections: null, overrides: {}, status: 'DRAFT', updatedAt: new Date('2026-01-02T00:00:00Z') },
    extraResumes: [] as any[], versions: [] as any[], metas: [] as any[], variants: [] as any[],
  };
  const tx: any = {
    resumeVersion: {
      findFirst: async ({ where }: any) => state.versions.filter((v: any) => v.resumeId === where.resumeId).sort((a: any, b: any) => b.versionNumber - a.versionNumber)[0] ?? null,
      create: async ({ data }: any) => { const r = { id: crypto.randomUUID(), createdAt: new Date(), ...data }; state.versions.push(r); return r; },
      findMany: async ({ where }: any) => state.versions.filter((v: any) => v.resumeId === where.resumeId).sort((a: any, b: any) => b.versionNumber - a.versionNumber),
      findUnique: async ({ where }: any) => state.versions.find((v: any) => v.resumeId === where.resumeId_versionNumber.resumeId && v.versionNumber === where.resumeId_versionNumber.versionNumber) ?? null,
    },
    resumeVersionMeta: {
      create: async ({ data }: any) => { const r = { id: crypto.randomUUID(), createdAt: new Date(), ...data }; state.metas.push(r); return r; },
      findMany: async ({ where }: any) => state.metas.filter((m: any) => m.resumeId === where.resumeId),
      findUnique: async ({ where }: any) => state.metas.find((m: any) => m.versionId === where.versionId) ?? null,
    },
    resumeVariant: {
      findFirst: async ({ where }: any) => state.variants.find((v: any) => v.tenantId === where.tenantId && v.userId === where.userId && (!where.resumeId || v.resumeId === where.resumeId) && (!where.kind || v.kind === where.kind) && (!where.NOT || v.resumeId !== where.NOT.resumeId)) ?? null,
      upsert: async ({ where, create, update }: any) => { const e = state.variants.find((v: any) => v.resumeId === where.resumeId); if (e) return Object.assign(e, update); const r = { id: crypto.randomUUID(), createdAt: new Date(), ...create }; state.variants.push(r); return r; },
      findMany: async ({ where }: any) => state.variants.filter((v: any) => v.tenantId === where.tenantId && v.userId === where.userId),
      create: async ({ data }: any) => { const r = { id: crypto.randomUUID(), createdAt: new Date(), ...data }; state.variants.push(r); return r; },
    },
    resume: {
      create: async ({ data }: any) => { const r = { id: crypto.randomUUID(), status: 'DRAFT', updatedAt: new Date(), ...data }; state.extraResumes.push(r); return r; },
      findMany: async ({ where }: any) => [state.resume, ...state.extraResumes].filter((r) => where.id.in.includes(r.id)).map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt })),
    },
    careerProfile: { findUnique: async () => ({ updatedAt: state.profileUpdatedAt }) },
    $transaction: async (fn: any) => fn(tx),
  };
  const resumes = {
    get: async (u: any, id: string) => { const r = id === RID ? state.resume : state.extraResumes.find((x: any) => x.id === id); if (!r || u.tenantId !== 't1' || u.userId !== 'u1') throw new NotFoundException('Resume not found'); return r; },
    renderModel: async (u: any, id: string) => { const r = await resumes.get(u, id); return { model: model(state.profile, TEMPLATE_CATALOG.find((t) => t.id === r.templateId)!, r.sections ?? undefined, r.overrides), name: r.name }; },
    update: async (u: any, id: string, dto: any) => { const r = await resumes.get(u, id); Object.assign(r, Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)), { updatedAt: new Date(r.updatedAt.getTime() + 1000) }); return r; },
  };
  return { state, tx, resumes };
}

let current = { userId: 'u1', tenantId: 't1' };
@Injectable() class FakeAuth implements CanActivate { canActivate(c: ExecutionContext) { c.switchToHttp().getRequest().user = current; return true; } }

describe('resume versions HTTP', () => {
  let app: INestApplication; let url: string; const w = world();
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10_000 }])], controllers: [ResumeVersionsController, ResumeVariantsController],
      providers: [ResumeVersionsService, { provide: PrismaService, useValue: w.tx }, { provide: ResumesService, useValue: w.resumes }, { provide: APP_GUARD, useClass: ThrottlerGuard }, { provide: APP_GUARD, useClass: FakeAuth }],
    }).compile();
    app = mod.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0); url = (await app.getUrl()).replace('[::1]', 'localhost');
  });
  afterAll(async () => { await app.close(); });
  const call = (m: string, p: string, body?: unknown) => fetch(`${url}${p}`, { method: m, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = async (r: Response) => (await r.json()) as any;

  it('snapshots record the exact inputs and are unaffected by later edits (acceptance: submitted resume never changes)', async () => {
    const v1 = await json(await call('POST', `/resumes/${RID}/snapshots`, { changeSummary: 'Sent to Acme', label: 'acme' }));
    expect(v1).toMatchObject({ versionNumber: 1, meta: { templateId: TEMPLATE_CATALOG[0].id, label: 'acme' } });
    expect(v1.meta.profileUpdatedAt).toBe('2026-01-01T00:00:00.000Z');
    const before = await json(await call('GET', `/resumes/${RID}/snapshots/1`));
    expect(before.integrity.valid).toBe(true);
    // later edits to the profile and the layout
    w.state.profile.experiences[0].bullets.push({ content: 'A brand new bullet.' }); w.state.profile.headline = 'Changed!';
    await call('PUT', `/resumes/${RID}/draft`, { expectedUpdatedAt: w.state.resume.updatedAt.toISOString(), overrides: { accent: '#ff0000' } });
    const after = await json(await call('GET', `/resumes/${RID}/snapshots/1`));
    expect(after.snapshot).toEqual(before.snapshot);
    expect(after.snapshot.header.headline).toBe('Programmer');
    expect(after.integrity).toMatchObject({ valid: true, hash: before.integrity.hash });
    const v2 = await json(await call('POST', `/resumes/${RID}/snapshots`, {}));
    expect(v2.versionNumber).toBe(2);
    expect(v2.meta.contentHash).not.toBe(v1.meta.contentHash);
  });

  it('integrity check detects tampering with a stored snapshot', async () => {
    const v = w.state.versions.find((x: any) => x.versionNumber === 1);
    const original = clone(v.structuredSnapshot);
    v.structuredSnapshot.header.name = 'Tampered';
    expect((await json(await call('GET', `/resumes/${RID}/snapshots/1`))).integrity.valid).toBe(false);
    v.structuredSnapshot = original;
    expect((await json(await call('GET', `/resumes/${RID}/snapshots/1`))).integrity.valid).toBe(true);
  });

  it('lists versions with meta; unknown versions 404; versions saved before hashing report unknown integrity', async () => {
    const list = await json(await call('GET', `/resumes/${RID}/snapshots`));
    expect(list.map((x: any) => x.versionNumber)).toEqual([2, 1]);
    expect((await call('GET', `/resumes/${RID}/snapshots/99`)).status).toBe(404);
    w.state.versions.push({ id: 'legacy', resumeId: RID, versionNumber: 50, structuredSnapshot: model(base), changeSummary: 'old', createdAt: new Date() });
    const legacy = await json(await call('GET', `/resumes/${RID}/snapshots/50`));
    expect(legacy.integrity.valid).toBeNull(); expect(legacy.integrity.note).toMatch(/before integrity hashes/);
    w.state.versions.pop();
  });

  it('compares version to version and version to draft', async () => {
    const d = await json(await call('GET', `/resumes/${RID}/snapshots/compare?from=1&to=draft`));
    expect(d.from).toBe('Version 1'); expect(d.to).toBe('Working draft');
    expect(d.header.some((h: any) => h.after === 'Changed!')).toBe(true);
    expect(d.design.some((x: any) => x.field === 'accent')).toBe(true);
    expect(d.items.some((i: any) => i.bulletsAdded.includes('A brand new bullet.'))).toBe(true);
    expect((await json(await call('GET', `/resumes/${RID}/snapshots/compare?from=1&to=1`))).identical).toBe(true);
    expect((await call('GET', `/resumes/${RID}/snapshots/compare?from=abc&to=1`)).status).toBe(400);
  });

  it('restore appends a new version and never mutates history; applyLayout updates only layout', async () => {
    const countBefore = w.state.versions.length;
    const v1Before = clone(w.state.versions.find((x: any) => x.versionNumber === 1).structuredSnapshot);
    const r = await json(await call('POST', `/resumes/${RID}/snapshots/1/restore`, { applyLayout: true }));
    expect(r.versionNumber).toBe(3); expect(r.changeSummary).toBe('Restored from version 1'); expect(r.meta.restoredFrom).toBe(1); expect(r.layoutApplied).toBe(true);
    expect(w.state.versions.length).toBe(countBefore + 1);
    expect(w.state.versions.find((x: any) => x.versionNumber === 1).structuredSnapshot).toEqual(v1Before);
    expect(w.state.versions.find((x: any) => x.versionNumber === 3).structuredSnapshot).toEqual(v1Before);
    expect(w.state.resume.overrides.accent).toBe(v1Before.theme.accent);
    expect(w.state.profile.headline).toBe('Changed!'); // content lives in the profile and is untouched
    expect((await call('POST', `/resumes/${RID}/snapshots/77/restore`, {})).status).toBe(404);
  });

  it('optimistic concurrency: a stale save is rejected with the current resume; a fresh save succeeds', async () => {
    const stale = w.state.resume.updatedAt.toISOString();
    const ok = await call('PUT', `/resumes/${RID}/draft`, { expectedUpdatedAt: stale, name: 'Renamed' });
    expect(ok.status).toBe(200);
    const conflict = await call('PUT', `/resumes/${RID}/draft`, { expectedUpdatedAt: stale, name: 'Overwrite attempt' });
    expect(conflict.status).toBe(409);
    const body = await json(conflict);
    expect(body.message).toMatch(/changed somewhere else/); expect(body.current.name).toBe('Renamed');
    expect(w.state.resume.name).toBe('Renamed');
    expect((await call('PUT', `/resumes/${RID}/draft`, { name: 'x' })).status).toBe(400); // expectedUpdatedAt is mandatory
  });

  it('variants: one master, role/job copies keep layout and point at their parent', async () => {
    expect((await json(await call('GET', `/resumes/${RID}/variant`))).kind).toBeNull();
    expect((await call('PUT', `/resumes/${RID}/variant`, { kind: 'MASTER' })).status).toBe(200);
    const job = await json(await call('POST', `/resumes/${RID}/variants`, { name: 'Acme - Backend', kind: 'JOB', company: 'Acme', jobTitle: 'Backend Engineer' }));
    expect(job.variant).toMatchObject({ kind: 'JOB', parentResumeId: RID, company: 'Acme' });
    expect(job.resume).toMatchObject({ name: 'Acme - Backend', templateId: TEMPLATE_CATALOG[0].id, targetRole: 'Backend Engineer' });
    expect((await call('PUT', `/resumes/${job.resume.id}/variant`, { kind: 'MASTER' })).status).toBe(409);
    expect((await call('POST', `/resumes/${RID}/variants`, { name: 'x', kind: 'MASTER' })).status).toBe(400);
    expect((await call('PUT', `/resumes/${RID}/variant`, { kind: 'WRONG' })).status).toBe(400);
    const list = await json(await call('GET', '/resume-variants'));
    expect(list.map((v: any) => v.kind).sort()).toEqual(['JOB', 'MASTER']);
    expect(list.find((v: any) => v.kind === 'JOB').name).toBe('Acme - Backend');
  });

  it('exports an old version exactly as saved (PDF and DOCX), rejects other formats', async () => {
    const pdf = await call('POST', `/resumes/${RID}/snapshots/1/export/pdf`);
    expect(pdf.headers.get('content-type')).toBe('application/pdf'); expect((await pdf.arrayBuffer()).byteLength).toBeGreaterThan(500);
    const docx = await call('POST', `/resumes/${RID}/snapshots/1/export/docx`);
    expect(docx.headers.get('content-disposition')).toMatch(/Renamed-v1\.docx/);
    expect(Object.keys(unzipSync(new Uint8Array(await docx.arrayBuffer())))).toContain('word/document.xml');
    expect((await call('POST', `/resumes/${RID}/snapshots/1/export/exe`)).status).toBe(400);
  });

  it('is isolated by owner and tenant', async () => {
    current = { userId: 'u2', tenantId: 't1' };
    for (const [m, p] of [['GET', `/resumes/${RID}/snapshots`], ['POST', `/resumes/${RID}/snapshots`], ['GET', `/resumes/${RID}/snapshots/1`], ['GET', `/resumes/${RID}/snapshots/compare?from=1&to=draft`], ['PUT', `/resumes/${RID}/variant`]] as const) {
      expect((await call(m, p, m === 'GET' ? undefined : p.endsWith('/variant') ? { kind: 'ROLE' } : {})).status).toBe(404);
    }
    current = { userId: 'u1', tenantId: 't1' };
  });
});
