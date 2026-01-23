import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api.config';
import { EventDto } from './events.service';

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  list() {
    return this.http.get<EventDto[]>(`${this.apiBaseUrl}/users/me/favorites`);
  }

  add(eventId: string) {
    return this.http.post(`${this.apiBaseUrl}/users/me/favorites/${eventId}`, {});
  }

  remove(eventId: string) {
    return this.http.delete(`${this.apiBaseUrl}/users/me/favorites/${eventId}`);
  }
}
