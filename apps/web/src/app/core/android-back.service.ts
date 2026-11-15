import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { backAction } from './back-action';

export { backAction };

/** Hardware back button on Android (Capacitor). No-op in a browser. */
@Injectable({ providedIn: 'root' })
export class AndroidBackService {
  private started = false;
  constructor(private router: Router) {}

  start() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    void import('@capacitor/core').then(async ({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;
      const { App } = await import('@capacitor/app');
      void App.addListener('backButton', () => {
        const a = backAction(this.router.url, window.history.length);
        if (a === 'exit') void App.exitApp();
        else if (a === 'back') window.history.back();
        else void this.router.navigateByUrl('/dashboard');
      });
    }).catch(() => undefined);
  }
}
