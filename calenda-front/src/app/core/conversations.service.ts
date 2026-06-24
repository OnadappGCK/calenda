import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api.config';

export type ConversationGroupCardDto = {
  id: string;
  title: string;
  createdAt: string;
  creator: { id: string; pseudo: string; profileImage: string | null };
  participantCount: number;
  firstMessagePreview: string;
  status: 'OPEN' | 'LOCKED' | 'DELETED';
  options: { lieuRdv: string | null; heureRdv: string | null; contactRdv: string | null };
  joinedByMe: boolean;
};

export type ConversationMessageDto = {
  id: string;
  content: string;
  createdAt: string;
  status: 'VISIBLE' | 'FLAGGED' | 'HIDDEN' | 'DELETED';
  reportCount: number;
  user: { id: string; pseudo: string; profileImage: string | null };
  likeCount: number;
  likedByMe: boolean;
};

@Injectable({ providedIn: 'root' })
export class ConversationsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  listGroups(eventId: string, params?: { q?: string }) {
    const cleanParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === null) continue;
      const trimmed = String(value).trim();
      if (!trimmed) continue;
      cleanParams[key] = trimmed;
    }
    return this.http.get<ConversationGroupCardDto[]>(`${this.apiBaseUrl}/events/${eventId}/conversation-groups`, {
      params: cleanParams,
    });
  }

  createGroup(
    eventId: string,
    payload: {
      title: string;
      firstMessage: string;
      lieuRdv?: string;
      heureRdv?: string;
      contactRdv?: string;
    },
  ) {
    return this.http.post<{ id: string; title: string; createdAt: string; expiresAt: string; status: string }>(
      `${this.apiBaseUrl}/events/${eventId}/conversation-groups`,
      payload,
    );
  }

  joinGroup(groupId: string) {
    return this.http.post<{ ok: true }>(`${this.apiBaseUrl}/conversation-groups/${groupId}/join`, {});
  }

  leaveGroup(groupId: string) {
    return this.http.post<{ ok: true }>(`${this.apiBaseUrl}/conversation-groups/${groupId}/leave`, {});
  }

  deleteGroup(groupId: string) {
    return this.http.delete<{ ok: true }>(`${this.apiBaseUrl}/conversation-groups/${groupId}`);
  }

  listMessages(groupId: string) {
    return this.http.get<ConversationMessageDto[]>(`${this.apiBaseUrl}/conversation-groups/${groupId}/messages`);
  }

  postMessage(groupId: string, payload: { content: string }) {
    return this.http.post<{ id: string; content: string; createdAt: string }>(
      `${this.apiBaseUrl}/conversation-groups/${groupId}/messages`,
      payload,
    );
  }

  reportMessage(messageId: string) {
    return this.http.post<{ ok: true; reportCount: number; status: string }>(
      `${this.apiBaseUrl}/conversation-messages/${messageId}/report`,
      {},
    );
  }

  toggleLike(messageId: string) {
    return this.http.post<{ ok: true; liked: boolean; likeCount: number }>(
      `${this.apiBaseUrl}/conversation-messages/${messageId}/like`,
      {},
    );
  }

}
