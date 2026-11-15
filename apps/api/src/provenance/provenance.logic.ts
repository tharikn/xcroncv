import { createHash } from 'crypto';
import { parseRangeText } from '../import-export/resume-parser';
import { RenderModel } from '../render-model/render-model.types';
import { findSkills, normalizeLabel, skillById } from '../resume-match/taxonomy';

export type Support = 'direct' | 'partial' | 'ambiguous' | 'absent' | 'contradictory';
export type ClaimKind = 'summary' | 'title' | 'employer' | 'date' | 'bullet' | 'skill' | 'credential' | 'project';
export type Origin = 'USER_ENTERED' | 'IMPORTED' | 'AI_REWRITTEN' | 'EXTERNALLY_VERIFIED';

export interface Claim { key: string; section: string; itemIndex: number; kind: ClaimKind; text: string; context?: { employer?: string; title?: string } }

/** One thing the user can be shown as evidence: a confirmed fact or an entry of their own career profile. */
export interface Evidence {
  id: string; source: 'FACT' | 'PROFILE'; label: string; text: string; confirmed: boolean; origin: Origin;
  employer?: string; title?: string; start?: string; end?: string; current?: boolean; skills?: string[];
}
export interface EvidenceMatch { id: string; source: 'FACT' | 'PROFILE'; label: string; excerpt: string; score: number; confirmed: boolean; origin: Origin; byUser?: boolean }
export interface Assessment { claim: Claim; support: Support; evidence: EvidenceMatch[]; issues: string[]; origin: Origin | null }

const STOP = new Set('a an and are as at be by for from in into is it of on or our that the their this to was were with using used use via while per across over under within also than then its my i we you'.split(' '));
export const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}%+#.\s]/gu, ' ').replace(/\s+/g, ' ').trim();
export const tokens = (s: string): string[] => norm(s).split(' ').map((t) => t.replace(/^\.+|\.+$/g, '')).filter((t) => t && !STOP.has(t) && (t.length > 1 || /\d/.test(t)));
const stem = (t: string) => (t.length > 4 ? t.replace(/(ing|ed|es|s)$/, '') : t);
const NUM_RE = /(?:[$£€]\s?)?\d[\d,.]*\s?(?:%|percent|[kmb]\b|x\b)?/gi;
export const numbers = (s: string): string[] => [...new Set((s.match(NUM_RE) ?? []).map((n) => n.toLowerCase().replace(/[\s,$£€]/g, '').replace('percent', '%').replace(/\.$/, '')).filter((n) => /\d/.test(n)))];
const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 24);
export const claimKey = (section: string, itemIndex: number, kind: string, text: string) => hash(`${section}|${itemIndex}|${kind}|${norm(text)}`);

/** Every factual statement in a resume render model, each with a stable key. */
export function extractClaims(m: RenderModel): Claim[] {
  const out: Claim[] = []; const add = (section: string, i: number, kind: ClaimKind, text: string | undefined, context?: Claim['context']) => {
    const t = (text ?? '').trim(); if (t) out.push({ key: claimKey(section, i, kind, t), section, itemIndex: i, kind, text: t, context });
  };
  for (const s of m.sections) {
    if (s.type === 'summary' && s.text) s.text.split(/(?<=[.!?])\s+/).forEach((x, j) => add('summary', j, 'summary', x));
    (s.items ?? []).forEach((it, i) => {
      if (s.type === 'experience') {
        const employer = (it.subtitle ?? '').split(',')[0].trim(); const ctx = { employer, title: it.title };
        add(s.type, i, 'title', it.title, ctx); add(s.type, i, 'employer', employer, ctx); add(s.type, i, 'date', it.meta, ctx);
        (it.bullets ?? []).forEach((b) => add(s.type, i, 'bullet', b, ctx));
      } else if (s.type === 'skills') (it.tags ?? []).forEach((t) => add(s.type, i, 'skill', t));
      else if (s.type === 'education' || s.type === 'certifications') add(s.type, i, 'credential', [it.title, it.subtitle].filter(Boolean).join(', '));
      else if (s.type === 'projects') { add(s.type, i, 'project', [it.title, it.text].filter(Boolean).join(': ')); }
      else if (s.type === 'languages') add(s.type, i, 'skill', it.title);
    });
  }
  return out;
}

