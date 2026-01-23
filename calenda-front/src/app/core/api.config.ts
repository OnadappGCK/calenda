import { InjectionToken } from '@angular/core';

/** Token d'injection Angular contenant l'URL de base de l'API backend. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');
