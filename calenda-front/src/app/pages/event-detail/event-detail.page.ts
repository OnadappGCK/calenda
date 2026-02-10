import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AdminService } from '../../core/admin.service';
import { AuthService } from '../../core/auth.service';
import { resolveEventImageUrl, tagIcon as tagIconFn } from '../../core/event-ui';
import { EventCategory, EventsService, EventDto, EventTag } from '../../core/events.service';
import { FavoritesService } from '../../core/favorites.service';
import { PhotonFeature, PhotonService } from '../../core/photon.service';

type Draft = {
  titre: string;
  description: string;
  categorie: EventCategory;
  ville: string;
  adresse: string;
  latitude: number | null;
  longitude: number | null;
  theme: string | null;
  caracteristiques: EventTag[] | null;
  imageUrl: string | null;
  tarif: string | null;
  organisateurId: string;
  dateDebutLocal: string;
  dateFinLocal: string;
  public: boolean;
  enAvant: boolean;
  couleur: string | null;
};

@Component({
  selector: 'app-event-detail-page',
  imports: [RouterLink, DatePipe, FormsModule],
  templateUrl: './event-detail.page.html',
  styleUrl: './event-detail.page.scss',
})
/**
 * Page détail d'événement.
 * Charge un événement depuis l'ID de route et affiche des suggestions similaires.
 */
