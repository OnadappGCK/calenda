import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { API_BASE_URL } from '../../core/api.config';
import { AdminService } from '../../core/admin.service';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n.service';
import { PlacesService, PlaceDto, PlaceType, CreatePlaceDto } from '../../core/places.service';

type PlaceDraft = {
  nom: string;
  description: string;
  adresse: string;
  ville: string;
  types: PlaceType[];
  contact: string;
  horaires: string;
  imageUrl: string;
  sourceUrl: string;
  tags: string;
  featured: boolean;
  featuredTier: number;
  featuredStart: string;
  featuredEnd: string;
  public: boolean;
  proprietaireId: string;
};

const TYPE_LABELS: Record<PlaceType, string> = {
  RESTAURANT: 'Restaurant',
  SORTIE: 'Sortie',
  BAR: 'Bar',
  ACTIVITE: 'Activité',
};
const TYPE_ICONS: Record<PlaceType, string> = {
  RESTAURANT: '🍽️',
  SORTIE: '🎭',
  BAR: '🍸',
  ACTIVITE: '🏃',
};
const TYPES: PlaceType[] = ['RESTAURANT', 'SORTIE', 'BAR', 'ACTIVITE'];

const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] as const;
type JourSemaine = typeof JOURS_SEMAINE[number];
type HoraireSlot = { jour: JourSemaine; heureDebut: string; heureFin: string; actif: boolean };

