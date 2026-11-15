import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthExchangeService } from '../src/auth-exchange/auth-exchange.service';

const cfg = (v: Record<string, string>) => ({ get: (k: string) => v[k] }) as unknown as ConfigService;
const ENV = { HOST_HANDOFF_URL: 'https://host.example/', HOST_HANDOFF_SECRET: 's3cret' };
const args = ['c'.repeat(30), 'https://cv.example/auth/callback', 'n'.repeat(24)] as const;

describe('AuthExchangeService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('rejects when the host is not configured', async () => {
    await expect(new AuthExchangeService(cfg({})).exchange(...args)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('posts the code with the shared secret and maps the token', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'a.b.c', expires_in: 900 }), { status: 200 }),
    );
    const r = await new AuthExchangeService(cfg(ENV)).exchange(...args);
    expect(r).toEqual({ accessToken: 'a.b.c', expiresIn: 900 });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://host.example/v1/handoff/exchange');
    expect((init.headers as Record<string, string>)['x-handoff-secret']).toBe('s3cret');
  });

  it('maps host errors, network failures and malformed bodies to 401', async () => {
    const svc = new AuthExchangeService(cfg(ENV));
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(svc.exchange(...args)).rejects.toBeInstanceOf(UnauthorizedException);
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('down'));
    await expect(svc.exchange(...args)).rejects.toBeInstanceOf(UnauthorizedException);
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{"access_token":1}', { status: 200 }));
    await expect(svc.exchange(...args)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
