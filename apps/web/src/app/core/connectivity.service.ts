import { Injectable, signal } from '@angular/core';

/** Browser online/offline state for the offline banner. Re-checked when a native app resumes. */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  private started = false;

  start() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    this.online.set(navigator.onLine);
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));
    void import('@capacitor/core').then(async ({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;
      const { App } = await import('@capacitor/app');
      void App.addListener('appStateChange', ({ isActive }) => { if (isActive) this.online.set(navigator.onLine); });
    }).catch(() => undefined);
  }
}
