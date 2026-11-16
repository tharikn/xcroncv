import { Component, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { IonIcon, IonRouterOutlet } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { sparklesOutline, chatbubbleEllipsesOutline } from 'ionicons/icons';
import { TranslatePipe } from '../core/i18n/translate.pipe';

interface NavItem { path: string; label: string; key: string; icon: string; desktopOnly?: boolean }

/**
 * Responsive shell:
 * - Desktop/Side-rail: shows full list of tools.
 * - Mobile/Bottom bar: clean 4 primary destinations (Home, Resumes, Templates, Profile).
 *   Hides bottom bar during full-screen editing flows (/resumes/:id, /design, /cover-letters/:id)
 *   just like modern mobile editors (Canva, Docs, Notion).
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [IonRouterOutlet, IonIcon, RouterLink, RouterLinkActive, TranslatePipe],
  styles: [`
    @keyframes fab-pulse {
      0%, 100% { transform: scale(1); box-shadow: 0 4px 20px rgba(124, 92, 255, 0.4); }
      50% { transform: scale(1.08); box-shadow: 0 8px 32px rgba(124, 92, 255, 0.65); }
    }
    @keyframes fab-bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }
    .fab-ai-resume {
      position: fixed; bottom: 5.5rem; right: 1.5rem; z-index: 200;
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(90deg, #7c5cff 0%, #f5a524 100%);
      color: #fff; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.5rem;
      animation: fab-pulse 2s ease-in-out infinite;
      box-shadow: 0 4px 20px rgba(124, 92, 255, 0.4);
    }
    .fab-ai-resume .fab-badge {
      position: absolute; top: -4px; right: -4px;
      background: #f5a524; color: #1a1430;
      font-size: 0.6rem; font-weight: 800;
      padding: 1px 4px; border-radius: 999px;
      line-height: 1.4;
    }
    .fab-chatbot {
      position: fixed; bottom: 2rem; right: 1.5rem; z-index: 200;
      width: 56px; height: 56px; border-radius: 50%;
      background: var(--c-primary);
      color: #fff; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.5rem;
      animation: fab-bounce 3s ease-in-out infinite;
      box-shadow: 0 4px 16px rgba(109, 79, 240, 0.35);
    }
    .fab-chatbot:hover .fab-tooltip, .fab-ai-resume:hover .fab-tooltip {
      opacity: 1; transform: translateX(-8px);
    }
    .fab-tooltip {
      position: absolute; right: calc(100% + 0.5rem);
      background: var(--c-text); color: var(--c-bg);
      font-size: 0.75rem; font-weight: 600;
      padding: 0.25rem 0.6rem; border-radius: 6px;
      white-space: nowrap; opacity: 0;
      transition: opacity 0.2s, transform 0.2s;
      pointer-events: none;
    }
    @media (max-width: 991px) {
      .fab-ai-resume {
        bottom: calc(4rem + env(safe-area-inset-bottom) + 3.5rem);
      }
      .fab-chatbot {
        bottom: calc(4rem + env(safe-area-inset-bottom) + 0.5rem);
      }
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
      <main class="main"><ion-router-outlet /></main>

      <!-- FAB 1: AI Resume Generator (blinking pulse, above chatbot FAB) -->
      <button
        class="fab-ai-resume"
        [style.display]="isEditorRoute() ? 'none' : 'flex'"
        title="AI Resume Generator"
        aria-label="AI Resume Generator"
        (click)="router.navigate(['/ai-resume-generator'])">
        <ion-icon name="sparkles-outline" aria-hidden="true"></ion-icon>
        <span class="fab-badge">AI</span>
        <span class="fab-tooltip">AI Resume Generator</span>
      </button>

      <!-- FAB 2: AI Chatbot Helper (bouncing) -->
      <button
        class="fab-chatbot"
        [style.display]="isEditorRoute() ? 'none' : 'flex'"
        title="AI Assistant"
        aria-label="AI Assistant"
        (click)="router.navigate(['/ai'])">
        <ion-icon name="chatbubble-ellipses-outline" aria-hidden="true"></ion-icon>
        <span class="fab-tooltip">AI Assistant</span>
      </button>
    </div>
  `,
})
export class ShellComponent {
  router = inject(Router);
  currentUrl = '';

  constructor() {
    addIcons({ sparklesOutline, chatbubbleEllipsesOutline });
    this.currentUrl = this.router.url;
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      this.currentUrl = e.urlAfterRedirects;
    });
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
    { path: '/profile', label: 'Profile', key: 'nav.profile', icon: 'person-outline' },
    // Desktop side-rail retains direct access to tools, while hiding them from mobile bottom nav:
    { path: '/insights', label: 'Insights', key: 'nav.insights', icon: 'eye-outline', desktopOnly: true },
    { path: '/career-tools', label: 'Career tools', key: 'nav.careerTools', icon: 'briefcase-outline', desktopOnly: true },
    { path: '/ai-resume-generator', label: 'AI Resume', key: 'nav.aiResume', icon: 'sparkles-outline' },
    { path: '/files', label: 'Files', key: 'nav.files', icon: 'folder-outline', desktopOnly: true },
    { path: '/settings', label: 'Settings', key: 'nav.settings', icon: 'settings-outline', desktopOnly: true },
  ];
}
