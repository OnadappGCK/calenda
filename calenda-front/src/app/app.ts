import { Component, OnInit, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { NavbarComponent } from './layout/navbar.component';
import { PLATFORM_ID } from '@angular/core';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavbarComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = signal('calenda-front');

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  private forceTop() {
    if (!isPlatformBrowser(this.platformId)) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }

  async ngOnInit() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.forceTop();
        setTimeout(() => this.forceTop(), 0);
      }
    });

    this.forceTop();
    await this.auth.ensureLoaded();
    this.forceTop();
  }
}
