import { RenderModel } from '../render-model/render-model.types';

/**
 * Resume-grounded interview preparation (doc 35). Deterministic: every resume-specific question quotes the exact resume
 * text it comes from (with a stable evidence reference); general-knowledge and gap questions are labelled as such and
 * never imply the candidate did the work. Answer feedback is a rubric over the TEXT only (relevance, structure, clarity,
 * specificity, evidence alignment) with no numeric score and no judgement of voice, accent, appearance or personality.
 */
export const GENERATOR = 'deterministic-1';

export type Category = 'RESUME_WALKTHROUGH' | 'BEHAVIOURAL' | 'TECHNICAL' | 'JOB_SPECIFIC' | 'GAP_PREPARATION';
export type Grounding = 'RESUME' | 'GENERAL';
export interface QuestionEvidence { ref: string; excerpt: string }
export interface Question {
  id: string; category: Category; grounding: Grounding; text: string; hint: string;
  evidence?: QuestionEvidence; notOnResume?: boolean;
  answer?: string | null; feedback?: AnswerFeedback | null; practiced: boolean;
}
export interface BuildOptions { roleTitle?: string; company?: string; focusSkills?: string[]; max?: number }

const STAR = 'Use STAR: the Situation, your Task, the Actions you took, and the Result. Only describe what you actually did.';
const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const hasTerm = (text: string, term: string) => new RegExp(`(^|[^a-z0-9+#])${esc(term.trim().toLowerCase())}(?![a-z0-9+#])`, 'i').test(text);

export function resumeCorpus(model: RenderModel): string {
  const parts: string[] = [model.header?.headline ?? ''];
  for (const s of model.sections ?? []) {
    if (s.text) parts.push(s.text);
    for (const it of s.items ?? []) parts.push(it.title ?? '', it.subtitle ?? '', it.text ?? '', ...(it.bullets ?? []), ...(it.tags ?? []));
  }
  return parts.join('\n').toLowerCase();
}

const score = (b: string) => (/\d/.test(b) ? 2 : 0) + Math.min(2, Math.floor(b.length / 60));

