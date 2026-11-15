import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthUser } from '../common/auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto';
import {
  API_VERSION, decryptSecret, encryptSecret, EVENT_TYPES, HttpsSender, MAX_ATTEMPTS, MAX_ENDPOINTS, newSecret, nextAttemptDelay, signatureHeader,
  targetUrlProblem, WEBHOOK_SENDER, WebhookSender,
} from './webhook-logic';

type Endpoint = Awaited<ReturnType<PrismaService['webhookEndpoint']['findFirstOrThrow']>>;
type Delivery = Awaited<ReturnType<PrismaService['webhookDelivery']['findFirstOrThrow']>>;

/** The secret is never returned except once, at creation or rotation. */
export function endpointView(e: Endpoint) {
  return {
    id: e.id, url: e.url, description: e.description, events: e.events as string[], active: e.active, secretHint: `••••${e.secretHint}`,
    secretVersion: e.secretVersion, createdAt: e.createdAt, updatedAt: e.updatedAt,
  };
}
export function deliveryView(d: Delivery) {
  return {
    id: d.id, endpointId: d.endpointId, eventId: d.eventId, eventType: d.eventType, status: d.status, attempts: d.attempts, responseCode: d.responseCode,
    error: d.error, nextAttemptAt: d.nextAttemptAt, createdAt: d.createdAt, deliveredAt: d.deliveredAt,
  };
}

@Injectable()
export class WebhooksService {
  private sender: WebhookSender;
  constructor(private prisma: PrismaService, @Optional() @Inject(WEBHOOK_SENDER) sender?: WebhookSender) { this.sender = sender ?? new HttpsSender(); }

  private who(u: AuthUser) { return { tenantId: u.tenantId, userId: u.userId }; }

  private async owned(u: AuthUser, id: string) {
    const e = await this.prisma.webhookEndpoint.findFirst({ where: { id, ...this.who(u) } });
    if (!e) throw new NotFoundException('Webhook endpoint not found');
    return e;
  }

  eventTypes() { return { apiVersion: API_VERSION, events: EVENT_TYPES.map((id) => ({ id, description: DESCRIPTIONS[id] })) }; }

  async create(u: AuthUser, dto: CreateWebhookDto) {
    const problem = targetUrlProblem(dto.url);
    if (problem) throw new BadRequestException(problem);
    if ((await this.prisma.webhookEndpoint.count({ where: this.who(u) })) >= MAX_ENDPOINTS) throw new ConflictException(`You can register up to ${MAX_ENDPOINTS} endpoints`);
    const secret = newSecret();
    const e = await this.prisma.webhookEndpoint.create({
      data: { ...this.who(u), url: dto.url, description: dto.description ?? null, events: dto.events, secretEnc: encryptSecret(secret), secretHint: secret.slice(-4) },
    });
    return { ...endpointView(e), secret, secretNote: 'Copy this signing secret now. It is not shown again.' };
  }

  async list(u: AuthUser) {
    const rows = await this.prisma.webhookEndpoint.findMany({ where: this.who(u), orderBy: { createdAt: 'desc' }, take: MAX_ENDPOINTS });
    return rows.map(endpointView);
  }

  async update(u: AuthUser, id: string, dto: UpdateWebhookDto) {
    await this.owned(u, id);
    if (dto.url !== undefined) { const p = targetUrlProblem(dto.url); if (p) throw new BadRequestException(p); }
    const data: Record<string, unknown> = {};
    for (const k of ['url', 'description', 'events', 'active'] as const) if (dto[k] !== undefined) data[k] = dto[k];
    return endpointView(await this.prisma.webhookEndpoint.update({ where: { id }, data }));
  }

  async rotate(u: AuthUser, id: string) {
    const e = await this.owned(u, id);
    const secret = newSecret();
    const row = await this.prisma.webhookEndpoint.update({ where: { id }, data: { secretEnc: encryptSecret(secret), secretHint: secret.slice(-4), secretVersion: e.secretVersion + 1 } });
    return { ...endpointView(row), secret, secretNote: 'The previous secret no longer works. Update your receiver now.' };
  }

  async remove(u: AuthUser, id: string) {
    await this.owned(u, id);
    await this.prisma.webhookEndpoint.delete({ where: { id } }); // deliveries cascade
  }

  async deliveries(u: AuthUser, endpointId?: string) {
    if (endpointId) await this.owned(u, endpointId);
    const rows = await this.prisma.webhookDelivery.findMany({
      where: { ...this.who(u), ...(endpointId ? { endpointId } : {}) }, orderBy: { createdAt: 'desc' }, take: 50,
    });
    return rows.map(deliveryView);
  }

  /** Builds the minimal envelope and attempts delivery to one endpoint. Failures are recorded, never thrown to the caller. */
  private async deliver(e: Endpoint, type: string, data: Record<string, unknown>, now = new Date()) {
    const eventId = randomUUID();
    const payload = { id: eventId, type, apiVersion: API_VERSION, createdAt: now.toISOString(), data };
    const row = await this.prisma.webhookDelivery.create({
      data: { endpointId: e.id, tenantId: e.tenantId, userId: e.userId, eventId, eventType: type, payload: payload as never, status: 'PENDING' },
    });
    return this.attempt(e, row, now);
  }

