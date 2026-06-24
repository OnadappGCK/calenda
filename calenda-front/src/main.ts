import { bootstrapApplication } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import localeEn from '@angular/common/locales/en';
import localeEs from '@angular/common/locales/es';
import localeFr from '@angular/common/locales/fr';
import localeIt from '@angular/common/locales/it';
import { appConfig } from './app/app.config';
import { App } from './app/app';

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

registerLocaleData(localeFr);
registerLocaleData(localeEn);
registerLocaleData(localeEs);
registerLocaleData(localeIt);
registerLocaleData(localeDe);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
