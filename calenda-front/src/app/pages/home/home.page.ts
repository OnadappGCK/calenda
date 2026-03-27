import { DatePipe } from '@angular/common';
import { isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { API_BASE_URL } from '../../core/api.config';
import { EventsService, EventDto } from '../../core/events.service';
import { NewsService, NewsDto } from '../../core/news.service';
import { categoryColor, resolveEventImageUrl, tagIcon } from '../../core/event-ui';
import { I18nService } from '../../core/i18n.service';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, DatePipe],
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
    const upcoming = this.allEvents().filter(e => {
      const end = e.dateFin ? new Date(e.dateFin) : new Date(e.dateDebut);
      return end >= now;
    });
    const map = new Map<string, EventDto[]>();
    for (const e of upcoming) {
      const cat = e.categorie;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(e);
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
    return resolveEventImageUrl(e.categorie, e.imageUrl);
  }

  private autoTimer: any = null;

  /** Hook Angular: charge featured + news, et démarre l'auto-rotation côté navigateur. */
  async ngOnInit() {
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
  }

  /** Hook Angular: stoppe le timer d'auto-rotation du carrousel. */
  ngOnDestroy() {
    if (this.autoTimer) {
      clearInterval(this.autoTimer);
      this.autoTimer = null;
    }
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