const overlap = (claim: string, ev: string) => {
  const a = new Set(tokens(claim).map(stem)); if (!a.size) return 0;
  const b = new Set(tokens(ev).map(stem)); let hit = 0; for (const t of a) if (b.has(t)) hit++;
  return hit / a.size;
};
const subset = (a: string[], b: string[]) => a.every((x) => b.includes(x));
const disjoint = (a: string[], b: string[]) => a.length > 0 && b.length > 0 && !a.some((x) => b.includes(x));

/** Deterministic support assessment. Never calls AI; never treats an unconfirmed source as full support. */
export function assess(claim: Claim, evidence: Evidence[], manual: Array<{ factId: string }> = []): Assessment {
  const issues: string[] = []; const matches: EvidenceMatch[] = []; let support: Support = 'absent';
  const m = (e: Evidence, score: number, byUser = false): EvidenceMatch => ({ id: e.id, source: e.source, label: e.label, excerpt: e.text.slice(0, 160), score: Math.round(score * 100) / 100, confirmed: e.confirmed, origin: e.origin, byUser });

  if (claim.kind === 'skill') {
    const id = normalizeLabel(claim.text);
    const direct = evidence.filter((e) => (e.skills ?? []).some((s) => (id ? normalizeLabel(s) === id : norm(s) === norm(claim.text))));
    const mention = evidence.filter((e) => !direct.includes(e) && (id ? findSkills(e.text).some((h) => h.id === id) : norm(e.text).includes(norm(claim.text))));
    direct.forEach((e) => matches.push(m(e, 1))); mention.forEach((e) => matches.push(m(e, 0.6)));
    const confirmedDirect = direct.some((e) => e.confirmed);
    support = confirmedDirect ? 'direct' : direct.length || mention.length ? 'partial' : 'absent';
    if (support === 'partial') issues.push(direct.length ? 'The skill is listed but the source has not been confirmed.' : 'The skill is only mentioned in passing, not listed as a skill.');
    if (id && !skillById(id)) issues.push('Skill is not in the taxonomy');
  } else if (claim.kind === 'employer' || claim.kind === 'title' || claim.kind === 'credential') {
    for (const e of evidence) {
      const target = claim.kind === 'employer' ? e.employer : claim.kind === 'title' ? e.title : e.text;
      if (!target) continue;
      const a = norm(claim.text); const b = norm(target);
      const s = a === b ? 1 : claim.kind === 'credential' ? (b.includes(a) || a.includes(b) ? 0.9 : overlap(claim.text, target)) : overlap(claim.text, target);
      if (s >= 0.5) matches.push(m(e, s));
    }
    matches.sort((x, y) => y.score - x.score);
    const best = matches[0];
    support = !best ? 'absent' : best.score >= 0.85 && best.confirmed ? 'direct' : 'partial';
    if (best && !best.confirmed) issues.push('The best match is from a source you have not confirmed.');
  } else if (claim.kind === 'date') {
    const r = parseRangeText(claim.text);
    const cands = evidence.filter((e) => e.source === 'PROFILE' && e.start && claim.context?.employer && norm(e.employer ?? '') === norm(claim.context.employer));
    if (!r || !cands.length) { support = 'absent'; if (r) issues.push('No profile role with this employer was found to compare dates against.'); }
    else {
      const ok = cands.find((e) => e.start === r.start && (r.current ? !!e.current : e.end === r.end));
      if (ok) { matches.push(m(ok, 1)); support = ok.confirmed ? 'direct' : 'partial'; }
      else { cands.forEach((e) => matches.push(m(e, 0.5))); support = 'contradictory'; issues.push(`The dates differ from your profile (${cands[0].start} to ${cands[0].current ? 'present' : cands[0].end}).`); }
    }
  } else {
    // free text: bullets, summary sentences, projects
    const cn = numbers(claim.text);
    const scored = evidence.map((e) => ({ e, s: overlap(claim.text, e.text) })).filter((x) => x.s >= 0.5).sort((a, b) => b.s - a.s);
    for (const { e, s } of scored.slice(0, 3)) matches.push(m(e, s));
    const withNums = scored.map((x) => ({ ...x, n: numbers(x.e.text) }));
    const direct = withNums.find((x) => x.s >= 0.85 && subset(cn, x.n));
    const clash = withNums.find((x) => disjoint(cn, x.n));
    if (direct) { support = direct.e.confirmed ? 'direct' : 'partial'; if (!direct.e.confirmed) issues.push('The matching source has not been confirmed yet.'); }
    else if (cn.length && !withNums.some((x) => subset(cn, x.n))) {
      if (clash) { support = 'contradictory'; issues.push(`The figure "${cn.join(', ')}" differs from "${clash.n.join(', ')}" in your evidence.`); }
      else if (scored.length) { support = 'partial'; issues.push(`The figure "${cn.join(', ')}" is not found in any evidence.`); }
    }
    if (support === 'absent' && scored.length) {
      const distinct = new Set(scored.map((x) => x.e.id));
      support = distinct.size >= 2 && new Set(withNums.map((x) => x.n.join(','))).size > 1 ? 'ambiguous' : 'partial';
      issues.push(support === 'ambiguous' ? 'Several sources partly match and disagree on details.' : 'Only part of this statement is backed by your evidence.');
    }
  }

  // contradictions are never overridden; a user-made link upgrades absent/partial to direct and is labelled
  for (const l of manual) {
    const e = evidence.find((x) => x.id === l.factId); if (!e) continue;
    if (!matches.some((x) => x.id === e.id)) matches.unshift(m(e, 1, true)); else matches.forEach((x) => { if (x.id === e.id) x.byUser = true; });
    if (support !== 'contradictory' && e.confirmed) support = 'direct';
  }
  const top = matches[0];
  return { claim, support, evidence: matches.slice(0, 3), issues, origin: top?.origin ?? null };
}

