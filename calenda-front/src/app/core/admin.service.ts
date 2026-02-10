import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api.config';
import { EventDto } from './events.service';

@Injectable({ providedIn: 'root' })
/** Service d'accès aux endpoints admin (validation/suppression d'événements). */
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  users(params?: { q?: string; role?: string }) {
    const query: Record<string, string> = {};
    const q = (params?.q ?? '').trim();
    const role = (params?.role ?? '').trim();
    if (q) query['q'] = q;
    if (role) query['role'] = role;
    return this.http.get<
      {
        id: string;
        email: string;
        pseudo: string;
        ville: string;
        lieu: string;
        role: string;
        profileImage: string | null;
        createdAt: string;
        updatedAt: string;
      }[]
    >(`${this.apiBaseUrl}/admin/users`, { params: query });
  }

  createUser(payload: {
    email: string;
    pseudo: string;
    ville: string;
    lieu: string;
    role?: string;
    profileImage?: string;
    password: string;
    passwordConfirmation: string;
  }) {
    return this.http.post(`${this.apiBaseUrl}/admin/users`, payload);
  }

  updateUser(
    id: string,
    payload: {
      email?: string;
      pseudo?: string;
      ville?: string;
      lieu?: string;
      role?: string;
      profileImage?: string | null;
      password?: string;
      passwordConfirmation?: string;
    },
  ) {
    return this.http.patch(`${this.apiBaseUrl}/admin/users/${id}`, payload);
  }

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

  /** Liste les profils organisateurs (admin). */
  organizers() {
    return this.http.get<{ id: string; pseudo: string; email: string; role: string }[]>(
      `${this.apiBaseUrl}/admin/organizers`,
    );
  }

  mergeMartigues(params?: { pages?: number; dryRun?: boolean }) {
    const query: Record<string, string> = {};
    if (params?.pages !== undefined) query['pages'] = String(params.pages);
    if (params?.dryRun !== undefined) query['dryRun'] = String(params.dryRun);

    return this.http.post<{
      scannedPages: number;
      foundUrls: number;
      dedupedUrls: number;
      created: number;
      skippedExisting: number;
      failed: number;
    }>(`${this.apiBaseUrl}/admin/merge/martigues`, {}, { params: query });
  }

  previewMergeMartigues(params?: { pages?: number }) {
    const query: Record<string, string> = {};
    if (params?.pages !== undefined) query['pages'] = String(params.pages);

    return this.http.get<{
      scannedPages: number;
      foundUrls: number;
      dedupedUrls: number;
      parsed: number;
      withImage: number;
      withDescription: number;
      wouldCreate: number;
      skippedExisting: number;
      skippedPast: number;
      failed: number;
      urls: string[];
      failures: { url: string; reason: string }[];
      debugSamples: {
        status: 'parse_failed' | 'exception' | 'past' | 'existing' | 'addable';
        url: string;
        reason?: string;
        titre?: string;
        dateDebut?: string;
        dateFin?: string;
        image?: boolean;
        descLen?: number;
      }[];
    }>(`${this.apiBaseUrl}/admin/merge/martigues/preview`, { params: query });
  }

  applyMergeMartigues(body: { urls: string[] }) {
    return this.http.post<{
      processed: number;
      created: number;
      skippedExisting: number;
      skippedPast: number;
      failed: number;
      debugSamples: {
        status: 'parse_failed' | 'exception' | 'past' | 'existing' | 'created';
        url: string;
        reason?: string;
        titre?: string;
        dateDebut?: string;
        dateFin?: string;
      }[];
    }>(`${this.apiBaseUrl}/admin/merge/martigues/apply`, body);
  }
}
