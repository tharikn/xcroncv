import { createHash } from 'crypto';
import { rangeTokens, textUnits, TextUnit, truncate, wordCount } from '../common/text-utils';
import { RenderModel } from '../render-model/render-model.types';
import { findSkillSpellings, findSkills, mentionsSkill } from '../resume-match/taxonomy';

/**
 * Deterministic resume quality + export-readiness rules (docs 20, 31). No AI. Every finding links to evidence.
 * The quality score is SEPARATE from job match and parsing scores. Bump QUALITY_VERSION when rules/weights change.
 */
export const QUALITY_VERSION = '1.0.0';
const RULE_VERSION = '1.0.0';

export type Severity = 'critical' | 'warning' | 'suggestion' | 'info';
export type QualityCategory = 'writing' | 'content' | 'structure' | 'consistency' | 'readability' | 'export';

export interface FindingEvidence { section: string; itemIndex?: number; itemTitle?: string; field?: string; bulletIndex?: number; text?: string }
export interface Finding {
  id: string; ruleId: string; ruleVersion: string; category: QualityCategory; severity: Severity; title: string; explanation: string;
  evidence: FindingEvidence; recommendation: string; confidence: number; source: 'deterministic_rule' | 'render_validator'; requiresUserConfirmation: boolean;
}

export const QUALITY_DIMENSIONS: Array<{ id: QualityCategory; label: string; weight: number }> = [
  { id: 'writing', label: 'Writing and language', weight: 20 },
  { id: 'content', label: 'Content strength and evidence', weight: 25 },
  { id: 'structure', label: 'Structure and completeness', weight: 15 },
  { id: 'consistency', label: 'Consistency and credibility', weight: 15 },
  { id: 'readability', label: 'Readability and scanability', weight: 15 },
  { id: 'export', label: 'Technical and export quality', weight: 10 },
];

const DEDUCTION: Record<Severity, number> = { critical: 30, warning: 10, suggestion: 3, info: 0 };

interface Rule { id: string; category: QualityCategory; severity: Severity; title: string; why: string; fix: string; confidence?: number; confirm?: boolean; source?: Finding['source'] }

