import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  HostListener,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AdminService } from '../../core/admin.service';
import { AuthService } from '../../core/auth.service';
import { categoryColor, resolveEventImageUrl, tagIcon as tagIconFn } from '../../core/event-ui';
import { I18nService } from '../../core/i18n.service';
import { EventCategory, EventsService, EventDto, EventSlotDto, EventTag, HighlightDto } from '../../core/events.service';
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
  contact: string;
  organisateurId: string;
  /** Créneaux horaires de l'événement en cours d'édition. */
  slots: { date: string; heureDebut: string; heureFin: string }[];
  public: boolean;
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
export class EventDetailPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventsService = inject(EventsService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly auth = inject(AuthService);
  private readonly adminService = inject(AdminService);
  protected readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly photon = inject(PhotonService);
  private readonly sanitizer = inject(DomSanitizer);

  private loadToken = 0;
  private lastLoadedId: string | null = null;

  readonly event = signal<EventDto | null>(null);
  readonly similar = signal<EventDto[]>([]);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly showDeleteConfirm = signal(false);
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);

  readonly organizers = signal<{ id: string; pseudo: string; email: string; isAdmin: boolean }[]>([]);

  private organizersLoaded = false;

  readonly highlights = signal<HighlightDto[]>([]);
  readonly highlightForm = signal<{ id: string | null; startAt: string; endAt: string; priority: number } | null>(null);
  readonly highlightSaving = signal(false);
  readonly highlightError = signal<string | null>(null);

  readonly canLike = computed(() => this.auth.isLoggedIn());
  readonly favoriteIds = signal<Set<string>>(new Set());
  readonly isFavorite = computed(() => {
    const e = this.event();
    if (!e) return false;
    return this.favoriteIds().has(e.id);
  });

  readonly lightboxOpen = signal(false);
  readonly imageEditorOpen = signal(false);
  private prevBodyOverflow: string | null = null;

  readonly geocodedCoords = signal<{ lat: number; lon: number } | null>(null);
  private geocodeToken = 0;

  readonly defaultImageChoices = computed(() => [
    { label: this.i18n.t('eventDetail.defaultImageSpectacle'), path: 'img/categorie/SPECTACLE/spec1.png' },
    { label: this.i18n.t('eventDetail.defaultImageFestival'), path: 'img/categorie/FESTIVAL/fest1.png' },
    { label: this.i18n.t('eventDetail.defaultImageExposition'), path: 'img/categorie/EXPOSITION/expo1.png' },
    { label: this.i18n.t('eventDetail.defaultImageOther'), path: 'img/categorie/AUTRE/autre1.png' },
    { label: this.i18n.t('eventDetail.defaultImageMeeting'), path: 'img/categorie/REUNION/reu1.png' },
  ]);

  readonly isAdmin = computed(() => !!this.auth.user()?.isAdmin);
  readonly canEdit = computed(() => {
    const u = this.auth.user();
    const e = this.event();
    if (!u || !e) return false;
    return u.isAdmin || e.organisateur?.id === u.id;
  });
  /** Propriétaire non-admin : peut ouvrir la modale de boost. */
  readonly canBoost = computed(() => {
    const u = this.auth.user();
    const e = this.event();
    if (!u || !e || u.isAdmin) return false;
    return e.organisateur?.id === u.id;
  });

  readonly boostOpen = signal(false);
  readonly boostDays = signal(30);
  readonly boostStartDate = signal('');
  readonly boostSaving = signal(false);
  readonly boostError = signal<string | null>(null);
  readonly boostSuccess = signal(false);

  readonly categories: EventCategory[] = ['Danse', 'Concert', 'Spectacle', 'Feux d\u2019artifice', 'Exposition', 'Autre'];
  readonly tags: EventTag[] = ['MUSIQUE', 'DANSE', 'PLEIN AIR', 'RENCONTRE', 'FEU D’ARTIFICE', 'SPORT', 'MARCHÉ', 'COMPÉTITION', 'HUMOUR', 'ART', 'VISITE'];

  readonly dateLocale = computed(() => {
    const lang = this.i18n.lang();
    if (lang === 'en') return 'en-GB';
    if (lang === 'es') return 'es-ES';
    if (lang === 'it') return 'it-IT';
    if (lang === 'de') return 'de-DE';
    return 'fr-FR';
  });

  protected readonly categoryColor = categoryColor;

  readonly caracteristiqueBubbles = computed(() => {
    const e = this.event();
    const tags = (e?.caracteristiques ?? []) as EventTag[];
    return tags.slice(0, 3).map((t) => ({ tag: t, icon: tagIconFn(t) }));
  });

  readonly adresseLabel = computed(() => {
    const e = this.event();
    return (e?.adresse ?? e?.lieu ?? '').trim();
  });

  readonly googleMapsUrl = computed(() => {
    const e = this.event();
    if (!e) return null;
    const addr = (e.adresse ?? e.lieu ?? '').trim();
    const city = (e.ville ?? '').trim();
    const q = [addr, city].filter((x) => (x ?? '').trim()).join(', ').trim();
    if (!q) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  });

  private coerceCoord(v: unknown): number | null {
    if (typeof v === 'number') {
      return Number.isFinite(v) ? v : null;
    }
    if (typeof v === 'string') {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

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

  ngOnDestroy() {
    this.unlockBodyScroll();
  }

  onHeroClick() {
    if (this.editing()) {
      this.openImageEditor();
      return;
    }
    this.openLightbox();
  }

  openLightbox() {
    if (!this.event()) return;
    this.lightboxOpen.set(true);
    this.lockBodyScroll();
  }

  closeLightbox() {
    this.lightboxOpen.set(false);
    this.unlockBodyScroll();
  }

  openImageEditor() {
    if (!this.editing()) return;
    if (!this.draft()) return;
    this.imageEditorOpen.set(true);
    this.lockBodyScroll();
  }

  closeImageEditor() {
    this.imageEditorOpen.set(false);
    this.unlockBodyScroll();
  }

  draftImagePreviewUrl() {
    const d = this.draft();
    if (!d) return '';
    return resolveEventImageUrl(d.categorie, d.imageUrl);
  }

  private lockBodyScroll() {
    if (!isPlatformBrowser(this.platformId)) return;
    const body = document?.body;
    if (!body) return;
    if (this.prevBodyOverflow === null) {
      this.prevBodyOverflow = body.style.overflow;
    }
    body.style.overflow = 'hidden';
  }

  private unlockBodyScroll() {
    if (!isPlatformBrowser(this.platformId)) return;
    const body = document?.body;
    if (!body) return;
    if (this.prevBodyOverflow !== null) {
      body.style.overflow = this.prevBodyOverflow;
      this.prevBodyOverflow = null;
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(ev: KeyboardEvent) {
    if (ev.key !== 'Escape') return;
    if (this.imageEditorOpen()) {
      this.closeImageEditor();
      return;
    }
    if (this.lightboxOpen()) {
      this.closeLightbox();
    }
  }

  readonly mapUrl = computed<SafeResourceUrl | null>(() => {
    const e = this.event();
    const lat = this.coerceCoord(e?.latitude) ?? this.geocodedCoords()?.lat ?? null;
    const lon = this.coerceCoord(e?.longitude) ?? this.geocodedCoords()?.lon ?? null;
    if (lat === null || lon === null) return null;
    const url = this.embedOsmUrl(lat, lon);
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  readonly draftMapUrl = computed<SafeResourceUrl | null>(() => {
    const d = this.draft();
    const lat = this.coerceCoord(d?.latitude);
    const lon = this.coerceCoord(d?.longitude);
    if (lat === null || lon === null) return null;
    const url = this.embedOsmUrl(lat, lon);
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  readonly draft = signal<Draft | null>(null);

  readonly saveErrorMessage = computed(() => {
    const err = this.saveError();
    if (!err) return null;
    if (err === 'save_failed') return this.i18n.t('eventDetail.saveFailed');
    return err;
  });

  readonly deleteErrorMessage = computed(() => {
    const err = this.deleteError();
    if (!err) return null;
    if (err === 'delete_failed') return this.i18n.t('eventDetail.deleteFailed');
    return err;
  });

  readonly adresseSuggestions = signal<PhotonFeature[]>([]);
  readonly adresseSuggestOpen = signal<boolean>(false);
  private adresseSuggestToken = 0;

  imageUrlFor(e: EventDto) {
    return resolveEventImageUrl(e.categorie, e.imageUrl);
  }

  private async reloadFavorites() {
    if (!this.auth.isLoggedIn()) {
      this.favoriteIds.set(new Set());
      return;
    }
    try {
      const list = await this.favoritesService.list().toPromise();
      const next = new Set((list ?? []).map((e) => e.id));
      this.favoriteIds.set(next);
    } catch {
      this.favoriteIds.set(new Set());
    }
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

  categoryLabel(category: EventCategory) {
    const key = this.categoryKey(category);
    return this.i18n.t(`eventDetail.categories.${key}`);
  }

  tagLabel(tag: EventTag) {
    const key = this.tagKey(tag);
    return this.i18n.t(`eventDetail.tags.${key}`);
  }

  private categoryKey(category: EventCategory) {
    if (category === 'Danse') return 'danse';
    if (category === 'Concert') return 'concert';
    if (category === 'Spectacle') return 'spectacle';
    if (category === 'Feux d’artifice') return 'fireworks';
    if (category === 'Exposition') return 'exhibition';
    return 'other';
  }

  private tagKey(tag: EventTag) {
    if (tag === 'MUSIQUE') return 'music';
    if (tag === 'DANSE') return 'dance';
    if (tag === 'PLEIN AIR') return 'outdoor';
    if (tag === 'RENCONTRE') return 'social';
    if (tag === 'FEU D’ARTIFICE') return 'fireworks';
    if (tag === 'SPORT') return 'sport';
    if (tag === 'COMPÉTITION') return 'competition';
    if (tag === 'HUMOUR') return 'humour';
    if (tag === 'ART') return 'art';
    if (tag === 'VISITE') return 'visite';
    return 'market';
  }

  /** Construit les slots draft depuis un EventDto (utilise event.slots si dispo, sinon dateDebut/dateFin). */
  private slotsFromEvent(e: EventDto): { date: string; heureDebut: string; heureFin: string }[] {
    if (e.slots && e.slots.length > 0) {
      return e.slots.map((s) => ({ date: s.date, heureDebut: s.heureDebut, heureFin: s.heureFin }));
    }
    const date = e.dateDebut ? e.dateDebut.slice(0, 10) : '';
    const heureDebut = e.dateDebut ? e.dateDebut.slice(11, 16) : '09:00';
    const heureFin = e.dateFin ? e.dateFin.slice(11, 16) : '18:00';
    return date ? [{ date, heureDebut, heureFin }] : [];
  }

  addDraftSlot() {
    const d = this.draft();
    if (!d) return;
    const last = d.slots[d.slots.length - 1];
    const nextDate = last ? this.nextDayStr(last.date) : new Date().toISOString().slice(0, 10);
    const heureDebut = last?.heureDebut ?? '09:00';
    const heureFin = last?.heureFin ?? '18:00';
    this.setDraft({ slots: [...d.slots, { date: nextDate, heureDebut, heureFin }] });
  }

  removeDraftSlot(idx: number) {
    const d = this.draft();
    if (!d || d.slots.length <= 1) return;
    const slots = d.slots.filter((_, i) => i !== idx);
    this.setDraft({ slots });
  }

  updateDraftSlot(idx: number, field: 'date' | 'heureDebut' | 'heureFin', value: string) {
    const d = this.draft();
    if (!d) return;
    const slots = d.slots.map((s, i) => (i === idx ? { ...s, [field]: value } : s));
    this.setDraft({ slots });
  }

  private nextDayStr(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  private formatDateTimeLocal(iso: string | null | undefined) {
    if (!iso) return '';
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
    if (!e) return;

    this.closeLightbox();
    this.closeImageEditor();

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
      contact: (e.contact ?? '').trim(),
      organisateurId: '',
      slots: this.slotsFromEvent(e),
      public: e.public,
      couleur: e.couleur ?? null,
    });

    if (!this.organizersLoaded) {
      const list = await this.adminService.organizers().toPromise();
      this.organizers.set((list ?? []) as any);
      this.organizersLoaded = true;
    }
  }

  cancelEdit() {
    this.closeImageEditor();
    this.editing.set(false);
    this.saving.set(false);
    this.saveError.set(null);
    this.draft.set(null);
    this.showDeleteConfirm.set(false);
    this.deleting.set(false);
    this.deleteError.set(null);
    this.highlightForm.set(null);
    this.highlightError.set(null);
  }

  openDeleteConfirm() {
    if (!this.editing() || !this.canEdit()) return;
    this.deleteError.set(null);
    this.showDeleteConfirm.set(true);
  }

  closeDeleteConfirm() {
    if (this.deleting()) return;
    this.showDeleteConfirm.set(false);
  }

  async confirmDelete() {
    const e = this.event();
    if (!e || !this.canEdit()) return;

    this.deleting.set(true);
    this.deleteError.set(null);
    try {
      await this.eventsService.remove(e.id).toPromise();
      this.showDeleteConfirm.set(false);
      this.editing.set(false);
      this.draft.set(null);
      await this.router.navigateByUrl('/calendar');
    } catch {
      this.deleteError.set('delete_failed');
    } finally {
      this.deleting.set(false);
    }
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

    this.closeImageEditor();
    this.saving.set(true);
    this.saveError.set(null);

    try {
      const rawContact = (d.contact ?? '').trim();
      const payload: any = {
        titre: d.titre.trim(),
        description: d.description.trim(),
        categorie: d.categorie,
        ville: d.ville.trim(),
        adresse: d.adresse.trim(),
        latitude: d.latitude,
        longitude: d.longitude,
        slots: d.slots,
      };

      const theme = this.cleanText(d.theme);
      if (theme) payload.theme = theme;

      const imageUrl = this.cleanText(d.imageUrl);
      if (imageUrl) payload.imageUrl = imageUrl;

      const couleur = this.cleanText(d.couleur);
      if (couleur) payload.couleur = couleur;

      const tarif = this.cleanText(d.tarif) ?? 'Non renseigné';
      payload.tarif = tarif;

      payload.contact = rawContact ? rawContact : null;

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
    this.geocodedCoords.set(null);
    this.event.set(null);
    this.similar.set([]);
    this.highlights.set([]);
    this.highlightForm.set(null);
    this.highlightError.set(null);
  }

  private async maybeGeocodeEvent(e: EventDto | null) {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!e) return;

    const existingLat = this.coerceCoord(e.latitude);
    const existingLon = this.coerceCoord(e.longitude);
    if (existingLat !== null && existingLon !== null) {
      this.geocodedCoords.set(null);
      return;
    }

    const addr = ((e.adresse ?? e.lieu ?? '') + ' ' + (e.ville ?? '')).trim();
    if (addr.length < 3) return;

    const token = ++this.geocodeToken;
    try {
      const res = await this.photon.search(addr, { limit: 1 }).toPromise();
      if (token !== this.geocodeToken) return;
      const first = (res ?? [])[0];
      const c = first ? this.photon.coords(first) : null;
      this.geocodedCoords.set(c ? { lat: c.lat, lon: c.lon } : null);
    } catch {
      if (token !== this.geocodeToken) return;
      this.geocodedCoords.set(null);
    }
  }

  private async loadEvent(id: string) {
    if (id === this.lastLoadedId) {
      return;
    }

    this.lastLoadedId = id;
    this.loading.set(true);
    this.loadError.set(null);
    this.resetForLoad();
    const token = ++this.loadToken;

    let evt: EventDto | null = null;
    try {
      evt = (await this.eventsService.getOne(id).toPromise()) ?? null;
    } catch {
      if (token !== this.loadToken) return;
      this.loadError.set('load_failed');
      this.loading.set(false);
      return;
    }

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
    this.highlights.set((normalized?.highlights ?? []));
    void this.maybeGeocodeEvent(normalized);

    try {
      const sim = await this.eventsService.similar(id).toPromise();
      if (token !== this.loadToken) return;
      this.similar.set(sim ?? []);
    } catch {
      if (token !== this.loadToken) return;
      this.similar.set([]);
    } finally {
      if (token !== this.loadToken) return;
      this.loading.set(false);
    }
  }

  /** Hook Angular: charge l'événement + la liste "similar" à partir du paramètre `id`. */
  ngOnInit() {
    void this.auth.ensureLoaded()
      .then(() => this.reloadFavorites())
      .catch(() => {
      // Page publique: ne pas bloquer le chargement de l'événement si l'auth échoue (token expiré, backend down, etc.).
      });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pm) => {
      const id = pm.get('id');
      if (!id) return;
      void this.loadEvent(id);
    });
  }

  openBoost() {
    const today = new Date().toISOString().slice(0, 10);
    this.boostStartDate.set(today);
    this.boostDays.set(30);
    this.boostError.set(null);
    this.boostSuccess.set(false);
    this.boostOpen.set(true);
  }

  closeBoost() {
    if (this.boostSaving()) return;
    this.boostOpen.set(false);
    this.boostError.set(null);
    this.boostSuccess.set(false);
  }

  async submitBoost() {
    const e = this.event();
    if (!e) return;
    const days = this.boostDays();
    const startRaw = this.boostStartDate();
    if (!startRaw || days < 1) {
      this.boostError.set('boost_invalid');
      return;
    }
    const startAt = new Date(startRaw);
    startAt.setHours(0, 0, 0, 0);
    const endAt = new Date(startAt.getTime() + days * 24 * 60 * 60 * 1000);
    this.boostSaving.set(true);
    this.boostError.set(null);
    try {
      const created = await this.eventsService
        .createHighlight(e.id, {
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          priority: 0,
        })
        .toPromise();
      if (created) {
        this.highlights.update((list) => [...list, created]);
      }
      this.boostSuccess.set(true);
    } catch {
      this.boostError.set('boost_failed');
    } finally {
      this.boostSaving.set(false);
    }
  }

  openNewHighlight() {
    const now = new Date();
    const start = now.toISOString().slice(0, 16);
    const end30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    this.highlightForm.set({ id: null, startAt: start, endAt: end30, priority: 0 });
    this.highlightError.set(null);
  }

  openEditHighlight(h: HighlightDto) {
    this.highlightForm.set({
      id: h.id,
      startAt: h.startAt.slice(0, 16),
      endAt: h.endAt.slice(0, 16),
      priority: h.priority,
    });
    this.highlightError.set(null);
  }

  cancelHighlightForm() {
    this.highlightForm.set(null);
    this.highlightError.set(null);
  }

  async saveHighlight() {
    const e = this.event();
    const f = this.highlightForm();
    if (!e || !f) return;
    this.highlightSaving.set(true);
    this.highlightError.set(null);
    try {
      const payload = {
        startAt: new Date(f.startAt).toISOString(),
        endAt: new Date(f.endAt).toISOString(),
        priority: f.priority,
      };
      if (f.id) {
        const updated = await this.eventsService.updateHighlight(f.id, payload).toPromise();
        if (updated) {
          this.highlights.update((list) => list.map((h) => (h.id === f.id ? updated : h)));
        }
      } else {
        const created = await this.eventsService.createHighlight(e.id, payload).toPromise();
        if (created) {
          this.highlights.update((list) => [...list, created]);
        }
      }
      this.highlightForm.set(null);
    } catch {
      this.highlightError.set('highlight_save_failed');
    } finally {
      this.highlightSaving.set(false);
    }
  }

  async deleteHighlight(id: string) {
    this.highlightSaving.set(true);
    this.highlightError.set(null);
    try {
      await this.eventsService.deleteHighlight(id).toPromise();
      this.highlights.update((list) => list.filter((h) => h.id !== id));
      if (this.highlightForm()?.id === id) {
        this.highlightForm.set(null);
      }
    } catch {
      this.highlightError.set('highlight_save_failed');
    } finally {
      this.highlightSaving.set(false);
    }
  }

  isHighlightActive(h: HighlightDto): boolean {
    const now = Date.now();
    return new Date(h.startAt).getTime() <= now && new Date(h.endAt).getTime() >= now;
  }

  setHighlightFormField(field: 'startAt' | 'endAt' | 'priority', value: string | number) {
    const f = this.highlightForm();
    if (!f) return;
    this.highlightForm.set({ ...f, [field]: value });
  }

  /** Ajoute/retire l'événement courant des favoris (si connecté). */
  async toggleFavorite() {
    const evt = this.event();
    if (!evt) {
      return;
    }

    if (!this.auth.isLoggedIn()) {
      await this.router.navigateByUrl('/login');
      return;
    }

    const current = this.favoriteIds();
    const next = new Set(current);
    try {
      if (next.has(evt.id)) {
        await this.favoritesService.remove(evt.id).toPromise();
        next.delete(evt.id);
      } else {
        await this.favoritesService.add(evt.id).toPromise();
        next.add(evt.id);
      }
      this.favoriteIds.set(next);
    } catch {
      // ignore
    }
  }
}
