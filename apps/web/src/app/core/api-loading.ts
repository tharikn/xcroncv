import { HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingCounter, isSilentUrl } from './api-loading-counter';
import { SettingsService } from './settings.service';

/** Global in-flight indicator state. `visible` is true once any request has been pending a moment. */
@Injectable({ providedIn: 'root' })
export class ApiLoadingService {
  readonly visible = signal(false);
  private counter = new LoadingCounter((v) => this.visible.set(v));
  begin() { this.counter.begin(); }
  end() { this.counter.end(); }
}

export const apiLoadingInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(SettingsService).apiBase;
  if (!req.url.startsWith(base) || isSilentUrl(req.url)) return next(req);
  const loading = inject(ApiLoadingService);
  loading.begin();
  return next(req).pipe(finalize(() => loading.end()));
};
