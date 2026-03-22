import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import localeEn from '@angular/common/locales/en';
import localeEs from '@angular/common/locales/es';
import localeFr from '@angular/common/locales/fr';
import localeIt from '@angular/common/locales/it';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { API_BASE_URL } from './core/api.config';
import { authInterceptor } from './core/auth.interceptor';

/** Enregistre le locale `fr` pour les pipes Angular (DatePipe) côté browser et SSR. */
registerLocaleData(localeFr);
registerLocaleData(localeEn);
registerLocaleData(localeEs);
registerLocaleData(localeIt);
registerLocaleData(localeDe);

function resolveApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return process.env['API_BASE_URL'] ?? 'http://127.0.0.1:8000/api';
  }

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return isLocalhost ? 'http://localhost:3000/api' : '/api';
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideHttpClient(withInterceptors([authInterceptor])),
    {
      provide: LOCALE_ID,
      useValue: 'fr-FR',
    },
    {
      provide: API_BASE_URL,
      useValue: resolveApiBaseUrl(),
    },
  ]
};
