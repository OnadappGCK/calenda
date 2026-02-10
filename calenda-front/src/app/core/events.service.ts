import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api.config';

/** Catégories disponibles pour un événement (doit matcher le backend). */
export type EventCategory = 'Danse' | 'Concert' | 'Spectacle' | "Feux d’artifice" | 'Exposition' | 'Autre';

/** Caractéristiques disponibles pour un événement (max 3, doit matcher le backend). */
export type EventTag = 'MUSIQUE' | 'DANSE' | 'PLEIN AIR' | 'RENCONTRE' | 'FEU D’ARTIFICE' | 'SPORT' | 'MARCHÉ';

/** Origine d'un événement (création manuelle ou import externe). */
export type EventOrigin = 'MANUAL' | 'MARTIGUES_SITE' | 'SALSA_OLIVIER';

/** DTO événement renvoyé par l'API. */
export type EventDto = {
  id: string;
  titre: string;
  description: string;
  categorie: EventCategory;
  /** Origine (peut être absente pour des événements existants avant ajout de la colonne). */
  origin?: EventOrigin;
  imageUrl?: string | null;
  tarif?: string | null;
  ville: string;
  lieu: string;
  theme: string | null;
  caracteristiques?: EventTag[] | null;
  dateDebut: string;
  dateFin: string;
  public: boolean;
  enAvant: boolean;
  couleur: string | null;
  organisateur: { id: string; pseudo: string; email: string; role: string } | null;
};

@Injectable({ providedIn: 'root' })
/** Service d'accès aux endpoints `/events` (liste, détails, création, etc.). */
export class EventsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  /** Liste les événements (avec filtres optionnels via query params). */
  list(params?: Record<string, string>) {
    return this.http.get<EventDto[]>(`${this.apiBaseUrl}/events`, { params });
  }

  /** Récupère les événements mis en avant (homepage). */
  featured() {
    return this.http.get<EventDto[]>(`${this.apiBaseUrl}/events/featured`);
  }

  /** Récupère le détail d'un événement. */
  getOne(id: string) {
    return this.http.get<EventDto>(`${this.apiBaseUrl}/events/${id}`);
  }

  /** Récupère des événements similaires à un événement donné. */
  similar(id: string) {
    return this.http.get<EventDto[]>(`${this.apiBaseUrl}/events/${id}/similar`);
  }

  /** Crée un événement (réservé aux rôles autorisés côté backend). */
  create(payload: {
    titre: string;
    description: string;
    categorie: EventCategory;
    ville: string;
    lieu: string;
    theme?: string;
    caracteristiques?: EventTag[];
    imageUrl?: string | null;
    tarif?: string | null;
    dateDebut: string;
    dateFin: string;
    enAvant?: boolean;
  }) {
    return this.http.post<EventDto>(`${this.apiBaseUrl}/events`, payload);
  }

  /** Met à jour un événement (admin ou owner). */
  update(
    id: string,
    payload: {
      titre?: string;
      description?: string;
      categorie?: EventCategory;
      ville?: string;
      lieu?: string;
      theme?: string | null;
      caracteristiques?: EventTag[] | null;
      imageUrl?: string | null;
      tarif?: string | null;
      organisateurId?: string;
      dateDebut?: string;
      dateFin?: string;
      public?: boolean;
      enAvant?: boolean;
      couleur?: string | null;
    },
  ) {
    return this.http.patch<EventDto>(`${this.apiBaseUrl}/events/${id}`, payload);
  }
}
