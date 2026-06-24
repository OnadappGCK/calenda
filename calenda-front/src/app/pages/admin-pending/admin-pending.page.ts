import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../core/admin.service';
import { EventDto, EventOrigin } from '../../core/events.service';

type PlaceType = 'RESTAURANT' | 'SORTIE' | 'BAR' | 'ACTIVITE';

const TYPE_LABELS: Record<PlaceType, string> = {
  RESTAURANT: 'Restaurant',
  SORTIE: 'Sortie',
  BAR: 'Bar',
  ACTIVITE: 'Activité',
};
const TYPE_ICONS: Record<PlaceType, string> = {
  RESTAURANT: '🍽️',
  SORTIE: '🎭',
  BAR: '🍸',
  ACTIVITE: '🏃',
};
const TYPES: PlaceType[] = ['RESTAURANT', 'SORTIE', 'BAR', 'ACTIVITE'];

type EtabDraft = {
  nom: string;
  description: string;
  adresse: string;
  ville: string;
  types: PlaceType[];
  contact: string;
  horaires: string;
  imageUrl: string;
  sourceUrl: string;
  tags: string;
  featured: boolean;
  featuredTier: number;
  featuredStart: string;
  featuredEnd: string;
  proprietaireId: string;
  public: boolean;
};

type MergeSourceId = 'MARTIGUES_TOURISME' | 'SALSA_OLIVIER_13' | 'CARRY_LE_ROUET';
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
  {
    id: 'CARRY_LE_ROUET',
    label: 'OT Carry-le-Rouet',
    description: 'Import depuis otcarrylerouet.fr (agenda événements, og:image, en attente).',
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
    CARRY_LE_ROUET: 'Import: OT Carry-le-Rouet',
  };

  readonly items = signal<EventDto[]>([]);
  readonly pendingEtabs = signal<any[]>([]);
  readonly allEtabs = signal<any[]>([]);
  readonly showAllEtabs = signal<boolean>(false);
  readonly editingEtabId = signal<string | null>(null);
  readonly etabDraft = signal<EtabDraft | null>(null);
  readonly etabSaving = signal(false);
  readonly etabSaveError = signal<string | null>(null);
  readonly etabUserSearch = signal('');
  readonly etabUserResults = signal<{ id: string; pseudo: string; email: string }[]>([]);
  readonly etabUserSearching = signal(false);
  readonly etabSearchQ = signal<string>('');
  readonly TYPES = TYPES;
  readonly TYPE_LABELS = TYPE_LABELS;
  readonly TYPE_ICONS = TYPE_ICONS;

  async searchEtabUsers(q: string) {
    this.etabUserSearch.set(q);
    if (!q.trim()) { this.etabUserResults.set([]); return; }
    this.etabUserSearching.set(true);
    try {
      const users = await this.adminService.users({ q }).toPromise();
      this.etabUserResults.set((users ?? []) as { id: string; pseudo: string; email: string }[]);
    } finally {
      this.etabUserSearching.set(false);
    }
  }

  selectEtabUser(user: { id: string; pseudo: string }) {
    this.setEtabDraft('proprietaireId', user.id);
    this.etabUserSearch.set(user.pseudo);
    this.etabUserResults.set([]);
  }

  readonly filteredAllEtabs = computed(() => {
    const q = this.etabSearchQ().toLowerCase().trim();
    if (!q) return this.allEtabs();
    return this.allEtabs().filter(
      (e) =>
        e.nom?.toLowerCase().includes(q) ||
        e.ville?.toLowerCase().includes(q) ||
        (e.types as string[] | undefined)?.some((t) => t.toLowerCase().includes(q)),
    );
  });

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
      toDelete?: { id: string; titre: string; dateDebut: string; dateFin: string | null }[];
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
      deleted?: number;
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

  readonly pendingDeletions = signal<
    { id: string; titre: string; dateDebut: string; dateFin: string | null; source: MergeSourceId }[]
  >([]);

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
    const [items, etabs, allEtabs] = await Promise.all([
      this.adminService.pendingEvents().toPromise(),
      this.adminService.pendingEtablissements().toPromise(),
      this.adminService.allEtablissements().toPromise(),
    ]);
    this.items.set(items ?? []);
    this.pendingEtabs.set(etabs ?? []);
    this.allEtabs.set(allEtabs ?? []);
    this.selectedIds.set(new Set());
  }

  startEditEtab(et: any) {
    this.etabSaveError.set(null);
    this.etabUserSearch.set(et.proprietairePseudo ?? '');
    this.etabUserResults.set([]);
    this.etabSaveError.set(null);
    this.etabDraft.set({
      nom: et.nom ?? '',
      description: et.description ?? '',
      adresse: et.adresse ?? '',
      ville: et.ville ?? '',
      types: et.types ?? [et.type ?? 'SORTIE'],
      contact: et.contact ?? '',
      horaires: et.horaires ?? '',
      imageUrl: et.imageUrl ?? '',
      sourceUrl: et.sourceUrl ?? '',
      tags: (et.tags ?? []).join(', '),
      featured: et.featured ?? false,
      featuredTier: et.featuredTier ?? 0,
      featuredStart: et.featuredStart ?? '',
      featuredEnd: et.featuredEnd ?? '',
      proprietaireId: et.proprietaireId ?? '',
      public: et.public ?? true,
    });
  }

  cancelEditEtab() {
    this.editingEtabId.set(null);
    this.etabDraft.set(null);
    this.etabSaveError.set(null);
  }

  setEtabDraft(field: keyof EtabDraft, value: any) {
    const d = this.etabDraft();
    if (!d) return;
    this.etabDraft.set({ ...d, [field]: value });
  }

  toggleEtabType(t: PlaceType) {
    const d = this.etabDraft();
    if (!d) return;
    const current = d.types ?? [];
    const types = current.includes(t) ? current.filter((x) => x !== t) : [...current, t];
    this.etabDraft.set({ ...d, types });
  }

  async saveEtab() {
    const id = this.editingEtabId();
    const d = this.etabDraft();
    if (!id || !d) return;
    this.etabSaving.set(true);
    this.etabSaveError.set(null);
    try {
      const payload = {
        nom: d.nom.trim(),
        description: d.description.trim() || null,
        adresse: d.adresse.trim() || null,
        ville: d.ville.trim() || null,
        types: d.types,
        contact: d.contact.trim() || null,
        horaires: d.horaires.trim() || null,
        imageUrl: d.imageUrl.trim() || null,
        sourceUrl: d.sourceUrl.trim() || null,
        tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean),
        featured: d.featured,
        featuredTier: Number(d.featuredTier) || 0,
        featuredStart: d.featuredStart.trim() || null,
        featuredEnd: d.featuredEnd.trim() || null,
        proprietaireId: d.proprietaireId.trim() || null,
        public: d.public,
      };
      const updated = await this.adminService.updateEtablissement(id, payload).toPromise();
      this.allEtabs.update((list) => list.map((e) => (e.id === id ? updated : e)));
      this.cancelEditEtab();
    } catch (err: any) {
      this.etabSaveError.set(err?.error?.message ?? 'Erreur lors de la sauvegarde');
    } finally {
      this.etabSaving.set(false);
    }
  }

  async validateEtab(id: string) {
    await this.adminService.validateEtablissement(id).toPromise();
    await this.reload();
  }

  async deleteEtab(id: string) {
    await this.adminService.deleteEtablissement(id).toPromise();
    await this.reload();
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
            : this.mergeSource === 'CARRY_LE_ROUET'
              ? await this.adminService.previewMergeCarryLeRouet({ pages: this.mergePages }).toPromise()
              : null;

      console.log('[Merge] preview response', res);
      console.log('[Merge] preview debugSamples', res?.debugSamples);

      this.mergePreview.set(res ?? null);

      if (res?.toDelete && res.toDelete.length > 0) {
        const source = this.mergeSource;
        const newDeletions = res.toDelete.map((e) => ({ ...e, source }));
        const existingIds = new Set(this.pendingDeletions().map((d) => d.id));
        const fresh = newDeletions.filter((d) => !existingIds.has(d.id));
        this.pendingDeletions.update((prev) => [...prev, ...fresh]);
      }
    } finally {
      this.mergeLoading.set(false);
    }
  }

  async runMergeApply() {
    const preview = this.mergePreview();
    if (!preview || (preview.urls.length === 0 && (preview.toDelete?.length ?? 0) === 0)) return;
    if (this.mergeLoading()) return;
    this.mergeLoading.set(true);
    try {
      const toDeleteIds = (preview.toDelete ?? []).map((e) => e.id);
      const res =
        this.mergeSource === 'MARTIGUES_TOURISME'
          ? await this.adminService.applyMergeMartigues({ urls: preview.urls, toDeleteIds }).toPromise()
          : this.mergeSource === 'SALSA_OLIVIER_13'
            ? await this.adminService.applyMergeSalsaOlivier({ urls: preview.urls, toDeleteIds }).toPromise()
            : this.mergeSource === 'CARRY_LE_ROUET'
              ? await this.adminService.applyMergeCarryLeRouet({ urls: preview.urls, toDeleteIds }).toPromise()
              : null;

      console.log('[Merge] apply response', res);
      console.log('[Merge] apply debugSamples', res?.debugSamples);

      this.mergeApply.set(res ?? null);
      if (toDeleteIds.length > 0) {
        this.pendingDeletions.update((prev) => prev.filter((d) => !toDeleteIds.includes(d.id)));
      }
      await this.reload();
    } finally {
      this.mergeLoading.set(false);
    }
  }

  mergeSourceDescription() {
    return this.mergeSourcesList.find((s) => s.id === this.mergeSource)?.description ?? '';
  }

  async confirmDeleteOrphan(id: string) {
    await this.adminService.deleteEvent(id).toPromise();
    this.pendingDeletions.update((prev) => prev.filter((d) => d.id !== id));
  }

  dismissOrphan(id: string) {
    this.pendingDeletions.update((prev) => prev.filter((d) => d.id !== id));
  }

  sourceLabel(source: MergeSourceId) {
    return this.mergeSourcesList.find((s) => s.id === source)?.label ?? source;
  }
}
