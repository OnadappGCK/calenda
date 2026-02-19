import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { API_BASE_URL } from '../../core/api.config';
import { AuthService } from '../../core/auth.service';
import { NewsService, NewsDto } from '../../core/news.service';

@Component({
  selector: 'app-news-page',
  imports: [DatePipe, FormsModule],
  templateUrl: './news.page.html',
  styleUrl: './news.page.scss',
})
/**
 * Page News.
 * Affiche une liste paginée de news (page/pageSize) en s'appuyant sur `NewsService`.
 */
export class NewsPage implements OnInit {
  private readonly newsService = inject(NewsService);
  private readonly auth = inject(AuthService);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  protected readonly isAdmin = computed(() => this.auth.user()?.role === 'ADMIN');

  private readonly apiHost = this.apiBaseUrl.replace(/\/api\/?$/, '');

  readonly items = signal<NewsDto[]>([]);
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(5);
  readonly total = signal<number>(0);

  readonly showCreate = signal(false);
  readonly showEdit = signal(false);
  readonly deleteId = signal<string | null>(null);

  readonly create = signal<{ titre: string; datePublication: string; texte: string }>({
    titre: '',
    datePublication: '',
    texte: '',
  });
  readonly createFile = signal<File | null>(null);
  readonly createPreviewUrl = signal<string | null>(null);

  readonly edit = signal<{ id: string; titre: string; datePublication: string; texte: string; image: string | null; removeImage: boolean } | null>(
    null,
  );
  readonly editFile = signal<File | null>(null);
  readonly editPreviewUrl = signal<string | null>(null);

  private isoDate(d: Date) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /** Hook Angular: charge la première page de news. */
  async ngOnInit() {
    await this.auth.ensureLoaded();
    await this.reload();
  }

  newsImageUrl(image: string | null) {
    const raw = (image ?? '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/')) return `${this.apiHost}${raw}`;
    return `${this.apiHost}/${raw}`;
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

  openCreate() {
    this.create.set({
      titre: '',
      datePublication: this.isoDate(new Date()),
      texte: '',
    });
    this.setCreateFile(null);
    this.showCreate.set(true);
  }

  closeCreate() {
    this.showCreate.set(false);
    this.setCreateFile(null);
  }

  setCreateFile(file: File | null) {
    const prev = this.createPreviewUrl();
    if (prev) {
      URL.revokeObjectURL(prev);
    }
    this.createFile.set(file);
    this.createPreviewUrl.set(file ? URL.createObjectURL(file) : null);
  }

  onCreateFileChange(ev: Event) {
    const f = (ev.target as HTMLInputElement | null)?.files?.[0] ?? null;
    this.setCreateFile(f);
  }

  async submitCreate() {
    const c = this.create();
    await this.newsService
      .create({ titre: c.titre.trim(), datePublication: c.datePublication, texte: c.texte.trim() }, this.createFile())
      .toPromise();
    this.showCreate.set(false);
    this.setCreateFile(null);
    await this.reload();
  }

  openEdit(n: NewsDto) {
    this.edit.set({
      id: n.id,
      titre: n.titre,
      datePublication: n.datePublication,
      texte: n.texte,
      image: n.image,
      removeImage: false,
    });
    this.setEditFile(null);
    this.showEdit.set(true);
  }

  closeEdit() {
    this.showEdit.set(false);
    this.edit.set(null);
    this.setEditFile(null);
  }

  setEditFile(file: File | null) {
    const prev = this.editPreviewUrl();
    if (prev) {
      URL.revokeObjectURL(prev);
    }
    this.editFile.set(file);
    this.editPreviewUrl.set(file ? URL.createObjectURL(file) : null);
  }

  onEditFileChange(ev: Event) {
    const f = (ev.target as HTMLInputElement | null)?.files?.[0] ?? null;
    this.setEditFile(f);
    const e = this.edit();
    if (e && f) {
      this.edit.set({ ...e, removeImage: false });
    }
  }

  async submitEdit() {
    const e = this.edit();
    if (!e) return;

    await this.newsService
      .update(
        e.id,
        {
          titre: e.titre.trim(),
          datePublication: e.datePublication,
          texte: e.texte.trim(),
          removeImage: e.removeImage,
        },
        this.editFile(),
      )
      .toPromise();

    this.showEdit.set(false);
    this.edit.set(null);
    this.setEditFile(null);
    await this.reload();
  }

  requestDelete(id: string) {
    this.deleteId.set(id);
  }

  cancelDelete() {
    this.deleteId.set(null);
  }

  async confirmDelete() {
    const id = this.deleteId();
    if (!id) return;
    await this.newsService.remove(id).toPromise();
    this.deleteId.set(null);
    await this.reload();
  }
}
