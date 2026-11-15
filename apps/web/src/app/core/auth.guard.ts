import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_r, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login'], { queryParams: { next: state.url.split('#')[0] } });
  // Token handoff arrives in the URL fragment; the router preserves fragments across redirects, so strip it here.
  if (state.url.includes('access_token=')) return router.parseUrl(state.url.split('#')[0]);
  return true;
};