export class EventDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly eventsService = inject(EventsService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly auth = inject(AuthService);
  private readonly adminService = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly photon = inject(PhotonService);
  private readonly sanitizer = inject(DomSanitizer);

  private loadToken = 0;

  readonly event = signal<EventDto | null>(null);
  readonly similar = signal<EventDto[]>([]);

  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly organizers = signal<{ id: string; pseudo: string; email: string; role: string }[]>([]);

  private organizersLoaded = false;

  readonly canLike = computed(() => this.auth.isLoggedIn());

  readonly isAdmin = computed(() => this.auth.user()?.role === 'ADMIN');
  readonly canEdit = computed(() => {
    const u = this.auth.user();
    const e = this.event();
    if (!u || !e) return false;
    return u.role === 'ADMIN' || e.organisateur?.id === u.id;
  });

  readonly categories: EventCategory[] = ['Danse', 'Concert', 'Spectacle', "Feux d’artifice", 'Exposition', 'Autre'];
  readonly tags: EventTag[] = ['MUSIQUE', 'DANSE', 'PLEIN AIR', 'RENCONTRE', 'FEU D’ARTIFICE', 'SPORT', 'MARCHÉ'];

  readonly caracteristiqueBubbles = computed(() => {
    const e = this.event();
    const tags = (e?.caracteristiques ?? []) as EventTag[];
    return tags.slice(0, 3).map((t) => ({ tag: t, icon: tagIconFn(t) }));
  });

  readonly adresseLabel = computed(() => {
    const e = this.event();
    return (e?.adresse ?? e?.lieu ?? '').trim();
  });

  private embedOsmUrl(lat: number, lon: number) {
    const delta = 0.01;
    const left = lon - delta;
    const right = lon + delta;
    const top = lat + delta;
    const bottom = lat - delta;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
      `${left},${bottom},${right},${top}`,
    )}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lon}`)}`;
  }

  readonly mapUrl = computed<SafeResourceUrl | null>(() => {
    const e = this.event();
    const lat = e?.latitude;
    const lon = e?.longitude;
    if (typeof lat !== 'number' || typeof lon !== 'number') return null;
    const url = this.embedOsmUrl(lat, lon);
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  readonly draftMapUrl = computed<SafeResourceUrl | null>(() => {
    const d = this.draft();
    const lat = d?.latitude;
    const lon = d?.longitude;
    if (typeof lat !== 'number' || typeof lon !== 'number') return null;
    const url = this.embedOsmUrl(lat, lon);
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  readonly draft = signal<Draft | null>(null);

  readonly adresseSuggestions = signal<PhotonFeature[]>([]);
  readonly adresseSuggestOpen = signal<boolean>(false);
  private adresseSuggestToken = 0;

  imageUrlFor(e: EventDto) {
    return resolveEventImageUrl(e.categorie, e.imageUrl);
  }

  private async refreshAdresseSuggestions(query: string) {
    const token = ++this.adresseSuggestToken;
    const q = (query ?? '').trim();
    if (q.length < 3) {
      this.adresseSuggestions.set([]);
      this.adresseSuggestOpen.set(false);
      return;
    }
    const res = await this.photon.search(q, { limit: 6 }).toPromise();
    if (token !== this.adresseSuggestToken) return;
    this.adresseSuggestions.set(res ?? []);
    this.adresseSuggestOpen.set(true);
  }

  onAdresseInput(v: string) {
    const cur = this.draft();
    if (!cur) return;
    this.setDraft({ adresse: v, latitude: null, longitude: null });
    void this.refreshAdresseSuggestions(v);
  }

  chooseAdresseSuggestion(f: PhotonFeature) {
    const cur = this.draft();
    if (!cur) return;
    const addr = this.photon.label(f);
    const c = this.photon.coords(f);
    const city = this.photon.city(f);
    this.setDraft({
      adresse: addr,
      latitude: c?.lat ?? null,
      longitude: c?.lon ?? null,
      ville: city ? city : cur.ville,
    });
    this.adresseSuggestions.set([]);
    this.adresseSuggestOpen.set(false);
  }

  adresseSuggestionLabel(f: PhotonFeature) {
    return this.photon.label(f);
  }

  tagIcon(t: EventTag) {
    return tagIconFn(t);
  }

  private formatDateTimeLocal(iso: string) {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  private toIsoFromLocal(local: string) {
    const d = new Date(local);
    return d.toISOString();
  }

  private cleanText(v: string | null | undefined) {
    const s = (v ?? '').trim();
    return s || null;
  }

  setDraft(patch: Partial<Draft>) {
    const cur = this.draft();
    if (!cur) return;
    this.draft.set({ ...cur, ...patch });
  }

  toggleTag(tag: EventTag) {
    const cur = this.draft();
    if (!cur) return;
    const list = (cur.caracteristiques ?? []).slice();
    const idx = list.indexOf(tag);
    if (idx >= 0) {
      list.splice(idx, 1);
      this.setDraft({ caracteristiques: list.length ? list : null });
      return;
    }
    if (list.length >= 3) return;
    list.push(tag);
    this.setDraft({ caracteristiques: list });
  }

  async startEdit() {
    const e = this.event();
    if (!e || !this.canEdit()) return;

    this.saveError.set(null);
    this.editing.set(true);
    this.draft.set({
      titre: e.titre,
      description: e.description,
      categorie: e.categorie,
      ville: e.ville,
      adresse: (e.adresse ?? e.lieu ?? '').trim(),
      latitude: e.latitude ?? null,
      longitude: e.longitude ?? null,
      theme: e.theme ?? null,
      caracteristiques: e.caracteristiques ?? null,
      imageUrl: e.imageUrl ?? null,
      tarif: e.tarif ?? null,
      organisateurId: '',
      dateDebutLocal: this.formatDateTimeLocal(e.dateDebut),
      dateFinLocal: this.formatDateTimeLocal(e.dateFin),
      public: e.public,
      enAvant: e.enAvant,
      couleur: e.couleur ?? null,
    });

    if (this.isAdmin() && !this.organizersLoaded) {
      const list = await this.adminService.organizers().toPromise();
      this.organizers.set(list ?? []);
      this.organizersLoaded = true;
    }
  }

  cancelEdit() {
    this.editing.set(false);
    this.saving.set(false);
    this.saveError.set(null);
    this.draft.set(null);
  }

  onOrganizerSelected(id: string) {
    const cur = this.draft();
    if (!cur) return;
    this.setDraft({ organisateurId: id });
  }

  async saveEdit() {
    const e = this.event();
    const d = this.draft();
    if (!e || !d) return;

    this.saving.set(true);
    this.saveError.set(null);

    try {
      const payload: any = {
        titre: d.titre.trim(),
        description: d.description.trim(),
        categorie: d.categorie,
        ville: d.ville.trim(),
        adresse: d.adresse.trim(),
        latitude: d.latitude,
        longitude: d.longitude,
        dateDebut: this.toIsoFromLocal(d.dateDebutLocal),
        dateFin: this.toIsoFromLocal(d.dateFinLocal),
        enAvant: d.enAvant,
      };

      const theme = this.cleanText(d.theme);
      if (theme) payload.theme = theme;

      const imageUrl = this.cleanText(d.imageUrl);
      if (imageUrl) payload.imageUrl = imageUrl;

      const couleur = this.cleanText(d.couleur);
      if (couleur) payload.couleur = couleur;

      const tarif = this.cleanText(d.tarif) ?? 'Non renseigné';
      payload.tarif = tarif;

      if ((d.caracteristiques ?? []).length > 0) {
        payload.caracteristiques = (d.caracteristiques ?? []).slice(0, 3);
      } else {
        payload.caracteristiques = [];
      }

      if (this.isAdmin()) {
        payload.public = d.public;
        if (d.organisateurId) {
          payload.organisateurId = d.organisateurId;
        }
      }

      const updated = await this.eventsService.update(e.id, payload).toPromise();
      if (updated) {
        this.event.set(updated);
      }
      this.editing.set(false);
      this.draft.set(null);
    } catch {
      this.saveError.set('save_failed');
    } finally {
      this.saving.set(false);
    }
  }

  private resetForLoad() {
    this.editing.set(false);
    this.saving.set(false);
    this.saveError.set(null);
    this.draft.set(null);
    this.event.set(null);
    this.similar.set([]);
  }

  private async loadEvent(id: string) {
    this.resetForLoad();
    const token = ++this.loadToken;

    const evt = await this.eventsService.getOne(id).toPromise();
    if (token !== this.loadToken) return;
    const normalizeTags = (v: any): EventTag[] | null => {
      if (!v) return null;
      if (Array.isArray(v)) return v as EventTag[];
      if (typeof v === 'string') {
        const s = v.trim();
        if (!s) return null;
        try {
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed)) return parsed as EventTag[];
        } catch {
          return null;
        }
      }
      return null;
    };

    const normalized = evt
      ? ({
          ...evt,
          caracteristiques: normalizeTags((evt as any).caracteristiques),
        } as EventDto)
      : null;

    // Front-only fallback: some backends may omit `caracteristiques` on GET /events/:id.
    // If missing, retrieve the same event via the list endpoint (used by the calendar) and reuse its tags.
    if (normalized && (normalized.caracteristiques ?? []).length === 0) {
      try {
        const list = await this.eventsService
          .list({ q: normalized.titre, limit: '20' })
          .toPromise();
        if (token !== this.loadToken) return;
        const hit = (list ?? []).find((e) => e.id === normalized.id);
        const tags = normalizeTags((hit as any)?.caracteristiques);
        if (tags && tags.length) {
          normalized.caracteristiques = tags;
        }
      } catch {
        // ignore
      }
    }

    this.event.set(normalized);

    const sim = await this.eventsService.similar(id).toPromise();
    if (token !== this.loadToken) return;
    this.similar.set(sim ?? []);
  }

  /** Hook Angular: charge l'événement + la liste "similar" à partir du paramètre `id`. */
  async ngOnInit() {
    await this.auth.ensureLoaded();
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pm) => {
      const id = pm.get('id');
      if (!id) return;
      void this.loadEvent(id);
    });
  }

  /** Ajoute l'événement courant aux favoris (si connecté). */
  async like() {
    const evt = this.event();
    if (!evt) {
      return;
    }

    if (!this.canLike()) {
      return;
    }

    await this.favoritesService.add(evt.id).toPromise();
  }
}
