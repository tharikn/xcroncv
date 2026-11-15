import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';

export interface WebhookEndpoint { id: string; url: string; description?: string | null; events: string[]; active: boolean; secretHint: string; secretVersion: number; createdAt: string }
export interface WebhookEndpointWithSecret extends WebhookEndpoint { secret: string; secretNote: string }
export interface WebhookDelivery { id: string; endpointId: string; eventId: string; eventType: string; status: 'PENDING' | 'SUCCESS' | 'FAILED'; attempts: number; responseCode?: number | null; error?: string | null; nextAttemptAt?: string | null; createdAt: string; deliveredAt?: string | null }
export interface EventTypes { apiVersion: string; events: Array<{ id: string; description: string }> }

/** Typed client for doc 37 (webhooks). */
@Injectable({ providedIn: 'root' })
export class WebhooksApi {
  constructor(private http: HttpClient, private settings: SettingsService) {}
  private url(p: string) { return `${this.settings.apiBase}${p}`; }
  eventTypes() { return this.http.get<EventTypes>(this.url('/webhooks/event-types')); }
  list() { return this.http.get<WebhookEndpoint[]>(this.url('/webhooks')); }
  create(b: { url: string; events: string[]; description?: string }) { return this.http.post<WebhookEndpointWithSecret>(this.url('/webhooks'), b); }
  update(id: string, b: { active?: boolean; url?: string; events?: string[]; description?: string }) { return this.http.patch<WebhookEndpoint>(this.url(`/webhooks/${id}`), b); }
  rotate(id: string) { return this.http.post<WebhookEndpointWithSecret>(this.url(`/webhooks/${id}/rotate-secret`), {}); }
  remove(id: string) { return this.http.delete<void>(this.url(`/webhooks/${id}`)); }
  test(id: string) { return this.http.post<WebhookDelivery>(this.url(`/webhooks/${id}/test`), {}); }
  deliveries() { return this.http.get<WebhookDelivery[]>(this.url('/webhooks/deliveries')); }
  retry(id: string) { return this.http.post<WebhookDelivery>(this.url(`/webhook-deliveries/${id}/retry`), {}); }
}
