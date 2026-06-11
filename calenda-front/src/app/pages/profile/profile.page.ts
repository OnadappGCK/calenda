import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { UsersService } from '../../core/users.service';
import { allowedProfileImagesForRole, profileImageUrl } from '../../core/profile-images';

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

  readonly verifyLoading = signal<boolean>(false);
  readonly verifyToken = signal<string | null>(null);
  readonly verifyError = signal<string | null>(null);

  readonly showVerifyModal = signal<boolean>(false);
  readonly verifyModalLoading = signal<boolean>(false);
  readonly verifyModalError = signal<string | null>(null);
  verifyModalCode = '';

  private savedEmail = '';

  pseudo = '';
  email = '';
  ville = '';
  lieu = '';
  numero = '';
  bio = '';
  password = '';
  passwordConfirmation = '';
  profileImage: string | null = null;

  readonly showAvatarPicker = signal<boolean>(false);

  readonly role = computed(() => (this.auth.user()?.isAdmin ? 'ADMIN' : ''));
  readonly allowedAvatars = computed(() => allowedProfileImagesForRole(this.auth.user()?.isAdmin ?? false));
  readonly profileImageUrl = profileImageUrl;

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
        this.email = me.email;
        this.savedEmail = me.email;
        this.ville = me.ville;
        this.lieu = me.lieu;
        this.numero = me.numero ?? '';
        this.bio = me.bio ?? '';
        this.profileImage = me.profileImage ?? null;
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
    this.verifyModalCode = '';
    this.showVerifyModal.set(false);
    this.editing.set(false);
    void this.reload();
  }

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

  /** Sauvegarde : si email ou mot de passe changé, envoie d'abord le code puis ouvre la popup. */
  async save() {
    this.ok.set(false);
    this.error.set(null);

    const wantsEmailChange = this.email.trim().toLowerCase() !== this.savedEmail;
    const wantsPasswordChange = !!this.password;

    if (wantsEmailChange || wantsPasswordChange) {
      this.verifyModalCode = '';
      this.verifyModalError.set(null);
      this.verifyModalLoading.set(true);
      this.showVerifyModal.set(true);
      try {
        if (wantsEmailChange) {
          await this.usersService.requestEmailChangeVerification(this.email.trim()).toPromise();
        } else {
          await this.usersService.requestPasswordChangeVerification().toPromise();
        }
      } catch {
        this.verifyModalError.set("L'envoi du code a échoué.");
      } finally {
        this.verifyModalLoading.set(false);
      }
      return;
    }

    await this.applyUpdate('');
  }

  /** Confirme la popup de vérification et applique les modifications. */
  async confirmVerifyModal() {
    const code = this.verifyModalCode.trim();
    if (!code) {
      this.verifyModalError.set('Veuillez saisir le code reçu par e-mail.');
      return;
    }
    this.verifyModalError.set(null);
    this.verifyModalLoading.set(true);
    try {
      await this.applyUpdate(code);
      this.showVerifyModal.set(false);
      this.verifyModalCode = '';
    } catch {
    } finally {
      this.verifyModalLoading.set(false);
    }
  }

  closeVerifyModal() {
    this.showVerifyModal.set(false);
    this.verifyModalCode = '';
    this.verifyModalError.set(null);
  }

  private async applyUpdate(verificationCode: string) {
    try {
      await this.usersService
        .updateMe({
          email: this.email,
          pseudo: this.pseudo,
          ville: this.ville,
          lieu: this.lieu,
          numero: this.numero.trim() || null,
          bio: this.bio.trim() || null,
          profileImage: this.profileImage,
          password: this.password || undefined,
          passwordConfirmation: this.passwordConfirmation || undefined,
          emailVerificationCode: verificationCode || undefined,
        })
        .toPromise();

      await this.auth.refreshMe();
      this.password = '';
      this.passwordConfirmation = '';
      this.editing.set(false);
      this.ok.set(true);
    } catch (e: any) {
      const code =
        typeof e?.error?.message === 'string'
          ? e.error.message
          : Array.isArray(e?.error?.message)
            ? e.error.message[0]
            : null;

      const msg =
        code === 'verification_code_required' ? 'Code de vérification e-mail requis.' :
        code === 'verification_code_invalid'   ? 'Code de vérification invalide.' :
        code === 'verification_code_expired'   ? 'Code de vérification expiré.' :
        code === 'email_already_used'          ? 'Cette adresse e-mail est déjà utilisée.' :
        'Sauvegarde impossible';

      if (this.showVerifyModal()) {
        this.verifyModalError.set(msg);
      } else {
        this.error.set(msg);
      }
      throw e;
    }
  }

  async requestEmailVerification() {
    this.verifyError.set(null);
    this.verifyToken.set(null);
    this.verifyLoading.set(true);
    try {
      await this.usersService.requestEmailVerification().toPromise();
      this.verifyToken.set('sent');
    } catch {
      this.verifyError.set('Envoi du lien impossible.');
    } finally {
      this.verifyLoading.set(false);
    }
  }
}
