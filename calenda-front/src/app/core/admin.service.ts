import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api.config';
import { EventDto } from './events.service';

@Injectable({ providedIn: 'root' })
/** Service d'accès aux endpoints admin (validation/suppression d'événements). */
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  /** Liste les événements en attente de validation (admin). */
  pendingEvents() {
    return this.http.get<EventDto[]>(`${this.apiBaseUrl}/admin/pending-events`);
  }

  /** Valide (publie) un événement en attente. */
  validateEvent(id: string) {
    return this.http.patch(`${this.apiBaseUrl}/admin/events/${id}/validate`, {});
  }

  /** Supprime un événement (admin). */
  deleteEvent(id: string) {
    return this.http.delete(`${this.apiBaseUrl}/admin/events/${id}`);
  }
}
