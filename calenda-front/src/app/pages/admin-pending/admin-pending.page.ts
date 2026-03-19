import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../core/admin.service';
import { EventDto, EventOrigin } from '../../core/events.service';

type MergeSourceId = 'MARTIGUES_TOURISME' | 'SALSA_OLIVIER_13';
type MergeSource = { id: MergeSourceId; label: string; description: string };

const MERGE_SOURCES: MergeSource[] = [
  {
    id: 'MARTIGUES_TOURISME',
    label: 'Martigues Tourisme',
    description: 'Import depuis martigues-tourisme.com (og:image, événements en attente).',
  },
  {
    id: 'SALSA_OLIVIER_13',
    label: 'Salsa d’Olivier (dpt 13)',
    description: "Import depuis salsa.faurax.fr (Bouches-du-Rhône). Le paramètre 'pages' correspond à ~50 événements par tranche.",
  },
];

@Component({
  selector: 'app-admin-pending-page',
  imports: [RouterLink, DatePipe, FormsModule],
  templateUrl: './admin-pending.page.html',
  styleUrl: './admin-pending.page.scss',
})
/**
 * Page admin: événements en attente.
 * Permet de lister, valider ou supprimer les événements soumis.
 */
export class AdminPendingPage implements OnInit {
  private readonly adminService = inject(AdminService);

  /** Libellés d'UI pour afficher l'origine d'un événement (champ `origin`). */
  private readonly originLabels: Record<EventOrigin, string> = {
    MANUAL: 'Manuel',
    MARTIGUES_SITE: 'Import: Martigues site',
    SALSA_OLIVIER: 'Import: Salsa Olivier',
  };

  readonly items = signal<EventDto[]>([]);

  readonly selectedIds = signal<Set<string>>(new Set());

  readonly expanded = signal<Set<string>>(new Set());
  readonly confirm = signal<null | { action: 'validate' | 'delete'; ids: string[]; title: string; count: number }>(null);
  readonly showMerge = signal<boolean>(false);

  readonly mergeSourcesList = MERGE_SOURCES;
  mergeSource: MergeSourceId = 'MARTIGUES_TOURISME';

  mergePages = 2;
  readonly mergePreview = signal<
    null | {
      scannedPages: number;
      foundUrls: number;
      dedupedUrls: number;
      parsed: number;
      withImage: number;
      withDescription: number;
      wouldCreate: number;
      skippedExisting: number;
      skippedPast: number;
      failed: number;
      urls: string[];
      failures: { url: string; reason: string }[];
      debugSamples: {
        status: 'parse_failed' | 'exception' | 'past' | 'existing' | 'addable';
        url: string;
        reason?: string;
        titre?: string;
        dateDebut?: string;
        dateFin?: string | null;
        image?: boolean;
        descLen?: number;
      }[];
    }
  >(null);
  readonly mergeApply = signal<
    null | {
      processed: number;
      created: number;
      skippedExisting: number;
      skippedPast: number;
      failed: number;
      debugSamples: {
        status: 'parse_failed' | 'exception' | 'past' | 'existing' | 'created';
        url: string;
        reason?: string;
        titre?: string;
        dateDebut?: string;
        dateFin?: string | null;
      }[];
    }
  >(null);
  readonly mergeLoading = signal<boolean>(false);

  readonly showFilters = signal<boolean>(false);
  originFilter: '' | EventOrigin | 'NONE' = '';
  originSort: '' | 'asc' | 'desc' = '';

