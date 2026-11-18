import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { estimateTokens, looksLikeInjection, redact } from '../ai-policy';
import { HELP_CHAT_PROMPT_VERSION, HELP_CHAT_SYSTEM, HELP_CHAT_WELCOME } from './prompts/help-chat.prompt';
import { AiService } from '../ai.service';
import { AiTask } from '../ai.types';
import { AtsEngineService } from '../../ats-engine/ats-engine.service';
import { QualityReviewService } from '../../quality-review/quality-review.service';
import { Finding, QualityScore } from '../../quality-review/quality-engine';
import { AtsResult } from '../../ats-engine/ats-engine';
import {
  HELP_CHAT_FEATURE,
  HelpChatContext,
  HelpChatProvider,
  HelpChatQuotaSnapshot,
  HelpChatResult,
  HelpChatTurn,
} from './help-chat.types';
import { GuidedHelpProvider } from './providers/guided-help.provider';
import { OpenAiCompatibleHelpProvider } from './providers/openai-compatible-help.provider';

function envFlag(name: string, fallback = false): boolean {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name] ?? '');
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function utcMidnight(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d;
}

/** Grounded resume content check assembled from the deterministic engines (quality + ATS) plus AI wording candidates. */
interface ResumeAssist {
  quality: QualityScore;
  findings: Finding[];
  ats: AtsResult | null;
  resumeName: string | null;
  candidates: AssistCandidate[];
}

interface AssistCandidate { text: string; ruleId: string; title: string }

/** Content-check questions asked from the template editor chatbot (quality, mistakes, fixes, ATS corrections). */
const CONTENT_CHECK_INTENT = /\b(quality|mistake|flaw|problem|issue|finding|improve|improvement|polish|rewrite|sentence|wording|bullet|grammar|spelling|proofread|fix|check|review|weak|score|readiness|export)\b/i;
/** Questions that ask for a wording fix, so the bounded AI polish runs (opt-in only, deterministic fallback). */
const FIX_INTENT = /\b(improve|improve|fix|polish|rewrite|reword|correct|revision|sentence|wording|bullet|grammar|spell|proofread|tighten|strengthen|revise)\b/i;

/**
 * In-app assistant gateway (port of the X Cron help chat, docs 06/38).
 *
 * Flow: availability -> rate window -> quota -> user consent -> redaction ->
 * timeout race -> reply. Reply text is never persisted; only metering metadata
 * (tokens, latency, status) goes to `AiUsageEvent`, which is also what enforces
 * the daily token budget across restarts and devices.
 *
 * Two modes:
 *  - `guided`: deterministic local answers. Always available, no network, no consent needed.
 *  - `ai`: an OpenAI-compatible provider, used only when the user turned AI on in /ai.
 *
 * When a resume context is attached (template editor content checks) and the question asks
 * for a content check / improvement, the reply is grounded in the deterministic quality engine
 * and the ATS engine, plus at most one bounded AI wording fix (user-confirmed suggestions only).
 */