export function buildQuestions(model: RenderModel, opts: BuildOptions = {}): Question[] {
  const qs: Question[] = [];
  let n = 0;
  const add = (q: Omit<Question, 'id' | 'practiced'>) => qs.push({ ...q, id: `q-${++n}`, practiced: false });
  const corpus = resumeCorpus(model);
  const sections = model.sections ?? [];
  const exp = sections.find((s) => s.type === 'experience')?.items ?? [];

  add({ category: 'RESUME_WALKTHROUGH', grounding: 'GENERAL', text: 'Walk me through your resume in about two minutes.', hint: 'Lead with the through-line of your career, then the two or three roles most relevant to this job.' });
  exp.slice(0, 3).forEach((e, i) => {
    const label = [e.title, e.subtitle].filter(Boolean).join(' at ');
    add({
      category: 'RESUME_WALKTHROUGH', grounding: 'RESUME', text: `Tell me about your time as ${label}. What was the scope of your role and what are you proudest of?`,
      hint: 'Stick to what your resume states; add context, not new claims.', evidence: { ref: `experience[${i}]`, excerpt: clip(`${label}${e.meta ? ` (${e.meta})` : ''}`) },
    });
  });

  // behavioural: the strongest bullets across roles (numbers and substance first)
  const bullets = exp.flatMap((e, i) => (e.bullets ?? []).map((b, j) => ({ b, ref: `experience[${i}].bullets[${j}]` })));
  bullets.sort((x, y) => score(y.b) - score(x.b)).slice(0, 4).forEach((x) => {
    add({ category: 'BEHAVIOURAL', grounding: 'RESUME', text: `Your resume says: "${clip(x.b)}". Tell me about a specific time that happened: what was the situation and what did you do?`, hint: STAR, evidence: { ref: x.ref, excerpt: clip(x.b) } });
  });
  add({ category: 'BEHAVIOURAL', grounding: 'GENERAL', text: 'Tell me about a time you disagreed with a teammate. How did you handle it?', hint: STAR });

  // technical: listed skills, split into "shown in use on the resume" vs "general knowledge"
  const skills = sections.filter((s) => s.type === 'skills').flatMap((s) => (s.items ?? []).flatMap((i) => i.tags ?? [])).slice(0, 6);
  const projects = sections.find((s) => s.type === 'projects')?.items ?? [];
  for (const sk of skills.slice(0, 5)) {
    const eIdx = exp.findIndex((e) => hasTerm([e.title ?? '', ...(e.bullets ?? [])].join('\n'), sk));
    const pIdx = projects.findIndex((p) => hasTerm([p.title ?? '', p.text ?? '', ...(p.tags ?? [])].join('\n'), sk));
    if (eIdx >= 0) {
      const line = (exp[eIdx].bullets ?? []).find((b) => hasTerm(b, sk)) ?? `${exp[eIdx].title} at ${exp[eIdx].subtitle}`;
      add({ category: 'TECHNICAL', grounding: 'RESUME', text: `You used ${sk} in your work. Describe a concrete problem you solved with it and the trade-offs you considered.`, hint: 'Name the decision, the alternative you rejected, and the outcome.', evidence: { ref: `experience[${eIdx}]`, excerpt: clip(line) } });
    } else if (pIdx >= 0) {
      add({ category: 'TECHNICAL', grounding: 'RESUME', text: `Your project "${projects[pIdx].title}" uses ${sk}. How did you use it and what would you change?`, hint: 'Be clear this was a project, not paid work, if that is the case.', evidence: { ref: `projects[${pIdx}]`, excerpt: clip(projects[pIdx].title ?? sk) } });
    } else {
      add({ category: 'TECHNICAL', grounding: 'GENERAL', text: `General knowledge: what are the core concepts of ${sk} and when would you choose it?`, hint: `${sk} is listed as a skill but your resume does not show it in use. Answer from knowledge and do not imply work experience.`, notOnResume: true });
    }
  }

  const role = opts.roleTitle?.trim();
  if (role) {
    const at = opts.company?.trim() ? ` at ${opts.company.trim()}` : '';
    add({ category: 'JOB_SPECIFIC', grounding: 'GENERAL', text: `Why are you interested in the ${role} role${at}?`, hint: 'Connect the role to specific things you have done or want to learn. Avoid generic praise.' });
    add({ category: 'JOB_SPECIFIC', grounding: 'GENERAL', text: `Which parts of your experience best prepare you for ${role}, and where will you need to ramp up?`, hint: 'Choose two relevant examples from your resume and be honest about the gap.' });
  }

  const seen = new Set<string>();
  for (const raw of opts.focusSkills ?? []) {
    const sk = raw.trim();
    if (!sk || seen.has(sk.toLowerCase())) continue;
    seen.add(sk.toLowerCase());
    if (hasTerm(corpus, sk)) {
      const eIdx = exp.findIndex((e) => hasTerm([e.title ?? '', ...(e.bullets ?? [])].join('\n'), sk));
      const line = eIdx >= 0 ? (exp[eIdx].bullets ?? []).find((b) => hasTerm(b, sk)) ?? exp[eIdx].title ?? sk : `${sk} (listed in your skills)`;
      add({ category: 'JOB_SPECIFIC', grounding: 'RESUME', text: `This job emphasises ${sk}. Give me your best example of using it.`, hint: STAR, evidence: { ref: eIdx >= 0 ? `experience[${eIdx}]` : 'skills', excerpt: clip(line) } });
    } else {
      add({ category: 'GAP_PREPARATION', grounding: 'GENERAL', notOnResume: true, text: `This job emphasises ${sk}. Your resume does not show it. How would you describe your familiarity and how would you get up to speed?`, hint: 'Be honest. Describe related experience you really have and a concrete learning plan, without claiming work you have not done.' });
    }
  }
  return qs.slice(0, opts.max ?? 24);
}

// ------------------------------------------------------------------ answer feedback (text rubric)
export type Rating = 'strong' | 'ok' | 'improve';
export interface Dimension { rating: Rating; tip: string }
export interface AnswerFeedback {
  relevance: Dimension; structure: Dimension; clarity: Dimension; specificity: Dimension; evidenceAlignment: Dimension;
  starCoverage: { situation: boolean; task: boolean; action: boolean; result: boolean };
  unsupportedTerms: string[]; wordCount: number; note: string;
}