  readonly filteredItems = computed(() => {
    const items = this.items();

    const filtered =
      this.originFilter === ''
        ? items
        : items.filter((e) => {
            const o = e.origin;
            if (this.originFilter === 'NONE') return !o;
            return o === this.originFilter;
          });

    if (!this.originSort) {
      return filtered;
    }

    const dir = this.originSort === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const la = this.originLabel(a.origin);
      const lb = this.originLabel(b.origin);
      return dir * la.localeCompare(lb, 'fr');
    });
  });

  readonly selectedCount = computed(() => this.selectedIds().size);

  /** Retourne un libellé lisible pour l'origine d'un événement (fallback si non renseignée). */
  originLabel(origin: EventOrigin | undefined) {
    if (!origin) return 'Non renseignée';
    return this.originLabels[origin] ?? origin;
  }

  /** Hook Angular: charge la liste initiale des événements en attente. */
  async ngOnInit() {
    if (!this.mergeSourcesList.some((s) => s.id === this.mergeSource) && this.mergeSourcesList[0]) {
      this.mergeSource = this.mergeSourcesList[0].id;
    }
    await this.reload();
  }

  /** Recharge la liste des événements en attente depuis l'API. */
  async reload() {
    const items = await this.adminService.pendingEvents().toPromise();
    this.items.set(items ?? []);
    this.selectedIds.set(new Set());
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

  toggleSelected(id: string) {
    const next = new Set(this.selectedIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selectedIds.set(next);
  }

  isSelected(id: string) {
    return this.selectedIds().has(id);
  }

  toggleSelectAll() {
    const list = this.filteredItems();
    if (list.length === 0) {
      this.selectedIds.set(new Set());
      return;
    }

    const allSelected = list.every((e) => this.selectedIds().has(e.id));
    if (allSelected) {
      const next = new Set(this.selectedIds());
      for (const e of list) {
        next.delete(e.id);
      }
      this.selectedIds.set(next);
      return;
    }

    const next = new Set(this.selectedIds());
    for (const e of list) {
      next.add(e.id);
    }
    this.selectedIds.set(next);
  }

  clearSelection() {
    this.selectedIds.set(new Set());
  }

  openConfirm(action: 'validate' | 'delete', e: EventDto) {
    this.confirm.set({ action, ids: [e.id], title: e.titre, count: 1 });
  }

  openConfirmBulk(action: 'validate' | 'delete') {
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    this.confirm.set({ action, ids, title: `${ids.length} événements`, count: ids.length });
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
      if (c.ids.length > 1) {
        await this.adminService.validateEventsBulk(c.ids).toPromise();
      } else {
        for (const id of c.ids) {
          await this.adminService.validateEvent(id).toPromise();
        }
      }
    } else {
      for (const id of c.ids) {
        await this.adminService.deleteEvent(id).toPromise();
      }
    }

    this.closeConfirm();
    this.clearSelection();
    await this.reload();
  }

  toggleFilters() {
    this.showFilters.set(!this.showFilters());
  }

  /** Ouvre la modale de "merge" (stub UI). */
  openMerge() {
    this.showMerge.set(true);
    this.mergePreview.set(null);
    this.mergeApply.set(null);
  }

  /** Ferme la modale de "merge". */
  closeMerge() {
    this.showMerge.set(false);
  }

  async runMergePreview() {
    if (this.mergeLoading()) return;
    this.mergeLoading.set(true);
    try {
      this.mergeApply.set(null);

      const res =
        this.mergeSource === 'MARTIGUES_TOURISME'
          ? await this.adminService.previewMergeMartigues({ pages: this.mergePages }).toPromise()
          : this.mergeSource === 'SALSA_OLIVIER_13'
            ? await this.adminService.previewMergeSalsaOlivier({ pages: this.mergePages }).toPromise()
          : null;

      console.log('[Merge] preview response', res);
      console.log('[Merge] preview debugSamples', res?.debugSamples);

      this.mergePreview.set(res ?? null);
    } finally {
      this.mergeLoading.set(false);
    }
  }

  async runMergeApply() {
    const preview = this.mergePreview();
    if (!preview || preview.urls.length === 0) return;
    if (this.mergeLoading()) return;
    this.mergeLoading.set(true);
    try {
      const res =
        this.mergeSource === 'MARTIGUES_TOURISME'
          ? await this.adminService.applyMergeMartigues({ urls: preview.urls }).toPromise()
          : this.mergeSource === 'SALSA_OLIVIER_13'
            ? await this.adminService.applyMergeSalsaOlivier({ urls: preview.urls }).toPromise()
          : null;

      console.log('[Merge] apply response', res);
      console.log('[Merge] apply debugSamples', res?.debugSamples);

      this.mergeApply.set(res ?? null);
      await this.reload();
    } finally {
      this.mergeLoading.set(false);
    }
  }

  mergeSourceDescription() {
    return this.mergeSourcesList.find((s) => s.id === this.mergeSource)?.description ?? '';
  }
}
