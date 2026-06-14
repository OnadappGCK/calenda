import { Injectable } from '@angular/core';

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
    };
    __CALENDA_CONFIG__?: {
      turnstileSiteKey?: string;
    };
  }
}

@Injectable({ providedIn: 'root' })
export class TurnstileService {
  private loadingPromise: Promise<void> | null = null;

  getSiteKey(): string {
    if (typeof window === 'undefined') {
      return '';
    }
    return (window.__CALENDA_CONFIG__?.turnstileSiteKey ?? '').trim();
  }

  async ensureLoaded(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    if (window.turnstile) {
      return;
    }

    if (!this.loadingPromise) {
      this.loadingPromise = new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile="1"]');
        if (existing) {
          existing.addEventListener('load', () => resolve(), { once: true });
          existing.addEventListener('error', () => reject(new Error('turnstile_load_failed')), {
            once: true,
          });
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset['turnstile'] = '1';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('turnstile_load_failed'));
        document.head.appendChild(script);
      }).finally(() => {
        this.loadingPromise = null;
      });
    }

    await this.loadingPromise;
  }

  async render(
    container: string | HTMLElement,
    onToken: (token: string) => void,
    onExpired: () => void,
  ): Promise<string> {
    await this.ensureLoaded();

    if (!window.turnstile) {
      throw new Error('turnstile_unavailable');
    }

    const siteKey = this.getSiteKey();
    if (!siteKey) {
      throw new Error('turnstile_missing_site_key');
    }

    return window.turnstile.render(container, {
      sitekey: siteKey,
      callback: (token: string) => onToken(token),
      'expired-callback': () => onExpired(),
      'error-callback': () => onExpired(),
    });
  }
}
