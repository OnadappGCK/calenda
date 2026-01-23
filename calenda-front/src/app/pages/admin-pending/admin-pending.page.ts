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
export class AdminPendingPage implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly items = signal<EventDto[]>([]);

  readonly expanded = signal<Set<string>>(new Set());
  readonly confirm = signal<null | { action: 'validate' | 'delete'; id: string; title: string }>(null);
  readonly showMerge = signal<boolean>(false);

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    const items = await this.adminService.pendingEvents().toPromise();
    this.items.set(items ?? []);
  }

  toggleExpanded(id: string) {
    const next = new Set(this.expanded());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.expanded.set(next);
  }

  openConfirm(action: 'validate' | 'delete', e: EventDto) {
    this.confirm.set({ action, id: e.id, title: e.titre });
  }

  closeConfirm() {
    this.confirm.set(null);
  }

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

  openMerge() {
    this.showMerge.set(true);
  }

  closeMerge() {
    this.showMerge.set(false);
  }
}
