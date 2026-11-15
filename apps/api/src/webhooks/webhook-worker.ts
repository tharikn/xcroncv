import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DomainEvents } from '../common/domain-events';
import { WebhooksService } from './webhooks.service';

/**
 * Background worker: drains the delivery outbox (rows queued by producers) and fires scheduled retries.
 * Single in-process timer, overlap-guarded, bounded batch. Disable with WEBHOOK_WORKER=off (tests, or when
 * a separate worker process runs the same service). Never throws and never touches request paths.
 */
@Injectable()
export class WebhookWorker implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('WebhookWorker');
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(private svc: WebhooksService, private events: DomainEvents) {}

  onModuleInit() {
    // Producers publish to the in-process bus; the outbox rows are the durable hand-off.
    this.events.subscribe((u, type, data) => this.svc.enqueue(u, type, data).then(() => undefined));
    if ((process.env.WEBHOOK_WORKER ?? 'on').toLowerCase() === 'off' || process.env.NODE_ENV === 'test') return;
    const every = Math.max(5_000, Number(process.env.WEBHOOK_WORKER_INTERVAL_MS) || 15_000);
    this.timer = setInterval(() => void this.tick(), every);
    this.timer.unref();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick(now = new Date()): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    try { return await this.svc.processDue(now); } catch (e) { this.log.warn(`tick failed: ${(e as Error).message}`); return 0; } finally { this.busy = false; }
  }
}
