import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private svc: WebhooksService) {}

  @Get('event-types') eventTypes() { return this.svc.eventTypes(); }
  @Get('deliveries') allDeliveries(@CurrentUser() u: AuthUser) { return this.svc.deliveries(u); }

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateWebhookDto) { return this.svc.create(u, dto); }
  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.list(u); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWebhookDto) { return this.svc.update(u, id, dto); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
  @Post(':id/rotate-secret') @HttpCode(200) rotate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.rotate(u, id); }
  @Post(':id/test') @HttpCode(200) test(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.test(u, id); }
  @Get(':id/deliveries') deliveries(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.deliveries(u, id); }
}

@Controller('webhook-deliveries')
export class WebhookDeliveriesController {
  constructor(private svc: WebhooksService) {}
  @Post(':id/retry') @HttpCode(200) retry(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.retry(u, id); }
}
