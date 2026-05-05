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
  type: PlaceType;
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
};

const TYPE_LABELS: Record<string, string> = {
  RESTAURANT: 'Restaurant',
  SORTIE: 'Sortie',
  BAR: 'Bar',
  ACTIVITE: 'Activité',
};
const TYPE_ICONS: Record<string, string> = {
  RESTAURANT: '🍽️',
  SORTIE: '🎭',
  BAR: '🍸',
  ACTIVITE: '🏃',
};

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

  readonly typeLabel = computed(() => TYPE_LABELS[this.place()?.type ?? ''] ?? '');
  readonly typeIcon = computed(() => TYPE_ICONS[this.place()?.type ?? ''] ?? '');

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
      type: p.type,
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
    });
    this.editing.set(true);
  }

  cancelEdit() {
    this.editing.set(false);
    this.draft.set(null);
    this.saveError.set(null);
  }

  setDraft(field: keyof PlaceDraft, value: any) {
    const d = this.draft();
    if (!d) return;
    this.draft.set({ ...d, [field]: value });
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
        type: d.type,
        contact: d.contact.trim() || null,
        horaires: d.horaires.trim() || null,
        imageUrl: d.imageUrl.trim() || null,
        sourceUrl: d.sourceUrl.trim() || null,
        tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean),
        featured: d.featured,
        featuredTier: Number(d.featuredTier) || 0,
        featuredStart: d.featuredStart.trim() || null,
        featuredEnd: d.featuredEnd.trim() || null,
        public: d.public,
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
          type: payload.type,
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
