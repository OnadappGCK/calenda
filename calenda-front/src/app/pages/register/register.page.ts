import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-register-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  pseudo = '';
  email = '';
  ville = '';
  lieu = '';
  password = '';
  passwordConfirmation = '';

  readonly error = signal<string | null>(null);
  readonly ok = signal<boolean>(false);

  async submit() {
    this.error.set(null);
    this.ok.set(false);

    try {
      await this.auth.register({
        pseudo: this.pseudo,
        email: this.email,
        ville: this.ville,
        lieu: this.lieu,
        password: this.password,
        passwordConfirmation: this.passwordConfirmation,
      });
      this.ok.set(true);
      await this.router.navigateByUrl('/login');
    } catch {
      this.error.set('Inscription échouée');
    }
  }
}