const R = {
  repeatedWord: { id: 'WRITING.REPEATED_WORD', category: 'writing', severity: 'warning', title: 'A word is repeated back to back', why: 'Doubled words look like typing mistakes.', fix: 'Remove the duplicate word.', confidence: 0.9 },
  firstPerson: { id: 'WRITING.FIRST_PERSON', category: 'writing', severity: 'suggestion', title: 'First-person pronoun in a bullet', why: 'Resume bullets conventionally omit "I" and "my".', fix: 'Start with the action verb instead.', confidence: 0.85 },
  weakPhrase: { id: 'WRITING.WEAK_PHRASE', category: 'writing', severity: 'suggestion', title: 'Phrase describes duty, not action', why: 'Phrases like "responsible for" hide what you actually did.', fix: 'Lead with a specific action verb and what changed because of it.', confidence: 0.8 },
  lowerStart: { id: 'WRITING.LOWERCASE_START', category: 'writing', severity: 'suggestion', title: 'Bullet starts with a lowercase letter', why: 'Inconsistent capitalisation looks careless.', fix: 'Capitalise the first word.', confidence: 0.9 },
  spacing: { id: 'WRITING.SPACING', category: 'writing', severity: 'info', title: 'Extra or misplaced spacing', why: 'Double spaces or spaces before punctuation can hurt text extraction.', fix: 'Normalise the spacing.', confidence: 0.9 },
  tense: { id: 'WRITING.TENSE_MISMATCH', category: 'writing', severity: 'suggestion', title: 'Present-tense verb in a finished role', why: 'Completed roles are normally written in the past tense.', fix: 'Use past tense for roles that have ended.', confidence: 0.7 },

  noOutcome: { id: 'CONTENT.FEW_MEASURABLE', category: 'content', severity: 'suggestion', title: 'Few bullets show measurable results', why: 'Most bullets carry no number, scale or outcome.', fix: 'Where you can verify them, add scale, scope or results. Never invent figures.', confidence: 0.7, confirm: true },
  thinBullet: { id: 'CONTENT.THIN_BULLET', category: 'content', severity: 'suggestion', title: 'Bullet is very short', why: 'Very short bullets rarely show context or outcome.', fix: 'Add what you did and why it mattered, if you can verify it.', confidence: 0.7 },
  noSummary: { id: 'CONTENT.NO_SUMMARY', category: 'content', severity: 'suggestion', title: 'No professional summary', why: 'A short summary helps a reviewer place you quickly.', fix: 'Add two or three lines stating your role, strengths and focus.', confidence: 0.6 },
  cliche: { id: 'CONTENT.SUMMARY_CLICHE', category: 'content', severity: 'suggestion', title: 'Generic phrase in the summary', why: 'Generic self-descriptions carry no evidence.', fix: 'Replace it with something specific you can back up.', confidence: 0.75 },
  superlative: { id: 'CONTENT.SUPERLATIVE', category: 'content', severity: 'warning', title: 'Unsupported superlative', why: 'Claims like "best" or "world-class" cannot be verified from the resume.', fix: 'Replace with a fact: a result, rank or scale.', confidence: 0.8, confirm: true },
  duplicate: { id: 'CONTENT.DUPLICATE_BULLET', category: 'content', severity: 'warning', title: 'Near-duplicate bullet', why: 'Repeating the same statement wastes space and weakens credibility.', fix: 'Keep the stronger version or merge them.', confidence: 0.85 },
  skillNoEvidence: { id: 'CONTENT.SKILL_NO_EVIDENCE', category: 'content', severity: 'info', title: 'Skill listed without supporting work', why: 'This skill is not mentioned in any job or project.', fix: 'Show it in a bullet if you used it, or remove it.', confidence: 0.7 },
  noBullets: { id: 'CONTENT.ROLE_NO_DETAIL', category: 'content', severity: 'warning', title: 'Role has no description', why: 'A role with no bullets gives the reader nothing to assess.', fix: 'Add two or three bullets about what you did.', confidence: 0.9 },
  bigMetric: { id: 'CONTENT.CONFIRM_METRIC', category: 'content', severity: 'info', title: 'Large figure to confirm', why: 'Very large percentages or amounts draw scrutiny.', fix: 'Confirm the figure is accurate and add context (from what, over how long).', confidence: 0.6, confirm: true },

  noName: { id: 'STRUCTURE.MISSING_NAME', category: 'structure', severity: 'critical', title: 'The resume has no name', why: 'A resume without a name cannot be used.', fix: 'Add your full name to the career profile.', confidence: 1 },
  noEmail: { id: 'STRUCTURE.NO_EMAIL', category: 'structure', severity: 'warning', title: 'No email address', why: 'Reviewers need a way to contact you.', fix: 'Add an email address to your profile.', confidence: 0.95 },
  badEmail: { id: 'STRUCTURE.EMAIL_FORMAT', category: 'structure', severity: 'warning', title: 'Email address looks malformed', why: 'A mistyped email means missed replies.', fix: 'Check the address.', confidence: 0.9 },
  noPhone: { id: 'STRUCTURE.NO_PHONE', category: 'structure', severity: 'info', title: 'No phone number', why: 'Some employers expect a phone number; it is optional elsewhere.', fix: 'Add one if you are comfortable sharing it.', confidence: 0.5 },
  noExperience: { id: 'STRUCTURE.NO_EXPERIENCE', category: 'structure', severity: 'warning', title: 'No experience or projects', why: 'Reviewers look for evidence of work first.', fix: 'Add roles, internships, volunteering or projects.', confidence: 0.8 },
  noEducation: { id: 'STRUCTURE.NO_EDUCATION', category: 'structure', severity: 'info', title: 'No education listed', why: 'Education is expected for some roles and regions, not all.', fix: 'Add it if relevant to your target roles.', confidence: 0.5 },
  noSkills: { id: 'STRUCTURE.NO_SKILLS', category: 'structure', severity: 'suggestion', title: 'No skills section', why: 'A skills section helps quick scanning and keyword matching.', fix: 'Add the skills you can evidence.', confidence: 0.6 },
  noDates: { id: 'STRUCTURE.ROLE_NO_DATES', category: 'structure', severity: 'warning', title: 'Role has no dates', why: 'Chronology cannot be assessed without dates.', fix: 'Add start and end dates.', confidence: 0.85 },
  dateOrder: { id: 'STRUCTURE.DATE_ORDER', category: 'structure', severity: 'critical', title: 'End date is before start date', why: 'Impossible chronology undermines credibility.', fix: 'Correct the dates.', confidence: 0.95, confirm: true },
  overlap: { id: 'STRUCTURE.DATE_OVERLAP', category: 'structure', severity: 'info', title: 'Two roles overlap in time', why: 'Overlaps are fine for concurrent roles, but readers may ask.', fix: 'Make clear if the roles were concurrent.', confidence: 0.7 },
  gap: { id: 'STRUCTURE.DATE_GAP', category: 'structure', severity: 'info', title: 'Gap between roles', why: 'A neutral note only: gaps are common and are not a defect.', fix: 'Optionally add a short line if you wish to explain it.', confidence: 0.6 },
  dupSection: { id: 'STRUCTURE.DUPLICATE_SECTION', category: 'structure', severity: 'warning', title: 'Section appears twice', why: 'Duplicate sections confuse readers and parsers.', fix: 'Merge the sections.', confidence: 0.95 },

  dateFormat: { id: 'CONSISTENCY.DATE_FORMAT', category: 'consistency', severity: 'warning', title: 'Dates use mixed formats', why: 'Mixed formats look inconsistent and can confuse parsers.', fix: 'Use one date format throughout.', confidence: 0.85 },
  techCase: { id: 'CONSISTENCY.TECH_SPELLING', category: 'consistency', severity: 'suggestion', title: 'Inconsistent spelling of a technology', why: 'The same technology is written in different ways.', fix: 'Use the official spelling everywhere.', confidence: 0.85 },

  longBullet: { id: 'READABILITY.LONG_BULLET', category: 'readability', severity: 'suggestion', title: 'Bullet is long', why: 'Long bullets are hard to scan.', fix: 'Split it or trim to the key action and result.', confidence: 0.8 },
  veryLongBullet: { id: 'READABILITY.VERY_LONG_BULLET', category: 'readability', severity: 'warning', title: 'Bullet is very long', why: 'Very long bullets are skipped by most readers.', fix: 'Split it into two bullets.', confidence: 0.85 },
  longSummary: { id: 'READABILITY.LONG_SUMMARY', category: 'readability', severity: 'suggestion', title: 'Summary is long', why: 'Summaries over about 700 characters are rarely read in full.', fix: 'Trim to two or three lines.', confidence: 0.7 },
  manyBullets: { id: 'READABILITY.MANY_BULLETS', category: 'readability', severity: 'suggestion', title: 'Role has many bullets', why: 'More than eight bullets dilute the strongest points.', fix: 'Keep the most relevant ones.', confidence: 0.7 },
  noHeadline: { id: 'READABILITY.NO_HEADLINE', category: 'readability', severity: 'suggestion', title: 'No headline under your name', why: 'A headline lets a reviewer see your target role at a glance.', fix: 'Add a short headline such as your role and specialty.', confidence: 0.6 },
  buried: { id: 'READABILITY.EXPERIENCE_BURIED', category: 'readability', severity: 'suggestion', title: 'Experience appears late', why: 'With several roles, experience is usually the first thing readers look for.', fix: 'Consider moving Experience higher (unless you are early in your career).', confidence: 0.5 },
  skillsWall: { id: 'READABILITY.SKILLS_WALL', category: 'readability', severity: 'suggestion', title: 'Very long skills list', why: 'Long lists bury the skills that matter.', fix: 'Keep the skills most relevant to your target roles.', confidence: 0.7 },
  dense: { id: 'READABILITY.DENSE', category: 'readability', severity: 'info', title: 'Resume is text-heavy', why: 'There is no single ideal length; this is only a density note.', fix: 'Check that every line earns its place for your target role.', confidence: 0.5 },

  noContent: { id: 'EXPORT.NO_CONTENT', category: 'export', severity: 'critical', title: 'Nothing to export', why: 'The resume has no experience, projects, education or skills.', fix: 'Add content before exporting.', confidence: 1, source: 'render_validator' },
  glyph: { id: 'EXPORT.GLYPH_RISK', category: 'export', severity: 'warning', title: 'Characters the PDF font may not draw', why: 'PDF export uses standard fonts: characters outside Western European text may appear as blanks or symbols.', fix: 'Replace the characters, or verify the exported PDF before sending.', confidence: 0.8, source: 'render_validator' },
  pages: { id: 'EXPORT.PAGE_ESTIMATE', category: 'export', severity: 'suggestion', title: 'Likely to run to several pages', why: 'Estimated from text length and font size; the preview is authoritative.', fix: 'Check the preview. There is no universal ideal length.', confidence: 0.5, source: 'render_validator' },
  link: { id: 'EXPORT.LINK_MALFORMED', category: 'export', severity: 'warning', title: 'Link is malformed', why: 'Broken links cannot be followed from the PDF.', fix: 'Fix the address (include https://).', confidence: 0.9, source: 'render_validator' },
} satisfies Record<string, Rule>;

