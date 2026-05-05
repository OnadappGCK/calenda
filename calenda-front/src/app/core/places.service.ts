import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api.config';

export type PlaceType = 'RESTAURANT' | 'SORTIE' | 'BAR' | 'ACTIVITE';

export interface PlaceDto {
  id: string;
  nom: string;
  description: string | null;
  adresse: string | null;
  ville: string | null;
  imageUrl: string | null;
  type: PlaceType;
  tags: string[];
  latitude: number | null;
  longitude: number | null;
  sourceUrl: string | null;
  contact: string | null;
  horaires: string | null;
  heureOuverture: string | null;
  heureFermeture: string | null;
  public: boolean;
  featured: boolean;
  featuredTier: number;
  featuredStart: string | null;
  featuredEnd: string | null;
  proprietaireId: string | null;
  proprietairePseudo: string | null;
  createdAt: string;
}

export interface CreatePlaceDto {
  nom: string;
  description?: string | null;
  adresse?: string | null;
  ville?: string | null;
  imageUrl?: string | null;
  type: PlaceType;
  tags?: string[];
  latitude?: number | null;
  longitude?: number | null;
  sourceUrl?: string | null;
  contact?: string | null;
  horaires?: string | null;
  heureOuverture?: string | null;
  heureFermeture?: string | null;
  featured?: boolean;
  featuredTier?: number;
  featuredStart?: string | null;
  featuredEnd?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PlacesService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = inject(API_BASE_URL);

  list(type?: PlaceType, tag?: string) {
    const params: Record<string, string> = {};
    if (type) params['type'] = type;
    if (tag) params['tag'] = tag;
    return this.http.get<PlaceDto[]>(`${this.apiBase}/etablissements`, { params });
  }

  getOne(id: string) {
    return this.http.get<PlaceDto>(`${this.apiBase}/etablissements/${id}`);
  }

  topTags(type?: PlaceType, limit = 5) {
    const params: Record<string, string> = { limit: String(limit) };
    if (type) params['type'] = type;
    return this.http.get<{ tag: string; count: number }[]>(
      `${this.apiBase}/etablissements/tags/top`,
      { params },
    );
  }

  allTags() {
    return this.http.get<{ tag: string; count: number }[]>(
      `${this.apiBase}/etablissements/tags/all`,
    );
  }

  create(dto: CreatePlaceDto) {
    return this.http.post<PlaceDto>(`${this.apiBase}/etablissements`, dto);
  }

  update(id: string, dto: Partial<CreatePlaceDto>) {
    return this.http.patch<PlaceDto>(`${this.apiBase}/etablissements/${id}`, dto);
  }

  remove(id: string) {
    return this.http.delete<void>(`${this.apiBase}/etablissements/${id}`);
  }
}
