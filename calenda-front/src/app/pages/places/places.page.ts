import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { API_BASE_URL } from '../../core/api.config';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n.service';
import { PlacesService, PlaceDto, PlaceType, CreatePlaceDto } from '../../core/places.service';

const TYPE_LABELS: Record<PlaceType, string> = {
  RESTAURANT: 'Pour manger',
  SORTIE: 'Pour sortir',
  BAR: 'Pour boire un coup',
  ACTIVITE: 'Activité',
};

const TYPE_ICONS: Record<PlaceType, string> = {
  RESTAURANT: '🍽️',
  SORTIE: '🎭',
  BAR: '🍸',
  ACTIVITE: '🏃',
};

@Component({
  selector: 'app-places-page',
  imports: [RouterLink, FormsModule],
  templateUrl: './places.page.html',
  styleUrl: './places.page.scss',
})
export class PlacesPage implements OnInit {
  private readonly placesService = inject(PlacesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly apiBase = inject(API_BASE_URL);
  private readonly apiHost = this.apiBase.replace(/\/api\/?$/, '');
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  readonly TYPE_LABELS = TYPE_LABELS;
  readonly TYPE_ICONS = TYPE_ICONS;
  readonly TYPES: PlaceType[] = ['RESTAURANT', 'SORTIE', 'BAR', 'ACTIVITE'];

  readonly selectedType = signal<PlaceType>('RESTAURANT');
  readonly selectedTags = signal<Set<string>>(new Set());
  readonly allPlaces = signal<PlaceDto[]>([]);
  readonly topTags = signal<{ tag: string; count: number }[]>([]);
  readonly loading = signal(true);

  readonly filteredPlaces = computed(() => {
    const tags = this.selectedTags();
    const places = this.allPlaces().filter((p) => p.type === this.selectedType());
    if (tags.size === 0) return places;
    return places.filter((p) => [...tags].every((t) => (p.tags ?? []).includes(t)));
  });

  readonly featuredPlace = computed(() =>
    this.filteredPlaces().find((p) => p.featured) ?? this.filteredPlaces()[0] ?? null,
  );

  readonly gridPlaces = computed(() => {
    const featured = this.featuredPlace();
    if (!featured) return this.filteredPlaces();
    return this.filteredPlaces().filter((p) => p.id !== featured.id);
  });

  readonly typeLabel = computed(() => TYPE_LABELS[this.selectedType()]);

  readonly isAdmin = computed(() => this.auth.user()?.isAdmin ?? false);

  /** Formulaire création */
  showCreateForm = false;
  newNom = '';
  newDescription = '';
  newAdresse = '';
  newVille = '';
  newContact = '';
  newHoraires = '';
  newImageUrl = '';
  newType: PlaceType = 'RESTAURANT';
  newTags: string[] = [];
  newTagInput = '';
  allTagsForForm = signal<{ tag: string; count: number }[]>([]);
  saving = false;

  async ngOnInit() {
    const typeParam = this.route.snapshot.queryParamMap.get('type') as PlaceType | null;
    if (typeParam && this.TYPES.includes(typeParam)) {
      this.selectedType.set(typeParam);
      this.newType = typeParam;
    }

    await this.loadPlaces();
  }

  async selectType(type: PlaceType) {
    this.selectedType.set(type);
    this.selectedTags.set(new Set());
    await this.router.navigate([], { queryParams: { type }, replaceUrl: true });
    await this.loadTags();
  }

  private async loadPlaces() {
    this.loading.set(true);
    try {
      const [places, tags] = await Promise.all([
        this.placesService.list().toPromise(),
        this.placesService.topTags(this.selectedType(), 5).toPromise(),
      ]);
      this.allPlaces.set(places ?? []);
      this.topTags.set(tags ?? []);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadTags() {
    const tags = await this.placesService.topTags(this.selectedType(), 5).toPromise();
    this.topTags.set(tags ?? []);
  }

  toggleTag(tag: string) {
    const s = new Set(this.selectedTags());
    if (s.has(tag)) s.delete(tag);
    else s.add(tag);
    this.selectedTags.set(s);
  }

  isTagSelected(tag: string) {
    return this.selectedTags().has(tag);
  }

  placeImageUrl(p: PlaceDto): string | null {
    const raw = (p.imageUrl ?? '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/')) return `${this.apiHost}${raw}`;
    return `${this.apiHost}/${raw}`;
  }

  async openCreateForm() {
    this.showCreateForm = true;
    this.newType = this.selectedType();
    const tags = await this.placesService.allTags().toPromise();
    this.allTagsForForm.set(tags ?? []);
  }

  addTagFromInput() {
    const t = this.newTagInput.trim();
    if (t && !this.newTags.includes(t)) this.newTags = [...this.newTags, t];
    this.newTagInput = '';
  }

  addExistingTag(tag: string) {
    if (!this.newTags.includes(tag)) this.newTags = [...this.newTags, tag];
  }

  removeNewTag(tag: string) {
    this.newTags = this.newTags.filter((t) => t !== tag);
  }

  async submitCreate() {
    if (!this.newNom.trim()) return;
    this.saving = true;
    try {
      const dto: CreatePlaceDto = {
        nom: this.newNom.trim(),
        description: this.newDescription.trim() || null,
        adresse: this.newAdresse.trim() || null,
        ville: this.newVille.trim() || null,
        imageUrl: this.newImageUrl.trim() || null,
        contact: this.newContact.trim() || null,
        horaires: this.newHoraires.trim() || null,
        type: this.newType,
        tags: this.newTags,
      };
      const created = await this.placesService.create(dto).toPromise();
      if (created) {
        this.allPlaces.set([created, ...this.allPlaces()]);
      }
      this.resetCreateForm();
    } finally {
      this.saving = false;
    }
  }

  cancelCreate() {
    this.resetCreateForm();
  }

  private resetCreateForm() {
    this.showCreateForm = false;
    this.newNom = '';
    this.newDescription = '';
    this.newAdresse = '';
    this.newVille = '';
    this.newContact = '';
    this.newHoraires = '';
    this.newImageUrl = '';
    this.newTags = [];
    this.newTagInput = '';
  }
}
