import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api.config';

export type EventCategory = 'Danse' | 'Concert' | 'Spectacle' | "Feux d’artifice" | 'Exposition' | 'Autre';

export type EventDto = {
  id: string;
  titre: string;
  description: string;
  categorie: EventCategory;
  ville: string;
  lieu: string;
  theme: string | null;
  dateDebut: string;
  dateFin: string;
  public: boolean;
  enAvant: boolean;
  couleur: string | null;
  organisateur: { id: string; pseudo: string; email: string; role: string };
};

@Injectable({ providedIn: 'root' })
export class EventsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  list(params?: Record<string, string>) {
    return this.http.get<EventDto[]>(`${this.apiBaseUrl}/events`, { params });
  }

  featured() {
    return this.http.get<EventDto[]>(`${this.apiBaseUrl}/events/featured`);
  }

  getOne(id: string) {
    return this.http.get<EventDto>(`${this.apiBaseUrl}/events/${id}`);
  }

  similar(id: string) {
    return this.http.get<EventDto[]>(`${this.apiBaseUrl}/events/${id}/similar`);
  }

  create(payload: {
    titre: string;
    description: string;
    categorie: EventCategory;
    ville: string;
    lieu: string;
    dateDebut: string;
    dateFin: string;
    enAvant?: boolean;
  }) {
    return this.http.post<EventDto>(`${this.apiBaseUrl}/events`, payload);
  }
}
