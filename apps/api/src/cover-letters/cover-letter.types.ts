export type LetterKind = 'concise' | 'standard' | 'career-change' | 'referral';
export type LetterTone = 'professional' | 'warm' | 'direct';
export type LetterLength = 'short' | 'medium' | 'long';
export type ClaimStatus = 'SUPPORTED' | 'USER_AUTHORED' | 'UNSUPPORTED';
export type ClaimKind = 'employer' | 'skill' | 'metric' | 'referral' | 'research';

export interface LetterSection { id: string; heading: string; text: string; origin: 'GENERATED' | 'USER' }
export interface Claim { sectionId: string; text: string; kind: ClaimKind; status: ClaimStatus; evidence?: string }

/** Confirmed facts taken from the candidate's career profile. Nothing else may back a claim. */
export interface ProfileFacts {
  fullName: string;
  headline?: string | null;
  employers: string[];
  titles: string[];
  skills: string[];
  /** Achievement/responsibility bullet texts. */
  bullets: string[];
  yearsExperience?: number;
}
