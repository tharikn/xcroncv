import { signatureHeader } from '../src/webhooks/webhook-logic';
// Loaded with require so the API build (rootDir apps/api) does not pull the SDK sources into its program.
/* eslint-disable @typescript-eslint/no-var-requires */
const { verifyWebhook } = require('../../../packages/sdk/src/webhooks');
const { XCronCvClient, XCronCvError } = require('../../../packages/sdk/src/client');

describe('@xcroncv/sdk', () => {
  it('verifies signatures produced by the API and rejects tampering and replays', () => {
    const body = JSON.stringify({ id: 'e1', type: 'test.ping', apiVersion: '1', createdAt: 'x', data: {} });
    const now = 1_800_000_000;
    const h = signatureHeader('whsec_x', now, body);
    expect(verifyWebhook('whsec_x', h, body, { nowSec: now })?.id).toBe('e1');
    expect(verifyWebhook('whsec_x', h, body + ' ', { nowSec: now })).toBeNull();
    expect(verifyWebhook('whsec_y', h, body, { nowSec: now })).toBeNull();
    expect(verifyWebhook('whsec_x', h, body, { nowSec: now + 1000 })).toBeNull();
  });

  it('sends the bearer token and surfaces API errors as XCronCvError', async () => {
    const calls: any[] = [];
    const fake: any = async (url: string, init: any) => {
      calls.push({ url, init });
      return url.endsWith('/ai/status')
        ? { ok: true, status: 200, text: async () => JSON.stringify({ enabled: false }) }
        : { ok: false, status: 403, statusText: 'Forbidden', text: async () => JSON.stringify({ message: 'AI assistance is off' }) };
    };
    const c = new XCronCvClient({ baseUrl: 'https://cv.example.com/api/v1/', token: async () => 'tok', fetch: fake });
    expect((await c.ai.status()).enabled).toBe(false);
    expect(calls[0].url).toBe('https://cv.example.com/api/v1/ai/status');
    expect(calls[0].init.headers.authorization).toBe('Bearer tok');
    await expect(c.ai.suggest({ task: 'REWRITE_BULLET', text: 'x' })).rejects.toMatchObject({ status: 403, message: 'AI assistance is off' });
    await expect(c.ai.suggest({ task: 'REWRITE_BULLET', text: 'x' })).rejects.toBeInstanceOf(XCronCvError);
  });
});
