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