@Injectable()
export class HelpChatService {
  private readonly logger = new Logger(HelpChatService.name);
  private readonly guided = new GuidedHelpProvider();
  private readonly external: OpenAiCompatibleHelpProvider | null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly quality: QualityReviewService | null,
    @Optional() private readonly ats: AtsEngineService | null,
    private readonly ai: AiService,
  ) {
    this.external = this.resolveExternalProvider();
    this.logger.log(
      `AI help chat: enabled=${this.isEnabled()} provider=${this.external?.id ?? this.guided.id}`,
    );
  }

  isEnabled(): boolean {
    return envFlag('AI_HELP_ENABLED', true);
  }

  welcomeMessage(): string {
    return HELP_CHAT_WELCOME;
  }

  private budget(): number {
    return envInt('AI_HELP_DAILY_TOKEN_BUDGET', 4000);
  }

  private cooldownMs(): number {
    return envInt('AI_HELP_COOLDOWN_MS', 8000);
  }

  private timeoutMs(): number {
    return envInt('AI_HELP_TIMEOUT_MS', 20_000);
  }

  private maxChars(): number {
    return envInt('AI_HELP_MAX_MESSAGE_CHARS', 500);
  }

  private maxHistory(): number {
    return envInt('AI_HELP_MAX_HISTORY_TURNS', 4);
  }

  private maxCompletionTokens(): number {
    return envInt('AI_HELP_MAX_COMPLETION_TOKENS', 220);
  }

  private costPer1k(provider: HelpChatProvider): number {
    if (!provider.external) return 0;
    return envInt('AI_HELP_COST_PER_1K_MICROS', 0);
  }

  async statusForUser(u: AuthUser, now = new Date()): Promise<HelpChatQuotaSnapshot> {
    const [usage, consent] = await Promise.all([this.usageToday(u, now), this.aiConsent(u)]);
    const external = !!this.external && consent;
    const active = external ? (this.external as OpenAiCompatibleHelpProvider) : this.guided;
    const quota = this.quotaSnapshot(usage, now);

    return {
      enabled: this.isEnabled(),
      mode: external ? 'ai' : 'guided',
      provider: active.id,
      model: active.model,
      external: active.external,
      aiConfigured: !!this.external,
      aiOptInRequired: !!this.external && !consent,
      ...quota,
      maxMessageChars: this.maxChars(),
      maxHistoryTurns: this.maxHistory(),
      welcome: this.welcomeMessage(),
    };
  }

  async chat(
    u: AuthUser,
    message: string,
    history: HelpChatTurn[] = [],
    context: HelpChatContext = {},
  ): Promise<HelpChatResult> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('The in-app assistant is turned off.');
    }

    const trimmed = message.trim();
    const maxChars = this.maxChars();
    if (!trimmed || trimmed.length > maxChars) {
      throw new BadRequestException(`Message must be 1-${maxChars} characters.`);
    }

    const now = new Date();
    const usage = await this.usageToday(u, now);
    this.assertWithinLimits(usage, now);

    const provider = await this.providerFor(u);
    const safeHistory = (history ?? [])
      .filter(
        (t) =>
          (t.role === 'user' || t.role === 'assistant') &&
          typeof t.content === 'string' &&
          !!t.content.trim(),
      )
      .slice(-this.maxHistory())
      .map((t) => ({ role: t.role, content: t.content.trim().slice(0, 800) }));

    // Local answers keep the text on the device API; external providers get redacted text only.
    const outgoing = provider.external ? redact(trimmed).text : trimmed;
    if (looksLikeInjection(trimmed)) {
      this.logger.warn(`Help chat: instruction-like message flagged for ${u.userId}`);
    }

    const inTokens = estimateTokens(`${trimmed} ${safeHistory.map((t) => t.content).join(' ')}`);
    const started = Date.now();
    let reply: string;
    let tokensUsed: number;

    // Resume-scoped content assist (template editor chatbot): deterministic quality score, mistakes with
    // fixes and ATS corrections from the engines, plus at most one bounded AI wording fix when asked to improve.
    // Only content-check questions run it; design questions keep flowing to the guided/provider chat.
    let assist: ResumeAssist | null =
      context.resumeId && CONTENT_CHECK_INTENT.test(trimmed)
        ? await this.assist(u, context).catch((e) => {
            this.logger.warn(`Help chat: content assist failed for ${u.userId}: ${e instanceof Error ? e.message : 'unknown'}`);
            return null;
          })
        : null;

    try {
      if (assist) {
        reply = this.composeAssistReply(assist);
        tokensUsed = Math.max(1, estimateTokens(reply));
        if (FIX_INTENT.test(trimmed)) {
          const fix = await this.sentenceFix(u, context, trimmed, assist.candidates);
          if (fix) {
            reply = `${reply}\n\n${fix.text}`.trim();
            tokensUsed += Math.max(1, estimateTokens(fix.text));
          }
        }
      } else {
        const result = await this.withTimeout(
          provider.chat({
            system: HELP_CHAT_SYSTEM,
            history: safeHistory,
            message: outgoing,
            maxTokens: this.maxCompletionTokens(),
          }),
        );
        reply = result.reply;
        tokensUsed = Math.max(1, result.tokensUsed);
      }
    } catch (error) {
      const timeout = error instanceof Error && error.message === 'TIMEOUT';
      const detail = error instanceof Error ? error.message : 'help_chat_failed';
      this.logger.warn(`Help chat failed for ${u.userId}: ${detail}`);
      await this.record(u, provider, timeout ? 'TIMEOUT' : 'ERROR', inTokens, 0, Date.now() - started);
      throw new ServiceUnavailableException(
        timeout
          ? 'The assistant took too long. Please try again.'
          : 'The assistant is busy right now. Please try again shortly.',
      );
    }

    await this.record(u, provider, 'OK', inTokens, estimateTokens(reply), Date.now() - started);

    const after = this.quotaSnapshot(
      { usedTokens: usage.usedTokens + inTokens + estimateTokens(reply), lastMessageAt: Date.now() },
      new Date(),
    );

    return {
      reply,
      provider: provider.id,
      tokensUsed,
      aiAssisted: provider.external,
      remainingTokens: after.remainingTokens,
      dailyTokenBudget: after.dailyTokenBudget,
      cooldownSecondsRemaining: after.cooldownSecondsRemaining,
      coolDownUntil: after.coolDownUntil,
    };
  }

  /**
   * Deterministic content check for a resume the signed-in user owns: quality score + findings with fixes,
   * and (when a job posting is in context) the ATS estimate with weak-or-missing items and improvements.
   * Nothing is written to the database; chat stays ephemeral.
   */
  private async assist(u: AuthUser, context: HelpChatContext): Promise<ResumeAssist> {
    const resumeId = context.resumeId!;
    const versionId = context.versionId ?? undefined;
    const analysis = await this.quality?.analyze(u, resumeId, versionId);
    if (!analysis) throw new Error('Quality engine unavailable');
    const quality: QualityScore = analysis.quality;
    const findings = analysis.findings;
    let ats: AtsResult | null = null;
    if (context.jobId && this.ats) {
      try {
        ats = await this.ats.score(u, resumeId, context.jobId, versionId);
      } catch (error) {
        this.logger.warn(`Help chat: ATS check failed for ${u.userId}: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }
    return { quality, findings, ats, resumeName: analysis.resumeName ?? null, candidates: this.candidates(findings) };
  }

  /** Picks the sentences worth a wording fix (action/weak-phrase/tense/cliché findings), bounded and evidence-linked. */
  private candidates(findings: Finding[]): AssistCandidate[] {
    const interesting = new Set([
      'WRITING.WEAK_PHRASE', 'WRITING.FIRST_PERSON', 'WRITING.TENSE_MISMATCH', 'WRITING.LOWERCASE_START',
      'WRITING.REPEATED_WORD', 'CONTENT.SUMMARY_CLICHE', 'CONTENT.SUPERLATIVE', 'CONTENT.NO_SUMMARY', 'READABILITY.LONG_SUMMARY',
    ]);
    const out: AssistCandidate[] = [];
    for (const f of findings) {
      if (f.source !== 'deterministic_rule') continue;
      if (!interesting.has(f.ruleId)) continue;
      const text = f.evidence.text;
      if (!text || text.length > 240) continue;
      if (out.some((c) => c.text === text)) continue;
      out.push({ text, ruleId: f.ruleId, title: f.title });
      if (out.length >= 2) break;
    }
    return out;
  }

  /** Plain-text reply: score, top mistakes with fixes and (when known) ATS corrections. */
  private composeAssistReply(a: ResumeAssist): string {
    const q = a.quality;
    const lines = [
      `I checked your resume: the quality score is ${q.score} out of 100, so the export readiness is ${q.readiness.replace(/_/g, ' ')}.`,
    ];
    const top = a.findings.slice(0, 3);
    for (const f of top) lines.push(`${f.title}: ${f.explanation} Fix: ${f.recommendation}`);
    if (a.ats) lines.push(`Against the job you selected, the ATS estimate is ${a.ats.score} out of 100. Improvements to consider: ${a.ats.improvements.join('; ') || 'none found'}.`);
    if (!top.length) lines.push('No findings. Proofread yourself as well: spelling and grammar are only checked mechanically.');
    return lines.join(' ');
  }

  /**
   * Bounded AI wording fix for the chosen sentences. The deterministic checklist already carries mechanical
   * fixes; wording-level fixes go through the AI policy gateway (opt-in, consent, redaction, invented-number
   * guard, daily quota). At most two candidates are sent, so the free AI allowance is not drained by checks.
   */
  private async sentenceFix(u: AuthUser, context: HelpChatContext, message: string, candidates: AssistCandidate[]) {
    if (!this.external) return null; // guided mode: deterministic answers only
    if (!FIX_INTENT.test(message)) return null;
    const texts = candidates.map((c) => c.text.trim()).filter((t) => t.length > 3).slice(0, 2);
    if (!texts.length) return null;
    const results = await Promise.all(texts.map((t) => this.ai.polish(u, 'POLISH_TEXT', t, {}).catch(() => null)));
    const first = results.find((r) => r && r.text.trim().length > 3);
    if (!first) return null;
    return first;
  }

  private assertWithinLimits(usage: { usedTokens: number; lastMessageAt: number }, now: Date): void {
    const budget = this.budget();

    if (usage.usedTokens >= budget) {
      const until = utcMidnight(now);
      throw this.tooMany(
        'Assistant limit reached for today. It resets at midnight UTC; every other tool keeps working.',
        Math.ceil((until.getTime() - now.getTime()) / 1000),
        until,
        budget,
      );
    }

    const cooldownMs = this.cooldownMs();
    const elapsed = usage.lastMessageAt > 0 ? now.getTime() - usage.lastMessageAt : Number.POSITIVE_INFINITY;
    if (cooldownMs > 0 && elapsed < cooldownMs) {
      const retryAfterSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
      throw this.tooMany(
        `Please wait ${retryAfterSeconds}s before another message.`,
        retryAfterSeconds,
        new Date(now.getTime() + retryAfterSeconds * 1000),
        budget,
      );
    }
  }

  private tooMany(message: string, retryAfterSeconds: number, until: Date, budget: number): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message,
        error: 'Too Many Requests',
        retryAfterSeconds,
        coolDownUntil: until.toISOString(),
        remainingTokens: 0,
        dailyTokenBudget: budget,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private quotaSnapshot(
    usage: { usedTokens: number; lastMessageAt: number },
    now: Date,
  ): {
    remainingTokens: number;
    dailyTokenBudget: number;
    usedTokens: number;
    cooldownSecondsRemaining: number;
    coolDownUntil: string | null;
  } {
    const budget = this.budget();
    const remainingTokens = Math.max(0, budget - usage.usedTokens);

    let until = 0;
    if (usage.usedTokens >= budget) until = utcMidnight(now).getTime();
    else if (usage.lastMessageAt > 0) until = usage.lastMessageAt + this.cooldownMs();

    const left = until > now.getTime() ? until : 0;
    return {
      remainingTokens,
      dailyTokenBudget: budget,
      usedTokens: usage.usedTokens,
      cooldownSecondsRemaining: left ? Math.ceil((left - now.getTime()) / 1000) : 0,
      coolDownUntil: left ? new Date(left).toISOString() : null,
    };
  }

  private async usageToday(
    u: AuthUser,
    now: Date,
  ): Promise<{ usedTokens: number; lastMessageAt: number }> {
    const since = new Date(now);
    since.setUTCHours(0, 0, 0, 0);
    const where = {
      tenantId: u.tenantId,
      userId: u.userId,
      feature: HELP_CHAT_FEATURE,
      createdAt: { gte: since },
    };

    const [sum, last] = await Promise.all([
      this.prisma.aiUsageEvent.aggregate({
        where,
        _sum: { inputTokens: true, outputTokens: true },
      }),
      this.prisma.aiUsageEvent.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      usedTokens: (sum._sum.inputTokens ?? 0) + (sum._sum.outputTokens ?? 0),
      lastMessageAt: last?.createdAt ? new Date(last.createdAt).getTime() : 0,
    };
  }

  private async record(
    u: AuthUser,
    provider: HelpChatProvider,
    status: 'OK' | 'ERROR' | 'TIMEOUT',
    inputTokens: number,
    outputTokens: number,
    latencyMs: number,
  ): Promise<void> {
    try {
      await this.prisma.aiUsageEvent.create({
        data: {
          tenantId: u.tenantId,
          userId: u.userId,
          feature: HELP_CHAT_FEATURE,
          provider: provider.id,
          model: provider.model,
          promptVersion: HELP_CHAT_PROMPT_VERSION,
          inputTokens: Math.max(0, inputTokens),
          outputTokens: Math.max(0, outputTokens),
          costMicros: Math.round(((inputTokens + outputTokens) / 1000) * this.costPer1k(provider)),
          latencyMs: Math.max(0, latencyMs),
          status,
        },
      });
    } catch (error) {
      // Metering must never break the conversation.
      this.logger.warn(`Help chat metering failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  private async providerFor(u: AuthUser): Promise<HelpChatProvider> {
    if (!this.external) return this.guided;
    return (await this.aiConsent(u)) ? this.external : this.guided;
  }

  private async aiConsent(u: AuthUser): Promise<boolean> {
    if (!this.external) return false;
    try {
      const setting = await this.prisma.aiSetting.findFirst({
        where: { tenantId: u.tenantId, userId: u.userId },
        select: { enabled: true },
      });
      return !!setting?.enabled;
    } catch (error) {
      this.logger.warn(`Help chat consent lookup failed: ${error instanceof Error ? error.message : 'unknown'}`);
      return false;
    }
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('TIMEOUT')), this.timeoutMs());
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private resolveExternalProvider(): OpenAiCompatibleHelpProvider | null {
    if (!this.isEnabled()) return null;
    if (!OpenAiCompatibleHelpProvider.isConfigured()) return null;

    const id = (process.env.AI_HELP_PROVIDER ?? '').trim().toLowerCase();
    if (id === 'ollama' || id === 'groq' || id === 'openai') {
      return new OpenAiCompatibleHelpProvider(id);
    }

    this.logger.warn(`Unknown AI_HELP_PROVIDER=${id}; guided answers only`);
    return null;
  }
}
