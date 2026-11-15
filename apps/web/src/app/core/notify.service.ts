import { Injectable } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { activeLocale, translate } from './i18n/locale.service';
import { errorMessage } from './error-message';

export { errorMessage };

@Injectable({ providedIn: 'root' })
export class NotifyService {
  constructor(private toasts: ToastController, private alerts: AlertController) {}

  async toast(message: string, tone: 'ok' | 'error' = 'ok') {
    const t = await this.toasts.create({
      message, duration: tone === 'error' ? 5000 : 2500, position: 'top', cssClass: `toast-${tone}`,
      buttons: [{ text: translate(activeLocale(), 'common.dismiss'), role: 'cancel' }],
    });
    await t.present();
  }

  async confirm(header: string, message: string, confirmText = 'Delete'): Promise<boolean> {
    const a = await this.alerts.create({
      header, message,
      buttons: [{ text: translate(activeLocale(), 'common.cancel'), role: 'cancel' }, { text: confirmText, role: 'confirm', cssClass: 'alert-danger' }],
    });
    await a.present();
    const { role } = await a.onDidDismiss();
    return role === 'confirm';
  }
}
