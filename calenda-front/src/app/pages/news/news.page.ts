import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { NewsService, NewsDto } from '../../core/news.service';

@Component({
  selector: 'app-news-page',
  imports: [DatePipe],
  templateUrl: './news.page.html',
  styleUrl: './news.page.scss',
})
export class NewsPage implements OnInit {
  private readonly newsService = inject(NewsService);

  readonly items = signal<NewsDto[]>([]);
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(5);
  readonly total = signal<number>(0);

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    const res = await this.newsService.list(this.page(), this.pageSize()).toPromise();
    this.items.set(res?.items ?? []);
    this.total.set(res?.total ?? 0);
  }

  async prev() {
    if (this.page() <= 1) return;
    this.page.set(this.page() - 1);
    await this.reload();
  }

  async next() {
    const maxPage = Math.max(1, Math.ceil(this.total() / this.pageSize()));
    if (this.page() >= maxPage) return;
    this.page.set(this.page() + 1);
    await this.reload();
  }
}
