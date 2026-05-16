import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api.config';
import { AuthUser } from './auth.service';
import { EventDto } from './events.service';

export type PublicProfileDto = {
  id: string;
  pseudo: string;
  ville: string;
  lieu: string;
  profileImage: string | null;
  bio: string | null;
  upcomingCount: number;
  totalCount: number;
};

@Injectable({ providedIn: 'root' })
/** Service d'accès aux endpoints utilisateur (profil courant). */
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  /** Récupère le profil complet de l'utilisateur courant. */
  me() {
    return this.http.get<AuthUser & { ville: string; lieu: string; numero?: string | null; bio?: string | null }>(
      `${this.apiBaseUrl}/users/me`,
    );
  }

  /** Met à jour le profil courant (pseudo/ville/lieu et éventuellement password). */
  updateMe(payload: {
    pseudo?: string;
    ville?: string;
    lieu?: string;
    profileImage?: string | null;
    numero?: string | null;
    bio?: string | null;
    password?: string;
    passwordConfirmation?: string;
  }) {
    return this.http.patch(`${this.apiBaseUrl}/users/me`, payload);
  }

  publicProfile(userId: string) {
    return this.http.get<PublicProfileDto>(`${this.apiBaseUrl}/users/${userId}/profile`);
  }

  publicOrganizedEvents(
    userId: string,
    params?: {
      upcoming?: 'true' | 'false';
      q?: string;
      categorie?: string;
      ville?: string;
      limit?: string;
      offset?: string;
    },
  ) {
    const cleanParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === null) continue;
      const trimmed = String(value).trim();
      if (!trimmed) continue;
      cleanParams[key] = trimmed;
    }
    return this.http.get<EventDto[]>(`${this.apiBaseUrl}/users/${userId}/events`, { params: cleanParams });
  }

  requestEmailVerification() {
    return this.http.post<{ ok: true; token?: string }>(`${this.apiBaseUrl}/users/me/request-email-verification`, {});
  }

  verifyEmail(token: string) {
    return this.http.get<{ ok: true }>(`${this.apiBaseUrl}/users/verify-email`, { params: { token } });
  }
}