const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 10);

function mk(rule: Rule, evidence: FindingEvidence, extra: { title?: string; explanation?: string } = {}): Finding {
  const ev = { ...evidence, text: evidence.text ? truncate(evidence.text, 140) : undefined };
  return {
    id: `f-${hash([rule.id, ev.section, ev.itemIndex, ev.field, ev.bulletIndex, ev.text].join('|'))}`, ruleId: rule.id, ruleVersion: RULE_VERSION, category: rule.category,
    severity: rule.severity, title: extra.title ?? rule.title, explanation: extra.explanation ?? rule.why, evidence: ev, recommendation: rule.fix,
    confidence: rule.confidence ?? 0.8, source: rule.source ?? 'deterministic_rule', requiresUserConfirmation: !!rule.confirm,
  };
}

const unitEv = (u: TextUnit, text = u.text): FindingEvidence => ({ section: u.section, itemIndex: u.itemIndex, itemTitle: u.itemTitle, field: u.field, bulletIndex: u.bulletIndex, text });

const PAST_ROLE_BAD_START = /^(manage|lead|develop|build|design|create|write|maintain|implement|deliver|drive|own|run|support|coordinate|analy[sz]e|test|deploy|optimi[sz]e|collaborate|work|ship|improve|mentor|plan|define|architect)s?\b/i;
const CLICHES = ['hardworking', 'hard-working', 'team player', 'results-driven', 'results driven', 'detail-oriented', 'detail oriented', 'self-motivated', 'go-getter', 'passionate about', 'think outside the box', 'dynamic professional', 'excellent communication skills'];
const SUPERLATIVE = /\b(best|world[- ]class|number one|#1|guru|ninja|rockstar|unmatched|unparalleled|second to none)\b/i;
const WEAK = /\b(responsible for|worked on|helped with|helped to|duties included|tasked with|involved in|assisted with)\b/i;
const OK_CHARS = /[\u0009\u000A -~ -ÿ–—‘’“”•…€™]/;

function dateFormatOf(meta: string): string | null {
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}/i.test(meta)) return 'Mon YYYY';
  if (/\b\d{4}-\d{2}\b/.test(meta)) return 'YYYY-MM';
  if (/\b\d{1,2}\/\d{4}\b/.test(meta)) return 'MM/YYYY';
  if (/\b(19|20)\d{2}\b/.test(meta)) return 'YYYY';
  return null;
}

