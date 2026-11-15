import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdatePreferencesDto } from '../src/preferences/dto/preferences.dto';
import { DEFAULT_PREFERENCES, PreferencesService } from '../src/preferences/preferences.service';

const u = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };

function fakePrisma() {
  const rows = new Map<string, any>();
  const k = (w: any) => `${w.tenantId_userId.tenantId}|${w.tenantId_userId.userId}`;
  return {
    rows,
    userPreference: {
      findUnique: async ({ where }: any) => rows.get(k(where)) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const cur = rows.get(k(where));
        const next = cur ? { ...cur, ...update } : { theme: null, locale: null, ...create };
        rows.set(k(where), next);
        return next;
      },
    },
  } as any;
}

describe('PreferencesService', () => {
  it('returns null (never chosen) when nothing is saved', async () => {
    expect(await new PreferencesService(fakePrisma()).get(u)).toEqual(DEFAULT_PREFERENCES);
  });
  it('saves partial updates and keeps the other field', async () => {
    const svc = new PreferencesService(fakePrisma());
    await svc.update(u, { theme: 'dark' });
    expect(await svc.update(u, { locale: 'ta' })).toEqual({ theme: 'dark', locale: 'ta' });
  });
  it('is isolated per tenant and user', async () => {
    const svc = new PreferencesService(fakePrisma());
    await svc.update(u, { theme: 'dark' });
    expect(await svc.get({ ...u, tenantId: 't2' })).toEqual(DEFAULT_PREFERENCES);
    expect(await svc.get({ ...u, userId: 'u2' })).toEqual(DEFAULT_PREFERENCES);
  });
  it('ignores unknown fields (never writes ids from the body)', async () => {
    const prisma = fakePrisma();
    const svc = new PreferencesService(prisma);
    await svc.update(u, { theme: 'light', userId: 'evil', tenantId: 'evil' } as any);
    expect([...prisma.rows.keys()]).toEqual(['t1|u1']);
  });
});

describe('UpdatePreferencesDto', () => {
  const check = (o: object) => validate(plainToInstance(UpdatePreferencesDto, o));
  it('accepts supported values', async () => { expect(await check({ theme: 'dark', locale: 'hi' })).toHaveLength(0); });
  it('rejects unsupported theme/locale', async () => {
    expect((await check({ theme: 'neon' })).length).toBe(1);
    expect((await check({ locale: 'xx' })).length).toBe(1);
  });
});
