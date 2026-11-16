import { Component, computed, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IonIcon, IonRouterOutlet } from '@ionic/angular/standalone';
import { TranslatePipe } from '../core/i18n/translate.pipe';

interface NavItem { path: string; label: string; key: string; icon: string; desktopOnly?: boolean }

/**
 * Responsive shell:
 * - Desktop/Side-rail: shows full list of tools.
 * - Mobile/Bottom bar: clean 4 primary destinations (Home, Resumes, Templates, Profile).
 *   Secondary tools (Insights, Career Tools, Files, Settings) are accessible via Desktop or Home/More.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [IonRouterOutlet, IonIcon, RouterLink, RouterLinkActive, TranslatePipe],
  template: `
    <div class="shell">
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
    </div>
  `,
})
export class ShellComponent {
  items: NavItem[] = [
    { path: '/dashboard', label: 'Home', key: 'nav.home', icon: 'home-outline' },
    { path: '/resumes', label: 'Resumes', key: 'nav.resumes', icon: 'document-text-outline' },
    { path: '/templates', label: 'Templates', key: 'nav.templates', icon: 'grid-outline' },
    { path: '/profile', label: 'Profile', key: 'nav.profile', icon: 'person-outline' },
    // Desktop side-rail retains direct access to tools, while hiding them from mobile bottom nav:
    { path: '/insights', label: 'Insights', key: 'nav.insights', icon: 'eye-outline', desktopOnly: true },
    { path: '/career-tools', label: 'Career tools', key: 'nav.careerTools', icon: 'briefcase-outline', desktopOnly: true },
    { path: '/files', label: 'Files', key: 'nav.files', icon: 'folder-outline', desktopOnly: true },
    { path: '/settings', label: 'Settings', key: 'nav.settings', icon: 'settings-outline', desktopOnly: true },
  ];
}
