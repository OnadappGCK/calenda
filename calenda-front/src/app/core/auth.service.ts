import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { inject } from '@angular/core';
import { API_BASE_URL } from './api.config';
import { StorageService } from './storage.service';

export type Role = 'ADMIN' | 'ORGANISATEUR' | 'UTILISATEUR';

export type AuthUser = {
  id: string;
  email: string;
  pseudo: string;
  role: Role;
};

@Injectable({ providedIn: 'root' })
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

  async refreshMe() {
    if (!this.token()) {
      return;
    }

    const me = await this.http.get<AuthUser>(`${this.apiBaseUrl}/users/me`).toPromise();
    if (me) {
      this.user.set(me);
    }
  }

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

  async register(payload: {
    pseudo: string;
    email: string;
    ville: string;
    lieu: string;
    password: string;
    passwordConfirmation: string;
  }) {
    await this.http.post(`${this.apiBaseUrl}/auth/register`, payload).toPromise();
  }

  logout() {
    this.storage.remove(this.tokenKey);
    this.token.set(null);
    this.user.set(null);
    this.router.navigateByUrl('/');
  }
}
