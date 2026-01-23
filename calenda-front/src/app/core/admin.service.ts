import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api.config';
import { EventDto } from './events.service';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  pendingEvents() {
    return this.http.get<EventDto[]>(`${this.apiBaseUrl}/admin/pending-events`);
  }

  validateEvent(id: string) {
    return this.http.patch(`${this.apiBaseUrl}/admin/events/${id}/validate`, {});
  }

  deleteEvent(id: string) {
    return this.http.delete(`${this.apiBaseUrl}/admin/events/${id}`);
  }
}
