import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { inject } from '@angular/core';
import { API_BASE_URL } from './api.config';
import { StorageService } from './storage.service';

/** Représentation minimaliste de l'utilisateur authentifié côté front. */
export type AuthUser = {
  id: string;
  email: string;
  pseudo: string;
  isAdmin: boolean;
  emailVerified: boolean;
  profileImage?: string | null;
  numero?: string | null;
  bio?: string | null;
};

@Injectable({ providedIn: 'root' })
/**
 * Service d'authentification.
 * Stocke le token, expose l'utilisateur courant et propose login/register/logout.
 */
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly storage = inject(StorageService);
  private readonly router = inject(Router);

  private readonly tokenKey = 'calenda_token';

  readonly token = signal<string | null>(this.storage.get(this.tokenKey));
  readonly user = signal<AuthUser | null>(null);

  readonly isLoggedIn = computed(() => !!this.token());

  private loadPromise: Promise<void> | null = null;

  /**
   * S'assure que `user()` est chargé si un token existe.
   * Déduplique les appels concurrents avec `loadPromise`.
   */
  async ensureLoaded() {
    if (!this.token()) {
      return;
    }

    if (this.user()) {
      return;
    }

    if (!this.loadPromise) {
      this.loadPromise = this.refreshMe().finally(() => {
        this.loadPromise = null;
      });
    }

    await this.loadPromise;
  }

  /** Recharge le profil courant via `/users/me` (si token présent). */
  async refreshMe() {
    if (!this.token()) {
      return;
    }

    try {
      const me = await this.http.get<AuthUser>(`${this.apiBaseUrl}/users/me`).toPromise();
      if (me) {
        this.user.set(me);
      }
    } catch {
      this.storage.remove(this.tokenKey);
      this.token.set(null);
      this.user.set(null);
    }
  }

  /** Authentifie via `/auth/login`, persiste le token, et met à jour le user courant. */
  async login(email: string, password: string) {
    const result = await this.http
      .post<{ accessToken: string; user: AuthUser }>(`${this.apiBaseUrl}/auth/login`, {
        email,
        password,
      })
      .toPromise();

    if (!result) {
      throw new Error('login_failed');
    }

    this.storage.set(this.tokenKey, result.accessToken);
    this.token.set(result.accessToken);
    this.user.set(result.user);
  }

  /** Inscription via `/auth/register`. */
  async register(payload: {
    pseudo: string;
    email: string;
    adresse: string;
    ville?: string;
    numero?: string | null;
    password: string;
    passwordConfirmation: string;
    profileImage?: string | null;
    captchaToken?: string;
  }) {
    await this.http.post(`${this.apiBaseUrl}/auth/register`, payload).toPromise();
  }

  /** Déconnecte l'utilisateur: supprime le token, reset le state et redirige vers `/`. */
  logout() {
    this.storage.remove(this.tokenKey);
    this.token.set(null);
    this.user.set(null);
    this.router.navigateByUrl('/');
  }
}
