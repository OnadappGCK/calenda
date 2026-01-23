import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api.config';

export type NewsDto = {
  id: string;
  titre: string;
  datePublication: string;
  texte: string;
  image: string | null;
};

@Injectable({ providedIn: 'root' })
export class NewsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

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
}
