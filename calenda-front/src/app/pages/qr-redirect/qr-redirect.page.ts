import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-qr-redirect',
  imports: [],
  template: '',
})
/**
 * Page de redirection QR code.
 * Redirige immédiatement vers l'URL définie dans `environment.qrRedirectUrl`.
 * Changer la destination = modifier uniquement ce fichier d'environnement.
 */
export class QrRedirectPage implements OnInit {
  private readonly router = inject(Router);

  ngOnInit() {
    void this.router.navigateByUrl(environment.qrRedirectUrl, { replaceUrl: true });
  }
}
