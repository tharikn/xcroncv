import { CanActivate, ExecutionContext, INestApplication, Injectable, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { CareerProfileService } from '../src/career-profile/career-profile.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ContentOptimizer } from '../src/quick-build/content-optimizer';
import { QuickBuildController } from '../src/quick-build/quick-build.controller';
import { QuickBuildService } from '../src/quick-build/quick-build.service';
import { ResumesService } from '../src/resumes/resumes.service';
import { TemplatesService } from '../src/templates/templates.service';

const JD = `Senior Frontend Engineer

We are hiring a senior frontend engineer to own our customer-facing platform.

Requirements:
- 5+ years building production React applications
- Strong TypeScript and modern JavaScript
- Experience shipping to AWS with Docker

Preferred:
- Kubernetes
- GraphQL

Responsibilities:
- Build accessible UI components used by millions of customers
- Improve web performance and Core Web Vitals

Certifications such as AWS Certified Developer are a plus.
`;

const stamp = () => ({ createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z') });

const profile: any = {
  id: 'profile-1', userId: 'u1', tenantId: 't1', fullName: 'Ada Lovelace', email: 'ada@example.com',
  phone: null, location: 'London', links: [], headline: 'Senior Frontend Engineer',
  summary: 'Frontend engineer focused on fast, accessible product surfaces and measurable outcomes.',
  ...stamp(),
  experiences: [
    {
      id: 'e1', profileId: 'profile-1', employerName: 'Acme', jobTitle: 'Senior React Engineer', location: 'Remote',
      startDate: '2019-01', endDate: null, isCurrent: true, description: null, displayOrder: 0, ...stamp(),
      bullets: [1, 2, 3, 4].map((n) => ({
        id: `b${n}`, experienceId: 'e1', content: `Built React and TypeScript surfaces on AWS, cutting load time by ${n * 9}% for ${n} million users.`,
        kind: 'RESPONSIBILITY', displayOrder: n, ...stamp(),
      })),
    },
    {
      id: 'e2', profileId: 'profile-1', employerName: 'Old Co', jobTitle: 'Mainframe Operator', location: 'Leeds',
      startDate: '2010-01', endDate: '2015-06', isCurrent: false, description: null, displayOrder: 1, ...stamp(), bullets: [],
    },
  ],
  skills: [
    { id: 's1', profileId: 'profile-1', name: 'React', category: 'Core', level: null, displayOrder: 0, ...stamp() },
    { id: 's2', profileId: 'profile-1', name: 'TypeScript', category: 'Core', level: null, displayOrder: 1, ...stamp() },
    { id: 's3', profileId: 'profile-1', name: 'COBOL', category: 'Tools', level: null, displayOrder: 2, ...stamp() },
  ],
  educations: [{
    id: 'ed1', profileId: 'profile-1', institution: 'University', degree: 'BSc', field: 'Mathematics',
    startDate: '2005-01', endDate: '2009-01', displayOrder: 0, ...stamp(),
  }],
  projects: [],
  certifications: Array.from({ length: 20 }, (_, i) => ({
    id: `c${i}`, profileId: 'profile-1', name: i === 0 ? 'AWS Certified Developer' : `Certification ${i}`,
    issuer: 'Royal Society', issuedDate: '2019-05', expiresDate: null, credentialUrl: null, displayOrder: i, ...stamp(),
  })),
  languages: [],
};

/**
 * Minimal in-memory Prisma stand-in. Only the queries QuickBuildService and ResumesService use are
 * implemented, and every one of them resolves the ownership filter the real query carries.
 */
function fakePrisma() {
  const resumes: any[] = [];
  const owned = (where: any) => resumes.find((r) => r.id === where.id
    && (!where.tenantId || r.tenantId === where.tenantId)
    && (!where.profile || r.profileId === where.profileId || r.profileId === 'profile-1'));

  return {
    resumes,
    careerProfile: {
      findUnique: async () => profile,
      findUniqueOrThrow: async () => profile,
    },
    resume: {
      create: async ({ data }: any) => {
        // Real ids are UUIDs; the report route validates that, so the fake must be too.
        const row = { id: randomUUID(), status: 'DRAFT', ...stamp(), ...data };
        resumes.push(row);
        return { id: row.id, name: row.name, templateId: row.templateId, templateVersion: row.templateVersion, createdAt: row.createdAt };
      },
      findFirst: async ({ where }: any) => owned(where) ?? null,
      update: async ({ where, data }: any) => {
        const row = owned(where)!;
        for (const [key, value] of Object.entries(data)) {
          if (value === undefined) continue;
          // Prisma excludes a column (`DbNull`) instead of storing the sentinel; reads then see null.
          row[key] = value === Prisma.DbNull ? null : value;
        }
        return row;
      },
    },
  };
}

let current = { userId: 'u1', tenantId: 't1' };
@Injectable()
class FakeAuth implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    ctx.switchToHttp().getRequest().user = current;
    return true;
  }
}

describe('quick build HTTP', () => {
  let app: INestApplication;
  let url: string;
  let db: ReturnType<typeof fakePrisma>;
  let resumes: ResumesService;

  beforeAll(async () => {
    db = fakePrisma();
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10_000 }])],
      controllers: [QuickBuildController],
      providers: [
        QuickBuildService,
        ContentOptimizer,
        TemplatesService,
        ResumesService,
        { provide: PrismaService, useValue: db },
        { provide: CareerProfileService, useValue: { get: async () => profile } },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: FakeAuth },
      ],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0);
    url = (await app.getUrl()).replace('[::1]', 'localhost');
    resumes = app.get(ResumesService);
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { current = { userId: 'u1', tenantId: 't1' }; });

  const call = (method: string, path: string, body?: unknown) => fetch(`${url}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = async (r: Response) => (await r.json()) as any;

  it('previews the whole pipeline without writing anything', async () => {
    const before = db.resumes.length;
    const res = await call('POST', '/quick-build/preview', { jdText: JD, jobTitle: 'Senior Frontend Engineer' });
    expect(res.status).toBe(200);
    const body = await json(res);

    expect(body.plan.metrics.pageCount).toBeLessThanOrEqual(2);
    expect(body.plan.metrics.unplaced).toBe(0);
    expect(body.report).toMatchObject({ maxPages: 2, usedAi: false, summarySource: 'rule-based' });
    expect(Array.isArray(body.report.decisions)).toBe(true);
    expect(body.report.template.atsProfile).toBeDefined();
    expect(body.content.sections.find((s: any) => s.key === 'experience').included).toBe(true);
    expect(body.model.sections.length).toBeGreaterThan(0);
    expect(body.jd.requirements.length).toBeGreaterThan(0);
    expect(db.resumes.length).toBe(before);
  });

  it('creates the resume with its frozen snapshot, plan and report', async () => {
    const res = await call('POST', '/quick-build', { jdText: JD, jobTitle: 'Senior Frontend Engineer', name: '  Acme frontend  ' });
    expect(res.status).toBe(201);
    const body = await json(res);

    const row = db.resumes.find((r) => r.id === body.resume.id)!;
    expect(row.tenantId).toBe('t1');
    expect(row.profileId).toBe('profile-1');
    expect(row.name).toBe('Acme frontend');
    expect(row.targetRole).toBe('Senior Frontend Engineer');
    expect(row.layoutPlan).toBeTruthy();
    expect(row.renderSnapshot.sections.length).toBeGreaterThan(0);
    expect(row.buildReport.pageCount).toBe(row.layoutPlan.metrics.pageCount);
    // Everything the plan paints was persisted as a visible section, in template order.
    const painted = new Set(row.layoutPlan.sections.map((s: any) => s.key));
    for (const section of row.sections) expect(painted.has(section.type)).toBe(true);
    expect(body.plan.metrics.pageCount).toBeLessThanOrEqual(2);
  });

  it('derives a name when none is given', async () => {
    const body = await json(await call('POST', '/quick-build', { jdText: JD, jobTitle: 'Staff Platform Engineer' }));
    expect(body.resume.name).toBe('Staff Platform Engineer resume');
  });

  it('serves the decision log to the owner only', async () => {
    const created = await json(await call('POST', '/quick-build', { jdText: JD, jobTitle: 'Senior Frontend Engineer' }));
    const ok = await call('GET', `/quick-build/resumes/${created.resume.id}/report`);
    expect(ok.status).toBe(200);
    const body = await json(ok);
    expect(body.report.pageCount).toBe(created.plan.metrics.pageCount);
    expect(Array.isArray(body.plan.decisions)).toBe(true);

    current = { userId: 'u2', tenantId: 't2' }; // another tenant must not see it
    expect((await call('GET', `/quick-build/resumes/${created.resume.id}/report`)).status).toBe(404);
  });

  it('rejects an unusable job description and an out-of-range page budget', async () => {
    expect((await call('POST', '/quick-build/preview', { jdText: 'too short' })).status).toBe(400);
    expect((await call('POST', '/quick-build/preview', { jdText: JD, maxPages: 5 })).status).toBe(400);
    expect((await call('POST', '/quick-build/preview', { jdText: JD, unknownField: true })).status).toBe(400);
  });

  it('renders a Quick Build resume from its snapshot and plan, and leaves that mode on a manual edit', async () => {
    const created = await json(await call('POST', '/quick-build', { jdText: JD, jobTitle: 'Senior Frontend Engineer' }));

    const built = await resumes.renderModel({ userId: 'u1', tenantId: 't1' } as any, created.resume.id);
    expect(built.model.layoutPlan).toBeTruthy();
    expect(built.model.layoutPlan!.metrics.pageCount).toBe(created.plan.metrics.pageCount);
    // The frozen snapshot is authoritative, not the live profile.
    expect(JSON.stringify(built.model.sections)).toBe(JSON.stringify(db.resumes.find((r) => r.id === created.resume.id)!.renderSnapshot.sections));

    await resumes.update({ userId: 'u1', tenantId: 't1' } as any, created.resume.id, { name: 'Edited by hand' });
    const row = db.resumes.find((r) => r.id === created.resume.id)!;
    expect(row.layoutPlan).toBeTruthy(); // renaming is not a content edit

    await resumes.update({ userId: 'u1', tenantId: 't1' } as any, created.resume.id, { sections: [{ type: 'summary', visible: true }] } as any);
    expect(row.layoutPlan).toBe(null);
    expect(row.renderSnapshot).toBe(null);
    const after = await resumes.renderModel({ userId: 'u1', tenantId: 't1' } as any, created.resume.id);
    expect(after.model.layoutPlan).toBeUndefined();
  });
});
