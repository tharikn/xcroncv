import { Component, ElementRef, effect, inject, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DesignPatch } from '../../core/design-patch';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { LocaleService } from '../../core/i18n/locale.service';
import { HelpChatStore } from '../../core/help-chat.api';

/**
 * Floating assistant console (XY position owned by the shell FAB dock).
 * One conversational surface, no separate page: messages, quota, suggestions and composer.
 */
@Component({
  selector: 'app-help-chat',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  host: { class: 'help-chat-host' },
  template: `
    @if (chat.available() && chat.open()) {
      <section
        class="hc-panel"
        id="xcron-help"
        role="dialog"
        aria-modal="false"
        [attr.aria-label]="'chat.title' | t"
        (keydown.escape)="chat.close()"
      >
        <header class="hc-head">
          <span class="hc-avatar" aria-hidden="true">X</span>
          <div class="hc-who">
            <p class="hc-title">{{ 'chat.title' | t }}</p>
            <p class="hc-mode">
              <span class="hc-dot" [class.hc-dot--ai]="chat.aiAssisted()" aria-hidden="true"></span>
              {{ (chat.aiAssisted() ? 'chat.modeAI' : 'chat.modeGuided') | t }}
            </p>
          </div>
          <button type="button" class="hc-icon-btn" (click)="chat.close()" [attr.aria-label]="'chat.close' | t">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        </header>

        <div class="hc-quota">
          <span class="hc-quota__track" aria-hidden="true"><i [style.width.%]="chat.quotaLeftPercent()"></i></span>
          <p class="hc-quota__text" aria-live="polite">
            <span>{{ 'chat.quota' | t: { pct: chat.quotaLeftPercent() } }}</span>
            @if (chat.cooldownLeft() > 0) {
              <span class="hc-wait">{{ cooldownText() }}</span>
            }
          </p>
        </div>

        @if (chat.showActions()) {
          <div class="hc-actions" data-testid="hc-actions">
            <button type="button" class="hc-action" data-testid="hc-action-quality" [disabled]="chat.busy() || chat.cooldownLeft() > 0" (click)="run('quality')">
              <span class="hc-action__dot" aria-hidden="true"></span> {{ 'chat.checkQuality' | t }}
            </button>
            <button type="button" class="hc-action" data-testid="hc-action-improve" [disabled]="chat.busy() || chat.cooldownLeft() > 0" (click)="run('improve')">
              <span class="hc-action__dot" aria-hidden="true"></span> {{ 'chat.improveSentences' | t }}
            </button>
            <button type="button" class="hc-action" data-testid="hc-action-ats" [disabled]="chat.busy() || chat.cooldownLeft() > 0" (click)="run('ats')">
              <span class="hc-action__dot" aria-hidden="true"></span> {{ 'chat.checkAts' | t }}
            </button>
            <button type="button" class="hc-action" data-testid="hc-action-overflow" [disabled]="chat.busy() || chat.cooldownLeft() > 0" (click)="run('overflow')">
              <span class="hc-action__dot" aria-hidden="true"></span> {{ 'chat.fixOverflow' | t }}
            </button>
            <button type="button" class="hc-action" data-testid="hc-action-headings" [disabled]="chat.busy() || chat.cooldownLeft() > 0" (click)="run('headings')">
              <span class="hc-action__dot" aria-hidden="true"></span> {{ 'chat.accentHeadings' | t }}
            </button>
            <button type="button" class="hc-action" data-testid="hc-action-center" [disabled]="chat.busy() || chat.cooldownLeft() > 0" (click)="run('center')">
              <span class="hc-action__dot" aria-hidden="true"></span> {{ 'chat.centerHeader' | t }}
            </button>
          </div>
        }

        <div class="hc-log" #log role="log" aria-live="polite">
          @for (msg of chat.messages(); track msg.id) {
            <div class="hc-row" [class.hc-row--user]="msg.role === 'user'">
              @if (msg.role === 'assistant') {
                <span class="hc-mini" aria-hidden="true">X</span>
              }
              <p class="hc-bubble" [class.hc-bubble--user]="msg.role === 'user'">{{ msg.content }}</p>
            </div>
          }

          @if (chat.busy()) {
            <div class="hc-row" role="status" [attr.aria-label]="'chat.typing' | t">
              <span class="hc-mini" aria-hidden="true">X</span>
              <div class="hc-typing" aria-hidden="true"><i></i><i></i><i></i></div>
            </div>
          }

          @if (chat.showSuggestions()) {
            <div class="hc-suggestions" [attr.aria-label]="'chat.suggestionsAria' | t">
              @for (chip of chat.suggestions(); track chip) {
                <button
                  type="button"
                  class="hc-chip"
                  [disabled]="chat.busy() || chat.cooldownLeft() > 0"
                  (click)="chat.useSuggestion(chip)"
                >
                  {{ chip }}
                </button>
              }
            </div>
          }

          @if (chat.pendingDesignPatch(); as patch) {
            <div class="hc-patch" data-testid="hc-design-patch" [attr.aria-label]="'ve.chatPatch.title' | t">
              <p class="hc-patch__title">{{ 've.chatPatch.title' | t }}</p>
              <ul class="hc-patch__list">
                @for (op of patch.ops; track $index) {
                  <li>{{ op.labelKey | t: op.labelParams }}</li>
                }
              </ul>
              <div class="hc-patch__actions">
                <button type="button" class="hc-patch__apply" data-testid="hc-design-apply" (click)="applyPatch()">
                  {{ 've.chatPatch.apply' | t }}
                </button>
                <button type="button" class="hc-patch__dismiss" data-testid="hc-design-dismiss" (click)="chat.clearDesignPatch()">
                  {{ 've.chatPatch.dismiss' | t }}
                </button>
              </div>
            </div>
          }
        </div>

        @if (chat.error()) {
          <p class="hc-error" role="alert">{{ chat.error() }}</p>
        }

        <form class="hc-compose" (ngSubmit)="send($event)">
          <label class="hc-field">
            <textarea
              #input
              rows="1"
              name="helpDraft"
              [attr.maxlength]="chat.maxChars()"
              [attr.aria-label]="'chat.placeholder' | t"
              [placeholder]="'chat.placeholder' | t"
              [ngModel]="chat.draft()"
              (ngModelChange)="chat.draft.set($event)"
              (keydown)="onKeydown($event)"
              [disabled]="chat.busy() || chat.cooldownLeft() > 0"
            ></textarea>
          </label>
          <button
            type="submit"
            class="hc-send"
            [attr.aria-label]="'chat.send' | t"
            [disabled]="chat.busy() || !chat.draft().trim() || chat.cooldownLeft() > 0"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M4.5 19.5L20 12 4.5 4.5 4.5 10.5 14 12 4.5 13.5z" fill="currentColor" />
            </svg>
          </button>
        </form>

        <footer class="hc-foot">
          <span class="hc-foot__note">{{ (chat.aiAssisted() ? 'chat.footAI' : 'chat.footGuided') | t }}</span>
          @if (chat.status()?.aiOptInRequired) {
            <a class="hc-link" routerLink="/ai" (click)="chat.close()">{{ 'chat.optIn' | t }}</a>
          }
        </footer>
      </section>
    }
  `,
  styles: [`
    :host { display: contents; }

    .hc-panel {
      position: absolute;
      right: 0;
      bottom: calc(100% + 0.9rem);
      width: min(23.5rem, calc(100vw - 2rem));
      max-height: min(34rem, calc(100dvh - 15rem));
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr) auto auto auto;
      border-radius: 22px;
      overflow: hidden;
      background:
        radial-gradient(120% 60% at 0% 0%, color-mix(in srgb, var(--c-primary) 14%, transparent), transparent 60%),
        var(--c-bg);
      border: 1px solid color-mix(in srgb, var(--c-border) 78%, var(--c-primary));
      box-shadow: 0 24px 60px rgba(12, 6, 32, 0.35), 0 2px 8px rgba(12, 6, 32, 0.18);
      color: var(--c-text);
      transform-origin: bottom right;
      animation: hc-rise 200ms ease-out;
    }

    .hc-head {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      padding: 0.85rem 0.85rem 0.75rem;
      border-bottom: 1px solid color-mix(in srgb, var(--c-border) 70%, transparent);
      background: color-mix(in srgb, var(--c-primary) 7%, transparent);
    }
    .hc-avatar {
      flex: none;
      width: 2.4rem;
      height: 2.4rem;
      display: grid;
      place-items: center;
      border-radius: 14px;
      background: var(--brand-gradient);
      color: #fff;
      font-weight: 800;
      font-size: 0.95rem;
      letter-spacing: 0.02em;
      box-shadow: 0 6px 16px rgba(124, 92, 255, 0.35);
    }
    .hc-who { flex: 1 1 auto; min-width: 0; }
    .hc-title { margin: 0; font-size: 1rem; font-weight: 800; line-height: 1.2; }
    .hc-mode {
      margin: 0.15rem 0 0;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--c-muted);
      line-height: 1.2;
    }
    .hc-dot { width: 0.45rem; height: 0.45rem; border-radius: 999px; background: var(--c-ok); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-ok) 20%, transparent); }
    .hc-dot--ai { background: var(--c-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-primary) 22%, transparent); }

    .hc-icon-btn {
      flex: none;
      width: 2rem;
      height: 2rem;
      display: grid;
      place-items: center;
      padding: 0;
      border-radius: 999px;
      border: 1px solid var(--c-border);
      background: var(--c-bg);
      color: var(--c-muted);
      cursor: pointer;
      transition: color 0.14s ease, border-color 0.14s ease, background 0.14s ease;
    }
    .hc-icon-btn:hover { color: var(--c-text); border-color: color-mix(in srgb, var(--c-primary) 50%, var(--c-border)); background: color-mix(in srgb, var(--c-primary) 10%, var(--c-bg)); }

    .hc-quota { padding: 0.55rem 0.95rem 0.6rem; border-bottom: 1px solid color-mix(in srgb, var(--c-border) 60%, transparent); }
    .hc-quota__track { display: block; height: 4px; border-radius: 999px; background: var(--c-surface); overflow: hidden; }
    .hc-quota__track i { display: block; height: 100%; border-radius: inherit; background: var(--brand-gradient); transition: width 0.3s ease; }
    .hc-quota__text {
      margin: 0.4rem 0 0;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: baseline;
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      color: var(--c-muted);
      font-variant-numeric: tabular-nums;
    }
    .hc-wait { color: var(--c-warn); }

    .hc-actions { display: flex; flex-wrap: wrap; gap: 0.4rem; padding: 0.55rem 0.95rem 0.2rem; border-bottom: 1px solid color-mix(in srgb, var(--c-border) 60%, transparent); }
    .hc-action {
      display: inline-flex; align-items: center; gap: 0.4rem;
      padding: 0.4rem 0.7rem; border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--c-primary) 38%, var(--c-border));
      background: color-mix(in srgb, var(--c-primary) 9%, var(--c-bg));
      color: var(--c-text); font: inherit; font-size: 0.76rem; font-weight: 600; line-height: 1.25; cursor: pointer;
      transition: background 0.14s ease, border-color 0.14s ease, transform 0.14s ease;
    }
    .hc-action:hover:not(:disabled) { background: color-mix(in srgb, var(--c-primary) 16%, var(--c-bg)); border-color: color-mix(in srgb, var(--c-primary) 60%, var(--c-border)); transform: translateY(-1px); }
    .hc-action:disabled { opacity: 0.55; cursor: not-allowed; }
    .hc-action__dot { width: 0.4rem; height: 0.4rem; border-radius: 999px; background: var(--c-primary); }

    .hc-log {
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 0.7rem;
      min-height: 10rem;
      padding: 0.9rem 0.8rem 0.6rem;
      background:
        radial-gradient(60% 50% at 100% 0%, color-mix(in srgb, var(--c-accent) 7%, transparent), transparent 70%);
      scrollbar-gutter: stable;
      scroll-behavior: smooth;
    }

    .hc-row { display: flex; align-items: flex-end; gap: 0.4rem; animation: hc-msg 170ms ease-out; }
    .hc-row--user { justify-content: flex-end; }
    .hc-mini {
      flex: none;
      width: 1.5rem;
      height: 1.5rem;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: var(--brand-gradient);
      color: #fff;
      font-size: 0.55rem;
      font-weight: 800;
      margin-bottom: 0.1rem;
    }
    .hc-bubble {
      margin: 0;
      max-width: min(85%, 18rem);
      padding: 0.6rem 0.8rem;
      border-radius: 16px 16px 16px 6px;
      background: var(--c-surface);
      border: 1px solid color-mix(in srgb, var(--c-border) 80%, transparent);
      color: var(--c-text);
      font-size: 0.875rem;
      line-height: 1.45;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .hc-bubble--user {
      border-radius: 16px 16px 6px 16px;
      background: linear-gradient(145deg, color-mix(in srgb, var(--c-primary) 94%, #9580ff), color-mix(in srgb, var(--c-primary) 74%, var(--c-accent)));
      border-color: transparent;
      color: #fff;
      font-weight: 500;
      box-shadow: 0 8px 18px color-mix(in srgb, var(--c-primary) 30%, transparent);
    }

    .hc-typing {
      display: inline-flex;
      align-items: center;
      gap: 0.28rem;
      padding: 0.6rem 0.85rem;
      border-radius: 16px 16px 16px 6px;
      background: var(--c-surface);
      border: 1px solid color-mix(in srgb, var(--c-border) 80%, transparent);
    }
    .hc-typing i { width: 0.36rem; height: 0.36rem; border-radius: 999px; background: var(--c-primary); animation: hc-dot 1.1s ease-in-out infinite; }
    .hc-typing i:nth-child(2) { animation-delay: 0.15s; }
    .hc-typing i:nth-child(3) { animation-delay: 0.3s; }

    .hc-suggestions { display: flex; flex-wrap: wrap; gap: 0.4rem; padding-top: 0.2rem; }
    .hc-chip {
      max-width: 100%;
      padding: 0.45rem 0.7rem;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--c-primary) 38%, var(--c-border));
      background: color-mix(in srgb, var(--c-primary) 9%, var(--c-bg));
      color: var(--c-text);
      font: inherit;
      font-size: 0.76rem;
      font-weight: 600;
      line-height: 1.25;
      text-align: left;
      cursor: pointer;
      transition: background 0.14s ease, border-color 0.14s ease, transform 0.14s ease;
    }
    .hc-chip:hover:not(:disabled) { background: color-mix(in srgb, var(--c-primary) 16%, var(--c-bg)); border-color: color-mix(in srgb, var(--c-primary) 60%, var(--c-border)); transform: translateY(-1px); }
    .hc-chip:disabled { opacity: 0.55; cursor: not-allowed; }

    .hc-patch {
      border: 1px solid color-mix(in srgb, var(--c-accent) 45%, var(--c-border));
      border-radius: 14px;
      padding: 0.6rem 0.7rem;
      background: color-mix(in srgb, var(--c-accent) 9%, var(--c-surface));
    }
    .hc-patch__title { margin: 0 0 0.35rem; font-size: 0.76rem; font-weight: 800; color: var(--c-text); }
    .hc-patch__list { margin: 0; padding-left: 1.1rem; color: var(--c-text); font-size: 0.76rem; line-height: 1.4; }
    .hc-patch__actions { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.55rem; }
    .hc-patch__apply, .hc-patch__dismiss {
      min-height: 44px;
      padding: 0.45rem 0.75rem;
      border-radius: 999px;
      font: inherit;
      font-size: 0.76rem;
      font-weight: 700;
      cursor: pointer;
    }
    .hc-patch__apply { border: 0; background: var(--brand-gradient); color: #fff; }
    .hc-patch__dismiss { border: 1px solid var(--c-border); background: var(--c-bg); color: var(--c-muted); }

    .hc-error { margin: 0; padding: 0.35rem 0.95rem 0; color: var(--c-danger); font-size: 0.78rem; font-weight: 500; }

    .hc-compose {
      display: flex;
      align-items: flex-end;
      gap: 0.5rem;
      padding: 0.7rem 0.7rem 0.75rem;
      border-top: 1px solid color-mix(in srgb, var(--c-border) 70%, transparent);
      background: color-mix(in srgb, var(--c-surface) 45%, var(--c-bg));
    }
    .hc-field { flex: 1 1 auto; min-width: 0; display: block; margin: 0; }
    .hc-compose textarea {
      display: block;
      width: 100%;
      min-height: 2.6rem;
      max-height: 7rem;
      resize: none;
      padding: 0.65rem 1rem;
      border-radius: 999px;
      border: 1px solid var(--c-border);
      background: var(--c-bg);
      color: var(--c-text);
      font: inherit;
      font-size: 0.875rem;
      line-height: 1.4;
      field-sizing: content;
    }
    .hc-compose textarea::placeholder { color: var(--c-muted); }
    .hc-compose textarea:focus { outline: none; border-color: color-mix(in srgb, var(--c-primary) 70%, var(--c-border)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-primary) 22%, transparent); }
    .hc-compose textarea:disabled { opacity: 0.55; cursor: not-allowed; }

    .hc-send {
      flex: none;
      width: 2.6rem;
      height: 2.6rem;
      display: grid;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: var(--brand-gradient);
      color: #fff;
      cursor: pointer;
      box-shadow: 0 8px 18px color-mix(in srgb, var(--c-primary) 32%, transparent);
      transition: transform 0.14s ease, opacity 0.14s ease;
    }
    .hc-send:hover:not(:disabled) { transform: scale(1.05); }
    .hc-send:disabled { opacity: 0.45; cursor: not-allowed; }

    .hc-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0 0.85rem 0.7rem;
      background: color-mix(in srgb, var(--c-surface) 45%, var(--c-bg));
    }
    .hc-foot__note { font-size: 0.68rem; color: var(--c-muted); line-height: 1.35; }
    .hc-link { font-size: 0.72rem; font-weight: 700; color: var(--c-primary); text-decoration: none; white-space: nowrap; }
    .hc-link:hover { text-decoration: underline; }

    @keyframes hc-rise { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes hc-msg { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes hc-dot { 0%, 80%, 100% { opacity: 0.35; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }

    @media (max-width: 420px) {
      .hc-panel { width: calc(100vw - 1.5rem); }
    }
    @media (prefers-reduced-motion: reduce) {
      .hc-panel, .hc-row, .hc-typing i { animation: none; }
      .hc-log { scroll-behavior: auto; }
      .hc-chip, .hc-send, .hc-icon-btn { transition: none; }
    }
  `],
})
export class HelpChatComponent {
  readonly chat = inject(HelpChatStore);
  /** Hosted editor listens and applies the reviewed patch through its own commit/autosave path. */
  readonly applyDesignSuggestion = output<DesignPatch>();
  private readonly locale = inject(LocaleService);
  private readonly log = viewChild<ElementRef<HTMLElement>>('log');
  private readonly input = viewChild<ElementRef<HTMLTextAreaElement>>('input');

