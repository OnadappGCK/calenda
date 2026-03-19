import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { AdminService } from '../core/admin.service';
import { profileImageUrl } from '../core/profile-images';
import { I18nService } from '../core/i18n.service';
import { LanguageCode } from '../core/i18n.types';

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
  protected readonly i18n = inject(I18nService);

  protected readonly profileImageUrl = profileImageUrl;

  protected readonly isAdmin = computed(() => !!this.auth.user()?.isAdmin);

  protected readonly darkTheme = signal<boolean>(false);
  protected readonly languageMenuOpen = signal<boolean>(false);

  protected readonly pendingCount = signal<number>(0);

  /** Hook Angular: charge l'utilisateur puis, si admin, récupère le compteur d'événements en attente. */
  async ngOnInit() {
    this.initTheme();
    await this.auth.refreshMe();

    if (!this.isAdmin()) {
      return;
    }

    const pending = await this.adminService.pendingEvents().toPromise();
    this.pendingCount.set(pending?.length ?? 0);
  }

  protected toggleTheme() {
    this.applyTheme(!this.darkTheme());
  }

  protected toggleLanguageMenu(event: MouseEvent) {
    event.stopPropagation();
    this.languageMenuOpen.update((open) => !open);
  }

  protected closeLanguageMenu(event: MouseEvent) {
    event.stopPropagation();
    this.languageMenuOpen.set(false);
  }

  protected selectLanguage(code: LanguageCode, event: MouseEvent) {
    event.stopPropagation();
    this.i18n.setLanguage(code);
    this.languageMenuOpen.set(false);
  }

  protected isActiveLanguage(code: LanguageCode) {
    return this.i18n.currentLanguage().code === code;
  }

  @HostListener('document:click')
  protected onDocumentClick() {
    this.languageMenuOpen.set(false);
  }

  private initTheme() {
    if (typeof window === 'undefined') return;
    try {
      const saved = (window.localStorage.getItem('theme') ?? '').toLowerCase();
      if (saved === 'dark' || saved === 'light') {
        this.applyTheme(saved === 'dark');
        return;
      }

      const prefersDark =
        !!window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.applyTheme(prefersDark);
    } catch {
      this.applyTheme(false);
    }
  }

  private applyTheme(isDark: boolean) {
    this.darkTheme.set(isDark);

    if (typeof document !== 'undefined') {
      document.body.classList.toggle('theme-dark', isDark);
    }

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('theme', isDark ? 'dark' : 'light');
      } catch {
        // ignore
      }
    }
  }
}
