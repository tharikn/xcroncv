import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { App as CapacitorApp, type URLOpenListenerEvent } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { LoadingOverlayService } from '../shared/loading/loading-overlay.service';
import { AuthService } from './auth.service';
import { NATIVE_HANDOFF_REDIRECT, parseHandoffLink, type HandoffLink } from './native-handoff.logic';
import { SettingsService } from './settings.service';

/**
 * Signs the standalone APK in when it is opened by X Cron Jobs through
 * `xcroncv://auth/callback`. Works for a cold start (`getLaunchUrl`) and while already
 * running (`appUrlOpen`). The spinner is state-driven so the user always sees progress.
 */
@Injectable({ providedIn: 'root' })
export class NativeHandoffService {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly settings = inject(SettingsService);
  private readonly overlay = inject(LoadingOverlayService);

  /** True when the last native handoff could not be redeemed (login page explains it). */
  readonly failed = signal(false);
  private running: Promise<boolean> | null = null;
  private listening = false;
  private handledCode = '';

  /**
   * Called from APP_INITIALIZER, so a cold-start deep link is redeemed before the first
   * route guard runs. Resolves quickly when the app was opened from the launcher.
   */
  async init(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    if (!this.listening) {
      this.listening = true;
      await CapacitorApp.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
        void this.handleUrl(event.url, true);
      }).catch(() => undefined);
    }
    const launch = await Promise.race([
      CapacitorApp.getLaunchUrl().catch(() => null),
      // Never let a misbehaving bridge keep the splash up forever.
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_000)),
    ]);
    if (launch?.url) await this.handleUrl(launch.url, false);
  }

  /**
   * Redeems a deep link. `navigate=false` is used for a cold start (the router has not
   * started yet; the guard picks up the new session). Returns true if it was a handoff URL.
   */
  async handleUrl(rawUrl: string, navigate: boolean): Promise<boolean> {
    const link = parseHandoffLink(rawUrl);
    if (!link) return false;
    // getLaunchUrl and appUrlOpen can both deliver the cold-start intent on some devices.
    if (link.code === this.handledCode) return true;
    if (this.running) {
      await this.running.catch(() => false);
      return true;
    }

    this.failed.set(false);
    this.overlay.show('handoff.signingIn');
    this.running = this.exchange(link)
      .then(async (ok) => {
        if (!ok) return false;
        this.handledCode = link.code;
        if (navigate) await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
        return true;
      })
      .catch(() => false)
      .finally(() => {
        this.running = null;
        this.overlay.hide();
      });

    const ok = await this.running;
    if (!ok) this.failed.set(true);
    return true;
  }

  private async exchange(link: HandoffLink): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${this.settings.apiBase}/auth/exchange`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: link.code,
          nonce: link.nonce,
          redirectUri: NATIVE_HANDOFF_REDIRECT,
        }),
        signal: controller.signal,
      });
      if (!res.ok) return false;
      const body = (await res.json()) as { access_token?: string };
      return !!body.access_token && this.auth.signInWithToken(body.access_token);
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
