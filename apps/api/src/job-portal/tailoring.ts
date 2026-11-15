import { mentions, ProfileLike } from '../career-path/analysis';
import { analyzePosting } from '../job-clipper/clip-logic';

export type ItemType = 'EMPHASISE_SKILL' | 'LEAD_WITH_EXPERIENCE' | 'NO_RECORDED_EVIDENCE';
export interface ProposalItem {
  id: string; type: ItemType; requirement: string;
  /** Existing confirmed profile items this suggestion points at. Empty for NO_RECORDED_EVIDENCE. */
  refs: Array<{ type: 'skill' | 'experience'; id: string; label: string }>;
  /** Fixed wording, no generated claims. */
  note: string;
}

/** Requirement terms: what the host listed plus known terms found in the description, de-duplicated, capped. */
export function requirementTerms(description: string, listed: string[]): string[] {
  const out = new Map<string, string>();
  for (const r of listed) { const k = r.trim(); if (k && !out.has(k.toLowerCase())) out.set(k.toLowerCase(), k); }
  for (const t of analyzePosting(description, []).terms) if (!out.has(t.label.toLowerCase())) out.set(t.label.toLowerCase(), t.label);
  return [...out.values()].slice(0, 30);
}

/**
 * Evidence-mapped tailoring proposal (doc 32). It only points at facts already in the confirmed profile and reorders emphasis;
 * it never writes new content and never suggests adding something with no recorded evidence.
 */
export function buildProposal(profile: ProfileLike, terms: string[]): ProposalItem[] {
  const items: ProposalItem[] = [];
  const skills = profile.skills.filter((s) => s.isUserConfirmed !== false);
  terms.forEach((term, i) => {
    const q = term.toLowerCase();
    const sk = skills.filter((s) => mentions(s.name, q) || mentions(q, s.name.toLowerCase()));
    const ex = profile.experiences.filter((e) => mentions([e.description ?? '', ...e.bullets.filter((b) => b.isUserConfirmed !== false).map((b) => b.content)].join(' '), q));
    if (sk.length) items.push({ id: `i${i}s`, type: 'EMPHASISE_SKILL', requirement: term, refs: sk.slice(0, 2).map((s) => ({ type: 'skill', id: s.id, label: s.name })), note: `Show "${sk[0].name}" near the top of your skills.` });
    if (ex.length) items.push({ id: `i${i}e`, type: 'LEAD_WITH_EXPERIENCE', requirement: term, refs: ex.slice(0, 2).map((e) => ({ type: 'experience', id: e.id, label: `${e.jobTitle} at ${e.employerName}` })), note: `Lead with your confirmed bullets from ${ex[0].jobTitle} at ${ex[0].employerName}.` });
    if (!sk.length && !ex.length) items.push({ id: `i${i}n`, type: 'NO_RECORDED_EVIDENCE', requirement: term, refs: [], note: 'Nothing in your profile mentions this. Add it only if it is true and you can support it.' });
  });
  return items;
}