  constructor() {
    effect(() => {
      if (!this.chat.open()) return;
      queueMicrotask(() => this.input()?.nativeElement.focus());
    });
    effect(() => {
      this.chat.messages();
      this.chat.busy();
      if (!this.chat.open()) return;
      queueMicrotask(() => this.scrollLogToEnd());
    });
  }

  send(event: Event): void {
    event.preventDefault();
    void this.chat.send();
  }

  /** Quick actions from the assistant panel (content, ATS and bounded design corrections). */
  run(action: 'quality' | 'improve' | 'ats' | 'overflow' | 'headings' | 'center'): void {
    if (this.chat.busy() || this.chat.cooldownLeft() > 0) return;
    if (action === 'quality') void this.chat.checkQuality();
    else if (action === 'improve') void this.chat.improveResume();
    else if (action === 'ats') void this.chat.checkAts();
    else if (action === 'overflow') void this.chat.fixOverflow();
    else if (action === 'headings') void this.chat.accentHeadings();
    else void this.chat.centerHeader();
  }

  /** Emits the reviewed patch and clears it; persistence remains entirely in the editor. */
  applyPatch(): void {
    const patch = this.chat.pendingDesignPatch();
    if (!patch?.ops.length) return;
    this.applyDesignSuggestion.emit(patch);
    this.chat.clearDesignPatch();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void this.chat.send();
  }

  cooldownText(): string {
    const left = this.chat.cooldownLeft();
    return left > 3600
      ? this.locale.t('chat.limitReached')
      : this.locale.t('chat.waitSeconds', { n: left });
  }

  private scrollLogToEnd(): void {
    const el = this.log()?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }
}
