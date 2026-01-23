import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { NewsService, NewsDto } from '../../core/news.service';

@Component({
  selector: 'app-news-page',
  imports: [DatePipe],
  templateUrl: './news.page.html',
  styleUrl: './news.page.scss',
})
/**
 * Page News.
 * Affiche une liste paginée de news (page/pageSize) en s'appuyant sur `NewsService`.
 */
export class NewsPage implements OnInit {
  private readonly newsService = inject(NewsService);

  readonly items = signal<NewsDto[]>([]);
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(5);
  readonly total = signal<number>(0);

  /** Hook Angular: charge la première page de news. */
  async ngOnInit() {
    await this.reload();
  }

  /** Recharge la page courante de news et met à jour `items` et `total`. */
  async reload() {
    const res = await this.newsService.list(this.page(), this.pageSize()).toPromise();
    this.items.set(res?.items ?? []);
    this.total.set(res?.total ?? 0);
  }

  /** Va à la page précédente si possible. */
  async prev() {
    if (this.page() <= 1) return;
    this.page.set(this.page() - 1);
    await this.reload();
  }

  /** Va à la page suivante si possible. */
  async next() {
    const maxPage = Math.max(1, Math.ceil(this.total() / this.pageSize()));
    if (this.page() >= maxPage) return;
    this.page.set(this.page() + 1);
    await this.reload();
  }
}
