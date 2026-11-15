export const TERMINAL_STAGES = ['OFFER', 'REJECTED', 'WITHDRAWN'];
export const STALE_AFTER_DAYS = 14;
export const UPCOMING_DAYS = 7;

export type ReminderKind = 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | 'SUGGESTED';
export interface ReminderEntry { id: string; employerLabel: string; jobTitle: string | null; appliedOn: string; stage: string; followUpOn: string | null; followUpDone: boolean }
export interface Reminder { entryId: string; employerLabel: string; jobTitle: string | null; stage: string; kind: ReminderKind; dueOn: string | null; daysFromToday: number; label: string }

const day = (s: string) => Math.round(Date.parse(`${s}T00:00:00Z`) / 86_400_000);
export const addDays = (s: string, n: number) => new Date((day(s) + n) * 86_400_000).toISOString().slice(0, 10);

const ORDER: Record<ReminderKind, number> = { OVERDUE: 0, DUE_TODAY: 1, UPCOMING: 2, SUGGESTED: 3 };

/**
 * In-app reminders only (no push, email or calendar). Candidate-recorded follow-ups are reminders as written;
 * SUGGESTED ones are clearly labelled prompts for applications that never got a follow-up date. Closed stages are excluded.
 * The employer portal remains the source of truth for real status.
 */
export function buildReminders(entries: ReminderEntry[], today: string): Reminder[] {
  const out: Reminder[] = [];
  for (const e of entries) {
    if (TERMINAL_STAGES.includes(e.stage)) continue;
    const base = { entryId: e.id, employerLabel: e.employerLabel, jobTitle: e.jobTitle, stage: e.stage };
    if (e.followUpOn && !e.followUpDone) {
      const d = day(e.followUpOn) - day(today);
      if (d < 0) out.push({ ...base, kind: 'OVERDUE', dueOn: e.followUpOn, daysFromToday: d, label: `Follow-up was due ${-d} day${d === -1 ? '' : 's'} ago` });
      else if (d === 0) out.push({ ...base, kind: 'DUE_TODAY', dueOn: e.followUpOn, daysFromToday: 0, label: 'Follow-up is due today' });
      else if (d <= UPCOMING_DAYS) out.push({ ...base, kind: 'UPCOMING', dueOn: e.followUpOn, daysFromToday: d, label: `Follow-up due in ${d} day${d === 1 ? '' : 's'}` });
    } else if (!e.followUpOn && e.stage === 'APPLIED') {
      const age = day(today) - day(e.appliedOn);
      if (age >= STALE_AFTER_DAYS) out.push({ ...base, kind: 'SUGGESTED', dueOn: null, daysFromToday: -age, label: `Applied ${age} days ago with no follow-up date. Suggestion only: consider a polite check-in.` });
    }
  }
  return out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.daysFromToday - b.daysFromToday);
}
