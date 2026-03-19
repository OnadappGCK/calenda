import { Injectable, computed, signal } from '@angular/core';
import { LanguageCode, LanguageOption, TranslationTree } from './i18n.types';
import { TRANSLATIONS } from './i18n/translations';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly storageKey = 'lang';

  readonly availableLanguages: readonly LanguageOption[] = [
    { code: 'fr', flag: '🇫🇷', label: 'Français' },
    { code: 'en', flag: '🇬🇧', label: 'English' },
    { code: 'es', flag: '🇪🇸', label: 'Español' },
    { code: 'it', flag: '🇮🇹', label: 'Italiano' },
    { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
  ];

  readonly lang = signal<LanguageCode>('fr');

  readonly currentLanguage = computed(() => {
    const active = this.lang();
    return this.availableLanguages.find((x) => x.code === active) ?? this.availableLanguages[0];
  });

  constructor() {
    this.initLanguage();
  }

  setLanguage(lang: LanguageCode) {
    if (!this.isSupported(lang)) {
      return;
    }

    this.lang.set(lang);

    if (typeof document !== 'undefined') {
      document.documentElement.lang = this.toHtmlLang(lang);
    }

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(this.storageKey, lang);
      } catch {
        // ignore
      }
    }
  }

  t(key: string, params?: Record<string, string | number>): string {
    const active = this.lang();
    const raw = this.lookup(active, key) ?? this.lookup('fr', key) ?? key;

    if (!params) {
      return raw;
    }

    return raw.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, p: string) => `${params[p] ?? ''}`);
  }

  private initLanguage() {
    const fromStorage = this.readStorage();
    if (fromStorage) {
      this.setLanguage(fromStorage);
      return;
    }

    const browserLang = this.readBrowserLang();
    this.setLanguage(browserLang ?? 'fr');
  }

  private readStorage(): LanguageCode | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = (window.localStorage.getItem(this.storageKey) ?? '').toLowerCase();
      return this.toLanguageCode(raw);
    } catch {
      return null;
    }
  }

  private readBrowserLang(): LanguageCode | null {
    if (typeof navigator === 'undefined') return null;
    const raw = (navigator.language ?? '').toLowerCase();
    const short = raw.split('-')[0] ?? '';
    return this.toLanguageCode(short);
  }

  private toLanguageCode(raw: string): LanguageCode | null {
    const value = raw as LanguageCode;
    return this.isSupported(value) ? value : null;
  }

  private isSupported(value: string): value is LanguageCode {
    return this.availableLanguages.some((x) => x.code === value);
  }

  private lookup(lang: LanguageCode, key: string): string | null {
    const parts = key.split('.');
    let node: string | TranslationTree | undefined = TRANSLATIONS[lang];

    for (const part of parts) {
      if (!node || typeof node === 'string') {
        return null;
      }
      node = node[part];
    }

    return typeof node === 'string' ? node : null;
  }

  private toHtmlLang(code: LanguageCode): string {
    if (code === 'fr') return 'fr-FR';
    if (code === 'en') return 'en-GB';
    if (code === 'es') return 'es-ES';
    if (code === 'it') return 'it-IT';
    return 'de-DE';
  }
}
