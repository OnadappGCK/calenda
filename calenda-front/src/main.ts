import { bootstrapApplication } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { appConfig } from './app/app.config';
import { App } from './app/app';

registerLocaleData(localeFr);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
