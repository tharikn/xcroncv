import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthGuard } from '../src/common/auth/auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { PortfolioController, PublicPortfolioController } from '../src/portfolio/portfolio.controller';
import { PortfolioService, newToken } from '../src/portfolio/portfolio.service';

/** HTTP-level proof that the public portfolio view is the only anonymous route and that it is hardened. */
describe('portfolio HTTP security', () => {
  let app: INestApplication; let base: string;
  const good = newToken();
  const svc = {
    publicView: jest.fn(async (t: string) => {
      if (t !== good) throw new NotFoundException('Portfolio not found');
      return { noIndex: true, view: { schemaVersion: 1, theme: 'light', snapshot: { schemaVersion: 1, header: { fullName: 'Ada' }, sections: {} } } };
    }),
    list: jest.fn(), create: jest.fn(), publish: jest.fn(), get: jest.fn(),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
      controllers: [PortfolioController, PublicPortfolioController],
      providers: [
        { provide: PortfolioService, useValue: svc },
        { provide: ConfigService, useValue: { getOrThrow: (k: string) => k, get: (k: string) => (k === 'AUTH_DEV_SECRET' ? 'test-secret-at-least-32-characters-long!!' : undefined) } },
        { provide: PrismaService, useValue: {} },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0);
    base = `${(await app.getUrl()).replace('[::1]', 'localhost')}/api/v1`;
  });
  afterAll(async () => { await app.close(); });

  it('every authenticated route rejects a missing or bogus token', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const calls: Array<[string, string]> = [['GET', '/portfolios'], ['POST', '/portfolios'], ['GET', `/portfolios/${id}`], ['POST', `/portfolios/${id}/publish`], ['POST', `/portfolios/${id}/revoke`], ['PATCH', `/portfolios/${id}/share-policy`], ['DELETE', `/portfolios/${id}`]];
    for (const [method, path] of calls) {
      expect((await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' || method === 'DELETE' ? undefined : '{}' })).status).toBe(401);
      expect((await fetch(base + path, { method, headers: { authorization: 'Bearer nope', 'content-type': 'application/json' }, body: method === 'GET' || method === 'DELETE' ? undefined : '{}' })).status).toBe(401);
    }
    expect(svc.list).not.toHaveBeenCalled();
    expect(svc.publish).not.toHaveBeenCalled();
  });

  it('the public view works without a token and is never cached or indexed', async () => {
    const r = await fetch(`${base}/public/portfolios/${good}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-robots-tag')).toContain('noindex');
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    const body: any = await r.json();
    expect(body.snapshot.header.fullName).toBe('Ada');
    expect(JSON.stringify(body)).not.toMatch(/tokenHash|userId|tenantId/);
  });

  it('unknown tokens get a plain 404', async () => {
    expect((await fetch(`${base}/public/portfolios/${newToken()}`)).status).toBe(404);
    expect((await fetch(`${base}/public/portfolios/short`)).status).toBe(404);
  });

  it('the public controller exposes exactly one route and it is read-only', async () => {
    expect((await fetch(`${base}/public/portfolios/${good}`, { method: 'DELETE' })).status).toBe(404);
    expect((await fetch(`${base}/public/portfolios`)).status).toBe(404);
  });
});