export function runQualityRules(model: RenderModel, now = new Date()): Finding[] {
  const out: Finding[] = [];
  const units = textUnits(model);
  const sec = (t: string) => model.sections.filter((s) => s.type === t);
  const exp = sec('experience')[0]?.items ?? [];
  const proj = sec('projects')[0]?.items ?? [];
  const skills = sec('skills')[0]?.items ?? [];
  const bullets = units.filter((u) => u.field === 'bullets');
  const prose = units.filter((u) => ['bullets', 'text'].includes(u.field));

  // ---- structure ----
  if (!model.header.name?.trim()) out.push(mk(R.noName, { section: 'header', field: 'name' }));
  const email = model.header.contacts.find((c) => c.includes('@'));
  if (!email) out.push(mk(R.noEmail, { section: 'header', field: 'contacts' }));
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) out.push(mk(R.badEmail, { section: 'header', field: 'contacts', text: email }));
  if (!model.header.contacts.some((c) => /\+?\d[\d\s().-]{6,}/.test(c))) out.push(mk(R.noPhone, { section: 'header', field: 'contacts' }));
  if (!exp.length && !proj.length) out.push(mk(R.noExperience, { section: 'experience' }));
  if (!sec('education').length) out.push(mk(R.noEducation, { section: 'education' }));
  if (!skills.length) out.push(mk(R.noSkills, { section: 'skills' }));
  const seen = new Set<string>();
  for (const s of model.sections) { if (seen.has(s.type)) out.push(mk(R.dupSection, { section: s.type, text: s.title })); seen.add(s.type); }

  const dated: Array<{ i: number; start: number; end: number }> = [];
  const formats = new Set<string>();
  exp.forEach((it, i) => {
    const t = rangeTokens(it.meta, now);
    if (!t.length) out.push(mk(R.noDates, { section: 'experience', itemIndex: i, itemTitle: it.title, field: 'meta', text: it.meta }));
    else {
      const f = dateFormatOf(it.meta ?? ''); if (f) formats.add(f);
      const start = t[0]; const end = t[1] ?? t[0];
      if (end < start) out.push(mk(R.dateOrder, { section: 'experience', itemIndex: i, itemTitle: it.title, field: 'meta', text: it.meta }));
      else dated.push({ i, start, end });
    }
  });
  const byStart = [...dated].sort((a, b) => a.start - b.start);
  for (let k = 1; k < byStart.length; k++) {
    const prev = byStart[k - 1]; const cur = byStart[k];
    if (cur.start < prev.end - 2) out.push(mk(R.overlap, { section: 'experience', itemIndex: cur.i, itemTitle: exp[cur.i].title, field: 'meta', text: `${exp[prev.i].title} / ${exp[cur.i].title}` }));
    else if (cur.start - prev.end > 12) out.push(mk(R.gap, { section: 'experience', itemIndex: cur.i, itemTitle: exp[cur.i].title, field: 'meta', text: `${Math.round((cur.start - prev.end) / 12 * 10) / 10} years between roles` }));
  }
  if (formats.size > 1) out.push(mk(R.dateFormat, { section: 'experience', field: 'meta', text: [...formats].join(' and ') }));

  // ---- writing ----
  for (const u of prose) {
    const rep = /\b([A-Za-z]{2,})\s+\1\b/i.exec(u.text);
    if (rep && !/^(that|had|very|bye)$/i.test(rep[1])) out.push(mk(R.repeatedWord, unitEv(u), { explanation: `"${rep[0]}" repeats a word.` }));
    if (/\s{2,}|\s[,.;:!?]/.test(u.text)) out.push(mk(R.spacing, unitEv(u)));
  }
  for (const u of bullets) {
    if (/(^|\s)(I|my|me|I'm|I've)(\s|[,.;]|$)/.test(u.text)) out.push(mk(R.firstPerson, unitEv(u)));
    const w = WEAK.exec(u.text); if (w) out.push(mk(R.weakPhrase, unitEv(u), { explanation: `"${w[0]}" describes a duty, not what you did.` }));
    if (/^[a-z]/.test(u.text.trim())) out.push(mk(R.lowerStart, unitEv(u)));
  }
  exp.forEach((it, i) => {
    const ended = !!it.meta && !/present|current|now/i.test(it.meta) && rangeTokens(it.meta, now).length > 0;
    if (!ended) return;
    (it.bullets ?? []).forEach((b, bi) => { if (PAST_ROLE_BAD_START.test(b.trim())) out.push(mk(R.tense, { section: 'experience', itemIndex: i, itemTitle: it.title, field: 'bullets', bulletIndex: bi, text: b })); });
  });

  // ---- content ----
  const expBullets = units.filter((u) => u.field === 'bullets' && u.section === 'experience');
  if (expBullets.length >= 4) {
    const withNumber = expBullets.filter((u) => /\d/.test(u.text)).length;
    if (withNumber / expBullets.length < 0.3) out.push(mk(R.noOutcome, { section: 'experience', field: 'bullets', text: `${withNumber} of ${expBullets.length} bullets contain a figure` }));
  }
  for (const u of expBullets) if (wordCount(u.text) < 5) out.push(mk(R.thinBullet, unitEv(u)));
  const summary = sec('summary')[0];
  if (!summary?.text) out.push(mk(R.noSummary, { section: 'summary' }));
  else {
    const low = summary.text.toLowerCase();
    for (const c of CLICHES) if (low.includes(c)) out.push(mk(R.cliche, { section: 'summary', field: 'text', text: c }, { explanation: `"${c}" is a generic phrase with no evidence behind it.` }));
    if (summary.text.length > 700) out.push(mk(R.longSummary, { section: 'summary', field: 'text', text: summary.text }));
  }
  for (const u of prose) {
    const s = SUPERLATIVE.exec(u.text); if (s) out.push(mk(R.superlative, unitEv(u), { explanation: `"${s[0]}" cannot be verified from the resume.` }));
    const big = /\b(\d{3,}(?:,\d{3})*)\s*%|\b(?:\$|£|€)\s?\d{1,3}(?:,\d{3}){2,}|\b\d+\s?(?:x|times)\b/i.exec(u.text);
    if (big && (/%/.test(big[0]) ? Number(big[1].replace(/,/g, '')) >= 100 : true)) out.push(mk(R.bigMetric, unitEv(u), { explanation: `"${big[0]}" is a large figure readers may question.` }));
  }
  const norm = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
  const bnorm = bullets.map((u) => ({ u, w: norm(u.text) }));
  for (let a = 0; a < bnorm.length; a++) for (let b = a + 1; b < bnorm.length; b++) {
    const A = bnorm[a].w; const B = bnorm[b].w; if (A.size < 4 || B.size < 4) continue;
    const inter = [...A].filter((w) => B.has(w)).length; const jac = inter / (A.size + B.size - inter);
    if (jac >= 0.85) out.push(mk(R.duplicate, unitEv(bnorm[b].u), { explanation: `Nearly identical to another bullet (${Math.round(jac * 100)}% word overlap).` }));
  }
  exp.forEach((it, i) => { if (!(it.bullets?.length) && !it.text) out.push(mk(R.noBullets, { section: 'experience', itemIndex: i, itemTitle: it.title, field: 'bullets' })); });
  const workText = units.filter((u) => u.demonstrated && u.field !== 'tags').map((u) => u.text).join('\n');
  const noEvidence: string[] = [];
  for (const it of skills) for (const tag of it.tags ?? []) {
    const hit = findSkills(tag)[0]; if (hit && !mentionsSkill(workText, hit.id)) noEvidence.push(tag);
  }
  for (const tag of noEvidence.slice(0, 5)) out.push(mk(R.skillNoEvidence, { section: 'skills', field: 'tags', text: tag }, { explanation: `${tag} is listed but no job or project mentions it.` }));

  // ---- consistency: same technology spelled differently ----
  const spell = new Map<string, Set<string>>();
  for (const u of units) for (const s of findSkillSpellings(u.text)) { const k = `${s.id}|${s.alias}`; (spell.get(k) ?? spell.set(k, new Set()).get(k)!).add(s.spelling); }
  for (const [, set] of spell) if (set.size > 1) out.push(mk(R.techCase, { section: 'document', field: 'text', text: [...set].join(' / ') }));

  // ---- readability ----
  for (const u of bullets) {
    if (u.text.length > 320) out.push(mk(R.veryLongBullet, unitEv(u)));
    else if (u.text.length > 220) out.push(mk(R.longBullet, unitEv(u)));
  }
  exp.forEach((it, i) => { if ((it.bullets?.length ?? 0) > 8) out.push(mk(R.manyBullets, { section: 'experience', itemIndex: i, itemTitle: it.title, field: 'bullets', text: `${it.bullets!.length} bullets` })); });
  if (!model.header.headline) out.push(mk(R.noHeadline, { section: 'header', field: 'headline' }));
  const expPos = model.sections.findIndex((s) => s.type === 'experience');
  if (expPos >= 3 && exp.length >= 2) out.push(mk(R.buried, { section: 'experience', text: `position ${expPos + 1} of ${model.sections.length}` }));
  const tagCount = skills.reduce((n, it) => n + (it.tags?.length ?? 0), 0);
  if (tagCount > 30) out.push(mk(R.skillsWall, { section: 'skills', field: 'tags', text: `${tagCount} skills listed` }));
  const totalWords = units.reduce((n, u) => n + wordCount(u.text), 0);
  if (totalWords > 900) out.push(mk(R.dense, { section: 'document', text: `about ${totalWords} words` }));

  // ---- export / technical ----
  if (!exp.length && !proj.length && !sec('education').length && !skills.length) out.push(mk(R.noContent, { section: 'document' }));
  const allText = [model.header.name, model.header.headline ?? '', ...model.header.contacts, ...units.map((u) => u.text)].join('');
  const bad = [...new Set([...allText].filter((ch) => !OK_CHARS.test(ch)))];
  if (bad.length) out.push(mk(R.glyph, { section: 'document', field: 'text', text: bad.slice(0, 6).join(' ') }, { explanation: `Found characters outside the PDF font's range (${bad.slice(0, 6).join(' ')}).` }));
  for (const l of model.header.links) {
    let ok = !!l.label?.trim();
    try { const u = new URL(l.url); ok = ok && /^https?:$/.test(u.protocol) && !/\s/.test(l.url); } catch { ok = false; }
    if (!ok) out.push(mk(R.link, { section: 'header', field: 'links', text: l.url }));
  }
  proj.forEach((p, i) => { if (p.url) { try { new URL(p.url); } catch { out.push(mk(R.link, { section: 'projects', itemIndex: i, itemTitle: p.title, field: 'url', text: p.url })); } } });
  const size = model.theme.baseSizePt || 10.5;
  const pageW = (model.page.size === 'A4' ? 595 : 612) - 2 * model.page.marginPt;
  const pageH = (model.page.size === 'A4' ? 842 : 792) - 2 * model.page.marginPt;
  const cpl = Math.max(20, Math.floor(pageW / (size * 0.5)));
  let lines = 4 + model.sections.length * 2;
  for (const s of model.sections) {
    if (s.text) lines += Math.ceil(s.text.length / cpl);
    for (const it of s.items ?? []) {
      lines += 1 + (it.subtitle ? 0 : 0) + (it.text ? Math.ceil(it.text.length / cpl) : 0) + (it.tags?.length ? Math.ceil(it.tags.join(', ').length / cpl) : 0);
      for (const b of it.bullets ?? []) lines += Math.ceil((b.length + 2) / (cpl - 4));
    }
  }
  const pages = Math.ceil(lines / Math.floor(pageH / (size * 1.35)));
  if (pages > 3) out.push(mk(R.pages, { section: 'document', text: `about ${pages} pages` }, { explanation: `Estimated at about ${pages} pages from text length and font size. The preview is authoritative.` }));

  return out;
}

