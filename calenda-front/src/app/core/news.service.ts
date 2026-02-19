import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api.config';

/** DTO d'une news renvoyée par l'API. */
export type NewsDto = {
  id: string;
  titre: string;
  datePublication: string;
  texte: string;
  image: string | null;
};

@Injectable({ providedIn: 'root' })
/** Service d'accès aux news (pagination) via `/news`. */
export class NewsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  /** Récupère une page de news (page, pageSize). */
  list(page = 1, pageSize = 5) {
    return this.http.get<{ items: NewsDto[]; page: number; pageSize: number; total: number }>(
      `${this.apiBaseUrl}/news`,
      {
        params: {
          page: String(page),
          pageSize: String(pageSize),
        },
      },
    );
  }

  create(payload: { titre: string; datePublication: string; texte: string }, image?: File | null) {
    const fd = new FormData();
    fd.append('titre', payload.titre);
    fd.append('datePublication', payload.datePublication);
    fd.append('texte', payload.texte);
    if (image) {
      fd.append('image', image);
    }
    return this.http.post<NewsDto>(`${this.apiBaseUrl}/news`, fd);
  }

  update(
    id: string,
    payload: { titre?: string; datePublication?: string; texte?: string; removeImage?: boolean },
    image?: File | null,
  ) {
    const fd = new FormData();
    if (payload.titre !== undefined) fd.append('titre', payload.titre);
    if (payload.datePublication !== undefined) fd.append('datePublication', payload.datePublication);
    if (payload.texte !== undefined) fd.append('texte', payload.texte);
    if (payload.removeImage) fd.append('removeImage', 'true');
    if (image) fd.append('image', image);
    return this.http.patch<NewsDto>(`${this.apiBaseUrl}/news/${id}`, fd);
  }

  remove(id: string) {
    return this.http.delete<{ ok: true }>(`${this.apiBaseUrl}/news/${id}`);
  }
}
