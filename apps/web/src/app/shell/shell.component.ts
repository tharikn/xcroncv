import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { IonIcon, IonRouterOutlet } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chatbubbleEllipsesOutline, closeOutline, flashOutline, personOutline, sparklesOutline } from 'ionicons/icons';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { HelpChatStore } from '../core/help-chat.api';
import { HelpChatComponent } from '../shared/help-chat/help-chat.component';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';

interface NavItem { path: string; label: string; key: string; icon: string; desktopOnly?: boolean }

/**
 * Responsive shell:
 * - Desktop/Side-rail: shows full list of tools.
 * - Mobile/Bottom bar: clean 4 primary destinations (Home, Resumes, Templates, Profile).
 *   Hides bottom bar during full-screen editing flows (/resumes/:id, /design, /cover-letters/:id)
 *   just like modern mobile editors (Canva, Docs, Notion).
 *
 * The bottom-right dock stacks both floating actions with a fixed gap, so the AI Resume
 * button and the assistant button never touch. The assistant opens a console in place;
 * it no longer navigates to a page.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  providers: [HelpChatStore],
  imports: [IonRouterOutlet, IonIcon, RouterLink, RouterLinkActive, TranslatePipe, HelpChatComponent],
  styles: [`
    @keyframes fab-in {
      from { opacity: 0; transform: translateY(8px) scale(0.9); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes fab-blink {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.35; transform: scale(0.9); }
    }

    /* One dock owns the corner: consistent gap, no overlap at any width. */
    .fab-dock {
      position: fixed;
      right: max(1.25rem, calc(env(safe-area-inset-right) + 1rem));
      bottom: max(2rem, calc(env(safe-area-inset-bottom) + 1.25rem));
      z-index: 200;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.9rem;
    }

    .fab {
      position: relative;
      width: 56px;
      height: 56px;
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      border: 0;
      color: #fff;
      font-size: 1.5rem;
      cursor: pointer;
      transition: transform 0.18s ease, box-shadow 0.18s ease;
    }
    .fab:hover { transform: translateY(-2px) scale(1.04); }
    .fab:active { transform: scale(0.97); }

    .fab-ai-resume {
      background: var(--brand-gradient);
      animation: fab-in 260ms ease-out;
      box-shadow: 0 8px 24px rgba(124, 92, 255, 0.42);
    }
    .fab-ai-resume .fab-badge {
      position: absolute; top: -4px; right: -4px;
      background: #f5a524; color: #1a1430;
      font-size: 0.6rem; font-weight: 800;
      padding: 1px 5px; border-radius: 999px;
      line-height: 1.4;
      box-shadow: 0 2px 8px rgba(20, 8, 48, 0.3);
    }
    .fab-new {
      position: absolute; top: -8px; left: -10px;
      background: var(--c-ok); color: #fff;
      font-size: 0.55rem; font-weight: 800; letter-spacing: 0.04em;
      padding: 2px 6px; border-radius: 999px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
      animation: fab-blink 1.6s ease-in-out infinite;
    }

    .fab-chatbot {
      background: var(--c-primary);
      animation: fab-in 260ms ease-out;
      box-shadow: 0 8px 22px color-mix(in srgb, var(--c-primary) 45%, transparent);
      border: 1px solid color-mix(in srgb, #fff 16%, transparent);
    }
    .fab-chatbot.is-open {
      animation: none;
      background: var(--c-text);
      color: var(--c-bg);
      box-shadow: 0 8px 22px rgba(10, 6, 24, 0.35);
    }

    .fab-tooltip {
      position: absolute; right: calc(100% + 0.6rem);
      background: var(--c-text); color: var(--c-bg);
      font-size: 0.75rem; font-weight: 600;
      padding: 0.28rem 0.6rem; border-radius: 8px;
      white-space: nowrap; opacity: 0;
      transform: translateX(4px);
      transition: opacity 0.18s ease, transform 0.18s ease;
      pointer-events: none;
      box-shadow: 0 6px 16px rgba(10, 6, 24, 0.25);
    }
    .fab:hover .fab-tooltip, .fab:focus-visible .fab-tooltip { opacity: 1; transform: translateX(0); }

    @media (hover: none) {
      .fab-tooltip { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .fab-ai-resume, .fab-chatbot, .fab-new { animation: none; }
    }    /* Clear the mobile bottom bar (≈3.5rem + safe area) and keep the same gap. */
    @media (max-width: 991.98px) {
      .fab-dock {
        bottom: calc(3.85rem + env(safe-area-inset-bottom) + 0.55rem);
        right: max(1rem, calc(env(safe-area-inset-right) + 0.85rem));
        gap: 0.85rem;
      }
      .fab { width: 52px; height: 52px; font-size: 1.4rem; }
    }
  `],
  template: `
    <div class="shell" [class.editor-immersive]="isEditorRoute()">
      <nav class="nav" [attr.aria-label]="'nav.primary' | t">
        <a class="brand" routerLink="/dashboard" [attr.aria-label]="'nav.homeAria' | t"><span class="brand-mark">X</span><span class="brand-name">XCron CV</span></a>
        <ul>
          @for (n of items; track n.path) {
            <li [class.desktop-only]="n.desktopOnly">
              <a [routerLink]="n.path" routerLinkActive="active" [attr.data-testid]="'nav-' + n.label.toLowerCase().replace(' ', '-')" [attr.data-tour]="'nav-' + n.label.toLowerCase().replace(' ', '-')">
                <ion-icon [name]="n.icon" aria-hidden="true"></ion-icon><span>{{ n.key | t }}</span>
              </a>
            </li>
          }
        </ul>
      </nav>
      <header class="topbar" aria-label="Top bar">
        <div class="topbar-spacer"></div>
        <a class="topbar-profile" routerLink="/profile" routerLinkActive="active" data-testid="nav-profile" data-tour="nav-profile" [attr.aria-label]="profileLabel()">
          <span class="topbar-avatar" aria-hidden="true">{{ avatarText() }}</span>
          <span class="topbar-username">{{ profileLabel() }}</span>
        </a>
      </header>
      <main class="main"><ion-router-outlet /></main>

      <!-- Floating action dock: assistant console + AI Resume generator, always separated. -->
      <div class="fab-dock" [style.display]="isEditorRoute() ? 'none' : 'flex'">
        @if (!isEditorRoute()) {
          <app-help-chat />
        }

        <button
          class="fab fab-ai-resume"
          data-testid="fab-ai-resume"
          [attr.title]="'nav.aiResume' | t"
          [attr.aria-label]="'nav.aiResume' | t"
          (click)="router.navigate(['/ai-resume-generator'])">
          <ion-icon name="sparkles-outline" aria-hidden="true"></ion-icon>
          <span class="fab-badge">AI</span>
          <span class="fab-new">{{ 'shell.newBadge' | t }}</span>
          <span class="fab-tooltip">{{ 'nav.aiResume' | t }}</span>
        </button>

        @if (chat.available()) {
          <button
            class="fab fab-chatbot"
            data-testid="fab-chatbot"
            [class.is-open]="chat.open()"
            aria-controls="xcron-help"
            [attr.aria-expanded]="chat.open()"
            [attr.title]="(chat.open() ? 'chat.close' : 'chat.open') | t"
            [attr.aria-label]="(chat.open() ? 'chat.close' : 'chat.open') | t"
            (click)="chat.toggle()">
            <ion-icon [name]="chat.open() ? 'close-outline' : 'chatbubble-ellipses-outline'" aria-hidden="true"></ion-icon>
            <span class="fab-tooltip">{{ (chat.open() ? 'chat.close' : 'chat.open') | t }}</span>
          </button>
        }
      </div>
    </div>
  `,
})
export class ShellComponent {
  router = inject(Router);
  readonly chat = inject(HelpChatStore);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  currentUrl = '';
  readonly profileName = signal('');
  readonly profileLabel = computed(() => this.profileName() || this.auth.subject() || 'Profile');
  readonly avatarText = computed(() => this.initials(this.profileLabel()));

  constructor() {
    addIcons({ sparklesOutline, chatbubbleEllipsesOutline, closeOutline, personOutline, flashOutline });
    void this.chat.load();
    this.currentUrl = this.router.url;
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      this.currentUrl = e.urlAfterRedirects;
      this.loadProfileName();
    });
    this.loadProfileName();
  }

  private loadProfileName() {
    this.api.getProfile().subscribe({
      next: (p) => this.profileName.set((p?.fullName || '').trim()),
      error: () => {},
    });
  }

  private initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'U';
    if (parts.length === 1) {
      const w = parts[0].replace(/[^A-Za-z0-9]/g, '');
      return (w.slice(0, 2) || w.slice(0, 1) || 'U').toUpperCase();
    }
    return ((parts[0][0] || '') + (parts[parts.length - 1][0] || '')).toUpperCase() || 'U';
  }

  isEditorRoute(): boolean {
    return /^\/(resumes\/[^/]+|cover-letters\/[^/]+)/.test(this.currentUrl) &&
      !/^\/resumes\/?(\?.*)?$/.test(this.currentUrl) &&
      !/^\/cover-letters\/?(\?.*)?$/.test(this.currentUrl);
  }

  items: NavItem[] = [
    { path: '/dashboard', label: 'Home', key: 'nav.home', icon: 'home-outline' },
    { path: '/resumes', label: 'Resumes', key: 'nav.resumes', icon: 'document-text-outline' },
    { path: '/templates', label: 'Templates', key: 'nav.templates', icon: 'grid-outline' },
    // Desktop side-rail retains direct access to tools, while hiding them from mobile bottom nav:
    { path: '/insights', label: 'Insights', key: 'nav.insights', icon: 'eye-outline', desktopOnly: true },
    { path: '/career-tools', label: 'Career tools', key: 'nav.careerTools', icon: 'briefcase-outline', desktopOnly: true },
    { path: '/ai-resume-generator', label: 'AI Resume', key: 'nav.aiResume', icon: 'sparkles-outline' },
    { path: '/quick-build', label: 'Quick Build', key: 'nav.quickBuild', icon: 'flash-outline' },
    { path: '/files', label: 'Files', key: 'nav.files', icon: 'folder-outline', desktopOnly: true },
    { path: '/settings', label: 'Settings', key: 'nav.settings', icon: 'settings-outline', desktopOnly: true },
  ];
}
