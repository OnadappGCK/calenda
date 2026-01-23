import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class StorageService {
  constructor(@Inject(PLATFORM_ID) private readonly platformId: object) {}

  get(key: string): string | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }
    return localStorage.getItem(key);
  }

  set(key: string, value: string) {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    localStorage.setItem(key, value);
  }

  remove(key: string) {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    localStorage.removeItem(key);
  }
}
