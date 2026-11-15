import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  decryptSecret, encryptSecret, isPrivateAddress, nextAttemptDelay, safeLookup, sign, signatureHeader, targetUrlProblem, verifySignature, WebhookSender,
} from '../src/webhooks/webhook-logic';
import { endpointView, WebhooksService } from '../src/webhooks/webhooks.service';

describe('SSRF-safe targets', () => {
  const bad = [
    'http://example.com/hook', 'https://localhost/hook', 'https://127.0.0.1/hook', 'https://[::1]/hook', 'https://10.0.0.5/x', 'https://192.168.1.1/x',
    'https://172.16.0.1/x', 'https://169.254.169.254/latest/meta-data', 'https://2130706433/x', 'https://0x7f.0.0.1/x', 'https://[::ffff:127.0.0.1]/x',
    'https://[fd00::1]/x', 'https://user:pw@example.com/x', 'https://example.com:8080/x', 'https://intranet/x', 'https://printer.local/x',
    'https://service.internal/x', 'ftp://example.com', 'not a url', 'https://100.64.0.1/x', 'https://0.0.0.0/x',
  ];
  for (const url of bad) it(`rejects ${url}`, () => expect(targetUrlProblem(url)).not.toBeNull());
  it('accepts public https targets on 443 and 8443', () => {
    expect(targetUrlProblem('https://hooks.example.com/xcron')).toBeNull();
    expect(targetUrlProblem('https://hooks.example.com:8443/xcron?x=1')).toBeNull();
    expect(targetUrlProblem('https://93.184.216.34/x')).toBeNull();
  });
  it('classifies private ranges', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
    expect(isPrivateAddress('172.31.255.255')).toBe(true);
    expect(isPrivateAddress('2606:4700::1111')).toBe(false);
  });
  it('the delivery-time lookup refuses names that resolve to loopback (rebinding guard)', (done) => {
    safeLookup('localhost', {}, (err) => { expect(err).toBeTruthy(); done(); });
  });
});

describe('signing and replay protection', () => {
  const secret = 'whsec_test'; const body = '{"id":"e1"}';
  it('verifies a fresh signature and rejects tampering, wrong secret and replays', () => {
    const now = 1_800_000_000;
    const h = signatureHeader(secret, now, body);
    expect(verifySignature(secret, h, body, now)).toBe(true);
    expect(verifySignature(secret, h, body + ' ', now)).toBe(false);
    expect(verifySignature('other', h, body, now)).toBe(false);
    expect(verifySignature(secret, h, body, now + 301)).toBe(false); // replay outside the window
    expect(verifySignature(secret, h, body, now - 301)).toBe(false);
    expect(verifySignature(secret, 'garbage', body, now)).toBe(false);
    expect(verifySignature(secret, `t=${now},v1=zz`, body, now)).toBe(false);
  });
  it('the signature binds the timestamp', () => {
    expect(sign(secret, 1, body)).not.toBe(sign(secret, 2, body));
  });
  it('secrets are encrypted at rest and fail on tampering', () => {
    const enc = encryptSecret('whsec_abc');
    expect(enc).not.toContain('whsec');
    expect(decryptSecret(enc)).toBe('whsec_abc');
    const buf = Buffer.from(enc, 'base64'); buf[buf.length - 1] ^= 1;
    expect(() => decryptSecret(buf.toString('base64'))).toThrow();
  });
  it('backs off and caps the schedule', () => {
    expect(nextAttemptDelay(1)).toBe(60_000);
    expect(nextAttemptDelay(99)).toBe(7_200_000);
  });
});

