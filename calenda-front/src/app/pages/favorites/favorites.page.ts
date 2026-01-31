import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FavoritesService } from '../../core/favorites.service';
import { EventCategory, EventDto, EventTag } from '../../core/events.service';
import { categoryColor, tagIcon } from '../../core/event-ui';

@Component({
  selector: 'app-favorites-page',
  imports: [RouterLink, DatePipe, FormsModule],
  templateUrl: './favorites.page.html',
  styleUrl: './favorites.page.scss',
})
/**
 * Page Favoris.
 * Affiche la liste des événements favoris et permet de retirer un favori.
 */
export class FavoritesPage implements OnInit {
  private readonly favoritesService = inject(FavoritesService);

  readonly favorites = signal<EventDto[]>([]);

  q = '';
  ville = '';
  lieu = '';
  categorie: EventCategory | '' = '';
  caracteristiquesFilter: EventTag[] = [];
  dateDebutFilter = '';
  dateFinFilter = '';

  readonly availableTags: EventTag[] = [
    'MUSIQUE',
    'DANSE',
    'PLEIN AIR',
    'RENCONTRE',
    'FEU D’ARTIFICE',
    'SPORT',
    'MARCHÉ',
  ];

  showFilters = false;

  readonly favoritesFiltered = computed(() => {
    const q = this.q.trim().toLowerCase();
    const ville = this.ville.trim().toLowerCase();
    const lieu = this.lieu.trim().toLowerCase();
    const categorie = this.categorie;
    const d0 = this.dateDebutFilter;
    const d1 = this.dateFinFilter;

    return (this.favorites() ?? [])
      .filter((e) => {
        if (categorie && e.categorie !== categorie) return false;

        if (this.caracteristiquesFilter.length) {
          const tags = e.caracteristiques ?? [];
          const hit = this.caracteristiquesFilter.some((t) => tags.includes(t));
          if (!hit) return false;
        }

        if (ville) {
          if (!e.ville?.toLowerCase().includes(ville)) return false;
        }
        if (lieu) {
          if (!e.lieu?.toLowerCase().includes(lieu)) return false;
        }

        const dayKey = this.localKeyFromIso(e.dateDebut);
        if (d0 && dayKey < d0) return false;
        if (d1 && dayKey > d1) return false;

        if (!q) return true;
        const hay = `${e.titre} ${e.description ?? ''} ${e.ville ?? ''} ${e.lieu ?? ''} ${e.theme ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => a.dateDebut.localeCompare(b.dateDebut) || a.titre.localeCompare(b.titre));
  });

  readonly favoritesDayKeys = computed(() => {
    const keys = new Set<string>();
    for (const e of this.favoritesFiltered()) {
      keys.add(this.localKeyFromIso(e.dateDebut));
    }
    return Array.from(keys.values()).sort((a, b) => a.localeCompare(b));
  });

  readonly favoritesWeeks = computed(() => {
    const map = new Map<string, EventDto[]>();
    for (const e of this.favoritesFiltered()) {
      const key = this.localKeyFromIso(e.dateDebut);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => a.dateDebut.localeCompare(b.dateDebut) || a.titre.localeCompare(b.titre));
      map.set(k, arr);
    }

    const weeks = new Map<
      string,
      {
        weekStartKey: string;
        label: string;
        days: Array<{ dayKey: string; items: EventDto[] }>;
      }
    >();

    for (const dayKey of this.favoritesDayKeys()) {
      const items = map.get(dayKey) ?? [];
      const weekStartKey = this.weekStartKeyFromDayKey(dayKey);
      const label = this.formatWeekLabelFromStartKey(weekStartKey);
      const w = weeks.get(weekStartKey) ?? { weekStartKey, label, days: [] };
      w.days.push({ dayKey, items });
      weeks.set(weekStartKey, w);
    }

    return Array.from(weeks.values()).sort((a, b) => a.weekStartKey.localeCompare(b.weekStartKey));
  });

  readonly activeChips = computed(() => {
    const out: Array<{ key: string; label: string }> = [];
    if (this.q.trim()) out.push({ key: 'q', label: `Mot-clé: ${this.q.trim()}` });
    if (this.ville.trim()) out.push({ key: 'ville', label: `Ville: ${this.ville.trim()}` });
    if (this.lieu.trim()) out.push({ key: 'lieu', label: `Lieu: ${this.lieu.trim()}` });
    if (this.categorie) out.push({ key: 'categorie', label: `Catégorie: ${this.categorie}` });
    if (this.caracteristiquesFilter.length) {
      out.push({ key: 'caracteristiques', label: `Caractéristiques: ${this.caracteristiquesFilter.join(', ')}` });
    }
    if (this.dateDebutFilter) out.push({ key: 'dateDebut', label: `Début: ${this.dateDebutFilter}` });
    if (this.dateFinFilter) out.push({ key: 'dateFin', label: `Fin: ${this.dateFinFilter}` });
    return out;
  });

  categoryColor = categoryColor;
  tagIcon = tagIcon;

  /** Hook Angular: charge la liste initiale des favoris. */
  async ngOnInit() {
    await this.reload();
  }

  /** Retire un favori puis recharge la liste. */
  async remove(id: string) {
    await this.favoritesService.remove(id).toPromise();
    await this.reload();
  }

  async reload() {
    const fav = await this.favoritesService.list().toPromise();
    this.favorites.set(fav ?? []);
  }

  toggleFilters() {
    this.showFilters = !this.showFilters;
  }

  applyFilters() {
    this.showFilters = false;
  }

  reset() {
    this.q = '';
    this.ville = '';
    this.lieu = '';
    this.categorie = '';
    this.caracteristiquesFilter = [];
    this.dateDebutFilter = '';
    this.dateFinFilter = '';
    this.showFilters = false;
  }

  clearChip(key: string) {
    switch (key) {
      case 'q':
        this.q = '';
        break;
      case 'ville':
        this.ville = '';
        break;
      case 'lieu':
        this.lieu = '';
        break;
      case 'categorie':
        this.categorie = '';
        break;
      case 'caracteristiques':
        this.caracteristiquesFilter = [];
        break;
      case 'dateDebut':
        this.dateDebutFilter = '';
        break;
      case 'dateFin':
        this.dateFinFilter = '';
        break;
    }
  }

  isCaracteristiqueFilterSelected(tag: EventTag) {
    return this.caracteristiquesFilter.includes(tag);
  }

  toggleCaracteristiqueFilter(tag: EventTag) {
    const current = this.caracteristiquesFilter;
    if (current.includes(tag)) {
      this.caracteristiquesFilter = current.filter((t) => t !== tag);
      return;
    }
    if (current.length >= 3) return;
    this.caracteristiquesFilter = [...current, tag];
  }

  dayKeyToDate(dayKey: string) {
    const [y, m, d] = dayKey.split('-').map((x) => Number(x));
    return new Date(y, m - 1, d);
  }

  private localKeyFromIso(iso: string) {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  private weekStartKeyFromDayKey(dayKey: string) {
    const d = this.dayKeyToDate(dayKey);
    const day = d.getDay();
    const diff = (day + 6) % 7;
    d.setDate(d.getDate() - diff);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  private formatWeekLabelFromStartKey(weekStartKey: string) {
    const d = this.dayKeyToDate(weekStartKey);
    const formatted = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    return `Semaine du ${formatted}`;
  }
}
