import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { APP_INITIALIZER, ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, RouteReuseStrategy, withComponentInputBinding } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { routes } from './app.routes';
import { apiLoadingInterceptor } from './core/api-loading';
import { authInterceptor } from './core/auth.interceptor';
import { NativeHandoffService } from './core/native-handoff.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: 'md', animated: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, apiLoadingInterceptor])),
    {
      // A cold start from xcroncv://auth/callback must redeem the code before the first guard,
      // so the user lands on the dashboard instead of the login page.
      provide: APP_INITIALIZER,
      multi: true,
      deps: [NativeHandoffService],
      useFactory: (handoff: NativeHandoffService) => () => handoff.init(),
    },
  ],
};
