/** Provider-neutral contracts (doc 06 section 4). Business modules depend on these, never on a vendor SDK. */
export const AI_TASKS = ['REWRITE_BULLET', 'SUMMARY_DRAFT', 'KEYWORD_GAPS', 'POLISH_TEXT', 'COACH_ANSWER'] as const;
export type AiTask = (typeof AI_TASKS)[number];

export interface AiRequest {
  task: AiTask;
  /** Redacted text under review (a bullet, a job description for KEYWORD_GAPS, a letter or document passage for POLISH_TEXT, the user's answer for COACH_ANSWER). */
  text: string;
  /** Confirmed facts only: title, years, skills. Never contact details. */
  context: { title?: string; years?: number; skills?: string[] }; // COACH_ANSWER passes the interview question as `title`
}

export interface AiStructuredOutput {
  /** Suggested text. Always a suggestion; a person confirms before anything is saved. */
  text: string;
  notes: string[];
  /** Things the user must supply (for example a real metric); the model may not invent them. */
  questions: string[];
}

export interface ProviderInfo { id: string; model: string; promptVersion: string; available: boolean; costPer1kTokensMicros: number }

export interface TextGenerationProvider {
  readonly info: ProviderInfo;
  generateStructured(req: AiRequest): Promise<unknown>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