export function summarize(list: Assessment[]) {
  const c: Record<Support, number> = { direct: 0, partial: 0, ambiguous: 0, absent: 0, contradictory: 0 };
  list.forEach((a) => c[a.support]++);
  return { total: list.length, ...c, needsAttention: c.partial + c.ambiguous + c.absent + c.contradictory };
}

/* ------------------------------ evidence diff between two versions (doc 28) ------------------------------ */
export interface EvidenceEntry { key: string; section: string; kind: ClaimKind; text: string; support: Support; evidence: string[] }
export interface EvidenceDiff {
  added: EvidenceEntry[]; removed: EvidenceEntry[];
  changed: Array<{ text: string; kind: ClaimKind; section: string; from: Support; to: Support }>;
  unchanged: number;
  fromSummary: ReturnType<typeof summarize>; toSummary: ReturnType<typeof summarize>;
  /** Statements new in the second version that are not directly supported. */
  addedNeedingEvidence: number;
  /** Statements removed from the first version that were not directly supported. */
  removedWithoutEvidence: number;
}
const entry = (a: Assessment): EvidenceEntry => ({ key: a.claim.key, section: a.claim.section, kind: a.claim.kind, text: a.claim.text, support: a.support, evidence: a.evidence.map((e) => e.label) });

/**
 * Compares the evidence position of two versions of one resume. Statements are matched by kind + normalised text (position changes
 * are not edits). Both sides are assessed against the SAME current evidence, so a difference reflects what the statements say.
 */
export function diffEvidence(a: Assessment[], b: Assessment[]): EvidenceDiff {
  const id = (x: Assessment) => `${x.claim.kind}|${norm(x.claim.text)}`;
  const pool = new Map<string, Assessment[]>();
  for (const x of a) pool.set(id(x), [...(pool.get(id(x)) ?? []), x]);
  const added: EvidenceEntry[] = []; const changed: EvidenceDiff['changed'] = []; let unchanged = 0;
  for (const y of b) {
    const x = pool.get(id(y))?.shift();
    if (!x) { added.push(entry(y)); continue; }
    if (x.support !== y.support) changed.push({ text: y.claim.text, kind: y.claim.kind, section: y.claim.section, from: x.support, to: y.support });
    else unchanged++;
  }
  const removed = [...pool.values()].flat().map(entry);
  return {
    added, removed, changed, unchanged, fromSummary: summarize(a), toSummary: summarize(b),
    addedNeedingEvidence: added.filter((e) => e.support !== 'direct').length,
    removedWithoutEvidence: removed.filter((e) => e.support !== 'direct').length,
  };
}

