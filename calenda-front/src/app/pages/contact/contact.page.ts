import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../../core/api.config';

@Component({
  selector: 'app-contact-page',
  imports: [FormsModule],
  templateUrl: './contact.page.html',
  styleUrl: './contact.page.scss',
})
/**
 * Page Contact.
 * Envoie un email via le backend avec un cooldown de 20 secondes anti-spam.
 */
export class ContactPage {
  private readonly http = inject(HttpClient);
  private readonly apiBase = inject(API_BASE_URL);

  email = '';
  sujet = '';
  message = '';

  readonly ok = signal<boolean>(false);
  readonly error = signal<string>('');
  readonly loading = signal<boolean>(false);
  readonly cooldown = signal<number>(0);

  private cooldownInterval: ReturnType<typeof setInterval> | null = null;

  submit() {
    if (this.cooldown() > 0 || this.loading()) return;

    this.ok.set(false);
    this.error.set('');
    this.loading.set(true);

    this.http.post<{ ok: boolean }>(`${this.apiBase}/contact`, {
      email: this.email,
      sujet: this.sujet,
      message: this.message,
    }).subscribe({
      next: () => {
        this.loading.set(false);
        this.ok.set(true);
        this.email = '';
        this.sujet = '';
        this.message = '';
        this.startCooldown();
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Erreur lors de l\'envoi.');
        if (err?.status === 429) {
          this.startCooldown();
        }
      },
    });
  }

  private startCooldown() {
    this.cooldown.set(20);
    if (this.cooldownInterval) clearInterval(this.cooldownInterval);
    this.cooldownInterval = setInterval(() => {
      const v = this.cooldown() - 1;
      this.cooldown.set(v);
      if (v <= 0 && this.cooldownInterval) {
        clearInterval(this.cooldownInterval);
        this.cooldownInterval = null;
      }
    }, 1000);
  }
}
