import { HttpClient } from '@angular/common/http';
import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { activeLocale, translate } from './i18n/translate';
import { errorMessage } from './error-message';
import { SettingsService } from './settings.service';

export type HelpChatMode = 'guided' | 'ai';
export interface HelpChatStatus {
  enabled: boolean;
  mode: HelpChatMode;
  provider: string;
  model: string | null;
  external: boolean;
  aiConfigured: boolean;
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
export interface HelpChatReply {
  reply: string;
  provider: string;
  tokensUsed: number;
  aiAssisted: boolean;
  remainingTokens: number;
  dailyTokenBudget: number;
  cooldownSecondsRemaining: number;
  coolDownUntil: string | null;
}
export interface HelpChatTurn {
  role: 'user' | 'assistant';
  content: string;
}
export interface HelpChatMessage extends HelpChatTurn {
  id: number;
}

/** Resume-scoped context sent with each assistant message (template editor content checks). */
export interface HelpChatContext {
  resumeId?: string;
  jobId?: string;
  versionId?: string;
}

/**
 * Floating assistant state (port of the X Cron help chat widget).
 * Replies are shown in a console, never on a dedicated page; chat text is not stored anywhere.
 * The backend keeps only token usage so the daily budget survives reloads and devices.
 */
@Injectable()
export class HelpChatStore implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly settings = inject(SettingsService);

  private seq = 0;
  private loaded = false;
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  readonly available = signal(false);
  readonly open = signal(false);
  readonly busy = signal(false);
  readonly status = signal<HelpChatStatus | null>(null);
  readonly messages = signal<HelpChatMessage[]>([]);
  readonly draft = signal('');
  readonly error = signal('');
  readonly cooldownLeft = signal(0);

  readonly aiAssisted = computed(() => this.status()?.mode === 'ai');
  readonly maxChars = computed(() => this.status()?.maxMessageChars ?? 500);
  readonly quotaPercent = computed(() => {
    const s = this.status();
    if (!s || s.dailyTokenBudget <= 0) return 0;
    return Math.min(100, Math.round((s.usedTokens / s.dailyTokenBudget) * 100));
  });
  readonly quotaLeftPercent = computed(() => 100 - this.quotaPercent());

  /** Screens can set this so the chips match where the user is (e.g. template design options in the editor). */
  private readonly context = signal<'design' | null>(null);

  /** Resume the assistant is helping with (content checks in the template editor). */
  readonly resumeId = signal('');
  readonly jobId = signal('');

  /** Quick actions shown in the editor chatbot: content check, sentence fixes, ATS corrections. */
  readonly showActions = computed(() => this.context() === 'design');

  readonly suggestions = computed(() => {
    if (this.context() === 'design') {
      return [
        translate(activeLocale(), 'chat.suggest.template'),
        translate(activeLocale(), 'chat.suggest.color'),
        translate(activeLocale(), 'chat.suggest.layout'),
        translate(activeLocale(), 'chat.suggest.typography'),
        translate(activeLocale(), 'chat.suggest.sections'),
        translate(activeLocale(), 'chat.suggest.save'),
        translate(activeLocale(), 'chat.suggest.version'),
        translate(activeLocale(), 'chat.suggest.quality'),
        translate(activeLocale(), 'chat.suggest.improve'),
      ];
    }
    return [
      translate(activeLocale(), 'chat.suggest.resume'),
      translate(activeLocale(), 'chat.suggest.ats'),
      translate(activeLocale(), 'chat.suggest.privacy'),
    ];
  });
  readonly showSuggestions = computed(() => this.messages().length <= 1 && !this.busy());

  /** Tell the assistant which surface it is serving; pass null to restore the default chips. */
  setContext(next: 'design' | null): void {
    this.context.set(next);
  }

  /** Attach the resume the assistant should check (content checks from the template editor). */
  setResume(id: string, jobId = ''): void {
    this.resumeId.set(id);
    this.jobId.set(jobId);
  }

  clearResume(): void {
    this.resumeId.set('');
    this.jobId.set('');
  }

  /** Runs the deterministic content check plus mistakes and ATS corrections for the attached resume. */
  async checkQuality(): Promise<void> {
    this.draft.set(translate(activeLocale(), 'chat.runQuality'));
    await this.send();
  }

  /** Asks for bounded AI-assisted sentence improvements for the attached resume. */
  async improveResume(): Promise<void> {
    this.draft.set(translate(activeLocale(), 'chat.runImprove'));
    await this.send();
  }

  /** Starts a sentence-fix flow for specific text (editor toolbar "improve selected text"). */
  startFix(text: string): void {
    const t = text.trim();
    if (!t || this.busy() || this.cooldownLeft() > 0) return;
    this.draft.set(`Improve this sentence: ${t}`);
    void this.send();
  }