const STOP = new Set('the a an and or of to in on for with at by from is are was were be been it this that i you we my your our as but not have has had what how when why which who tell me about'.split(' '));
const words = (s: string) => (s.toLowerCase().match(/[a-z][a-z+#.\-]{2,}/g) ?? []).filter((w) => !STOP.has(w));
/** Tech/tool vocabulary used only to warn when an answer names something absent from the resume. */
const TECH_VOCAB = ['react', 'angular', 'vue', 'node.js', 'nestjs', 'typescript', 'javascript', 'python', 'java', 'kotlin', 'go', 'rust', 'c#', 'c++', 'sql', 'postgresql', 'mysql', 'mongodb', 'redis', 'kafka', 'docker', 'kubernetes', 'terraform', 'aws', 'azure', 'gcp', 'graphql', 'jenkins', 'spark', 'hadoop', 'tensorflow', 'pytorch', 'salesforce', 'sap'];

export function evaluateAnswer(q: Pick<Question, 'text' | 'grounding' | 'evidence' | 'category'>, answer: string, corpus: string): AnswerFeedback {
  const text = answer.trim();
  const wc = (text.match(/\S+/g) ?? []).length;
  const sentences = Math.max(1, (text.match(/[.!?](\s|$)/g) ?? []).length);
  const star = {
    situation: /\b(when|during|at the time|situation|context|while working|we were|our team|the project|back at)\b/i.test(text),
    task: /\b(my role|i was responsible|responsible for|goal|objective|needed to|had to|task|asked to)\b/i.test(text),
    action: /(?<![A-Za-z])I (?:[a-z]+ed|built|led|wrote|made|set up|ran|drove|took|chose|began|did|taught)(?![A-Za-z])/.test(text),
    result: /\b(result|resulted|as a result|outcome|reduced|increased|improved|saved|delivered|launched|shipped|achieved|grew|cut)\b|\d+\s?(%|percent|x\b)/i.test(text),
  };
  const starCount = Object.values(star).filter(Boolean).length;
  const behavioural = q.category === 'BEHAVIOURAL' || q.category === 'RESUME_WALKTHROUGH' || q.category === 'GAP_PREPARATION';

  const qWords = new Set(words(`${q.text} ${q.evidence?.excerpt ?? ''}`));
  const overlap = [...new Set(words(text))].filter((w) => qWords.has(w)).length;
  const relevance: Dimension = wc < 8 ? { rating: 'improve', tip: 'Too short to judge relevance. Answer the question that was asked.' }
    : overlap >= 3 ? { rating: 'strong', tip: 'Your answer stays on the question.' }
    : overlap >= 1 ? { rating: 'ok', tip: 'Tie your answer back to the specific question and the situation it names.' }
    : { rating: 'improve', tip: 'Your answer shares little language with the question. Re-read it and address it directly.' };

  const structure: Dimension = !behavioural ? (wc >= 40 ? { rating: 'strong', tip: 'Lead with the answer, then support it with one example.' } : { rating: 'improve', tip: 'State your point first, then back it with a concrete example.' })
    : starCount >= 4 ? { rating: 'strong', tip: 'Situation, task, action and result are all present.' }
    : starCount >= 3 ? { rating: 'ok', tip: `Add the missing STAR part: ${Object.entries(star).filter(([, v]) => !v).map(([k]) => k).join(', ')}.` }
    : { rating: 'improve', tip: `Cover more of STAR. Missing: ${Object.entries(star).filter(([, v]) => !v).map(([k]) => k).join(', ')}.` };

  const avg = wc / sentences;
  const clarity: Dimension = wc < 30 ? { rating: 'improve', tip: 'Aim for roughly 80 to 200 words (about a minute spoken).' }
    : wc > 320 ? { rating: 'improve', tip: 'Long answers lose the listener. Trim to your strongest points.' }
    : avg > 32 ? { rating: 'ok', tip: 'Break long sentences into shorter ones.' }
    : { rating: 'strong', tip: 'Length and sentence size are easy to follow.' };

  const specifics = (text.match(/\d+/g) ?? []).length + (text.match(/\b[A-Z][a-zA-Z0-9.+#]{2,}\b/g) ?? []).length;
  const specificity: Dimension = specifics >= 4 ? { rating: 'strong', tip: 'Good use of names, tools and numbers.' }
    : specifics >= 2 ? { rating: 'ok', tip: 'Add a number or a named tool or system to make it concrete.' }
    : { rating: 'improve', tip: 'Be more specific: name the system, the size, the timeframe, or a measurable result.' };

  const unsupported = TECH_VOCAB.filter((t) => hasTerm(text, t) && !hasTerm(corpus, t) && !hasTerm(q.text, t));
  let evidenceAlignment: Dimension;
  if (unsupported.length) evidenceAlignment = { rating: 'improve', tip: `You mention ${unsupported.join(', ')}, which is not on this resume version. Only say it if it is true, and add it to your profile so your resume matches your answers.` };
  else if (q.grounding === 'RESUME' && q.evidence) {
    const ev = new Set(words(q.evidence.excerpt));
    const hits = [...new Set(words(text))].filter((w) => ev.has(w)).length;
    evidenceAlignment = hits >= 2 ? { rating: 'strong', tip: 'Your answer lines up with what your resume states.' } : { rating: 'ok', tip: 'Refer back to the work your resume describes so the interviewer can connect the two.' };
  } else evidenceAlignment = { rating: 'ok', tip: 'This is a general question. Use a real example from your resume where you can.' };

  return {
    relevance, structure, clarity, specificity, evidenceAlignment, starCoverage: star, unsupportedTerms: unsupported, wordCount: wc,
    note: 'Text-only practice feedback from a fixed rubric. It is guidance, not a score, and says nothing about voice, accent, appearance or personality.',
  };
}
