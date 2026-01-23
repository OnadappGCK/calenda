import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { EventsService, EventDto } from '../../core/events.service';
import { FavoritesService } from '../../core/favorites.service';

@Component({
  selector: 'app-event-detail-page',
  imports: [RouterLink, DatePipe],
  templateUrl: './event-detail.page.html',
  styleUrl: './event-detail.page.scss',
})
/**
 * Page détail d'événement.
 * Charge un événement depuis l'ID de route et affiche des suggestions similaires.
 */
export class EventDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly eventsService = inject(EventsService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly auth = inject(AuthService);

  readonly event = signal<EventDto | null>(null);
  readonly similar = signal<EventDto[]>([]);

  readonly canLike = computed(() => this.auth.isLoggedIn());

  /** Hook Angular: charge l'événement + la liste "similar" à partir du paramètre `id`. */
  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      return;
    }

    const evt = await this.eventsService.getOne(id).toPromise();
    this.event.set(evt ?? null);

    const sim = await this.eventsService.similar(id).toPromise();
    this.similar.set(sim ?? []);
  }

  /** Ajoute l'événement courant aux favoris (si connecté). */
  async like() {
    const evt = this.event();
    if (!evt) {
      return;
    }

    if (!this.canLike()) {
      return;
    }

    await this.favoritesService.add(evt.id).toPromise();
  }
}
