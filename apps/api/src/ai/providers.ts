import { AiRequest, AiStructuredOutput, ProviderInfo, TextGenerationProvider } from './ai.types';

const FILLER = /^(responsible for|worked on|helped with|helped to|duties included|tasked with|in charge of)\s+/i;
const STOP = new Set(('the and for with you your our are will have has that this from not but all any can able work team role job ' +
  'experience years skills ability strong must should including etc who what about into over such using use per than more most ' +
  'looking join well also their they them its was were been being very new help helping make making build building').split(' '));

/** Deterministic, offline adapter. It only rearranges and flags what the user supplied; it cannot invent facts or numbers. */
export class DeterministicProvider implements TextGenerationProvider {
  readonly info: ProviderInfo = { id: 'deterministic', model: 'rules-v1', promptVersion: '1', available: true, costPer1kTokensMicros: 0 };

  async generateStructured(req: AiRequest): Promise<AiStructuredOutput> {
    switch (req.task) {
      case 'REWRITE_BULLET': return this.bullet(req.text);
      case 'SUMMARY_DRAFT': return this.summary(req);
      case 'KEYWORD_GAPS': return this.gaps(req);
      case 'POLISH_TEXT': return this.polish(req.text);
      case 'COACH_ANSWER': return this.coach(req);
    }
  }

  private bullet(raw: string): AiStructuredOutput {
    const notes: string[] = []; const questions: string[] = [];
    let t = raw.replace(/\s+/g, ' ').trim();
    if (FILLER.test(t)) { t = t.replace(FILLER, ''); notes.push('Removed a filler opening. Start with the action you took; choose the verb that is true for you.'); }
    t = t.replace(/\b(very|really|various|etc\.?)\b\s*/gi, '').replace(/\s+([,.;])/g, '$1').trim();
    t = t.charAt(0).toUpperCase() + t.slice(1);
    if (t && !/[.!?]$/.test(t)) t += '.';
    if (!/\d/.test(t)) questions.push('What was the measurable result (a number, percentage or time saved)? Add it only if you know the real value.');
    if (t.split(' ').length > 30) notes.push('This is long; one idea per bullet reads better.');
    return { text: t, notes, questions };
  }

  private summary(req: AiRequest): AiStructuredOutput {
    const { title, years, skills = [] } = req.context;
    const questions: string[] = []; const notes: string[] = [];
    if (!title) return { text: '', notes, questions: ['Add a confirmed job title first so the summary has something true to say.'] };
    const top = skills.slice(0, 5);
    let t = years !== undefined ? `${title} with ${years} years of experience` : title;
    if (top.length) t += `${years !== undefined ? ' in' : ' skilled in'} ${top.length > 1 ? `${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}` : top[0]}`;
    t += '.';
    if (years === undefined) questions.push('Add your years of experience if you want it in the summary.');
    notes.push('Built only from the confirmed title, years and skills you provided.');
    return { text: t, notes, questions };
  }

  /** Cover letters, career documents (modules 42, 52): mechanical tidying only. Never adds a fact, number or claim. */
  private polish(raw: string): AiStructuredOutput {
    const notes: string[] = []; const questions: string[] = [];
    let t = raw.replace(/[ \t]+/g, ' ').replace(/ +([,.;:!?])/g, '$1').replace(/\b(\w+)(\s+\1\b)+/gi, '$1');
    if (t !== raw) notes.push('Fixed spacing and repeated words.');
    t = t.split(/\n/).map((l) => l.trim().replace(/^[a-z]/, (c) => c.toUpperCase())).join('\n');
    const filler = /\b(very|really|extremely|basically|actually)\s+/gi;
    if (filler.test(t)) { t = t.replace(filler, ''); notes.push('Removed intensifiers that add no information.'); }
    const longest = Math.max(0, ...t.split(/(?<=[.!?])\s+/).map((x) => x.split(/\s+/).length));
    if (longest > 35) notes.push('At least one sentence is over 35 words; consider splitting it.');
    if (/\[add[^\]]*\]/i.test(t)) questions.push('Fill in the bracketed placeholders with real details before using this.');
    if (notes.length === 0) notes.push('No mechanical edits were needed. The wording is yours; this tool does not add content.');
    return { text: t, notes, questions };
  }

  /** Interview copilot / preparation (modules 35, 51): structure feedback on the user's own answer. No score and no invented content. */
  private coach(req: AiRequest): AiStructuredOutput {
    const a = req.text; const words = a.trim().split(/\s+/).filter(Boolean).length;
    const notes: string[] = []; const questions: string[] = [];
    if (words < 40) notes.push('Short answers rarely show context and outcome; aim for roughly 90 seconds spoken (about 150 to 200 words).');
    else if (words > 260) notes.push('This is long; lead with the point and keep one example.');
    if (!/\b(i|we)\b/i.test(a)) questions.push('Which part did you personally do?');
    if (!/\d/.test(a)) questions.push('Is there a real number, scale or time saved you can add? Only add one that is true.');
    if (!/\b(result|outcome|because|so that|led to|improved|reduced|increased|delivered)\b/i.test(a)) questions.push('What changed as a result?');
    if (req.context.title) notes.push(`Checked against the question: "${req.context.title.slice(0, 120)}". Make sure your first sentence answers it directly.`);
    return { text: '', notes: notes.length ? notes : ['The answer has context, action and outcome cues. Practise saying it aloud.'], questions };
  }

  private gaps(req: AiRequest): AiStructuredOutput {
    const have = new Set((req.context.skills ?? []).map((s) => s.toLowerCase()));
    const counts = new Map<string, number>();
    for (const w of req.text.toLowerCase().match(/[a-z][a-z0-9+#.]{2,}/g) ?? []) {
      const k = w.replace(/\.$/, '');
      if (STOP.has(k) || have.has(k)) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const missing = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([k]) => k);
    return {
      text: missing.length ? `Terms in this posting that your skills list does not mention: ${missing.join(', ')}.` : 'No obvious keyword gaps found.',
      notes: ['Only add a term to your profile if it is true for you. This list is advisory and does not change any score.'],
      questions: missing.length ? ['Which of these do you genuinely have experience with?'] : [],
    };
  }
}

/** Used when AI_PROVIDER=none: reports itself unavailable so every AI path degrades to the manual workflow. */
export class NoopProvider implements TextGenerationProvider {
  readonly info: ProviderInfo = { id: 'none', model: 'none', promptVersion: '0', available: false, costPer1kTokensMicros: 0 };
  async generateStructured(): Promise<never> { throw new Error('No AI provider is configured'); }
}

/** Provider selection is configuration. A vendor adapter would be added here behind the same interface. */
export function providerFromEnv(id = process.env.AI_PROVIDER): TextGenerationProvider {
  if ((id ?? 'deterministic').toLowerCase() === 'none') return new NoopProvider();
  return new DeterministicProvider();
}
