import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../core/admin.service';
import { EventDto } from '../../core/events.service';

@Component({
  selector: 'app-admin-pending-page',
  imports: [RouterLink, DatePipe],
  templateUrl: './admin-pending.page.html',
  styleUrl: './admin-pending.page.scss',
})
/**
 * Page admin: événements en attente.
 * Permet de lister, valider ou supprimer les événements soumis.
 */
export class AdminPendingPage implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly items = signal<EventDto[]>([]);

  readonly expanded = signal<Set<string>>(new Set());
  readonly confirm = signal<null | { action: 'validate' | 'delete'; id: string; title: string }>(null);
  readonly showMerge = signal<boolean>(false);

  /** Hook Angular: charge la liste initiale des événements en attente. */
  async ngOnInit() {
    await this.reload();
  }

  /** Recharge la liste des événements en attente depuis l'API. */
  async reload() {
    const items = await this.adminService.pendingEvents().toPromise();
    this.items.set(items ?? []);
  }

  /** Ouvre/ferme l'affichage détaillé d'une carte (UI seulement). */
  toggleExpanded(id: string) {
    const next = new Set(this.expanded());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.expanded.set(next);
  }

  /** Ouvre la modale de confirmation (valider/supprimer) pour un événement donné. */
  openConfirm(action: 'validate' | 'delete', e: EventDto) {
    this.confirm.set({ action, id: e.id, title: e.titre });
  }

  /** Ferme la modale de confirmation. */
  closeConfirm() {
    this.confirm.set(null);
  }

  /** Confirme l'action choisie (valider/supprimer), puis recharge la liste. */
  async confirmYes() {
    const c = this.confirm();
    if (!c) return;

    if (c.action === 'validate') {
      await this.adminService.validateEvent(c.id).toPromise();
    } else {
      await this.adminService.deleteEvent(c.id).toPromise();
    }

    this.closeConfirm();
    await this.reload();
  }

  /** Ouvre la modale de "merge" (stub UI). */
  openMerge() {
    this.showMerge.set(true);
  }

  /** Ferme la modale de "merge". */
  closeMerge() {
    this.showMerge.set(false);
  }
}
