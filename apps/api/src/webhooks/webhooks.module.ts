import { Module } from '@nestjs/common';
import { WebhookDeliveriesController, WebhooksController } from './webhooks.controller';
import { WebhookWorker } from './webhook-worker';
import { WebhooksService } from './webhooks.service';

/** Exports WebhooksService so producers (resumes, import) can `emit` minimal events later. */
@Module({ controllers: [WebhooksController, WebhookDeliveriesController], providers: [WebhooksService, WebhookWorker], exports: [WebhooksService] })
export class WebhooksModule {}
