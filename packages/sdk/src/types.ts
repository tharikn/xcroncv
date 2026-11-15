/**
 * Generated-style types for the XCron CV API (/api/v1). The source of truth is the OpenAPI document at `GET /api/docs-json`;
 * until the generator is wired into CI these shapes are maintained next to the controllers they mirror.
 */
export type AiTask = 'REWRITE_BULLET' | 'SUMMARY_DRAFT' | 'KEYWORD_GAPS';
export interface AiStatus { enabled: boolean; provider: { id: string; model: string; available: boolean; external: boolean }; quota: { limit: number; used: number; windowHours: number }; tasks: AiTask[] }
export interface AiSuggestion { id: string; feature: AiTask; status: 'PENDING' | 'ACCEPTED' | 'REJECTED'; output: { text: string; notes: string[]; questions: string[] }; requiresApproval: boolean }

export type WebhookEventType = 'test.ping' | 'resume.created' | 'resume.updated' | 'resume.exported' | 'import.completed';
export interface WebhookEndpoint { id: string; url: string; description?: string | null; events: WebhookEventType[]; active: boolean; secretHint: string; secretVersion: number }
export interface WebhookEndpointWithSecret extends WebhookEndpoint { secret: string; secretNote: string }
export interface WebhookDelivery { id: string; endpointId: string; eventId: string; eventType: string; status: 'PENDING' | 'SUCCESS' | 'FAILED'; attempts: number; responseCode?: number | null; error?: string | null; nextAttemptAt?: string | null; createdAt: string; deliveredAt?: string | null }
/** The envelope every delivery carries. `data` holds ids and counts only. */
export interface WebhookEvent<T = Record<string, unknown>> { id: string; type: WebhookEventType; apiVersion: '1'; createdAt: string; data: T }
