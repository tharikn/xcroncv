import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IonIcon, IonRouterOutlet } from '@ionic/angular/standalone';
import { TranslatePipe } from '../core/i18n/translate.pipe';

interface NavItem { path: string; label: string; key: string; icon: string }

/**
 * Responsive shell (doc 25): side rail on desktop, bottom bar on phones/tablets.
 * Dashboard is navigation only; Preview lives on its own route outside this shell.
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
            <li>
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
    { path: '/files', label: 'Files', key: 'nav.files', icon: 'folder-outline' },
    { path: '/templates', label: 'Templates', key: 'nav.templates', icon: 'grid-outline' },
    { path: '/insights', label: 'Insights', key: 'nav.insights', icon: 'eye-outline' },
    { path: '/career-tools', label: 'Career tools', key: 'nav.careerTools', icon: 'briefcase-outline' },
    { path: '/profile', label: 'Profile', key: 'nav.profile', icon: 'person-outline' },
    { path: '/settings', label: 'Settings', key: 'nav.settings', icon: 'settings-outline' },
  ];
}
