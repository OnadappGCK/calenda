import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api.config';
import { AuthUser } from './auth.service';

@Injectable({ providedIn: 'root' })
/** Service d'accès aux endpoints utilisateur (profil courant). */
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  /** Récupère le profil complet de l'utilisateur courant. */
  me() {
    return this.http.get<AuthUser & { ville: string; lieu: string }>(`${this.apiBaseUrl}/users/me`);
  }

  /** Met à jour le profil courant (pseudo/ville/lieu et éventuellement password). */
  updateMe(payload: {
    pseudo?: string;
    ville?: string;
    lieu?: string;
    password?: string;
    passwordConfirmation?: string;
  }) {
    return this.http.patch(`${this.apiBaseUrl}/users/me`, payload);
  }
}
