import { mentions, ProfileLike } from '../career-path/analysis';
import { requirementTerms } from '../job-portal/tailoring';

export interface Question { id: string; text: string; why: string; kind: 'EXPERIENCE' | 'GAP' | 'GENERAL' }
export const MAX_QUESTIONS = 8;
export const MAX_ANSWER_CHARS = 4000;

/** Grounded questions with an explanation of why each was chosen. Pure and deterministic; no model involved. */
export function buildQuestions(profile: ProfileLike, jobTitle: string, terms: string[]): Question[] {
  const qs: Question[] = [];
  const latest = [...profile.experiences].sort((a, b) => Number(!!b.isCurrent) - Number(!!a.isCurrent) || (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0];
  if (latest) qs.push({ id: 'q-recent', kind: 'GENERAL', text: `Walk me through your role as ${latest.jobTitle} at ${latest.employerName} and what you are proudest of there.`, why: 'Your most recent experience is the natural opening topic.' });
  terms.forEach((term, i) => {
    if (qs.length >= MAX_QUESTIONS - 1) return;
    const ex = profile.experiences.find((e) => mentions([e.description ?? '', ...e.bullets.filter((b) => b.isUserConfirmed !== false).map((b) => b.content)].join(' '), term.toLowerCase()));
    const sk = profile.skills.find((s) => s.isUserConfirmed !== false && mentions(s.name, term.toLowerCase()));
    if (ex) qs.push({ id: `q-x${i}`, kind: 'EXPERIENCE', text: `Tell me about a time you used ${term} in your work at ${ex.employerName}. What was the situation, what did you do and what was the result?`, why: `The ${jobTitle} posting asks for ${term}, and your resume mentions it in ${ex.jobTitle} at ${ex.employerName}.` });
    else if (sk) qs.push({ id: `q-s${i}`, kind: 'EXPERIENCE', text: `You list ${sk.name} as a skill. Describe a concrete situation where you applied it.`, why: `The posting asks for ${term} and ${sk.name} is on your skills list without a described example.` });
    else qs.push({ id: `q-g${i}`, kind: 'GAP', text: `The role mentions ${term}. How would you approach it, and what related experience would you draw on?`, why: `The posting asks for ${term}, but your resume does not mention it. Interviewers may probe this, so prepare an honest answer.` });
  });
  qs.push({ id: 'q-why', kind: 'GENERAL', text: `Why are you interested in this ${jobTitle} role?`, why: 'Almost every interview asks about motivation.' });
  return qs.slice(0, MAX_QUESTIONS);
}

export type DimensionStatus = 'STRONG' | 'COULD_IMPROVE';
export interface Dimension { key: 'relevance' | 'structure' | 'specificity' | 'evidence' | 'clarity'; label: string; status: DimensionStatus; observation: string }

const STAR = { situation: /\b(situation|context|when|at the time|we were|our team|the project)\b/i, task: /\b(task|goal|needed to|responsible for|had to|objective)\b/i, action: /\b(i (built|led|designed|wrote|created|fixed|implemented|decided|organi[sz]ed|set up|ran|proposed)|my role|i then|i started)\b/i, result: /\b(result|resulted|as a result|outcome|reduced|increased|improved|saved|delivered|launched|so that)\b/i };

/** Observations on the answer's content, never on the person. No numeric score, no tone/accent/appearance analysis. */
export function giveFeedback(answer: string, q: Question, profile: ProfileLike): Dimension[] {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  const text = answer.toLowerCase();
  const qTerms = (q.text.match(/using ([A-Za-z0-9.+# /-]+?) in your|mentions ([A-Za-z0-9.+# /-]+?)\./) ?? []).slice(1).filter(Boolean).map((s) => s.toLowerCase());
  const relevant = q.kind === 'GENERAL' ? words.length >= 25 : qTerms.length ? qTerms.some((t) => text.includes(t.split(/[ /]/)[0])) : words.length >= 25;
  const star = (Object.keys(STAR) as Array<keyof typeof STAR>).filter((k) => STAR[k].test(answer));
  const specific = /\d/.test(answer) || /\b[A-Z][A-Za-z0-9.+#]{2,}\b/.test(answer.replace(/^\W*\w+/, ''));
  const names = [...profile.experiences.map((e) => e.employerName), ...profile.skills.map((s) => s.name)].filter(Boolean);
  const evid = names.filter((n) => text.includes(n.toLowerCase()));
  const sentences = answer.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const avg = sentences.length ? words.length / sentences.length : words.length;
  return [
    { key: 'relevance', label: 'Relevance', status: relevant ? 'STRONG' : 'COULD_IMPROVE', observation: relevant ? 'Your answer addresses the topic of the question.' : 'Tie your answer more directly to what the question asks about.' },
    { key: 'structure', label: 'Structure', status: star.length >= 3 ? 'STRONG' : 'COULD_IMPROVE', observation: star.length >= 3 ? 'You covered most of situation, task, action and result.' : `Consider the situation, task, action, result pattern. Missing signals: ${(['situation', 'task', 'action', 'result'] as const).filter((k) => !star.includes(k)).join(', ')}.` },
    { key: 'specificity', label: 'Specificity', status: specific ? 'STRONG' : 'COULD_IMPROVE', observation: specific ? 'You included concrete names or numbers.' : 'Add a concrete detail: a named tool, a number, a size or a timeframe (only real ones).' },
    { key: 'evidence', label: 'Evidence from your resume', status: evid.length ? 'STRONG' : 'COULD_IMPROVE', observation: evid.length ? `You referred to ${evid.slice(0, 3).join(', ')} from your resume.` : 'Anchor the answer in an employer, project or skill that is on your resume.' },
    { key: 'clarity', label: 'Clarity', status: words.length >= 40 && words.length <= 250 && avg <= 28 ? 'STRONG' : 'COULD_IMPROVE', observation: words.length < 40 ? 'Quite short; add the reasoning behind what you did.' : words.length > 250 ? 'Long; aim to land the main point within about two minutes.' : avg > 28 ? 'Some sentences are long; shorter ones are easier to follow.' : 'Length and sentence size look easy to follow.' },
  ];
}

export { requirementTerms };
