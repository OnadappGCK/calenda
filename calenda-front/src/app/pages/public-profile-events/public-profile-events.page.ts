import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { categoryForegroundColor, categoryGradient } from '../../core/event-ui';
import { EventCategory, EventDto } from '../../core/events.service';
import { profileImageUrl } from '../../core/profile-images';
import { PublicProfileDto, UsersService } from '../../core/users.service';

@Component({
  selector: 'app-public-profile-events-page',
  imports: [RouterLink, DatePipe, FormsModule],
  templateUrl: './public-profile-events.page.html',
  styleUrl: './public-profile-events.page.scss',
})
export class PublicProfileEventsPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly usersService = inject(UsersService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly listLoading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly profile = signal<PublicProfileDto | null>(null);
  readonly events = signal<EventDto[]>([]);

  q = '';
  ville = '';
  categorie: EventCategory | '' = '';
  upcomingOnly = false;

  readonly categories: EventCategory[] = [
    'Culture & spectacle',
    'Arts & expos',
    'Vie sociale',
    'Activités',
    'Vie locale',
    'Famille',
    'Spécial',
  ];

  readonly avatarUrl = computed(() => profileImageUrl(this.profile()?.profileImage ?? null));

  protected readonly categoryGradient = categoryGradient;
  protected readonly categoryForegroundColor = categoryForegroundColor;

  private currentUserId = '';

  ngOnInit() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pm) => {
      const id = (pm.get('id') ?? '').trim();
      if (!id) return;
      this.currentUserId = id;
      void this.load(id);
    });
  }

  private async load(id: string) {
    this.loading.set(true);
    this.loadError.set(null);
    this.profile.set(null);
    this.events.set([]);

    try {
      const p = await this.usersService.publicProfile(id).toPromise();
      if (!p) {
        this.loadError.set('Profil introuvable');
        return;
      }
      this.profile.set(p);
      await this.reloadEvents();
    } catch {
      this.loadError.set('Profil introuvable');
    } finally {
      this.loading.set(false);
    }
  }

  async reloadEvents() {
    if (!this.currentUserId) return;

    this.listLoading.set(true);
    try {
      const list = await this.usersService
        .publicOrganizedEvents(this.currentUserId, {
          q: this.q.trim() || undefined,
          ville: this.ville.trim() || undefined,
          categorie: this.categorie || undefined,
          upcoming: this.upcomingOnly ? 'true' : undefined,
          limit: '120',
        })
        .toPromise();
      this.events.set(list ?? []);
    } finally {
      this.listLoading.set(false);
    }
  }
}
