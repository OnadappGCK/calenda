import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-contact-page',
  imports: [FormsModule],
  templateUrl: './contact.page.html',
  styleUrl: './contact.page.scss',
})
export class ContactPage {
  email = '';
  motif = '';
  message = '';

  readonly ok = signal<boolean>(false);

  submit() {
    this.ok.set(true);
  }
}
