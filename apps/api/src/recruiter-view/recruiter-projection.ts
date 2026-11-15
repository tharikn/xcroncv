import { parseRange, unionMonths } from '../common/text-utils';
import { RenderItem, RenderModel } from '../render-model/render-model.types';
import { detectSeniority } from '../resume-match/jd-analyzer';
import { Finding } from '../quality-review/quality-engine';

/**
 * Recruiter View projection (doc 22): a READ-ONLY view model derived from a resume's render model.
 * It never mutates its input, never drops content in full mode, and states how much quick-scan collapsed.
 * It computes no score of its own; annotations are existing quality-review findings, linked by id.
 */
export type ViewMode = 'quick' | 'full';
export interface ProjectionOptions {
  mode: ViewMode; anonymize: boolean; targetRole?: string; keywords?: string[]; annotations?: Finding[]; now?: Date;
}

export interface ProjectedBullet { index: number; text: string; highlight: boolean; matched: string[] }
export interface ProjectedItem {
  index: number; title?: string; subtitle?: string; meta?: string; text?: string; bullets: ProjectedBullet[]; hiddenBullets: number;
  tags: string[]; hiddenTags: number; url?: string; collapsed: boolean; annotationIds: string[];
}
export interface ProjectedSection { type: string; title: string; text?: string; items: ProjectedItem[]; totalItems: number; hiddenItems: number; annotationIds: string[] }
export interface Annotation { id: string; ruleId: string; severity: string; category: string; title: string; explanation: string; section: string; itemIndex?: number; bulletIndex?: number; text?: string }

export interface RecruiterProjection {
  mode: ViewMode; anonymized: boolean; readOnly: true;
  identity: { name: string; headline?: string; targetRole?: string };
  contacts: string[]; links: Array<{ label: string; url?: string }>;
  overview: { currentRole?: string; currentEmployer?: string; statedExperienceYears: number | null; roleCount: number; statedLevel?: string; coreSkills: string[]; note: string };
  sections: ProjectedSection[];
  navigation: Array<{ type: string; title: string }>;
  collapsedSummary: { hiddenItems: number; hiddenBullets: number; hiddenTags: number; message: string };
  annotations: Annotation[];
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URLRE = /\b(?:https?:\/\/|www\.)[^\s)]+/gi;
const PHONE = /(?<![\w.])\+?\d[\d\s().-]{7,}\d(?![\w])/g;

/** Masks contact details (email, phone, URL) inside free text. */
export function scrub(s: string): string {
  return s.replace(EMAIL, '[email hidden]').replace(URLRE, '[link hidden]').replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 9 && !/^(?:19|20)\d{2}[-/ ](?:\d{2}|(?:19|20)\d{2})/.test(m) ? '[phone hidden]' : m));
}

const QUICK = { items: 3, bullets: 3, tags: 12 };
const ANNOTATE = new Set(['writing', 'content', 'readability', 'consistency']);

