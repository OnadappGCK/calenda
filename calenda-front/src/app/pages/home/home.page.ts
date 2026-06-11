import { DatePipe } from '@angular/common';
import { isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { API_BASE_URL } from '../../core/api.config';
import { EventsService, EventDto } from '../../core/events.service';
import { NewsService, NewsDto } from '../../core/news.service';
import { categoryColor, normalizeCategory, resolveEventImageUrl, tagIcon } from '../../core/event-ui';
import { EventImgFallbackDirective } from '../../shared/event-img-fallback.directive';
import { I18nService } from '../../core/i18n.service';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, DatePipe, EventImgFallbackDirective],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
/**
 * Page d'accueil.
 * Charge les événements mis en avant et les news, et gère le carrousel (auto + navigation).
 */
export class HomePage implements OnInit, OnDestroy {
  private readonly eventsService = inject(EventsService);
  private readonly newsService = inject(NewsService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly apiHost = this.apiBaseUrl.replace(/\/api\/?$/, '');
  protected readonly i18n = inject(I18nService);

  readonly featured = signal<EventDto[]>([]);
  readonly news = signal<NewsDto[]>([]);
  readonly allEvents = signal<EventDto[]>([]);

  readonly eventsByCategory = computed(() => {
    const now = new Date();
    const seenIds = new Set<string>();
    // key = titre normalisé + catégorie → garde uniquement le prochain créneau
    const byTitleCat = new Map<string, EventDto>();

    for (const e of this.allEvents()) {
      if (seenIds.has(e.id)) continue;
      seenIds.add(e.id);

      let nextDate: Date | null = null;

      if (e.slots && e.slots.length > 0) {
        const upcoming = e.slots
          .map(s => new Date(`${s.date}T${s.heureDebut}:00`))
          .filter(d => d >= now)
          .sort((a, b) => a.getTime() - b.getTime());
        if (upcoming.length === 0) continue;
        nextDate = upcoming[0];
      } else {
        const end = e.dateFin ? new Date(e.dateFin) : new Date(e.dateDebut);
        if (end < now) continue;
        nextDate = new Date(e.dateDebut);
      }

      const key = `${e.categorie}||${e.titre.trim().toLowerCase()}`;
      const existing = byTitleCat.get(key);
      if (!existing || nextDate.getTime() < new Date(existing.dateDebut).getTime()) {
        byTitleCat.set(key, { ...e, dateDebut: nextDate.toISOString() });
      }
    }

    const map = new Map<string, EventDto[]>();
    for (const e of byTitleCat.values()) {
      const cat = normalizeCategory(e.categorie);
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push({ ...e, categorie: cat });
    }
    for (const evts of map.values()) {
      evts.sort((a, b) => new Date(a.dateDebut).getTime() - new Date(b.dateDebut).getTime());
    }
    return Array.from(map.entries()).filter(([, evts]) => evts.length > 0);
  });

  readonly featuredIndex = signal<number>(0);
  readonly normalizedFeaturedIndex = computed(() => {
    const items = this.featured();
    if (items.length === 0) {
      return 0;
    }
    const idx = this.featuredIndex();
    return ((idx % items.length) + items.length) % items.length;
  });
  readonly currentFeatured = computed(() => {
    const items = this.featured();
    if (items.length === 0) {
      return null;
    }
    return items[this.normalizedFeaturedIndex()] ?? null;
  });

  protected readonly categoryColor = categoryColor;
  protected readonly tagIcon = tagIcon;
  protected readonly resolveEventImageUrl = resolveEventImageUrl;

  newsImageUrl(image: string | null): string | null {
    const raw = (image ?? '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/')) return `${this.apiHost}${raw}`;
    return `${this.apiHost}/${raw}`;
  }

  featuredImageUrl(e: EventDto) {
    return resolveEventImageUrl(e.categorie, e.imageUrl, e.id);
  }

  private autoTimer: any = null;
  private scrollTimers: any[] = [];

  private forceTopSequence() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    for (const delay of [0, 80, 250, 800, 1600]) {
      const timer = setTimeout(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }, delay);
      this.scrollTimers.push(timer);
    }
  }

  /** Hook Angular: charge featured + news, et démarre l'auto-rotation côté navigateur. */
  async ngOnInit() {
    this.forceTopSequence();

    const featured = await this.eventsService.featured().toPromise();
    this.featured.set(featured ?? []);

    if (isPlatformBrowser(this.platformId) && (featured?.length ?? 0) > 1) {
      this.autoTimer = setInterval(() => {
        this.nextFeatured();
      }, 8000);
    }

    const news = await this.newsService.list(1, 5).toPromise();
    this.news.set(news?.items ?? []);

    const all = await this.eventsService.list().toPromise();
    this.allEvents.set(all ?? []);

    this.forceTopSequence();
  }

  /** Hook Angular: stoppe le timer d'auto-rotation du carrousel. */
  ngOnDestroy() {
    if (this.autoTimer) {
      clearInterval(this.autoTimer);
      this.autoTimer = null;
    }

    for (const timer of this.scrollTimers) {
      clearTimeout(timer);
    }
    this.scrollTimers = [];
  }

  /** Va au slide précédent du carrousel. */
  prevFeatured() {
    this.featuredIndex.set(this.featuredIndex() - 1);
  }

  /** Va au slide suivant du carrousel. */
  nextFeatured() {
    this.featuredIndex.set(this.featuredIndex() + 1);
  }

  /** Force l'affichage du slide `i`. */
  setFeatured(i: number) {
    this.featuredIndex.set(i);
  }
}