@Component({
  selector: 'app-place-detail-page',
  imports: [FormsModule],
  templateUrl: './place-detail.page.html',
  styleUrl: './place-detail.page.scss',
})
export class PlaceDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly svc = inject(PlacesService);
  private readonly adminSvc = inject(AdminService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly apiBase = inject(API_BASE_URL);
  private readonly apiHost = this.apiBase.replace(/\/api\/?$/, '');
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  readonly place = signal<PlaceDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly editing = signal(false);
  readonly draft = signal<PlaceDraft | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly JOURS_SEMAINE = JOURS_SEMAINE;
  readonly TYPES = TYPES;
  readonly TYPE_LABELS = TYPE_LABELS;
  readonly TYPE_ICONS = TYPE_ICONS;
  editHorairesMode: 'simple' | 'custom' = 'simple';
  editJourDebut = 'Lundi';
  editJourFin = 'Dimanche';
  editHeureDebut = '';
  editHeureFin = '';
  editHorairesSlots: HoraireSlot[] = this.defaultEditSlots();

  readonly editUserSearch = signal('');
  readonly editUserResults = signal<{ id: string; pseudo: string; email: string }[]>([]);
  readonly editUserSearching = signal(false);

  private defaultEditSlots(): HoraireSlot[] {
    return JOURS_SEMAINE.map(j => ({ jour: j, heureDebut: '', heureFin: '', actif: false }));
  }

  parseHorairesForEdit(h: string | null): void {
    if (!h) { this.editHorairesMode = 'simple'; this.editJourDebut = 'Lundi'; this.editJourFin = 'Dimanche'; this.editHeureDebut = ''; this.editHeureFin = ''; this.editHorairesSlots = this.defaultEditSlots(); return; }
    try {
      const p = JSON.parse(h);
      if (p.mode === 'simple') {
        this.editHorairesMode = 'simple';
        this.editJourDebut = p.jourDebut ?? 'Lundi';
        this.editJourFin = p.jourFin ?? 'Dimanche';
        this.editHeureDebut = p.heureDebut ?? '';
        this.editHeureFin = p.heureFin ?? '';
        this.editHorairesSlots = this.defaultEditSlots();
      } else if (p.mode === 'custom' && Array.isArray(p.slots)) {
        this.editHorairesMode = 'custom';
        this.editHorairesSlots = this.defaultEditSlots().map(s => {
          const found = (p.slots as any[]).find(sl => sl.jour === s.jour);
          return found ? { ...s, actif: true, heureDebut: found.heureDebut ?? '', heureFin: found.heureFin ?? '' } : s;
        });
      } else {
        this.editHorairesMode = 'simple'; this.editJourDebut = 'Lundi'; this.editJourFin = 'Dimanche'; this.editHeureDebut = ''; this.editHeureFin = ''; this.editHorairesSlots = this.defaultEditSlots();
      }
    } catch { this.editHorairesMode = 'simple'; this.editJourDebut = 'Lundi'; this.editJourFin = 'Dimanche'; this.editHeureDebut = ''; this.editHeureFin = ''; this.editHorairesSlots = this.defaultEditSlots(); }
  }

  buildEditHoraires(): string | null {
    if (this.editHorairesMode === 'simple') {
      if (!this.editHeureDebut && !this.editHeureFin) return null;
      return JSON.stringify({ mode: 'simple', jourDebut: this.editJourDebut, jourFin: this.editJourFin, heureDebut: this.editHeureDebut, heureFin: this.editHeureFin });
    }
    const slots = this.editHorairesSlots.filter(s => s.actif);
    if (!slots.length) return null;
    return JSON.stringify({ mode: 'custom', slots: slots.map(s => ({ jour: s.jour, heureDebut: s.heureDebut, heureFin: s.heureFin })) });
  }

  switchEditHorairesMode(mode: 'simple' | 'custom') {
    if (mode === 'custom') {
      const iStart = JOURS_SEMAINE.indexOf(this.editJourDebut as JourSemaine);
      const iEnd = JOURS_SEMAINE.indexOf(this.editJourFin as JourSemaine);
      this.editHorairesSlots = this.defaultEditSlots().map((s, i) => ({
        ...s,
        actif: i >= iStart && i <= iEnd,
        heureDebut: this.editHeureDebut,
        heureFin: this.editHeureFin,
      }));
    }
    this.editHorairesMode = mode;
  }

  async searchEditUser(q: string) {
    this.editUserSearch.set(q);
    if (!q.trim()) { this.editUserResults.set([]); return; }
    this.editUserSearching.set(true);
    try {
      const users = await this.adminSvc.users({ q }).toPromise();
      this.editUserResults.set((users ?? []) as { id: string; pseudo: string; email: string }[]);
    } finally { this.editUserSearching.set(false); }
  }

  selectEditUser(user: { id: string; pseudo: string }) {
    this.setDraft('proprietaireId', user.id);
    this.editUserSearch.set(user.pseudo);
    this.editUserResults.set([]);
  }

  clearEditUser() {
    this.setDraft('proprietaireId', '');
    this.editUserSearch.set('');
    this.editUserResults.set([]);
  }

  readonly typeLabels = computed(() => (this.place()?.types ?? []).map((t) => TYPE_LABELS[t] ?? t));
  readonly typeIcons = computed(() => (this.place()?.types ?? []).map((t) => TYPE_ICONS[t] ?? t));
  readonly typeLabel = computed(() => this.typeLabels().join(' · ') || 'Établissement');
  readonly typeIcon = computed(() => this.typeIcons().join(' '));

  readonly mapUrl = computed((): SafeResourceUrl | null => {
    const p = this.place();
    if (!p) return null;
    if (p.latitude && p.longitude) {
      const lat = p.latitude;
      const lon = p.longitude;
      const delta = 0.005;
      const url = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - delta},${lat - delta},${lon + delta},${lat + delta}&layer=mapnik&marker=${lat},${lon}`;
      return this.sanitizer.bypassSecurityTrustResourceUrl(url);
    }
    return null;
  });

  readonly googleMapsUrl = computed((): string | null => {
    const p = this.place();
    if (!p) return null;
    if (p.latitude && p.longitude) {
      return `https://www.google.com/maps?q=${p.latitude},${p.longitude}`;
    }
    if (p.adresse) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.adresse + (p.ville ? ', ' + p.ville : ''))}`;
    }
    return null;
  });

  placeImageUrl(p: PlaceDto): string | null {
    const raw = (p.imageUrl ?? '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/')) return `${this.apiHost}${raw}`;
    return `${this.apiHost}/${raw}`;
  }

  get isAdmin(): boolean { return this.auth.user()?.isAdmin ?? false; }

  displayHoraires(h: string | null): string {
    if (!h) return '';
    try {
      const p = JSON.parse(h);
      if (p.mode === 'simple') {
        const jours = `${p.jourDebut || '?'} au ${p.jourFin || '?'}`;
        return p.heureDebut || p.heureFin ? `${jours} · ${p.heureDebut || '?'}h \u2192 ${p.heureFin || '?'}h` : jours;
      }
      if (p.mode === 'custom' && Array.isArray(p.slots)) {
        return (p.slots as any[]).map((s) => `${s.jour}\u00a0: ${s.heureDebut || '?'} \u2192 ${s.heureFin || '?'}`).join(' · ');
      }
      return h;
    } catch { return h; }
  }
  get isOwner(): boolean { return !!this.auth.user() && this.place()?.proprietaireId === this.auth.user()!.id; }
  get canEdit(): boolean { return this.isAdmin || this.isOwner; }

  startEdit() {
    const p = this.place();
    if (!p) return;
    this.saveError.set(null);
    this.draft.set({
      nom: p.nom,
      description: p.description ?? '',
      adresse: p.adresse ?? '',
      ville: p.ville ?? '',
      types: p.types ?? [],
      contact: p.contact ?? '',
      horaires: p.horaires ?? '',
      imageUrl: p.imageUrl ?? '',
      sourceUrl: p.sourceUrl ?? '',
      tags: (p.tags ?? []).join(', '),
      featured: p.featured,
      featuredTier: p.featuredTier ?? 0,
      featuredStart: p.featuredStart ?? '',
      featuredEnd: p.featuredEnd ?? '',
      public: p.public,
      proprietaireId: p.proprietaireId ?? '',
    });
    this.editUserSearch.set(p.proprietairePseudo ?? '');
    this.editUserResults.set([]);
    this.parseHorairesForEdit(p.horaires ?? null);
    this.editing.set(true);
  }

  cancelEdit() {
    this.editing.set(false);
    this.draft.set(null);
    this.saveError.set(null);
    this.editUserSearch.set('');
    this.editUserResults.set([]);
    this.editHorairesMode = 'simple';
    this.editJourDebut = 'Lundi';
    this.editJourFin = 'Dimanche';
    this.editHeureDebut = '';
    this.editHeureFin = '';
    this.editHorairesSlots = this.defaultEditSlots();
  }

  setDraft(field: keyof PlaceDraft, value: any) {
    const d = this.draft();
    if (!d) return;
    this.draft.set({ ...d, [field]: value });
  }

  toggleDraftType(t: PlaceType) {
    const d = this.draft();
    if (!d) return;
    const current = d.types ?? [];
    const types = current.includes(t) ? current.filter((x) => x !== t) : [...current, t];
    this.draft.set({ ...d, types });
  }

  async save() {
    const id = this.place()?.id;
    const d = this.draft();
    if (!id || !d) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const payload = {
        nom: d.nom.trim(),
        description: d.description.trim() || null,
        adresse: d.adresse.trim() || null,
        ville: d.ville.trim() || null,
        types: d.types,
        contact: d.contact.trim() || null,
        horaires: this.buildEditHoraires(),
        imageUrl: d.imageUrl.trim() || null,
        sourceUrl: d.sourceUrl.trim() || null,
        tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean),
        featured: d.featured,
        featuredTier: Number(d.featuredTier) || 0,
        featuredStart: d.featuredStart.trim() || null,
        featuredEnd: d.featuredEnd.trim() || null,
        public: d.public,
        proprietaireId: d.proprietaireId.trim() || null,
      };
      let updated: PlaceDto;
      if (this.isAdmin) {
        updated = await this.adminSvc.updateEtablissement(id, payload).toPromise() as PlaceDto;
      } else {
        const ownerPayload: Partial<CreatePlaceDto> = {
          nom: payload.nom,
          description: payload.description,
          adresse: payload.adresse,
          ville: payload.ville,
          types: payload.types,
          contact: payload.contact,
          horaires: payload.horaires,
          imageUrl: payload.imageUrl,
          sourceUrl: payload.sourceUrl,
          tags: payload.tags,
        };
        updated = await this.svc.update(id, ownerPayload).toPromise() as PlaceDto;
      }
      this.place.set(updated);
      this.cancelEdit();
    } catch (err: any) {
      this.saveError.set(err?.error?.message ?? 'Erreur lors de la sauvegarde');
    } finally {
      this.saving.set(false);
    }
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.error.set('ID manquant'); this.loading.set(false); return; }
    try {
      const p = await this.svc.getOne(id).toPromise();
      this.place.set(p ?? null);
    } catch {
      this.error.set('Établissement introuvable');
    } finally {
      this.loading.set(false);
    }
  }
}
