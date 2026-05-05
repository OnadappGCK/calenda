import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { API_BASE_URL } from '../../core/api.config';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n.service';
import { PlacesService, PlaceDto, PlaceType, CreatePlaceDto } from '../../core/places.service';
import { AdminService } from '../../core/admin.service';

const TYPE_LABELS: Record<PlaceType, string> = {
  RESTAURANT: 'Pour manger',
  SORTIE: 'Pour sortir',
  BAR: 'Pour boire un coup',
  ACTIVITE: 'Activité',
};

const TYPE_LABELS_HERO: Record<PlaceType, string> = {
  RESTAURANT: 'POUR MANGER',
  SORTIE: 'POUR SORTIR',
  BAR: 'POUR BOIRE UN COUP',
  ACTIVITE: "POUR S'ACTIVER",
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
export class PlacesPage implements OnInit, OnDestroy {
  private readonly placesService = inject(PlacesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly apiBase = inject(API_BASE_URL);
  private readonly apiHost = this.apiBase.replace(/\/api\/?$/, '');
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  private readonly adminService = inject(AdminService);

  readonly TYPE_LABELS = TYPE_LABELS;
  readonly TYPE_LABELS_HERO = TYPE_LABELS_HERO;
  readonly TYPE_ICONS = TYPE_ICONS;
  readonly TYPES: PlaceType[] = ['RESTAURANT', 'SORTIE', 'BAR', 'ACTIVITE'];

  readonly selectedType = signal<PlaceType>('RESTAURANT');
  readonly selectedTags = signal<Set<string>>(new Set());
  readonly searchName = signal('');
  readonly searchAddress = signal('');
  readonly filterOpenAt = signal('');  // HH:MM
  readonly allPlaces = signal<PlaceDto[]>([]);
  readonly topTags = signal<{ tag: string; count: number }[]>([]);
  readonly loading = signal(true);

  readonly topCities = computed(() => {
    const places = this.allPlaces().filter((p) => p.type === this.selectedType());
    const counts = new Map<string, number>();
    for (const p of places) {
      if (p.ville) counts.set(p.ville, (counts.get(p.ville) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ville]) => ville);
  });

  readonly filteredPlaces = computed(() => {
    const tags = this.selectedTags();
    const name = this.searchName().toLowerCase().trim();
    const addr = this.searchAddress().toLowerCase().trim();
    const openAt = this.filterOpenAt().trim();
    let places = this.allPlaces().filter((p) => p.type === this.selectedType());
    if (tags.size > 0) {
      places = places.filter((p) => [...tags].every((t) => (p.tags ?? []).includes(t)));
    }
    if (name) {
      places = places.filter((p) => p.nom.toLowerCase().includes(name));
    }
    if (addr) {
      places = places.filter(
        (p) =>
          (p.adresse ?? '').toLowerCase().includes(addr) ||
          (p.ville ?? '').toLowerCase().includes(addr),
      );
    }
    if (openAt) {
      places = places.filter((p) => {
        const ouv = p.heureOuverture;
        const fer = p.heureFermeture;
        if (!ouv || !fer) return true;
        return openAt >= ouv && openAt <= fer;
      });
    }
    return places;
  });

  /** Établissements mis en avant pour le carousel (date active + tier > 0, triés par tier desc). */
  readonly carouselPlaces = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    return this.filteredPlaces()
      .filter((p) => {
        if ((p.featuredTier ?? 0) <= 0) return false;
        if (p.featuredStart && today < p.featuredStart) return false;
        if (p.featuredEnd && today > p.featuredEnd) return false;
        return true;
      })
      .sort((a, b) => (b.featuredTier ?? 0) - (a.featuredTier ?? 0));
  });

  readonly carouselIdx = signal(0);
  private carouselTimer: ReturnType<typeof setInterval> | null = null;

  readonly gridPlaces = computed(() => this.filteredPlaces());

  carouselTierBadge(tier: number): string {
    if (tier >= 3) return '⭐⭐ Premium';
    if (tier === 2) return '⭐ À la une';
    return '✨ Sélection';
  }

  prevSlide() {
    const len = this.carouselPlaces().length;
    if (!len) return;
    this.carouselIdx.update((i) => (i - 1 + len) % len);
    this.resetTimer();
  }

  nextSlide() {
    const len = this.carouselPlaces().length;
    if (!len) return;
    this.carouselIdx.update((i) => (i + 1) % len);
    this.resetTimer();
  }

  goToSlide(i: number) {
    this.carouselIdx.set(i);
    this.resetTimer();
  }

  pauseCarousel() {
    if (this.carouselTimer) { clearInterval(this.carouselTimer); this.carouselTimer = null; }
  }

  resumeCarousel() { this.startTimer(); }

  private startTimer() {
    if (this.carouselTimer) clearInterval(this.carouselTimer);
    this.carouselTimer = setInterval(() => {
      const len = this.carouselPlaces().length;
      if (len > 1) this.carouselIdx.update((i) => (i + 1) % len);
    }, 5000);
  }

  private resetTimer() {
    if (this.carouselTimer) clearInterval(this.carouselTimer);
    this.startTimer();
  }

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
  newProprietaireId = '';
  newUserSearch = '';
  readonly newUserResults = signal<{ id: string; pseudo: string; email: string }[]>([]);
  readonly newUserSearching = signal(false);
  saving = false;

  async searchNewUser(q: string) {
    this.newUserSearch = q;
    if (!q.trim()) { this.newUserResults.set([]); return; }
    this.newUserSearching.set(true);
    try {
      const users = await this.adminService.users({ q }).toPromise();
      this.newUserResults.set((users ?? []) as { id: string; pseudo: string; email: string }[]);
    } finally {
      this.newUserSearching.set(false);
    }
  }

  selectNewUser(user: { id: string; pseudo: string }) {
    this.newProprietaireId = user.id;
    this.newUserSearch = user.pseudo;
    this.newUserResults.set([]);
  }

  clearNewUser() {
    this.newProprietaireId = '';
    this.newUserSearch = '';
    this.newUserResults.set([]);
  }

  async ngOnInit() {
    const typeParam = this.route.snapshot.queryParamMap.get('type') as PlaceType | null;
    if (typeParam && this.TYPES.includes(typeParam)) {
      this.selectedType.set(typeParam);
      this.newType = typeParam;
    }

    await this.loadPlaces();
    this.startTimer();
  }

  ngOnDestroy() {
    if (this.carouselTimer) clearInterval(this.carouselTimer);
  }

  async selectType(type: PlaceType) {
    this.selectedType.set(type);
    this.carouselIdx.set(0);
    this.selectedTags.set(new Set());
    this.searchName.set('');
    this.searchAddress.set('');
    this.filterOpenAt.set('');
    await this.router.navigate([], { queryParams: { type }, replaceUrl: true });
    await this.loadTags();
  }

  selectCity(ville: string) {
    this.searchAddress.set(ville);
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

  clearTags() {
    this.selectedTags.set(new Set());
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
        proprietaireId: this.newProprietaireId || null,
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
    this.newProprietaireId = '';
    this.newUserSearch = '';
    this.newUserResults.set([]);
  }
}