  private async attempt(e: Endpoint, d: Delivery, now = new Date()) {
    const body = JSON.stringify(d.payload);
    const ts = Math.floor(now.getTime() / 1000);
    let status = 'FAILED'; let code: number | null = null; let error: string | null = null;
    try {
      const res = await this.sender.send({
        url: e.url, body, timeoutMs: 5000,
        headers: {
          'content-type': 'application/json', 'user-agent': 'XCronCV-Webhooks/1', 'x-xcroncv-event-id': d.eventId, 'x-xcroncv-event-type': d.eventType,
          'x-xcroncv-signature': signatureHeader(decryptSecret(e.secretEnc), ts, body),
        },
      });
      code = res.status;
      if (res.status >= 200 && res.status < 300) status = 'SUCCESS'; else error = `Receiver answered HTTP ${res.status}`;
    } catch (err) { error = (err as Error).message.slice(0, 200); }
    const attempts = d.attempts + 1;
    const retryable = status === 'FAILED' && attempts < MAX_ATTEMPTS && !(code && code >= 400 && code < 500 && code !== 408 && code !== 429);
    const row = await this.prisma.webhookDelivery.update({
      where: { id: d.id },
      data: { status, attempts, responseCode: code, error, deliveredAt: status === 'SUCCESS' ? now : null, nextAttemptAt: retryable ? new Date(now.getTime() + nextAttemptDelay(attempts)) : null },
    });
    return deliveryView(row);
  }

  async test(u: AuthUser, id: string) {
    const e = await this.owned(u, id);
    return this.deliver(e, 'test.ping', { message: 'This is a test delivery from XCron CV.' });
  }

  async retry(u: AuthUser, deliveryId: string) {
    const d = await this.prisma.webhookDelivery.findFirst({ where: { id: deliveryId, ...this.who(u) } });
    if (!d) throw new NotFoundException('Delivery not found');
    if (d.status !== 'FAILED') throw new BadRequestException('Only failed deliveries can be retried');
    if (d.attempts >= MAX_ATTEMPTS) throw new BadRequestException('This delivery reached its attempt limit');
    const e = await this.owned(u, d.endpointId);
    if (!e.active) throw new BadRequestException('The endpoint is paused');
    return this.attempt(e, d);
  }

  /**
   * Outbox write: one PENDING row per active, subscribed endpoint, due immediately. No outbound call happens here;
   * the worker delivers. Used by producers so request latency and failures stay independent of receivers.
   */
  async enqueue(u: AuthUser, type: string, data: Record<string, unknown> = {}, now = new Date()) {
    if (!(EVENT_TYPES as readonly string[]).includes(type)) return 0;
    const eps = await this.prisma.webhookEndpoint.findMany({ where: { ...this.who(u), active: true }, take: MAX_ENDPOINTS });
    const targets = eps.filter((e) => (e.events as string[]).includes(type));
    for (const e of targets) {
      const eventId = randomUUID();
      const payload = { id: eventId, type, apiVersion: API_VERSION, createdAt: now.toISOString(), data };
      await this.prisma.webhookDelivery.create({
        data: { endpointId: e.id, tenantId: e.tenantId, userId: e.userId, eventId, eventType: type, payload: payload as never, status: 'PENDING', nextAttemptAt: now },
      });
    }
    return targets.length;
  }

  /** Worker entry point: attempts due PENDING rows and due FAILED retries (bounded batch, oldest first). Paused endpoints are skipped. */
  async processDue(now = new Date(), batch = 25) {
    const due = await this.prisma.webhookDelivery.findMany({
      where: { status: { in: ['PENDING', 'FAILED'] }, attempts: { lt: MAX_ATTEMPTS }, nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: 'asc' }, take: batch,
    });
    let done = 0;
    for (const d of due) {
      const e = await this.prisma.webhookEndpoint.findFirst({ where: { id: d.endpointId, tenantId: d.tenantId, userId: d.userId } });
      if (!e || !e.active) {
        await this.prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: 'FAILED', error: 'Endpoint paused or removed', nextAttemptAt: null } });
        continue;
      }
      await this.attempt(e, d, now);
      done++;
    }
    return done;
  }

  /** Producer hook for other modules: fan out a minimal event to this user's active, subscribed endpoints. */
  async emit(u: AuthUser, type: string, data: Record<string, unknown> = {}) {
    const eps = await this.prisma.webhookEndpoint.findMany({ where: { ...this.who(u), active: true }, take: MAX_ENDPOINTS });
    const targets = eps.filter((e) => (e.events as string[]).includes(type));
    return Promise.all(targets.map((e) => this.deliver(e, type, data)));
  }
}

const DESCRIPTIONS: Record<(typeof EVENT_TYPES)[number], string> = {
  'test.ping': 'Sent when you press Send test. Safe to ignore.',
  'resume.created': 'A resume was created. Contains the resume id only.',
  'resume.updated': 'A resume changed. Contains the resume id only.',
  'resume.exported': 'A resume export was requested. Contains the resume id and format only.',
  'import.completed': 'An import review was completed. Contains counts only.',
};
