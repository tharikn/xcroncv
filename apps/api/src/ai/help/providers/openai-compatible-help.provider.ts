import { HelpChatProvider, HelpChatTurn } from '../help-chat.types';

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
};

function defaultBaseUrl(provider: string): string {
  if (provider === 'groq') return 'https://api.groq.com/openai/v1';
  if (provider === 'ollama') return 'http://127.0.0.1:11434/v1';
  return 'https://api.openai.com/v1';
}

/** Small / cheap defaults — in-app help must stay light. */
function defaultModel(provider: string): string {
  if (provider === 'groq') return 'openai/gpt-oss-20b';
  if (provider === 'ollama') return 'llama3.2:1b';
  return 'gpt-4o-mini';
}

/**
 * OpenAI-compatible chat for the in-app assistant (ported from X Cron).
 * No SDK — fetch only. Text leaves the platform, so the gateway only calls this
 * after the user has explicitly opted in to AI assistance.
 */
export class OpenAiCompatibleHelpProvider implements HelpChatProvider {
  readonly id: string;
  readonly model: string;
  readonly promptVersion = '1';
  readonly external = true;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(providerId: string) {
    this.id = providerId;
    this.baseUrl = (
      process.env.AI_HELP_BASE_URL?.trim() ||
      process.env.AI_HELP_API_BASE_URL?.trim() ||
      defaultBaseUrl(providerId)
    ).replace(/\/$/, '');
    this.apiKey = process.env.AI_HELP_API_KEY?.trim() || '';
    this.model = process.env.AI_HELP_MODEL?.trim() || defaultModel(providerId);
    this.timeoutMs = Number(process.env.AI_HELP_TIMEOUT_MS ?? 20_000);
  }

  /** Configured = provider selected and, unless local Ollama, an API key exists. */
  static isConfigured(): boolean {
    const id = (process.env.AI_HELP_PROVIDER ?? '').trim().toLowerCase();
    if (!id || id === 'stub' || id === 'guided' || id === 'none') return false;
    if (id === 'ollama') return true;
    return !!process.env.AI_HELP_API_KEY?.trim();
  }

  async chat(input: {
    system: string;
    history: HelpChatTurn[];
    message: string;
    maxTokens: number;
  }): Promise<{ reply: string; tokensUsed: number }> {
    if (this.id !== 'ollama' && !this.apiKey) {
      throw new Error(`${this.id} is missing AI_HELP_API_KEY`);
    }

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: input.system },
      ...input.history.map((t) => ({ role: t.role, content: t.content })),
      { role: 'user', content: input.message },
    ];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_tokens: input.maxTokens,
          messages,
        }),
      });

      const raw = (await res.json()) as ChatCompletionResponse;
      if (!res.ok) {
        throw new Error(`${this.id} HTTP ${res.status}: ${raw.error?.message || 'request failed'}`);
      }

      const reply = (raw.choices?.[0]?.message?.content ?? '').trim();
      if (!reply) throw new Error(`${this.id} returned an empty reply`);

      const usage = raw.usage?.total_tokens;
      const tokensUsed =
        typeof usage === 'number' && usage > 0
          ? usage
          : Math.ceil(
              (input.system.length +
                input.history.reduce((n, t) => n + t.content.length, 0) +
                input.message.length +
                reply.length) /
                4,
            );

      return { reply: reply.slice(0, 1600), tokensUsed };
    } finally {
      clearTimeout(timer);
    }
  }
}
