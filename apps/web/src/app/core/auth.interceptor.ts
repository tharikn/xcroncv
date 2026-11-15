import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { SettingsService } from './settings.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const base = inject(SettingsService).apiBase;
  if (!req.url.startsWith(base)) return next(req);
  // Anonymous public routes (doc 41 portfolio view): never attach the session token, and a 401 there is a password prompt, not a sign-out.
  if (req.url.startsWith(base + '/public/')) return next(req);
  const t = auth.token();
  const authed = t ? req.clone({ setHeaders: { Authorization: `Bearer ${t}` } }) : req;
  return next(authed).pipe(catchError((e: HttpErrorResponse) => {
    if (e.status === 401) auth.signOut(true, true);
    return throwError(() => e);
  }));
};