export interface QualityDimension { id: QualityCategory; label: string; weight: number; applicable: boolean; effectiveWeight: number; score: number | null; findings: number; note: string }
export interface QualityScore {
  scoringVersion: string; score: number; readiness: 'ready' | 'review_recommended' | 'needs_attention';
  dimensions: QualityDimension[]; coverage: { applicableWeight: number; dimensionsApplicable: number; dimensionsTotal: number; limitations: string[] };
  counts: Record<Severity, number>; disclaimer: string;
}

export const QUALITY_DISCLAIMER = 'A quality score reviews the resume itself. It is not a job match score, a parsing test, an employer ATS result or a prediction of any hiring outcome.';

export function scoreFindings(model: RenderModel, findings: Finding[]): QualityScore {
  const units = textUnits(model);
  const expItems = model.sections.find((s) => s.type === 'experience')?.items ?? [];
  const projItems = model.sections.find((s) => s.type === 'projects')?.items ?? [];
  const applicable: Record<QualityCategory, { ok: boolean; why: string }> = {
    writing: { ok: units.some((u) => ['bullets', 'text'].includes(u.field)), why: 'No bullets or summary text to review.' },
    content: { ok: expItems.length + projItems.length > 0, why: 'No experience or projects to assess.' },
    structure: { ok: true, why: '' },
    consistency: { ok: expItems.length > 0, why: 'No experience entries to compare.' },
    readability: { ok: true, why: '' },
    export: { ok: true, why: '' },
  };
  const dims: QualityDimension[] = QUALITY_DIMENSIONS.map((d) => {
    const fs = findings.filter((f) => f.category === d.id);
    const perRule = new Map<string, number>();
    for (const f of fs) perRule.set(f.ruleId, Math.min((perRule.get(f.ruleId) ?? 0) + DEDUCTION[f.severity], DEDUCTION[f.severity] * 2));
    const deduction = [...perRule.values()].reduce((a, b) => a + b, 0);
    const a = applicable[d.id];
    return { id: d.id, label: d.label, weight: d.weight, applicable: a.ok, effectiveWeight: 0, score: a.ok ? Math.max(0, 100 - deduction) : null, findings: fs.length, note: a.ok ? (fs.length ? `${fs.length} finding${fs.length > 1 ? 's' : ''}.` : 'No findings.') : `Not evaluated: ${a.why}` };
  });
  const aw = dims.filter((d) => d.applicable).reduce((a, d) => a + d.weight, 0);
  for (const d of dims) d.effectiveWeight = d.applicable && aw ? Math.round((d.weight / aw) * 1000) / 10 : 0;
  const score = aw ? Math.round(dims.filter((d) => d.applicable).reduce((a, d) => a + d.weight * d.score!, 0) / aw) : 0;
  const counts: Record<Severity, number> = { critical: 0, warning: 0, suggestion: 0, info: 0 };
  findings.forEach((f) => counts[f.severity]++);
  const limitations = dims.filter((d) => !d.applicable).map((d) => `${d.label}: ${d.note.replace('Not evaluated: ', '')} Its weight was redistributed.`);
  limitations.push('Spelling and grammar are only checked for mechanical problems (repeated words, spacing, capitalisation). Proofread yourself.');
  return {
    scoringVersion: QUALITY_VERSION, score, readiness: counts.critical ? 'needs_attention' : counts.warning ? 'review_recommended' : 'ready',
    dimensions: dims, coverage: { applicableWeight: aw, dimensionsApplicable: dims.filter((d) => d.applicable).length, dimensionsTotal: dims.length, limitations }, counts, disclaimer: QUALITY_DISCLAIMER,
  };
}

