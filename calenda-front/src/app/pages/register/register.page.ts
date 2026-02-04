import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { allowedProfileImagesForRole, profileImageUrl } from '../../core/profile-images';

@Component({
  selector: 'app-register-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
})
/**
 * Page d'inscription.
 * Envoie les infos à l'API via `AuthService.register`, puis redirige vers la connexion.
 */
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  pseudo = '';
  email = '';
  ville = '';
  lieu = '';
  password = '';
  passwordConfirmation = '';
  profileImage: string | null = null;

  readonly showAvatarPicker = signal<boolean>(false);
  readonly allowedAvatars = allowedProfileImagesForRole('UTILISATEUR');
  readonly profileImageUrl = profileImageUrl;

  openAvatarPicker() {
    this.showAvatarPicker.set(true);
  }

  closeAvatarPicker() {
    this.showAvatarPicker.set(false);
  }

  selectAvatar(path: string) {
    this.profileImage = path;
    this.closeAvatarPicker();
  }

  readonly error = signal<string | null>(null);
  readonly ok = signal<boolean>(false);

  /** Soumet le formulaire d'inscription puis redirige vers `/login` en cas de succès. */
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
        profileImage: this.profileImage,
      });
      this.ok.set(true);
      await this.router.navigateByUrl('/login');
    } catch {
      this.error.set('Inscription échouée');
    }
  }
}
