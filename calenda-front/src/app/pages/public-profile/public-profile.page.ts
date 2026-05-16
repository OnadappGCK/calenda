import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { categoryForegroundColor, categoryGradient } from '../../core/event-ui';
import { EventDto } from '../../core/events.service';
import { profileImageUrl } from '../../core/profile-images';
import { PublicProfileDto, UsersService } from '../../core/users.service';

@Component({
  selector: 'app-public-profile-page',
  imports: [RouterLink, DatePipe],
  templateUrl: './public-profile.page.html',
  styleUrl: './public-profile.page.scss',
})
export class PublicProfilePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly usersService = inject(UsersService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly profile = signal<PublicProfileDto | null>(null);
  readonly associatedExpanded = signal(false);
  readonly associatedLoading = signal(false);
  readonly upcomingEvents = signal<EventDto[]>([]);

  readonly avatarUrl = computed(() => profileImageUrl(this.profile()?.profileImage ?? null));
  readonly hasBio = computed(() => ((this.profile()?.bio ?? '').trim().length ?? 0) > 0);
  readonly displayLieu = computed(() => {
    const lieu = (this.profile()?.lieu ?? '').trim();
    return lieu && lieu.toLowerCase() !== 'merge' ? lieu : '';
  });

  protected readonly categoryGradient = categoryGradient;
  protected readonly categoryForegroundColor = categoryForegroundColor;

  ngOnInit() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pm) => {
      const id = (pm.get('id') ?? '').trim();
      if (!id) return;
      void this.load(id);
    });
  }

  private async load(id: string) {
    this.loading.set(true);
    this.loadError.set(null);
    this.profile.set(null);
    this.upcomingEvents.set([]);
    this.associatedExpanded.set(false);

    try {
      const data = await this.usersService.publicProfile(id).toPromise();
      if (!data) {
        this.loadError.set('Profil introuvable');
        return;
      }
      this.profile.set(data);
    } catch {
      this.loadError.set('Profil introuvable');
    } finally {
      this.loading.set(false);
    }
  }

  async toggleAssociatedEvents() {
    const p = this.profile();
    if (!p) return;

    const next = !this.associatedExpanded();
    this.associatedExpanded.set(next);

    if (!next || this.upcomingEvents().length > 0) return;

    this.associatedLoading.set(true);
    try {
      const list = await this.usersService
        .publicOrganizedEvents(p.id, { upcoming: 'true', limit: '8' })
        .toPromise();
      this.upcomingEvents.set(list ?? []);
    } finally {
      this.associatedLoading.set(false);
    }
  }
}
