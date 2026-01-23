import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api.config';
import { EventDto } from './events.service';

@Injectable({ providedIn: 'root' })
/** Service de gestion des favoris (endpoints `/users/me/favorites`). */
export class FavoritesService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  /** Liste les événements favoris de l'utilisateur courant. */
  list() {
    return this.http.get<EventDto[]>(`${this.apiBaseUrl}/users/me/favorites`);
  }

  /** Ajoute un événement aux favoris. */
  add(eventId: string) {
    return this.http.post(`${this.apiBaseUrl}/users/me/favorites/${eventId}`, {});
  }

  /** Retire un événement des favoris. */
  remove(eventId: string) {
    return this.http.delete(`${this.apiBaseUrl}/users/me/favorites/${eventId}`);
  }
}