describe('WebhooksService', () => {
  const user = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
  const NOW = new Date('2026-06-01T00:00:00Z');
  const ep = (over: any = {}) => ({
    id: 'e1', tenantId: 't1', userId: 'u1', url: 'https://hooks.example.com/x', description: null, events: ['test.ping', 'resume.created'],
    secretEnc: encryptSecret('whsec_real'), secretHint: 'real', active: true, secretVersion: 1, createdAt: NOW, updatedAt: NOW, ...over,
  });
  const mk = (sender: WebhookSender, over: any = {}) => {
    const prisma: any = {
      webhookEndpoint: {
        findFirst: jest.fn().mockResolvedValue(over.ep === undefined ? ep() : over.ep), findMany: jest.fn().mockResolvedValue(over.eps ?? [ep()]),
        count: jest.fn().mockResolvedValue(over.count ?? 0), create: jest.fn().mockImplementation(async (a: any) => ep(a.data)),
        update: jest.fn().mockImplementation(async (a: any) => ep(a.data)), delete: jest.fn(),
      },
      webhookDelivery: {
        create: jest.fn().mockImplementation(async (a: any) => ({ id: 'd1', attempts: 0, responseCode: null, error: null, nextAttemptAt: null, createdAt: NOW, deliveredAt: null, ...a.data })),
        update: jest.fn().mockImplementation(async (a: any) => ({ id: 'd1', endpointId: 'e1', eventId: 'x', eventType: 'test.ping', createdAt: NOW, ...a.data })),
        findFirst: jest.fn().mockResolvedValue(over.delivery ?? null), findMany: jest.fn().mockResolvedValue([]),
      },
    };
    return { svc: new WebhooksService(prisma, sender), prisma };
  };
  const okSender = (calls: any[] = []): WebhookSender => ({ send: async (r) => { calls.push(r); return { status: 200 }; } });

  it('creates an endpoint, shows the secret once and never stores or returns it in clear', async () => {
    const { svc, prisma } = mk(okSender());
    const r: any = await svc.create(user, { url: 'https://hooks.example.com/x', events: ['test.ping'] });
    expect(r.secret).toMatch(/^whsec_/);
    const data = prisma.webhookEndpoint.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: 't1', userId: 'u1' });
    expect(data.secretEnc).not.toContain(r.secret);
    expect(decryptSecret(data.secretEnc)).toBe(r.secret);
    expect(JSON.stringify(endpointView(ep() as any))).not.toMatch(/secretEnc|whsec_real/);
  });
  it('rejects unsafe URLs and the sixth endpoint', async () => {
    await expect(mk(okSender()).svc.create(user, { url: 'https://127.0.0.1/x', events: ['test.ping'] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(mk(okSender(), { count: 5 }).svc.create(user, { url: 'https://hooks.example.com/x', events: ['test.ping'] })).rejects.toBeInstanceOf(ConflictException);
    await expect(mk(okSender()).svc.update(user, 'e1', { url: 'http://insecure.example.com' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('filters by tenant and owner; foreign endpoints look missing', async () => {
    const { svc, prisma } = mk(okSender(), { ep: null });
    await expect(svc.test(user, 'e1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.webhookEndpoint.findFirst).toHaveBeenCalledWith({ where: { id: 'e1', tenantId: 't1', userId: 'u1' } });
    await expect(svc.deliveries(user, 'e1')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('sends a signed, minimal, idempotent delivery the receiver can verify', async () => {
    const calls: any[] = [];
    const { svc, prisma } = mk(okSender(calls));
    const d: any = await svc.test(user, 'e1');
    expect(d.status).toBe('SUCCESS');
    const sent = calls[0];
    const payload = JSON.parse(sent.body);
    expect(payload).toMatchObject({ type: 'test.ping', apiVersion: '1' });
    expect(Object.keys(payload).sort()).toEqual(['apiVersion', 'createdAt', 'data', 'id', 'type']);
    expect(sent.headers['x-xcroncv-event-id']).toBe(payload.id);
    expect(verifySignature('whsec_real', sent.headers['x-xcroncv-signature'], sent.body)).toBe(true);
    expect(prisma.webhookDelivery.update.mock.calls[0][0].data).toMatchObject({ status: 'SUCCESS', attempts: 1, responseCode: 200 });
  });
  it('records failures with a retry time, but not for permanent 4xx answers', async () => {
    const a = mk({ send: async () => ({ status: 503 }) });
    const d: any = await a.svc.test(user, 'e1');
    expect(d.status).toBe('FAILED');
    expect(a.prisma.webhookDelivery.update.mock.calls[0][0].data.nextAttemptAt).toBeInstanceOf(Date);
    const b = mk({ send: async () => ({ status: 404 }) });
    await b.svc.test(user, 'e1');
    expect(b.prisma.webhookDelivery.update.mock.calls[0][0].data.nextAttemptAt).toBeNull();
    const c = mk({ send: async () => { throw new Error('Target resolves to a private address'); } });
    const cd: any = await c.svc.test(user, 'e1');
    expect(cd.status).toBe('FAILED');
    expect(cd.error).toContain('private address');
  });
  it('retries only failed deliveries below the attempt limit', async () => {
    const failed = { id: 'd1', endpointId: 'e1', tenantId: 't1', userId: 'u1', eventId: 'x', eventType: 'test.ping', payload: { id: 'x' }, status: 'FAILED', attempts: 1 };
    const calls: any[] = [];
    const a = mk(okSender(calls), { delivery: failed });
    expect(((await a.svc.retry(user, 'd1')) as any).status).toBe('SUCCESS');
    expect(JSON.parse(calls[0].body).id).toBe('x'); // same event id: consumers can de-duplicate
    await expect(mk(okSender(), { delivery: { ...failed, status: 'SUCCESS' } }).svc.retry(user, 'd1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(mk(okSender(), { delivery: { ...failed, attempts: 5 } }).svc.retry(user, 'd1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(mk(okSender(), { delivery: null }).svc.retry(user, 'd1')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('emit fans out only to active endpoints subscribed to the event', async () => {
    const calls: any[] = [];
    const { svc } = mk(okSender(calls), { eps: [ep(), ep({ id: 'e2', events: ['resume.exported'] })] });
    await svc.emit(user, 'resume.created', { resumeId: 'r1' });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].body).data).toEqual({ resumeId: 'r1' });
  });
  it('rotation invalidates the previous secret', async () => {
    const { svc, prisma } = mk(okSender());
    const r: any = await svc.rotate(user, 'e1');
    expect(r.secretVersion).toBe(2);
    expect(decryptSecret(prisma.webhookEndpoint.update.mock.calls[0][0].data.secretEnc)).toBe(r.secret);
    expect(r.secret).not.toBe('whsec_real');
  });
});

describe('outbox, worker and producers', () => {
  const user = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
  const NOW = new Date('2026-06-01T00:00:00Z');
  const ep = (over: any = {}) => ({
    id: 'e1', tenantId: 't1', userId: 'u1', url: 'https://hooks.example.com/x', description: null, events: ['resume.created'],
    secretEnc: encryptSecret('whsec_real'), secretHint: 'real', active: true, secretVersion: 1, createdAt: NOW, updatedAt: NOW, ...over,
  });
  const mk = (sender: WebhookSender, due: any[] = [], endpoint: any = ep()) => {
    const prisma: any = {
      webhookEndpoint: { findMany: jest.fn().mockResolvedValue([endpoint ?? ep()]), findFirst: jest.fn().mockResolvedValue(endpoint) },
      webhookDelivery: {
        create: jest.fn().mockImplementation(async (a: any) => ({ id: 'd1', ...a.data })),
        update: jest.fn().mockImplementation(async (a: any) => ({ id: 'd1', endpointId: 'e1', eventId: 'x', eventType: 'resume.created', createdAt: NOW, ...a.data })),
        findMany: jest.fn().mockResolvedValue(due),
      },
    };
    return { svc: new WebhooksService(prisma, sender), prisma };
  };
  it('enqueue writes PENDING outbox rows only for subscribed endpoints and sends nothing', async () => {
    const send = jest.fn();
    const { svc, prisma } = mk({ send });
    expect(await svc.enqueue(user, 'resume.created', { resumeId: 'r1' }, NOW)).toBe(1);
    expect(await svc.enqueue(user, 'resume.updated', {}, NOW)).toBe(0); // not subscribed
    expect(await svc.enqueue(user, 'not.an.event', {}, NOW)).toBe(0);   // unknown type
    expect(send).not.toHaveBeenCalled();
    const row = prisma.webhookDelivery.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ status: 'PENDING', tenantId: 't1', userId: 'u1', nextAttemptAt: NOW });
    expect(row.payload.data).toEqual({ resumeId: 'r1' });
  });
  it('processDue delivers due rows and records retry schedule on failure', async () => {
    const due = [{ id: 'd1', endpointId: 'e1', tenantId: 't1', userId: 'u1', eventId: 'x', eventType: 'resume.created', payload: { id: 'x' }, status: 'PENDING', attempts: 0 }];
    const ok = mk({ send: async () => ({ status: 200 }) }, due);
    expect(await ok.svc.processDue(NOW)).toBe(1);
    expect(ok.prisma.webhookDelivery.update.mock.calls[0][0].data).toMatchObject({ status: 'SUCCESS', attempts: 1 });
    expect(ok.prisma.webhookDelivery.findMany.mock.calls[0][0].where.attempts).toEqual({ lt: 5 });
    const bad = mk({ send: async () => ({ status: 500 }) }, due);
    await bad.svc.processDue(NOW);
    expect(bad.prisma.webhookDelivery.update.mock.calls[0][0].data.nextAttemptAt).toEqual(new Date(NOW.getTime() + 60_000));
  });
  it('processDue never sends to paused or removed endpoints', async () => {
    const due = [{ id: 'd1', endpointId: 'e1', tenantId: 't1', userId: 'u1', eventId: 'x', eventType: 'resume.created', payload: {}, status: 'PENDING', attempts: 0 }];
    const send = jest.fn();
    const paused = mk({ send }, due, ep({ active: false }));
    expect(await paused.svc.processDue(NOW)).toBe(0);
    const gone = mk({ send }, due, null);
    expect(await gone.svc.processDue(NOW)).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(paused.prisma.webhookDelivery.update.mock.calls[0][0].data).toMatchObject({ status: 'FAILED', nextAttemptAt: null });
  });
  it('domain events reach handlers asynchronously and handler errors never reach the producer', async () => {
    const { DomainEvents } = await import('../src/common/domain-events');
    const bus = new DomainEvents(); const seen: string[] = [];
    bus.subscribe(() => { throw new Error('boom'); });
    bus.subscribe((_u, t) => { seen.push(t); });
    expect(() => bus.emit(user, 'resume.created', { resumeId: 'r1' })).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    expect(seen).toEqual(['resume.created']);
  });
  it('the worker wires the bus to the outbox and tick is overlap-safe', async () => {
    const { DomainEvents } = await import('../src/common/domain-events');
    const { WebhookWorker } = await import('../src/webhooks/webhook-worker');
    const bus = new DomainEvents();
    const svc: any = { enqueue: jest.fn().mockResolvedValue(1), processDue: jest.fn().mockResolvedValue(2) };
    const w = new WebhookWorker(svc, bus); w.onModuleInit();
    bus.emit(user, 'resume.created', { resumeId: 'r1' });
    await new Promise((r) => setTimeout(r, 10));
    expect(svc.enqueue).toHaveBeenCalledWith(user, 'resume.created', { resumeId: 'r1' });
    expect(await w.tick()).toBe(2);
    w.onModuleDestroy();
  });
});
