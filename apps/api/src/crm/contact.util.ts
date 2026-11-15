export interface Channel { type: 'email' | 'phone' | 'linkedin' | 'other'; value: string }

const clean = (s?: string | null) => (s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();

/** Normalised name + organisation, used as the per-user deduplication key. */
export const contactKey = (name: string, organization?: string | null) => `${clean(name)}|${clean(organization)}`;

export const channelKey = (c: Channel) => `${c.type}:${c.type === 'phone' ? c.value.replace(/[^\d+]/g, '') : c.value.trim().toLowerCase()}`;

/** Returns the first existing contact that shares the name key or any channel with the candidate. */
export function findDuplicate<T extends { id: string; nameKey: string; channels: unknown }>(
  existing: T[], key: string, channels: Channel[], ignoreId?: string,
): T | undefined {
  const wanted = new Set(channels.map(channelKey));
  return existing.find((c) => {
    if (c.id === ignoreId) return false;
    if (c.nameKey === key) return true;
    return ((c.channels as Channel[]) ?? []).some((ch) => wanted.has(channelKey(ch)));
  });
}
