import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FavoritesService } from '../../core/favorites.service';
import { EventDto } from '../../core/events.service';

@Component({
  selector: 'app-favorites-page',
  imports: [RouterLink, DatePipe],
  templateUrl: './favorites.page.html',
  styleUrl: './favorites.page.scss',
})
/**
 * Page Favoris.
 * Affiche la liste des événements favoris et permet de retirer un favori.
 */
export class FavoritesPage implements OnInit {
  private readonly favoritesService = inject(FavoritesService);

  readonly favorites = signal<EventDto[]>([]);

  /** Hook Angular: charge la liste initiale des favoris. */
  async ngOnInit() {
    const fav = await this.favoritesService.list().toPromise();
    this.favorites.set(fav ?? []);
  }

  /** Retire un favori puis recharge la liste. */
  async remove(id: string) {
    await this.favoritesService.remove(id).toPromise();
    const fav = await this.favoritesService.list().toPromise();
    this.favorites.set(fav ?? []);
  }
}
