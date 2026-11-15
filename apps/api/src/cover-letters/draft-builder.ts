import { getTemplate } from './cover-letter.templates';
import { LetterLength, LetterSection, LetterTone, ProfileFacts } from './cover-letter.types';

export interface DraftInput {
  kind: string; tone: LetterTone; length: LetterLength;
  company?: string; jobTitle?: string;
  /** Pasted JD is used transiently for keyword matching and is never persisted. */
  jdText?: string; referrerName?: string;
}

const STOP = new Set('the a an and or of to in for with on at by from is are be as we you our your will this that it their they us not have has can able etc'.split(' '));
const words = (s: string) => s.toLowerCase().match(/[a-z][a-z0-9+#.]{1,}/g) ?? [];
export const jdKeywords = (jd = ''): Set<string> => new Set(words(jd).filter((w) => !STOP.has(w)));

const GREETING: Record<LetterTone, string> = { professional: 'Dear Hiring Manager,', warm: 'Hello,', direct: 'Hi,' };
const score = (b: string, kw: Set<string>) => words(b).filter((w) => kw.has(w)).length + (/\d/.test(b) ? 0.5 : 0);
const list = (a: string[]) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

/**
 * Deterministic, AI-free draft built only from confirmed profile facts (the manual path must always work).
 * An AI adapter may later replace the text; its output must still pass claim validation.
 */
export function buildDraft(facts: ProfileFacts, input: DraftInput): LetterSection[] {
  const tpl = getTemplate(input.kind) ?? getTemplate('standard')!;
  const kw = jdKeywords(input.jdText);
  const role = input.jobTitle?.trim() || 'the role';
  const at = input.company?.trim() ? ` at ${input.company.trim()}` : '';
  const matched = facts.skills.filter((s) => kw.has(s.toLowerCase())).slice(0, 5);
  const skills = matched.length ? matched : facts.skills.slice(0, 4);
  const perAch = input.length === 'short' ? 1 : tpl.maxAchievements + (input.length === 'long' ? 1 : 0);
  const bullets = [...facts.bullets].sort((a, b) => score(b, kw) - score(a, kw)).slice(0, Math.max(1, perAch));
  const latest = facts.titles[0] && facts.employers[0] ? `${facts.titles[0]} at ${facts.employers[0]}` : facts.headline ?? '';
  const out: LetterSection[] = [];
  const add = (id: string, heading: string, text: string) => out.push({ id, heading, text, origin: 'GENERATED' });

  for (const part of tpl.sections) {
    if (part === 'opening') {
      const ref = input.kind === 'referral' && input.referrerName?.trim() ? ` ${input.referrerName.trim()} suggested I get in touch.` : '';
      add('opening', 'Opening', `${GREETING[input.tone]}\n\nI am writing to apply for ${role}${at}.${ref}${latest ? ` My most recent role is ${latest}.` : ''}`);
    } else if (part === 'fit' && skills.length) {
      add('fit', 'Why I fit', `My background includes ${list(skills)}, which match what this role calls for.`);
    } else if (part === 'achievements' && bullets.length) {
      add('achievements', 'Selected achievements', bullets.map((b) => `- ${b.replace(/\.$/, '')}.`).join('\n'));
    } else if (part === 'motivation') {
      add('motivation', 'Why this change', 'Add, in your own words, why you are moving into this field. This section is yours to write.');
    } else if (part === 'closing') {
      add('closing', 'Closing', `Thank you for your time. I would welcome the chance to discuss how I can contribute${at}.\n\nSincerely,\n${facts.fullName}`);
    }
  }
  return out;
}
