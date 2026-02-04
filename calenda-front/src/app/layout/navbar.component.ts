import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { AdminService } from '../core/admin.service';
import { profileImageUrl } from '../core/profile-images';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
/**
 * Barre de navigation principale.
 * Affiche l'état de connexion et (si admin) le badge du nombre d'événements en attente.
 */
export class NavbarComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly adminService = inject(AdminService);

  protected readonly profileImageUrl = profileImageUrl;

  protected readonly isAdmin = computed(() => this.auth.user()?.role === 'ADMIN');

  protected readonly pendingCount = signal<number>(0);

  /** Hook Angular: charge l'utilisateur puis, si admin, récupère le compteur d'événements en attente. */
  async ngOnInit() {
    await this.auth.ensureLoaded();

    if (!this.isAdmin()) {
      return;
    }

    const pending = await this.adminService.pendingEvents().toPromise();
    this.pendingCount.set(pending?.length ?? 0);
  }
}
