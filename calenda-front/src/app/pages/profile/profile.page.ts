import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { UsersService } from '../../core/users.service';

@Component({
  selector: 'app-profile-page',
  imports: [FormsModule],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
})
/**
 * Page Profil.
 * Affiche le profil courant, permet l'édition et la mise à jour via `UsersService`.
 */
export class ProfilePage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly usersService = inject(UsersService);

  readonly loading = signal<boolean>(false);
  readonly editing = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly ok = signal<boolean>(false);

  pseudo = '';
  ville = '';
  lieu = '';
  password = '';
  passwordConfirmation = '';

  readonly role = computed(() => this.auth.user()?.role ?? '');

  /** Hook Angular: charge l'utilisateur puis récupère le profil. */
  async ngOnInit() {
    await this.auth.ensureLoaded();
    await this.reload();
  }

  /** Recharge les infos profil depuis l'API et met à jour les champs du formulaire. */
  async reload() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const me = await this.usersService.me().toPromise();
      if (me) {
        this.pseudo = me.pseudo;
        this.ville = me.ville;
        this.lieu = me.lieu;
      }
    } finally {
      this.loading.set(false);
    }
  }

  /** Passe le formulaire en mode édition. */
  startEdit() {
    this.ok.set(false);
    this.error.set(null);
    this.editing.set(true);
  }

  /** Annule l'édition, réinitialise les mots de passe et recharge les infos. */
  cancelEdit() {
    this.password = '';
    this.passwordConfirmation = '';
    this.editing.set(false);
    void this.reload();
  }

  /** Sauvegarde les modifications (et mot de passe si renseigné), puis rafraîchit l'utilisateur courant. */
  async save() {
    this.ok.set(false);
    this.error.set(null);

    try {
      await this.usersService
        .updateMe({
          pseudo: this.pseudo,
          ville: this.ville,
          lieu: this.lieu,
          password: this.password || undefined,
          passwordConfirmation: this.passwordConfirmation || undefined,
        })
        .toPromise();

      await this.auth.refreshMe();
      this.password = '';
      this.passwordConfirmation = '';
      this.editing.set(false);
      this.ok.set(true);
    } catch {
      this.error.set('Sauvegarde impossible');
    }
  }
}
