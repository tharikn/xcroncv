import { Claim, LetterSection, ProfileFacts } from './cover-letter.types';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%$.+# ]+/g, ' ').replace(/\s+/g, ' ').trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wholeWord = (hay: string, needle: string) => new RegExp(`(^|[^a-z0-9])${escapeRe(needle)}($|[^a-z0-9])`).test(hay);

const METRIC_RE = /(?:[$£€]\s?\d[\d,.]*\s?[kmb]?|\b\d[\d,.]*\s?(?:%|percent|x)\B|\b\d[\d,.]*\+?\s+(?:years?|yrs?|users?|customers?|clients?|engineers?|people|projects?|systems?)\b)/gi;
/** Phrases asserting something we cannot know: employer research, admiration, personal contact. */
const RESEARCH_RE = /\b(?:i (?:have )?(?:long )?(?:admired|followed|loved|been following|read about|noticed)|your (?:recent|latest) (?:launch|funding|announcement|article|post)|i (?:recently )?(?:met|spoke with|talked to))\b/i;
const REFERRAL_RE = /\b(?:referred (?:to you )?by|recommended (?:me )?by|introduced (?:to you |me )?by|at the suggestion of)\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)/;

/**
 * Deterministic claim check. `userAuthored` = strings the candidate typed themselves
 * (for example a referrer name); those are labelled USER_AUTHORED rather than blocked.
 */
export function validateClaims(sections: LetterSection[], facts: ProfileFacts, userAuthored: string[] = []): Claim[] {
  const corpus = norm([...facts.bullets, ...facts.employers, ...facts.titles, ...facts.skills].join(' . '));
  const userTexts = userAuthored.map(norm).filter(Boolean);
  const isUser = (text: string) => { const t = norm(text); return userTexts.some((u) => t.includes(u) || u.includes(t)); };
  const claims: Claim[] = [];

  for (const s of sections) {
    const text = s.text;
    const n = norm(text);

    for (const e of facts.employers) {
      if (e && wholeWord(n, norm(e))) claims.push({ sectionId: s.id, text: e, kind: 'employer', status: 'SUPPORTED', evidence: `Employer in career profile: ${e}` });
    }
    for (const k of facts.skills) {
      if (k && wholeWord(n, norm(k))) claims.push({ sectionId: s.id, text: k, kind: 'skill', status: 'SUPPORTED', evidence: `Skill in career profile: ${k}` });
    }
    for (const m of text.match(METRIC_RE) ?? []) {
      const key = norm(m);
      const years = /years?|yrs?/i.test(m) && facts.yearsExperience !== undefined && parseFloat(m) <= facts.yearsExperience;
      const backed = corpus.includes(key) || years;
      const user = !backed && isUser(m);
      claims.push({
        sectionId: s.id, text: m.trim(), kind: 'metric',
        status: backed ? 'SUPPORTED' : user ? 'USER_AUTHORED' : 'UNSUPPORTED',
        evidence: backed ? 'Found in confirmed achievements or experience dates' : undefined,
      });
    }
    const ref = REFERRAL_RE.exec(text);
    if (ref) claims.push({ sectionId: s.id, text: ref[0], kind: 'referral', status: isUser(ref[1]) ? 'USER_AUTHORED' : 'UNSUPPORTED' });
    const res = RESEARCH_RE.exec(text);
    if (res) claims.push({ sectionId: s.id, text: res[0].trim(), kind: 'research', status: isUser(res[0]) ? 'USER_AUTHORED' : 'UNSUPPORTED' });
  }
  return claims;
}

export const unsupportedCount = (claims: Claim[]) => claims.filter((c) => c.status === 'UNSUPPORTED').length;
