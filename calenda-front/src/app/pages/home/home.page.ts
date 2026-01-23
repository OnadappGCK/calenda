import { DatePipe } from '@angular/common';
import { isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventsService, EventDto } from '../../core/events.service';
import { NewsService, NewsDto } from '../../core/news.service';
import { categoryColor, categoryIcon } from '../../core/event-ui';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, DatePipe],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage implements OnInit, OnDestroy {
  private readonly eventsService = inject(EventsService);
  private readonly newsService = inject(NewsService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly featured = signal<EventDto[]>([]);
  readonly news = signal<NewsDto[]>([]);

  readonly featuredIndex = signal<number>(0);
  readonly currentFeatured = computed(() => {
    const items = this.featured();
    if (items.length === 0) {
      return null;
    }
    const idx = ((this.featuredIndex() % items.length) + items.length) % items.length;
    return items[idx] ?? null;
  });

  protected readonly categoryColor = categoryColor;
  protected readonly categoryIcon = categoryIcon;

  private autoTimer: any = null;

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
  }

  ngOnDestroy() {
    if (this.autoTimer) {
      clearInterval(this.autoTimer);
      this.autoTimer = null;
    }
  }

  prevFeatured() {
    this.featuredIndex.set(this.featuredIndex() - 1);
  }

  nextFeatured() {
    this.featuredIndex.set(this.featuredIndex() + 1);
  }

  setFeatured(i: number) {
    this.featuredIndex.set(i);
  }
}
