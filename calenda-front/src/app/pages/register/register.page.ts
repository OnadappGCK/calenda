import { AfterViewInit, Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { allowedProfileImagesForRole, profileImageUrl } from '../../core/profile-images';
import { PhotonFeature, PhotonService } from '../../core/photon.service';
import { TurnstileService } from '../../core/turnstile.service';

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
export class RegisterPage implements AfterViewInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly photon = inject(PhotonService);
  private readonly turnstile = inject(TurnstileService);

  pseudo = '';
  email = '';
  adresse = '';
  ville: string | null = null;
  numero = '';
  password = '';
  passwordConfirmation = '';
  profileImage: string | null = null;

  readonly adresseSuggestions = signal<PhotonFeature[]>([]);
  readonly adresseSuggestOpen = signal<boolean>(false);
  private adresseSuggestToken = 0;

  readonly showAvatarPicker = signal<boolean>(false);
  readonly allowedAvatars = allowedProfileImagesForRole(false);
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
  readonly captchaEnabled = signal<boolean>(false);
  readonly submitting = signal<boolean>(false);
  private captchaToken: string | null = null;
  private captchaWidgetId: string | null = null;

  private parseErrorMessage(e: unknown): string {
    const fallback = 'Inscription échouée';
    if (!(e instanceof HttpErrorResponse)) {
      return fallback;
    }

    const d: any = e.error;
    const code: string | null =
      typeof d === 'string'
        ? d
        : typeof d?.message === 'string'
          ? d.message
          : Array.isArray(d?.message)
            ? (d.message[0] ?? null)
            : null;

    switch (code) {
      case 'email_already_used':
        return "Cette adresse email est déjà utilisée.";
      case 'pseudo_already_used':
        return 'Ce pseudo est déjà utilisé.';
      case 'email_invalid':
        return "L'adresse email n'est pas valide.";
      case 'email_required':
        return "L'adresse email est obligatoire.";
      case 'pseudo_required':
        return 'Le pseudo est obligatoire.';
      case 'pseudo_too_short':
        return 'Le pseudo est trop court.';
      case 'pseudo_too_long':
        return 'Le pseudo est trop long.';
      case 'adresse_required':
        return "L'adresse est obligatoire.";
      case 'adresse_too_short':
        return "L'adresse est trop courte.";
      case 'adresse_too_long':
        return "L'adresse est trop longue.";
      case 'password_required':
        return 'Le mot de passe est obligatoire.';
      case 'password_too_short':
        return 'Le mot de passe doit contenir au moins 8 caractères.';
      case 'password_too_long':
        return 'Le mot de passe est trop long.';
      case 'password_mismatch':
        return 'Les mots de passe ne correspondent pas.';
      case 'password_confirmation_required':
        return 'La confirmation du mot de passe est obligatoire.';
      case 'captcha_required':
        return 'Captcha requis.';
      case 'captcha_invalid':
        return 'Captcha invalide, merci de réessayer.';
      case 'captcha_unavailable':
        return 'Captcha indisponible pour le moment.';
      case 'captcha_not_configured':
        return 'Captcha non configuré côté serveur.';
      case 'profile_image_forbidden':
        return 'Photo de profil invalide.';
    }

    return fallback;
  }

  private async refreshAdresseSuggestions(query: string) {
    const token = ++this.adresseSuggestToken;
    const q = (query ?? '').trim();
    if (q.length < 3) {
      this.adresseSuggestions.set([]);
      this.adresseSuggestOpen.set(false);
      return;
    }
    const res = await this.photon.search(q, { limit: 6 }).toPromise();
    if (token !== this.adresseSuggestToken) return;
    this.adresseSuggestions.set(res ?? []);
    this.adresseSuggestOpen.set(true);
  }

  onAdresseInput(v: string) {
    this.adresse = v;
    this.ville = null;
    void this.refreshAdresseSuggestions(v);
  }

  chooseAdresseSuggestion(f: PhotonFeature) {
    this.adresse = this.photon.label(f);
    const city = this.photon.city(f);
    this.ville = city ? city : null;
    this.adresseSuggestions.set([]);
    this.adresseSuggestOpen.set(false);
  }

  adresseSuggestionLabel(f: PhotonFeature) {
    return this.photon.label(f);
  }

  async ngAfterViewInit() {
    const siteKey = this.turnstile.getSiteKey();
    if (!siteKey || typeof window === 'undefined') {
      return;
    }

    try {
      this.captchaWidgetId = await this.turnstile.render(
        '#registerTurnstile',
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

  /** Soumet le formulaire d'inscription puis redirige vers `/login` en cas de succès. */
  async submit() {
    if (this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    this.ok.set(false);

    try {
      await this.auth.register({
        pseudo: this.pseudo,
        email: this.email,
        adresse: this.adresse,
        ville: this.ville ?? undefined,
        numero: this.numero.trim() || undefined,
        password: this.password,
        passwordConfirmation: this.passwordConfirmation,
        profileImage: this.profileImage,
        captchaToken: this.captchaToken || undefined,
      });
      this.ok.set(true);
      window.alert(
        'Un mail de vérification vous a été envoyé. Veuillez valider votre e-mail pour pouvoir vous connecter.',
      );
      await this.router.navigateByUrl('/login');
    } catch (e) {
      this.error.set(this.parseErrorMessage(e));
      this.captchaToken = null;
      if (typeof window !== 'undefined' && window.turnstile && this.captchaWidgetId) {
        window.turnstile.reset(this.captchaWidgetId);
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
