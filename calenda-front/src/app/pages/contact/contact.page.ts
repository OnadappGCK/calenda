import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-contact-page',
  imports: [FormsModule],
  templateUrl: './contact.page.html',
  styleUrl: './contact.page.scss',
})
/**
 * Page Contact.
 * Formulaire simple (actuellement sans envoi backend) qui affiche un succès local.
 */
export class ContactPage {
  email = '';
  motif = '';
  message = '';

  readonly ok = signal<boolean>(false);

  /** Soumet le formulaire (version actuelle: confirme localement). */
  submit() {
    this.ok.set(true);
  }
}
