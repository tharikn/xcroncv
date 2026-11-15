import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { AuthUser } from './auth/auth.types';

export type DomainEventHandler = (user: AuthUser, type: string, data: Record<string, unknown>) => Promise<void> | void;

/**
 * Tiny in-process event bus so producers (resumes, import/export) never import optional modules.
 * Handlers (e.g. the webhook outbox) are best-effort: a failing handler is logged and never reaches the caller.
 * Payload data must be minimal (ids and counts only).
 */
@Injectable()
export class DomainEvents {
  private readonly log = new Logger('DomainEvents');
  private handlers: DomainEventHandler[] = [];

  subscribe(h: DomainEventHandler) { this.handlers.push(h); }

  emit(user: AuthUser, type: string, data: Record<string, unknown> = {}): void {
    for (const h of this.handlers) {
      Promise.resolve().then(() => h(user, type, data)).catch((e) => this.log.warn(`handler failed for ${type}: ${(e as Error).message}`));
    }
  }
}

@Global()
@Module({ providers: [DomainEvents], exports: [DomainEvents] })
export class DomainEventsModule {}
