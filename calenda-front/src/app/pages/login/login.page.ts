import { Component, inject, signal, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: {
        sitekey: string;
        callback?: (token: string) => void;
        'error-callback'?: () => void;
        'expired-callback'?: () => void;
        theme?: 'light' | 'dark' | 'auto';
      }) => string;
      reset?: (widgetId: string) => void;
    };
  }
}

@Component({
  selector: 'app-login-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
/**
 * Page de connexion.
 * Authentifie l'utilisateur via `AuthService` puis redirige vers le calendrier.
 */
export class LoginPage implements AfterViewInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  @ViewChild('captchaContainer', { static: true }) captchaContainer!: ElementRef<HTMLDivElement>;

  email = '';
  password = '';
  captchaToken: string | null = null;
  turnstileWidgetId: string | null = null;
  turnstileLoaded = false;
  readonly turnstileError = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly error = signal<string | null>(null);

  ngAfterViewInit() {
    if (!environment.turnstileSiteKey) {
      return;
    }
    void this.loadTurnstile().then(() => this.renderTurnstile()).catch(() => {
      this.turnstileError.set('Impossible de charger le captcha.');
    });
  }

  private loadTurnstile(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window !== 'undefined' && window.turnstile) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject();
      document.head.appendChild(script);
    });
  }

  private renderTurnstile() {
    if (!window.turnstile || !this.captchaContainer?.nativeElement) {
      return;
    }
    this.turnstileWidgetId = window.turnstile.render(this.captchaContainer.nativeElement, {
      sitekey: environment.turnstileSiteKey,
      callback: (token) => {
        this.captchaToken = token;
        this.turnstileError.set(null);
      },
      'error-callback': () => {
        this.captchaToken = null;
        this.turnstileError.set('Erreur captcha. Veuillez réessayer.');
      },
      'expired-callback': () => {
        this.captchaToken = null;
      },
      theme: 'auto',
    });
    this.turnstileLoaded = true;
  }

  resetCaptcha() {
    this.captchaToken = null;
    if (this.turnstileWidgetId && window.turnstile?.reset) {
      window.turnstile.reset(this.turnstileWidgetId);
    }
  }

  togglePasswordVisibility() {
    this.showPassword.update((value) => !value);
  }

  /** Soumet le formulaire: tente un login puis navigation, sinon affiche une erreur. */
  async submit() {
    this.error.set(null);

    try {
      await this.auth.login(this.email, this.password, this.captchaToken ?? undefined);
      await this.router.navigateByUrl('/calendar');
    } catch (e: any) {
      const code =
        typeof e?.error?.message === 'string'
          ? e.error.message
          : Array.isArray(e?.error?.message)
            ? e.error.message[0]
            : null;
      if (code === 'email_not_verified') {
        this.error.set('Votre compte n\'est pas encore vérifié. Vérifiez votre e-mail puis cliquez sur le lien reçu.');
        return;
      }
      if (code === 'captcha_required') {
        this.error.set('Captcha requis.');
      } else if (code === 'captcha_invalid') {
        this.error.set('Captcha invalide. Veuillez réessayer.');
      } else {
        this.error.set('Connexion échouée');
      }
      this.resetCaptcha();
    }
  }
}
