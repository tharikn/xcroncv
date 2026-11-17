/**
 * In-app assistant contracts (port of X Cron help chat, docs 06/38).
 * Chat text is processed in memory and never stored; only usage metadata is metered.
 */
export const HELP_CHAT_FEATURE = 'HELP_CHAT';

export type HelpChatRole = 'user' | 'assistant';

export interface HelpChatTurn {
  role: HelpChatRole;
  content: string;
}

/** `guided` = local deterministic answers (always available, no network). `ai` = user opted in + provider configured. */
export type HelpChatMode = 'guided' | 'ai';

export interface HelpChatQuotaSnapshot {
  enabled: boolean;
  mode: HelpChatMode;
  provider: string;
  model: string | null;
  /** True only when the reply text leaves the platform. */
  external: boolean;
  /** An external provider is configured on this server. */
  aiConfigured: boolean;
  /** An external provider exists but this user has not turned AI assistance on. */
  aiOptInRequired: boolean;
  remainingTokens: number;
  dailyTokenBudget: number;
  usedTokens: number;
  cooldownSecondsRemaining: number;
  coolDownUntil: string | null;
  maxMessageChars: number;
  maxHistoryTurns: number;
  welcome: string;
}

export interface HelpChatResult {
  reply: string;
  provider: string;
  tokensUsed: number;
  aiAssisted: boolean;
  remainingTokens: number;
  dailyTokenBudget: number;
  cooldownSecondsRemaining: number;
  coolDownUntil: string | null;
}

export interface HelpChatProvider {
  readonly id: string;
  readonly model: string;
  readonly promptVersion: string;
  /** External providers send text off-platform; the gateway only uses them after the user's AI consent. */
  readonly external: boolean;
  chat(input: {
    system: string;
    history: HelpChatTurn[];
    message: string;
    maxTokens: number;
  }): Promise<{ reply: string; tokensUsed: number }>;
}
