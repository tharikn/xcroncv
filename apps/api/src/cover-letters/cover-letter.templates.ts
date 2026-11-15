import { LetterKind } from './cover-letter.types';

/** Declarative, immutable, versioned (project convention): ship a new `version`, never edit one. */
export interface CoverLetterTemplate {
  id: LetterKind; version: number; name: string; description: string;
  sections: Array<'opening' | 'fit' | 'achievements' | 'motivation' | 'closing'>;
  maxAchievements: number;
}

const defs: CoverLetterTemplate[] = [
  { id: 'concise', version: 1, name: 'Concise', description: 'Three short paragraphs for quick applications.', sections: ['opening', 'achievements', 'closing'], maxAchievements: 1 },
  { id: 'standard', version: 1, name: 'Standard', description: 'Opening, fit, achievements and a closing.', sections: ['opening', 'fit', 'achievements', 'closing'], maxAchievements: 2 },
  { id: 'career-change', version: 1, name: 'Career change', description: 'Emphasises transferable skills and motivation.', sections: ['opening', 'fit', 'achievements', 'motivation', 'closing'], maxAchievements: 2 },
  { id: 'referral', version: 1, name: 'Referral / contextual', description: 'Names a referrer you supply. We never invent referrals.', sections: ['opening', 'fit', 'achievements', 'closing'], maxAchievements: 2 },
];

export const COVER_LETTER_TEMPLATES: readonly CoverLetterTemplate[] = Object.freeze(defs.map((t) => Object.freeze(t)));

export function getTemplate(kind: string): CoverLetterTemplate | undefined {
  return COVER_LETTER_TEMPLATES.find((t) => t.id === kind);
}
