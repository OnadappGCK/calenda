import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { AdminService } from '../core/admin.service';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly adminService = inject(AdminService);

  protected readonly isAdmin = computed(() => this.auth.user()?.role === 'ADMIN');

  protected readonly pendingCount = signal<number>(0);

  async ngOnInit() {
    await this.auth.ensureLoaded();

    if (!this.isAdmin()) {
      return;
    }

    const pending = await this.adminService.pendingEvents().toPromise();
    this.pendingCount.set(pending?.length ?? 0);
  }
}
