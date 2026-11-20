import { activeLocale, translate } from './i18n/translate';
import { ResumeDoc } from './resume-doc';

/**
 * Bounded, deterministic design corrections proposed by the chat assistant.
 * These are ephemeral suggestions only: nothing is written to the resume until the user
 * explicitly confirms and the editor applies the ops through its normal autosave path.
 * AI responses are never parsed here, and no score is ever read or changed.
 */
export type DesignPatchValue = string | number | boolean | null;

export interface DesignStyleOp {
  kind: 'style';
  keys: string[];
  patch: Record<string, DesignPatchValue>;
  labelKey: string;
  labelParams?: Record<string, string | number | null>;
}

export interface DesignPageBreakOp {
  kind: 'pageBreak';
  sectionId: string;
  value: boolean;
  labelKey: string;
  labelParams?: Record<string, string | number | null>;
}

export type DesignPatchOp = DesignStyleOp | DesignPageBreakOp;

export interface DesignPatch {
  ops: DesignPatchOp[];
}

const HEADER_KEYS = ['header.name', 'header.headline', 'header.contacts'] as const;

const STYLE_KEY_RE = /^(header\.(name|headline|contacts)|s\.[A-Za-z0-9_-]{1,40}\.(title|text)|i\.[A-Za-z0-9_-]{1,40}\.(title|subtitle|meta|text|bullets|tags|url))$/;

const norm = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').trim();

const sectionKeys = (doc: ResumeDoc) => doc.sections.flatMap((s) => [
  `s.${s.id}.title`,
  ...(s.text ? [`s.${s.id}.text`] : []),
  ...(s.items ?? []).flatMap((i) => [
    `i.${i.id}.title`, `i.${i.id}.subtitle`, `i.${i.id}.meta`, `i.${i.id}.text`,
    `i.${i.id}.bullets`, `i.${i.id}.tags`, `i.${i.id}.url`,
  ]),
]);

/** Only element keys that exist in this document can be touched by a suggestion. */
export function validDesignKeys(doc: ResumeDoc): Set<string> {
  return new Set([...HEADER_KEYS, ...sectionKeys(doc)].filter((k) => STYLE_KEY_RE.test(k)));
}

const styleOp = (
  keys: string[],
  patch: Record<string, DesignPatchValue>,
  labelKey: string,
  labelParams?: Record<string, string | number | null>,
): DesignStyleOp | null => (keys.length ? { kind: 'style', keys, patch, labelKey, labelParams } : null);

const ops = (...items: Array<DesignPatchOp | null>): DesignPatch | null => {
  const list = items.filter((x): x is DesignPatchOp => !!x);
  return list.length ? { ops: list } : null;
};

const resolveSection = (doc: ResumeDoc, raw: string) => {
  const q = norm(raw).replace(/^(the|section)\s+/, '').replace(/[.!?]+$/, '').trim();
  if (!q) return undefined;
  const locale = activeLocale();
  return doc.sections.find((s) => {
    const titles = [s.title, translate(locale, `ve.type.${s.type}`)].map(norm);
    return titles.some((t) => t === q || (q.length >= 3 && t.includes(q)));
  });
};

/** Returns a reviewable patch, or null when the message is not a safe design command. */
export function proposeDesignPatch(text: string, doc: ResumeDoc | null): DesignPatch | null {
  if (!doc || !doc.sections.length) return null;
  const input = norm(text);
  if (!input) return null;
  const keys = validDesignKeys(doc);
  const titleKeys = [...keys].filter((k) => k.endsWith('.title') && k.startsWith('s.'));
  const bodyKeys = [...keys].filter((k) => k.startsWith('i.') || k.startsWith('s.') && k.endsWith('.text'));
  const has = (...phrases: string[]) => phrases.some((p) => input.includes(norm(p)));

  if (has(translate(activeLocale(), 'chat.runFixOverflow')) || /\b(fit|tighten|compact|shrink)\b.*\b(page|spacing|text)\b/.test(input) || /\b(reduce|less)\b.*\b(spacing|font|size)\b/.test(input)) {
    return ops(
      styleOp(titleKeys, { sizePt: 10.5, spaceAfterPt: 0 }, 've.chatPatch.fitTitles'),
      styleOp(bodyKeys, { sizePt: 9.5, spaceAfterPt: 0 }, 've.chatPatch.fitBody'),
    );
  }

  if (has(translate(activeLocale(), 'chat.runAccentHeadings')) || /\b(accent|brand)\b.*\b(headings?|title|name)\b/.test(input) || /\b(headings?|title|name)\b.*\b(accent|brand)\b/.test(input)) {
    return ops(styleOp(['header.name', ...titleKeys], { color: 'accent' }, 've.chatPatch.accentHeadings'));
  }

  if (has(translate(activeLocale(), 'chat.runCenterHeader')) || /\b(center|centre|align)\b.*\b(header|name|headline|contacts)\b/.test(input)) {
    return ops(styleOp([...HEADER_KEYS].filter((k) => keys.has(k)), { align: 'center' }, 've.chatPatch.centerHeader'));
  }

  if (/\b(smaller|reduce|decrease)\b.*\b(text|font|size)\b/.test(input) || /\b(text|font|size)\b.*\bsmaller\b/.test(input)) {
    return ops(
      styleOp(titleKeys, { sizePt: 10 }, 've.chatPatch.smallerTitles'),
      styleOp(bodyKeys, { sizePt: 9 }, 've.chatPatch.smallerBody'),
    );
  }

  if (/\b(larger|bigger|increase)\b.*\b(text|font|size)\b/.test(input) || /\b(text|font|size)\b.*\blarger\b/.test(input)) {
    return ops(
      styleOp(titleKeys, { sizePt: 12.5 }, 've.chatPatch.largerTitles'),
      styleOp(bodyKeys, { sizePt: 11.5 }, 've.chatPatch.largerBody'),
    );
  }

  const newPage = input.match(/(?:start|put|move)\s+(.+?)\s+(?:on|onto)\s+(?:a\s+)?new page/);
  const removePage = input.match(/(?:remove|clear)\s+(?:the\s+)?page\s*break\s+(?:before|for)\s+(.+)/);
  const target = newPage || removePage;
  if (target) {
    const section = resolveSection(doc, target[1]);
    if (section) {
      return { ops: [{
        kind: 'pageBreak',
        sectionId: section.id,
        value: !!newPage,
        labelKey: newPage ? 've.chatPatch.pageBreak' : 've.chatPatch.removePageBreak',
        labelParams: { section: section.title },
      }] };
    }
  }

  return null;
}
