import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { UsersService } from '../../core/users.service';

@Component({
  selector: 'app-verify-email-page',
  imports: [RouterLink],
  templateUrl: './verify-email.page.html',
  styleUrl: './verify-email.page.scss',
})
export class VerifyEmailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly usersService = inject(UsersService);

  readonly loading = signal(true);
  readonly success = signal(false);
  readonly message = signal('Validation de votre compte en cours...');

  async ngOnInit() {
    const token = (this.route.snapshot.queryParamMap.get('token') ?? '').trim();

    if (!token) {
      this.loading.set(false);
      this.success.set(false);
      this.message.set('Lien de vérification invalide.');
      return;
    }

    this.loading.set(true);
    this.success.set(false);

    try {
      await this.usersService.verifyEmailToken(token).toPromise();
      this.success.set(true);
      this.message.set('Votre compte calenda a bien été validé.');
    } catch (e) {
      const code = this.parseErrorCode(e);
      if (code === 'invalid_token') {
        this.message.set('Lien de vérification invalide ou expiré.');
      } else {
        this.message.set('Impossible de valider votre compte pour le moment.');
      }
      this.success.set(false);
    } finally {
      this.loading.set(false);
    }
  }

  private parseErrorCode(e: unknown): string | null {
    if (!(e instanceof HttpErrorResponse)) {
      return null;
    }

    const d: any = e.error;
    if (typeof d === 'string') {
      return d;
    }

    if (Array.isArray(d?.message) && typeof d.message[0] === 'string') {
      return d.message[0];
    }

    if (typeof d?.message === 'string') {
      return d.message;
    }

    return null;
  }
}
