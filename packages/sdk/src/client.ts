import type {
  AiStatus, AiSuggestion, AiTask, WebhookDelivery, WebhookEndpoint, WebhookEndpointWithSecret, WebhookEventType,
} from './types';

export class XCronCvError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'XCronCvError'; }
}

export interface ClientOptions {
  /** e.g. https://cv.example.com/api/v1 */
  baseUrl: string;
  /** A user token (Bearer). Service credentials alone never grant access to personal resumes. */
  token: string | (() => string | Promise<string>);
  fetch?: typeof fetch;
}

/** Thin typed client. Every call is made as the signed-in user; tenant and owner come from the token on the server. */
export class XCronCvClient {
  constructor(private o: ClientOptions) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = typeof this.o.token === 'function' ? await this.o.token() : this.o.token;
    const res = await (this.o.fetch ?? fetch)(`${this.o.baseUrl.replace(/\/$/, '')}${path}`, {
      method, headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let data: unknown = text;
    try { data = text ? JSON.parse(text) : undefined; } catch { /* keep text */ }
    if (!res.ok) {
      const m = (data as { message?: string | string[] } | undefined)?.message;
      throw new XCronCvError(res.status, Array.isArray(m) ? m.join('; ') : m ?? res.statusText);
    }
    return data as T;
  }

  readonly ai = {
    status: () => this.request<AiStatus>('GET', '/ai/status'),
    setEnabled: (enabled: boolean) => this.request<AiStatus>('PUT', '/ai/settings', { enabled }),
    suggest: (b: { task: AiTask; text: string; context?: { title?: string; years?: number; skills?: string[] } }) => this.request<AiSuggestion>('POST', '/ai/suggestions', b),
    decide: (id: string, b: { decision: 'ACCEPT' | 'REJECT'; confirm?: boolean }) => this.request<AiSuggestion>('POST', `/ai/suggestions/${id}/decision`, b),
  };

  readonly webhooks = {
    eventTypes: () => this.request<{ apiVersion: string; events: Array<{ id: WebhookEventType; description: string }> }>('GET', '/webhooks/event-types'),
    list: () => this.request<WebhookEndpoint[]>('GET', '/webhooks'),
    create: (b: { url: string; events: WebhookEventType[]; description?: string }) => this.request<WebhookEndpointWithSecret>('POST', '/webhooks', b),
    update: (id: string, b: { url?: string; events?: WebhookEventType[]; description?: string; active?: boolean }) => this.request<WebhookEndpoint>('PATCH', `/webhooks/${id}`, b),
    rotateSecret: (id: string) => this.request<WebhookEndpointWithSecret>('POST', `/webhooks/${id}/rotate-secret`),
    remove: (id: string) => this.request<void>('DELETE', `/webhooks/${id}`),
    test: (id: string) => this.request<WebhookDelivery>('POST', `/webhooks/${id}/test`),
    deliveries: (id?: string) => this.request<WebhookDelivery[]>('GET', id ? `/webhooks/${id}/deliveries` : '/webhooks/deliveries'),
    retry: (deliveryId: string) => this.request<WebhookDelivery>('POST', `/webhook-deliveries/${deliveryId}/retry`),
  };
}
