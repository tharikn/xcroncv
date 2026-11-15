import { EventDto } from './dto/analytics.dto';

export interface VaultRow { id: string; appliedOn: string; stage: string; resumeVersionId: string; updatedAt: Date }

/** Stage -> additional events the stage implies (the applied event always exists). */
const STAGE_EVENTS: Record<string, string[]> = {
  APPLIED: [], SCREENING: ['RESPONSE'], INTERVIEWING: ['RESPONSE', 'INTERVIEW'], OFFER: ['RESPONSE', 'INTERVIEW', 'OFFER'],
  REJECTED: ['REJECTED'], WITHDRAWN: ['WITHDRAWN'],
};

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Derives job-search events from the candidate's own application vault (module 33). Pure.
 * - APPLIED is dated at the recorded application date.
 * - Later stages are dated at the entry's last update (the vault does not keep stage history), never earlier than the application date.
 * - Idempotency keys are `vault:<entry>:<TYPE>`, so re-running never duplicates and a later stage change only adds its new event.
 * - Events are marked MANUAL: the data is candidate-recorded, not verified by an employer or portal.
 */
export function eventsFromVault(rows: VaultRow[], now = new Date()): EventDto[] {
  const out: EventDto[] = [];
  for (const r of rows) {
    const ref = `vault:${r.id}`;
    const applied = `${r.appliedOn}T00:00:00.000Z`;
    const base = { applicationRef: ref, source: 'MANUAL' as const, resumeVersionId: r.resumeVersionId.slice(0, 120) };
    out.push({ ...base, type: 'APPLIED', occurredAt: applied, idempotencyKey: `${ref}:APPLIED` });
    const later = r.updatedAt > now ? now : r.updatedAt;
    const stageDate = day(later) < r.appliedOn ? applied : later.toISOString();
    for (const t of STAGE_EVENTS[r.stage] ?? []) out.push({ ...base, type: t, occurredAt: stageDate, idempotencyKey: `${ref}:${t}` });
  }
  return out;
}

/** Provider boundary for employer-portal ingestion (module 32/48). No portal is connected; the default adapter reports that honestly. */
export interface HostEventConnector {
  readonly id: string;
  available(): boolean;
  /** Returns normalised events for ONE user. Must never be called without a verified user token and user consent. */
  fetchEvents(user: { tenantId: string; userId: string }): Promise<EventDto[]>;
}
export const HOST_EVENT_CONNECTOR = Symbol('HOST_EVENT_CONNECTOR');
export const notConfiguredConnector: HostEventConnector = { id: 'none', available: () => false, fetchEvents: async () => [] };
