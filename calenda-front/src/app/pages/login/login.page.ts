import { AfterViewInit, Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { TurnstileService } from '../../core/turnstile.service';

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
export class LoginPage implements AfterViewInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly turnstile = inject(TurnstileService);

  email = '';
  password = '';
  readonly showPassword = signal(false);
  readonly error = signal<string | null>(null);
  readonly captchaEnabled = signal<boolean>(false);
  readonly submitting = signal<boolean>(false);
  private captchaToken: string | null = null;
  private captchaWidgetId: string | null = null;

  async ngAfterViewInit() {
    const siteKey = this.turnstile.getSiteKey();
    if (!siteKey || typeof window === 'undefined') {
      return;
    }

    try {
      this.captchaWidgetId = await this.turnstile.render(
        '#loginTurnstile',
        (token) => {
          this.captchaToken = token;
        },
        () => {
          this.captchaToken = null;
        },
      );
      this.captchaEnabled.set(true);
    } catch {
      this.captchaEnabled.set(false);
      this.captchaToken = null;
      this.error.set('Captcha indisponible, recharge la page.');
    }
  }

  ngOnDestroy() {
    if (typeof window === 'undefined' || !window.turnstile || !this.captchaWidgetId) {
      return;
    }
    window.turnstile.remove(this.captchaWidgetId);
  }

  togglePasswordVisibility() {
    this.showPassword.update((value) => !value);
  }

  /** Soumet le formulaire: tente un login puis navigation, sinon affiche une erreur. */
  async submit() {
    if (this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    try {
      await this.auth.login(this.email, this.password, this.captchaToken || undefined);
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
      this.error.set('Connexion échouée');
      this.captchaToken = null;
      if (typeof window !== 'undefined' && window.turnstile && this.captchaWidgetId) {
        window.turnstile.reset(this.captchaWidgetId);
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