const SEV_ORDER: Record<Severity, number> = { critical: 0, warning: 1, suggestion: 2, info: 3 };
export function reviewResume(model: RenderModel, now = new Date()) {
  const findings = runQualityRules(model, now).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  // De-duplicate identical ids (same rule on the same evidence).
  const uniq = [...new Map(findings.map((f) => [f.id, f])).values()];
  return { findings: uniq, ...scoreFindings(model, uniq) };
}

export interface Comparison {
  previousId: string; previousScore: number; scoreDelta: number | null; scoringVersionChanged: boolean;
  newFindings: Array<Pick<Finding, 'id' | 'ruleId' | 'severity' | 'title'>>; resolvedFindings: Array<Pick<Finding, 'id' | 'ruleId' | 'severity' | 'title'>>; message: string;
}

/** Regression check: what changed since the previous review of the same resume. Scores from different rule versions are never diffed. */
export function compareReviews(prev: { id: string; score: number; scoringVersion: string; findings: Finding[] }, cur: { score: number; scoringVersion: string; findings: Finding[] }): Comparison {
  const lite = (f: Finding) => ({ id: f.id, ruleId: f.ruleId, severity: f.severity, title: f.title });
  const prevIds = new Set(prev.findings.map((f) => f.id)); const curIds = new Set(cur.findings.map((f) => f.id));
  const newFindings = cur.findings.filter((f) => !prevIds.has(f.id)).map(lite);
  const resolvedFindings = prev.findings.filter((f) => !curIds.has(f.id)).map(lite);
  const changed = prev.scoringVersion !== cur.scoringVersion;
  const delta = changed ? null : cur.score - prev.score;
  const regress = newFindings.filter((f) => f.severity === 'critical' || f.severity === 'warning').length;
  const message = changed
    ? `The scoring rules changed (${prev.scoringVersion} to ${cur.scoringVersion}), so the scores are not compared.`
    : delta === 0 && !newFindings.length && !resolvedFindings.length ? 'No change since the previous review.'
      : `${delta! > 0 ? 'Up' : delta! < 0 ? 'Down' : 'Unchanged'} ${delta ? Math.abs(delta) + ' points' : ''}: ${resolvedFindings.length} resolved, ${newFindings.length} new${regress ? ` (${regress} warning or critical)` : ''}.`.replace(/\s+:/, ':');
  return { previousId: prev.id, previousScore: prev.score, scoreDelta: delta, scoringVersionChanged: changed, newFindings, resolvedFindings, message };
}