export function buildProjection(model: RenderModel, o: ProjectionOptions): RecruiterProjection {
  const now = o.now ?? new Date();
  const anon = o.anonymize;
  const clean = (s: string | undefined) => (s === undefined ? undefined : anon ? scrub(s) : s);
  const keywords = (o.keywords ?? []).map((k) => k.trim()).filter(Boolean);
  const kwRes = keywords.map((k) => ({ k, re: new RegExp(`(?<![A-Za-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'i') }));
  const quick = o.mode === 'quick';

  const annotations: Annotation[] = (o.annotations ?? []).filter((f) => ANNOTATE.has(f.category)).map((f) => ({
    id: f.id, ruleId: f.ruleId, severity: f.severity, category: f.category, title: f.title, explanation: clean(f.explanation)!, section: f.evidence.section,
    itemIndex: f.evidence.itemIndex, bulletIndex: f.evidence.bulletIndex, text: anon ? undefined : f.evidence.text,
  }));
  const ids = (section: string, itemIndex?: number) => annotations.filter((a) => a.section === section && (itemIndex === undefined || a.itemIndex === itemIndex)).map((a) => a.id);

  let hiddenItems = 0; let hiddenBullets = 0; let hiddenTags = 0;
  const sections: ProjectedSection[] = model.sections.map((s) => {
    const all = s.items ?? [];
    const limit = quick && (s.type === 'experience' || s.type === 'projects') ? QUICK.items : all.length;
    const items = all.map((it: RenderItem, index): ProjectedItem => {
      const collapsed = index >= limit;
      const bl = it.bullets ?? [];
      const shownBullets = collapsed ? [] : quick && s.type === 'experience' ? bl.slice(0, QUICK.bullets) : bl;
      const tagLimit = quick && s.type === 'skills' ? QUICK.tags : (it.tags?.length ?? 0);
      const shownTags = collapsed ? [] : (it.tags ?? []).slice(0, tagLimit);
      hiddenBullets += bl.length - shownBullets.length; hiddenTags += (it.tags?.length ?? 0) - shownTags.length;
      return {
        index, title: clean(it.title), subtitle: clean(it.subtitle), meta: it.meta, text: collapsed ? undefined : clean(it.text),
        bullets: shownBullets.map((b, bi) => {
          const matched = kwRes.filter((x) => x.re.test(b)).map((x) => x.k);
          return { index: bi, text: clean(b)!, highlight: matched.length > 0 || /\d/.test(b), matched };
        }),
        hiddenBullets: bl.length - shownBullets.length, tags: shownTags, hiddenTags: (it.tags?.length ?? 0) - shownTags.length,
        url: anon ? undefined : it.url, collapsed, annotationIds: ids(s.type, index),
      };
    });
    hiddenItems += items.filter((i) => i.collapsed).length;
    return { type: s.type, title: s.title, text: clean(s.text), items, totalItems: all.length, hiddenItems: items.filter((i) => i.collapsed).length, annotationIds: ids(s.type) };
  });

  const exp = model.sections.find((s) => s.type === 'experience')?.items ?? [];
  const ranges = exp.map((e) => parseRange(e.meta, now)).filter((r): r is { start: number; end: number } => !!r);
  const years = ranges.length ? Math.round((unionMonths(ranges) / 12) * 10) / 10 : null;
  const skillTags = (model.sections.find((s) => s.type === 'skills')?.items ?? []).flatMap((i) => i.tags ?? []);
  const level = exp[0]?.title ? detectSeniority(exp[0].title) : undefined;

  const hiddenTotal = hiddenItems + hiddenBullets + hiddenTags;
  return {
    mode: o.mode, anonymized: anon, readOnly: true,
    identity: { name: model.header.name, headline: clean(model.header.headline), targetRole: o.targetRole?.trim() || undefined },
    contacts: anon ? model.header.contacts.map((c) => (c.includes('@') ? '[email hidden]' : /\d{6,}/.test(c.replace(/\D/g, '')) && /^\+?[\d\s().-]+$/.test(c) ? '[phone hidden]' : '[location hidden]')) : [...model.header.contacts],
    links: model.header.links.map((l) => (anon ? { label: l.label } : { label: l.label, url: l.url })),
    overview: {
      currentRole: exp[0]?.title, currentEmployer: anon ? exp[0]?.subtitle : exp[0]?.subtitle, statedExperienceYears: years, roleCount: exp.length,
      statedLevel: level, coreSkills: [...new Set(skillTags)].slice(0, 8),
      note: years === null ? 'Experience length is not shown because the resume has no explicit dates.' : 'Experience length is calculated from the dates stated on the resume.',
    },
    sections, navigation: sections.map((s) => ({ type: s.type, title: s.title })),
    collapsedSummary: {
      hiddenItems, hiddenBullets, hiddenTags,
      message: !hiddenTotal ? (quick ? 'Nothing is collapsed.' : 'Full content: nothing is hidden.') : `Quick scan collapsed ${hiddenItems} entr${hiddenItems === 1 ? 'y' : 'ies'}, ${hiddenBullets} bullet${hiddenBullets === 1 ? '' : 's'} and ${hiddenTags} skill${hiddenTags === 1 ? '' : 's'}. Switch to full content to see everything.`,
    },
    annotations,
  };
}