/* ------------------------------ rewrite guard ------------------------------ */
export interface DiffSeg { op: 'keep' | 'add' | 'remove'; text: string }
export interface Unsupported { type: 'number' | 'skill' | 'credential' | 'leadership' | 'name'; text: string; reason: string }

/** Word-level diff via LCS (inputs are single bullets, so sizes stay small). */
export function wordDiff(a: string, b: string): DiffSeg[] {
  const x = a.trim().split(/\s+/).filter(Boolean).slice(0, 300); const y = b.trim().split(/\s+/).filter(Boolean).slice(0, 300);
  const dp = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const segs: DiffSeg[] = []; const push = (op: DiffSeg['op'], t: string) => { const l = segs[segs.length - 1]; if (l && l.op === op) l.text += ` ${t}`; else segs.push({ op, text: t }); };
  let i = 0; let j = 0;
  while (i < x.length && j < y.length) { if (x[i] === y[j]) { push('keep', x[i]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) push('remove', x[i++]); else push('add', y[j++]); }
  while (i < x.length) push('remove', x[i++]); while (j < y.length) push('add', y[j++]);
  return segs;
}

const LEAD_RE = /\b(led|lead|leading|managed|managing|directed|headed|owned|spearheaded|founded|oversaw|mentored|supervised|architected|pioneered)\b/gi;
const CRED_RE = /\b(certified|certification|ph\.?d|doctorate|mba|master'?s|bachelor'?s|degree|licensed|accredited|chartered)\b/gi;
const TEAM_RE = /\bteam of \d+|\b\d+[- ](?:person|member|engineer|developer)s?\b/gi;

/** Facts in `proposed` that neither the original text nor any evidence contains. Each needs the user's explicit acknowledgement. */
export function findUnsupportedAdditions(original: string, proposed: string, evidenceTexts: string[]): Unsupported[] {
  const corpus = `${original} ${evidenceTexts.join(' ')}`; const cn = norm(corpus); const cnums = numbers(corpus); const out: Unsupported[] = [];
  const seen = new Set<string>(); const add = (u: Unsupported) => { const k = `${u.type}|${norm(u.text)}`; if (!seen.has(k)) { seen.add(k); out.push(u); } };
  for (const n of numbers(proposed)) if (!cnums.includes(n)) add({ type: 'number', text: n, reason: 'This figure is not in your original text or confirmed evidence.' });
  for (const h of findSkills(proposed)) { const s = skillById(h.id)!; if (!findSkills(corpus).some((x) => x.id === h.id)) add({ type: 'skill', text: s.label, reason: 'This skill is not mentioned in your original text or confirmed evidence.' }); }
  for (const re of [CRED_RE, LEAD_RE, TEAM_RE]) for (const m of proposed.match(re) ?? []) {
    if (!norm(corpus).includes(norm(m))) add(re === CRED_RE ? { type: 'credential', text: m, reason: 'A qualification or credential is claimed that is not in your evidence.' } : { type: 'leadership', text: m, reason: 'Leadership or ownership is claimed that is not in your evidence.' });
  }
  // capitalised words that appear mid-sentence and nowhere in the corpus: employers, products, places
  const words = proposed.split(/\s+/); words.forEach((w, i) => {
    const c = w.replace(/[^\p{L}\p{N}&.-]/gu, ''); if (i === 0 || !/^[A-Z][\p{L}&.-]{2,}$/u.test(c)) return;
    if (!cn.includes(norm(c)) && !findSkills(c).length) add({ type: 'name', text: c, reason: 'This name does not appear in your original text or confirmed evidence.' });
  });
  return out;
}

export function analyzeRewrite(original: string, proposed: string, evidenceTexts: string[]) {
  const diff = wordDiff(original, proposed);
  const same = tokens(original).join(' ') === tokens(proposed).join(' ');
  const unsupported = same ? [] : findUnsupportedAdditions(original, proposed, evidenceTexts);
  return { diff, unsupported, verdict: same ? 'unchanged' : unsupported.length ? 'needs-approval' : 'safe' } as const;
}

/** Every unsupported addition must be individually acknowledged (case-insensitive). */
export function missingAcknowledgements(unsupported: Unsupported[], acknowledged: string[]): Unsupported[] {
  const ack = new Set(acknowledged.map(norm));
  return unsupported.filter((u) => !ack.has(norm(u.text)));
}
