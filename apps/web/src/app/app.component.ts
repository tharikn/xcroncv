import { Component, OnInit, effect, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { AndroidBackService } from './core/android-back.service';
import { ApiLoadingService } from './core/api-loading';
import { AuthService } from './core/auth.service';
import { ConnectivityService } from './core/connectivity.service';
import { TranslatePipe } from './core/i18n/translate.pipe';
import { PreferencesService } from './core/preferences.service';
import { ThemeService } from './core/theme.service';
import { TourComponent } from './shared/tour/tour.component';
import { TourService } from './shared/tour/tour.service';
import { addIcons } from 'ionicons';
import { registerCareerToolIcons } from './core/career-tools.icons';
import {
  addOutline, arrowBackOutline, chevronDownOutline, chevronUpOutline, cloudDownloadOutline, copyOutline, documentTextOutline,
  eyeOutline, folderOpenOutline, gridOutline, homeOutline, logOutOutline, personOutline, saveOutline, searchOutline,
  settingsOutline, shareOutline, trashOutline, removeOutline, expandOutline, checkmarkCircleOutline, alertCircleOutline, folderOutline, openOutline, createOutline, cloudUploadOutline, documentAttachOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet, TranslatePipe, TourComponent],
  template: `
    @if (loading.visible()) {
      <div class="api-progress" role="status" aria-live="polite" data-testid="api-progress"><span class="sr-only">{{ 'common.working' | t }}</span><span class="bar" aria-hidden="true"></span></div>
    }
    @if (!conn.online()) { <div class="offline-banner" role="status" data-testid="offline-banner">{{ 'common.offline' | t }}</div> }
    <ion-app><ion-router-outlet /></ion-app>
    <app-tour />`,
})
export class AppComponent implements OnInit {
  loading = inject(ApiLoadingService);
  conn = inject(ConnectivityService);
  private theme = inject(ThemeService);
  private prefs = inject(PreferencesService);
  private auth = inject(AuthService);
  private back = inject(AndroidBackService);
  private tour = inject(TourService);

  ngOnInit() {
    this.theme.init();
    this.conn.start();
    this.back.start();
    // Boot splash covers only Angular start-up; it never waits on HTTP (pages show skeletons instead).
    const splash = document.getElementById('boot-splash');
    if (splash) { splash.classList.add('done'); setTimeout(() => splash.remove(), 250); }
    void this.prefs.hydrate();
  }

  constructor() {
    // Account preferences are pulled whenever a session starts (sign-in after load).
    effect(() => { if (this.auth.isAuthenticated()) void this.prefs.hydrate(); });
    // First-time guided tour: starts once per user after sign-in (delay lets the first page render its targets).
    effect((onCleanup) => {
      if (!this.auth.isAuthenticated()) return;
      const t = setTimeout(() => this.tour.maybeStart(), 1200);
      onCleanup(() => clearTimeout(t));
    });
    registerCareerToolIcons();
    addIcons({
      addOutline, arrowBackOutline, chevronDownOutline, chevronUpOutline, cloudDownloadOutline, copyOutline, documentTextOutline,
      eyeOutline, folderOpenOutline, gridOutline, homeOutline, logOutOutline, personOutline, saveOutline, searchOutline,
      settingsOutline, shareOutline, trashOutline, removeOutline, expandOutline, checkmarkCircleOutline, alertCircleOutline, folderOutline, openOutline, createOutline, cloudUploadOutline, documentAttachOutline,
    });
  }
}
