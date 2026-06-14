import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api.config';

export type NotificationDto = {
  id: string;
  type: 'FAVORITE_EVENT' | 'NEW_MESSAGE';
  eventId: string | null;
  groupId: string | null;
  text: string;
  active: boolean;
  createdAt: string;
};

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  getNotifications() {
    return this.http.get<NotificationDto[]>(`${this.apiBaseUrl}/notifications`);
  }

  markRead(id: string) {
    return this.http.patch<{ ok: boolean }>(`${this.apiBaseUrl}/notifications/${id}/read`, {});
  }
}
