import { Pipe, PipeTransform, inject } from '@angular/core';
import { LocaleService } from './locale.service';

/** {{ 'nav.home' | t }} or {{ 'dash.welcomeName' | t: { name: x } }}. Impure so it follows the active-language signal. */
@Pipe({ name: 't', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private locale = inject(LocaleService);
  transform(key: string, params?: Record<string, string | number | null>): string { return this.locale.t(key, params); }
}
