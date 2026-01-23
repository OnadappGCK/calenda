import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
/**
 * Service de stockage côté navigateur.
 * Encapsule `localStorage` et désactive l'accès en SSR (server-side rendering).
 */
export class StorageService {
  constructor(@Inject(PLATFORM_ID) private readonly platformId: object) {}

  /** Récupère une valeur depuis `localStorage` (ou null si SSR/non dispo). */
  get(key: string): string | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }
    return localStorage.getItem(key);
  }

  /** Écrit une valeur dans `localStorage` (no-op si SSR). */
  set(key: string, value: string) {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    localStorage.setItem(key, value);
  }

  /** Supprime une valeur de `localStorage` (no-op si SSR). */
  remove(key: string) {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    localStorage.removeItem(key);
  }
}
