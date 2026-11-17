import { Injectable, signal } from '@angular/core';
import { MessageKey } from '../../core/i18n/en';

/** State for the app-wide blocking overlay rendered once by AppComponent. */
@Injectable({ providedIn: 'root' })
export class LoadingOverlayService {
  readonly visible = signal(false);
  readonly labelKey = signal<MessageKey>('common.working');

  show(labelKey: MessageKey = 'common.working') {
    this.labelKey.set(labelKey);
    this.visible.set(true);
  }

  hide() { this.visible.set(false); }
}