  /** Runs the fixed ATS check for the job attached to this resume (corrections/upgrades). */
  async checkAts(): Promise<void> {
    this.draft.set(translate(activeLocale(), 'chat.runAts'));
    await this.send();
  }

  ngOnDestroy(): void {
    this.clearCooldownTimer();
  }

  /** Called once by the shell. Failures simply hide the widget; no page depends on it. */
  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const status = await firstValueFrom(
        this.http.get<HelpChatStatus>(this.url('/ai/help/status')),
      );
      this.status.set(status);
      this.available.set(!!status.enabled);
      this.syncCooldown(status.cooldownSecondsRemaining);
    } catch {
      this.status.set(null);
      this.available.set(false);
    }
  }

  toggle(): void {
    if (!this.available()) return;
    const next = !this.open();
    this.open.set(next);
    if (next && this.messages().length === 0) {
      this.pushAssistant(translate(activeLocale(), 'chat.welcome'));
    }
  }

  close(): void {
    this.open.set(false);
  }

  useSuggestion(text: string): void {
    if (this.busy() || this.cooldownLeft() > 0) return;
    this.draft.set(text);
    void this.send();
  }

  async send(): Promise<void> {
    const text = this.draft().trim();
    if (!text || this.busy() || !this.available()) return;

    if (this.cooldownLeft() > 0) {
      this.error.set(translate(activeLocale(), 'chat.waitSeconds', { n: this.cooldownLeft() }));
      return;
    }
    if (text.length > this.maxChars()) {
      this.error.set(translate(activeLocale(), 'chat.tooLong', { n: this.maxChars() }));
      return;
    }

    this.error.set('');
    this.draft.set('');
    this.pushUser(text);
    this.busy.set(true);

    const cap = this.status()?.maxHistoryTurns ?? 4;
    const history = this.messages()
      .slice(0, -1)
      .slice(-cap)
      .map(({ role, content }) => ({ role, content }));

    try {
      const result = await firstValueFrom(
        this.http.post<HelpChatReply>(this.url('/ai/help/chat'), {
          message: text,
          history,
          context: { resumeId: this.resumeId() || undefined, jobId: this.jobId() || undefined },
        }),
      );
      this.pushAssistant(result.reply);
      this.patchQuota(result);
    } catch (e) {
      this.error.set(errorMessage(e));
      this.applyHttpQuota(e);
    } finally {
      this.busy.set(false);
    }
  }

  private url(path: string): string {
    return `${this.settings.apiBase}${path}`;
  }

  private pushUser(content: string): void {
    this.seq += 1;
    this.messages.update((list) => [...list, { id: this.seq, role: 'user', content }]);
  }

  private pushAssistant(content: string): void {
    this.seq += 1;
    this.messages.update((list) => [...list, { id: this.seq, role: 'assistant', content }]);
  }

  private patchQuota(result: HelpChatReply): void {
    const prev = this.status();
    if (!prev) return;
    this.status.set({
      ...prev,
      remainingTokens: result.remainingTokens,
      dailyTokenBudget: result.dailyTokenBudget,
      usedTokens: Math.max(0, result.dailyTokenBudget - result.remainingTokens),
      cooldownSecondsRemaining: result.cooldownSecondsRemaining,
      coolDownUntil: result.coolDownUntil,
      mode: result.aiAssisted ? 'ai' : prev.mode,
    });
    this.syncCooldown(result.cooldownSecondsRemaining);
  }

  /** 429 bodies carry the retry window so the composer can unlock on its own. */
  private applyHttpQuota(e: unknown): void {
    const body = (e as { error?: Record<string, unknown> })?.error;
    if (!body || typeof body !== 'object') return;
    const retry = body['retryAfterSeconds'];
    const remaining = body['remainingTokens'];
    const budget = body['dailyTokenBudget'];
    const until = body['coolDownUntil'];
    const prev = this.status();
    if (!prev) return;

    this.status.set({
      ...prev,
      remainingTokens: typeof remaining === 'number' ? remaining : prev.remainingTokens,
      dailyTokenBudget: typeof budget === 'number' ? budget : prev.dailyTokenBudget,
      coolDownUntil: typeof until === 'string' ? until : prev.coolDownUntil,
      cooldownSecondsRemaining: typeof retry === 'number' ? retry : prev.cooldownSecondsRemaining,
    });
    if (typeof retry === 'number' && retry > 0) this.syncCooldown(retry);
  }

  private syncCooldown(seconds: number): void {
    this.clearCooldownTimer();
    const left = Math.max(0, Math.floor(seconds));
    this.cooldownLeft.set(left);
    if (left <= 0) return;
    this.cooldownTimer = setInterval(() => {
      this.cooldownLeft.update((n) => {
        const next = Math.max(0, n - 1);
        if (next <= 0) this.clearCooldownTimer();
        return next;
      });
    }, 1000);
  }

  private clearCooldownTimer(): void {
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }
}
