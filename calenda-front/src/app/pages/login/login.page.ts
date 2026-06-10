import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

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
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  readonly showPassword = signal(false);
  readonly error = signal<string | null>(null);

  togglePasswordVisibility() {
    this.showPassword.update((value) => !value);
  }

  /** Soumet le formulaire: tente un login puis navigation, sinon affiche une erreur. */
  async submit() {
    this.error.set(null);

    try {
      await this.auth.login(this.email, this.password);
      await this.router.navigateByUrl('/calendar');
    } catch {
      this.error.set('Connexion échouée');
    }
  }
}
