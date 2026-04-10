import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { EventsService, EventCategory, EventDto, EventTag } from '../../core/events.service';
import {
  categoryColor,
  categoryForegroundColor,
  categoryGradient,
  categoryIcon,
  resolveEventImageUrl,
  tagIcon,
  tagIconUrl,
} from '../../core/event-ui';
import { FavoritesService } from '../../core/favorites.service';
import { I18nService } from '../../core/i18n.service';
import { PhotonFeature, PhotonService } from '../../core/photon.service';

type ImageChoice = { label: string; value: string };

/**
 * Villes toujours proposées en suggestion.
 * `label`      : texte affiché dans la bulle.
 * `searchTerm` : terme envoyé au filtre (plus flexible, généralement le premier mot).
 */
const PINNED_SUGGESTION_CITIES: Array<{ label: string; searchTerm: string }> = [
  { label: 'Martigues',       searchTerm: 'Martigues' },
  { label: 'Sausset-les-Pins', searchTerm: 'Sausset'  },
  { label: 'Carry-le-Rouet',  searchTerm: 'Carry'    },
];

const CATEGORY_IMAGE_CHOICES: Record<EventCategory, ImageChoice[]> = {
  Concert: [{ label: 'Générique', value: 'img/categorie/SPECTACLE/spec1.png' }],
  Danse: [{ label: 'Générique', value: 'img/categorie/SPECTACLE/spec1.png' }],
  Spectacle: [{ label: 'Générique', value: 'img/categorie/SPECTACLE/spec1.png' }],
  'Feux d\u2019artifice': [{ label: 'Générique', value: 'img/categorie/FESTIVAL/fest1.png' }],
  Exposition: [{ label: 'Générique', value: 'img/categorie/EXPOSITION/expo1.png' }],
  Autre: [{ label: 'Générique', value: 'img/categorie/AUTRE/autre1.png' }],
};

@Component({
  selector: 'app-calendar-page',
  imports: [FormsModule, RouterLink, DatePipe],
  templateUrl: './calendar.page.html',
  styleUrl: './calendar.page.scss',
})
/**
 * Page Calendrier.
 * Gère l'affichage semaine/journée, le chargement des événements et le layout du scheduler (positionnement + taille des slots).
 */
export class CalendarPage implements OnInit, AfterViewInit, OnDestroy {
  private readonly eventsService = inject(EventsService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly el = inject(ElementRef);
  private readonly photon = inject(PhotonService);

  @ViewChild('schedScroll')
  private schedScroll?: ElementRef<HTMLElement>;

  /** Indique si le composant a été détruit (évite des requêtes tardives via observers). */
  private destroyed = false;

  private resizeObserver?: ResizeObserver;
  private observedScheduler?: Element;

  /** Observer utilisé pour déclencher le chargement progressif de la liste "à venir". */
  private upcomingObserver?: IntersectionObserver;

  /** Point d'ancrage DOM en bas de liste, observé pour déclencher le chargement de la page suivante. */
  @ViewChild('upcomingSentinel')
  private upcomingSentinel?: ElementRef<HTMLElement>;

  private swipeHost?: HTMLElement;
  private swipeStartX = 0;
  private swipeStartY = 0;
  private swipeStartTs = 0;
  private swipeStartScrollLeft = 0;
  private readonly onSwipeTouchStart = (ev: TouchEvent) => {
    if (ev.touches.length !== 1) return;
    const t = ev.touches[0];
    this.swipeStartX = t.clientX;
    this.swipeStartY = t.clientY;
    this.swipeStartTs = Date.now();
    this.swipeStartScrollLeft = this.swipeHost?.scrollLeft ?? 0;
  };
  private readonly onSwipeTouchEnd = (ev: TouchEvent) => {
    if (!this.swipeStartTs) return;
    const t = ev.changedTouches[0];
    if (!t) return;

    const dx = t.clientX - this.swipeStartX;
    const dy = t.clientY - this.swipeStartY;
    const dt = Date.now() - this.swipeStartTs;
    this.swipeStartTs = 0;

    if (dt > 900) return;
    if (Math.abs(dx) < 70) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.2) return;

    const host = this.swipeHost;
    if (host && Math.abs((host.scrollLeft ?? 0) - this.swipeStartScrollLeft) > 6) return;

    if (dx > 0) {
      this.prevPeriod();
    } else {
      this.nextPeriod();
    }
  };

  /**
   * Avoid concurrent reload() calls (e.g. user clicking refresh multiple times):
   * - serialize requests with a single in-flight promise
   * - keep at most one queued reload
   * - use a token to ignore stale async responses
   */
  private reloadInFlight = false;
  private reloadQueued = false;
  private reloadToken = 0;

  readonly events = signal<EventDto[]>([]);
  readonly loading = signal<boolean>(false);

  /** Liste paginée des événements à venir (utilisée pour la section du bas). */
  readonly upcomingEvents = signal<EventDto[]>([]);
  /** Indique si une page "à venir" est en cours de chargement. */
  readonly upcomingLoading = signal<boolean>(false);
  /** Indique s'il reste potentiellement des événements à charger (pagination). */
  readonly upcomingHasMore = signal<boolean>(true);

  /** Taille de page pour le chargement progressif des événements à venir. */
  private readonly upcomingPageSize = 50;
  /** Offset courant pour la pagination des événements à venir. */
  private upcomingOffset = 0;
  /** Token d'invalidation pour ignorer les réponses "à venir" obsolètes. */
  private upcomingToken = 0;

  readonly favoriteIds = signal<Set<string>>(new Set());

  private readonly _viewMode = signal<'week' | 'day'>('week');
  private readonly _selectedDate = signal<string>(this.todayLocalKey());

  /** Récupère le mode de vue courant (`week` ou `day`). */
  get viewMode() {
    return this._viewMode();
  }
  /** Met à jour le mode de vue courant (`week` ou `day`). */
  set viewMode(v: 'week' | 'day') {
    this._viewMode.set(v);
  }

  /** Récupère la date sélectionnée au format `YYYY-MM-DD` (timezone locale). */
  get selectedDate() {
    return this._selectedDate();
  }
  /** Met à jour la date sélectionnée au format `YYYY-MM-DD` (timezone locale). */
  set selectedDate(v: string) {
    this._selectedDate.set(v);
  }

  q = '';
  adresse = '';
  categorie: EventCategory | '' = '';
  favoris = false;
  includePending = false;

  readonly cities = signal<string[]>([]);
  readonly suggestionPool = signal<EventDto[]>([]);

  readonly adresseSuggestions = signal<PhotonFeature[]>([]);
  readonly adresseSuggestOpen = signal<boolean>(false);
  private adresseSuggestToken = 0;

  caracteristiquesFilter: EventTag[] = [];

  dateDebutFilter = '';
  dateFinFilter = '';

  showFilters = false;

  private syncingFromUrl = false;
  private syncingToUrl = false;
  private lastQueryKey: string | null = null;

  private isDayKey(v: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(v);
  }

  private currentQueryKey(pm: { keys: string[]; get: (k: string) => string | null }) {
    const keys = pm.keys.slice().sort();
    return keys.map((k) => `${k}=${pm.get(k) ?? ''}`).join('&');
  }

  private isMobileViewport() {
    if (typeof window === 'undefined') return false;
    return !!window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  }

  private applyQueryParams(pm: { get: (k: string) => string | null }) {
    const view = pm.get('view');
    if (view === 'week' || view === 'day') {
      this.viewMode = view;
    } else if (this.isMobileViewport()) {
      this.viewMode = 'day';
    }

    const date = pm.get('date');
    if (date && this.isDayKey(date)) {
      this.selectedDate = date;
    }

    const dateDebut = pm.get('dateDebut');
    this.dateDebutFilter = dateDebut && this.isDayKey(dateDebut) ? dateDebut : '';

    const dateFin = pm.get('dateFin');
    this.dateFinFilter = dateFin && this.isDayKey(dateFin) ? dateFin : '';

    this.q = (pm.get('q') ?? '').trim();
    this.adresse = (pm.get('adresse') ?? '').trim();

    const cat = (pm.get('categorie') ?? '').trim();
    this.categorie = (cat as any) || '';

    const fav = (pm.get('favoris') ?? '').trim();
    const favEnabled = fav === '1' || fav.toLowerCase() === 'true';
    this.favoris = favEnabled && this.auth.isLoggedIn();

    const inc = (pm.get('includePending') ?? '').trim();
    const incEnabled = inc === '1' || inc.toLowerCase() === 'true';
    this.includePending = incEnabled;

    const tagsRaw = (pm.get('tags') ?? '').trim();
    if (tagsRaw) {
      const allowed = new Set(this.availableTags);
      const tags = tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter((t) => !!t)
        .filter((t) => allowed.has(t as EventTag))
        .slice(0, 3) as EventTag[];
      this.caracteristiquesFilter = tags;
    } else {
      this.caracteristiquesFilter = [];
    }
  }

  private buildQueryParams() {
    const qp: Record<string, string> = {};
    qp['view'] = this.viewMode;
    qp['date'] = this.selectedDate;
    if (this.dateDebutFilter) qp['dateDebut'] = this.dateDebutFilter;
    if (this.dateFinFilter) qp['dateFin'] = this.dateFinFilter;
    if (this.adresse) qp['adresse'] = this.adresse;
    if (this.categorie) qp['categorie'] = this.categorie as string;
    if (this.q) qp['q'] = this.q;
    if (this.favoris) qp['favoris'] = '1';
    if (this.includePending) qp['includePending'] = '1';
    if (this.caracteristiquesFilter.length) qp['tags'] = this.caracteristiquesFilter.join(',');
    return qp;
  }

  private syncUrl() {
    if (this.syncingFromUrl) return;
    if (this.syncingToUrl) return;
    this.syncingToUrl = true;
    const qp = this.buildQueryParams();
    const nav = this.router.navigate([], {
      relativeTo: this.route,
      queryParams: qp,
      replaceUrl: true,
    });
    Promise.resolve(nav).finally(() => {
      this.syncingToUrl = false;
    });
  }

  readonly sideOpen = signal<boolean>(false);
  readonly sideDayKey = signal<string>(this.selectedDate);
  readonly sideTab = signal<'day' | 'night'>('day');

  /** Liste optionnelle d'ids sélectionnés pour le drawer (null = afficher tous les événements du jour). */
  readonly sideSelectedEventIds = signal<string[] | null>(null);

  private readonly startHour = 6;
  private readonly endHour = 23;
  private readonly minutesPerSlot = 30;

  /** Nombre de semaines à charger/afficher dans la section "Événements à venir" (en vue semaine). */
  private readonly upcomingWeeksAhead = 6;

  /**
   * Hauteur (en px) d'un slot horaire dans la grille.
   * Recalculée dynamiquement en fonction de la hauteur réellement rendue du scheduler.
   */
  readonly slotPx = signal<number>(26);

  private readonly autoFitSlotPx = true;

  /** Indique si les logs de layout sont activés via `localStorage.CALENDA_DEBUG_CALENDAR=1`. */
  private readonly isDebugCalendar = () => {
    if (typeof window === 'undefined') return false;
    try {
      return (localStorage.getItem('CALENDA_DEBUG_CALENDAR') ?? '') === '1';
    } catch {
      return false;
    }
  };

  /** Log de diagnostic (silencieux si le debug calendar n'est pas activé). */
  private dbg(...args: unknown[]) {
    if (!this.isDebugCalendar()) return;
    // eslint-disable-next-line no-console
    console.debug('[CalendarLayout]', ...args);
  }

  /**
   * Lors d'un resize fenêtre, on refit `slotPx`.
   * On planifie le recalcul (rAF + retries) plutôt que de mesurer en synchrone.
   */
  private readonly onResize = () => {
    this.scheduleRecomputeSlotPx('resize');
  };

  readonly canPropose = computed(() => this.auth.isLoggedIn());
  protected readonly isAdmin = computed(() => !!this.auth.user()?.isAdmin);

  proposeGateOpen = false;
  proposeGateMessage = this.i18n.t('calendar.proposeLoginMessage');
  proposeGateKind: 'login_required' = 'login_required';

  /** Convertit un ISO datetime en minutes depuis minuit (heure locale). */
  private minutesOfDay(iso: string) {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  }

  /** Détermine si un événement est « nocturne » (00:00-05:59, fin avant 06:00, même jour). */
  private isNocturne(e: EventDto) {
    if (!e.dateFin) {
      return false;
    }
    if (this.localKeyFromIso(e.dateDebut) !== this.localKeyFromIso(e.dateFin)) {
      return false;
    }

    const start = this.minutesOfDay(e.dateDebut);
    const end = this.minutesOfDay(e.dateFin);
    // Nocturne = starts after midnight and ends before 06:00.
    // If it ends after 06:00, it becomes a “day” event (shown clipped in the grid).
    return start >= 0 && start < this.startHour * 60 && end > 0 && end <= this.startHour * 60;
  }

  readonly nightEventsByDay = computed(() => {
    const map = new Map<string, EventDto[]>();
    for (const e of this.events()) {
      if (!this.isNocturne(e)) continue;

      // Nocturne events are displayed as belonging to the "night of" the previous day.
      // Example: 10 Jan 01:00 -> shown under 9 Jan (night events).
      const key = this.prevDayKey(this.localKeyFromIso(e.dateDebut));
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => a.dateDebut.localeCompare(b.dateDebut) || a.titre.localeCompare(b.titre));
      map.set(k, arr);
    }
    return map;
  });

  /** Retourne le nombre d'événements nocturnes pour un jour (clé `YYYY-MM-DD`). */
  nightCount(dayKey: string) {
    return this.nightEventsByDay().get(dayKey)?.length ?? 0;
  }

  readonly sideTitleKey = computed(() => {
    const k = this.sideDayKey();
    return this.sideTab() === 'night' ? this.nextDayKey(k) : k;
  });

  readonly timeSlots = computed(() => {
    const totalMinutes = this.windowMinutes();
    const slots = Math.floor(totalMinutes / this.minutesPerSlot);
    return Array.from({ length: slots }).map((_, idx) => {
      const minutesFromStart = idx * this.minutesPerSlot;
      const hh = (this.startHour + Math.floor(minutesFromStart / 60)) % 24;
      const mm = minutesFromStart % 60;
      return {
        idx,
        minutesFromStart,
        label: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
        isHour: mm === 0,
      };
    });
  });

  readonly endTimeLabel = computed(() => {
    const minutes = this.windowMinutes();
    const hh = (this.startHour + Math.floor(minutes / 60)) % 24;
    const mm = minutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  });

  readonly dayHeightPx = computed(() => `${this.windowMinutes() * (this.slotPx() / this.minutesPerSlot)}px`);

  showPropose = false;

  newTitre = '';
  newDescription = '';
  newCategorie: EventCategory = 'Concert';
  newVille = '';
  newAdresse = '';
  newLatitude: number | null = null;
  newLongitude: number | null = null;
  readonly newAdresseSuggestions = signal<PhotonFeature[]>([]);
  readonly newAdresseSuggestOpen = signal<boolean>(false);
  private newAdresseSuggestToken = 0;
  newCaracteristiques: EventTag[] = [];
  newImageUrl = '';
  newContact = '';
  newDateDebut = '';
  newDateFin = '';

  newHoneypot = '';

  protected readonly categoryColor = categoryColor;
  protected readonly categoryGradient = categoryGradient;
  protected readonly categoryForegroundColor = categoryForegroundColor;
  protected readonly categoryIcon = categoryIcon;
  protected readonly tagIcon = tagIcon;
  protected readonly tagIconUrl = tagIconUrl;

  eventImageUrl(e: EventDto) {
    return resolveEventImageUrl(e.categorie, e.imageUrl);
  }

  displayAdresse(e: EventDto) {
    return (e.adresse ?? e.lieu ?? '').trim();
  }

  mergedBlockTags(eventIds: string[]): string[] {
    const evMap = new Map(this.events().map((e) => [e.id, e]));
    const seen = new Set<string>();
    const result: string[] = [];
    for (const id of eventIds) {
      const ev = evMap.get(id);
      if (!ev) continue;
      for (const tag of ev.caracteristiques ?? []) {
        if (!seen.has(tag)) {
          seen.add(tag);
          result.push(tag);
          if (result.length >= 5) return result;
        }
      }
    }
    return result;
  }

  newImageOptions(): ImageChoice[] {
    return CATEGORY_IMAGE_CHOICES[this.newCategorie] ?? [];
  }

  newImagePreviewUrl() {
    return resolveEventImageUrl(this.newCategorie, this.newImageUrl ? this.newImageUrl : null);
  }

  onNewCategorieChange() {
    this.newImageUrl = '';
  }

  readonly availableTags: EventTag[] = [
    'MUSIQUE',
    'DANSE',
    'PLEIN AIR',
    'RENCONTRE',
    'FEU D’ARTIFICE',
    'SPORT',
    'MARCHÉ',
    'COMPÉTITION',
    'HUMOUR',
    'ART',
    'VISITE',
  ];

  readonly selectedDateObj = computed(() => {
    const d = new Date(`${this.selectedDate}T00:00:00`);
    return isNaN(d.getTime()) ? new Date() : d;
  });

  readonly weekStart = computed(() => {
    const d = this.selectedDateObj();
    const day = (d.getDay() + 6) % 7;
    const start = new Date(d);
    start.setDate(d.getDate() - day);
    start.setHours(0, 0, 0, 0);
    return start;
  });

  readonly weekDays = computed(() => {
    const start = this.weekStart();
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  });

  readonly dateLocale = computed(() => {
    const code = this.i18n.lang();
    if (code === 'fr') return 'fr-FR';
    if (code === 'en') return 'en-GB';
    if (code === 'es') return 'es-ES';
    if (code === 'it') return 'it-IT';
    return 'de-DE';
  });

  readonly weekLabel = computed(() => {
    const start = this.weekStart();
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const locale = this.dateLocale();
    const startLabel = start.toLocaleDateString(locale);
    const endLabel = end.toLocaleDateString(locale);
    return this.i18n.t('calendar.weekRange', { start: startLabel, end: endLabel });
  });

  private todayLocalKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = `${now.getMonth() + 1}`.padStart(2, '0');
    const d = `${now.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** Transforme une Date en clé locale `YYYY-MM-DD`. */
  private localKeyFromDate(d: Date) {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Transforme un ISO datetime en clé locale `YYYY-MM-DD`. */
  private localKeyFromIso(iso: string) {
    return this.localKeyFromDate(new Date(iso));
  }

  private prevDayKey(dayKey: string) {
    const d = new Date(`${dayKey}T00:00:00`);
    d.setDate(d.getDate() - 1);
    return this.localKeyFromDate(d);
  }

  private nextDayKey(dayKey: string) {
    const d = new Date(`${dayKey}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return this.localKeyFromDate(d);
  }

  readonly eventsByDay = computed(() => {
    const map = new Map<string, EventDto[]>();
    for (const e of this.events()) {
      const key = this.localKeyFromIso(e.dateDebut);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => a.dateDebut.localeCompare(b.dateDebut) || a.titre.localeCompare(b.titre));
      map.set(k, arr);
    }
    return map;
  });

  readonly layoutsByDay = computed(() => {
    const map = new Map<string, Array<LayoutItem>>();
    const byDay = this.eventsByDay();
    for (const d of this.weekDays()) {
      const key = this.localKeyFromDate(d);
      map.set(key, this.computeLayoutForDay(key, byDay.get(key) ?? []));
    }
    return map;
  });

  readonly dayEvents = computed(() => {
    const key = this.selectedDate;
    return this.eventsByDay().get(key) ?? [];
  });

  readonly rangeDays = computed(() => {
    const startKey = this.selectedDate;
    const end = new Date(this.weekStart());
    end.setDate(end.getDate() + 6);
    const endKey = this.localKeyFromDate(end);

    const out: string[] = [];
    let cursor = new Date(`${startKey}T00:00:00`);
    cursor.setHours(0, 0, 0, 0);
    const endDate = new Date(`${endKey}T00:00:00`);
    endDate.setHours(0, 0, 0, 0);

    while (cursor <= endDate) {
      out.push(this.localKeyFromDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  });

  readonly eventsFromSelectedToWeekEnd = computed(() => {
    const map = this.eventsByDay();
    return this.rangeDays().map((k) => ({ key: k, items: map.get(k) ?? [] }));
  });

  /** Calcule la clé `YYYY-MM-DD` du lundi de la semaine contenant `dayKey` (timezone locale). */
  private weekStartKeyFromDayKey(dayKey: string) {
    const d = new Date(`${dayKey}T00:00:00`);
    const day = (d.getDay() + 6) % 7;
    const start = new Date(d);
    start.setDate(d.getDate() - day);
    start.setHours(0, 0, 0, 0);
    return this.localKeyFromDate(start);
  }

  /** Formate un libellé de semaine basé sur le lundi (ex: "Semaine du 1 janvier"). */
  private formatWeekLabelFromStartKey(weekStartKey: string) {
    const d = this.dayKeyToDate(weekStartKey);
    const formatted = d.toLocaleDateString(this.dateLocale(), { day: 'numeric', month: 'long' });
    return this.i18n.t('calendar.weekFrom', { date: formatted });
  }

  /** Retourne les jours (clés `YYYY-MM-DD`) présents dans la liste paginée des événements à venir. */
  readonly upcomingDayKeys = computed(() => {
    const keys = new Set<string>();
    for (const e of this.upcomingEvents()) {
      keys.add(this.localKeyFromIso(e.dateDebut));
    }
    return Array.from(keys.values()).sort((a, b) => a.localeCompare(b));
  });

  /**
   * Groupes d'événements à venir, structurés par semaine (lundi) puis par jour.
   * N'affiche que les jours qui contiennent au moins un événement.
   */
  readonly upcomingWeeks = computed(() => {
    const map = new Map<string, EventDto[]>();
    for (const e of this.upcomingEvents()) {
      const key = this.localKeyFromIso(e.dateDebut);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => a.dateDebut.localeCompare(b.dateDebut) || a.titre.localeCompare(b.titre));
      map.set(k, arr);
    }

    /** Semaine de référence pour "Semaine en cours" (basée sur aujourd'hui). */
    const currentWeekStartKey = this.weekStartKeyFromDayKey(this.todayLocalKey());

    const weeks = new Map<
      string,
      {
        weekStartKey: string;
        label: string;
        days: Array<{ dayKey: string; items: EventDto[] }>;
      }
    >();

    for (const dayKey of this.upcomingDayKeys()) {
      const items = map.get(dayKey) ?? [];

      const weekStartKey = this.weekStartKeyFromDayKey(dayKey);
      const isCurrentWeek = weekStartKey === currentWeekStartKey;

      const label = isCurrentWeek
        ? this.i18n.t('calendar.currentWeek')
        : this.formatWeekLabelFromStartKey(weekStartKey);

      const w = weeks.get(weekStartKey) ?? { weekStartKey, label, days: [] };
      w.days.push({ dayKey, items });
      weeks.set(weekStartKey, w);
    }

    return Array.from(weeks.values()).sort((a, b) => a.weekStartKey.localeCompare(b.weekStartKey));
  });

  /** Planifie l'observation du sentinel de scroll infini après rendu. */
  private scheduleObserveUpcomingSentinel() {
    if (typeof window === 'undefined') return;
    requestAnimationFrame(() => this.ensureUpcomingObserved());
  }

  /** Connecte (si possible) l'IntersectionObserver sur le sentinel de bas de liste "à venir". */
  private ensureUpcomingObserved() {
    if (typeof window === 'undefined') return;
    if (this.destroyed) return;
    if (!this.upcomingHasMore()) return;

    const el = this.upcomingSentinel?.nativeElement;
    if (!el) return;

    if (!this.upcomingObserver) {
      this.upcomingObserver = new IntersectionObserver((entries) => {
        if (this.destroyed) return;
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit) return;
        void this.loadMoreUpcoming();
      }, { rootMargin: '800px 0px' });
    }

    this.upcomingObserver.disconnect();
    this.upcomingObserver.observe(el);
  }

  readonly sideEvents = computed(() => {
    const k = this.sideDayKey();
    const all = this.eventsByDay().get(k) ?? [];

    /** Filtre de sélection (utilisé quand on clique sur un bloc événement ou un regroupement). */
    const ids = this.sideSelectedEventIds();
    if (!ids || ids.length === 0) {
      return all;
    }

    const allowed = new Set(ids);
    return all.filter((e) => allowed.has(e.id));
  });

  readonly sideDayEvents = computed(() => {
    const d = this.sideEvents();
    return d.filter((e) => !this.isNocturne(e));
  });

  readonly sideNightEvents = computed(() => {
    const key = this.sideDayKey();
    return this.nightEventsByDay().get(key) ?? [];
  });

  /** Hook Angular: initialise listeners (resize/navigation) puis charge favoris + événements. */
  async ngOnInit() {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.onResize);
    }

    const navSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        if (!e.urlAfterRedirects.includes('/calendar')) {
          return;
        }
        this.scheduleRecomputeSlotPx('navigation');
      });
    this.destroyRef.onDestroy(() => navSub.unsubscribe());

    this.scheduleRecomputeSlotPx('init');

    const qpSub = this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pm) => {
      const key = this.currentQueryKey(pm);
      if (this.lastQueryKey === key) return;
      if (this.syncingToUrl) {
        this.lastQueryKey = key;
        return;
      }
      this.lastQueryKey = key;
      this.syncingFromUrl = true;
      this.applyQueryParams(pm);
      this.syncingFromUrl = false;
      this.scheduleRecomputeSlotPx('queryParams');
      void this.reload();
    });

    /**
     * Charge l'utilisateur si un token est présent.
     * Tolère les erreurs (token expiré/invalidé) pour ne pas bloquer le chargement des événements publics.
     */
    try {
      await this.auth.ensureLoaded();
    } catch {
      // Ignore: l'utilisateur sera considéré comme déconnecté si l'API refuse le token.
    }

    /** Recharge les favoris si possible, sinon repart sur un état vide. */
    try {
      await this.reloadFavorites();
    } catch {
      this.favoriteIds.set(new Set());
    }
    const c = await this.eventsService.cities().toPromise();
    this.cities.set(c ?? []);

    this.lastQueryKey = this.currentQueryKey(this.route.snapshot.queryParamMap);
    this.syncingFromUrl = true;
    this.applyQueryParams(this.route.snapshot.queryParamMap);
    this.syncingFromUrl = false;
    this.syncUrl();

    void this.loadSuggestionPool();
    await this.reload();
  }

  cityButtons() {
    return this.cities().slice(0, 12);
  }

  pickCity(city: string) {
    this.adresse = city;
    this.adresseSuggestions.set([]);
    this.adresseSuggestOpen.set(false);
  }

  private async refreshAdresseSuggestions(query: string) {
    const token = ++this.adresseSuggestToken;
    const q = (query ?? '').trim();
    if (q.length < 3) {
      this.adresseSuggestions.set([]);
      this.adresseSuggestOpen.set(false);
      return;
    }
    const res = await this.photon.search(q, { limit: 6 }).toPromise();
    if (token !== this.adresseSuggestToken) return;
    this.adresseSuggestions.set(res ?? []);
    this.adresseSuggestOpen.set(true);
  }

  onAdresseInput(v: string) {
    this.adresse = v;
    void this.refreshAdresseSuggestions(v);
  }

  chooseAdresseSuggestion(f: PhotonFeature) {
    this.adresse = this.photon.label(f);
    this.adresseSuggestions.set([]);
    this.adresseSuggestOpen.set(false);
  }

  adresseSuggestionLabel(f: PhotonFeature) {
    return this.photon.label(f);
  }

  private async refreshNewAdresseSuggestions(query: string) {
    const token = ++this.newAdresseSuggestToken;
    const q = (query ?? '').trim();
    if (q.length < 3) {
      this.newAdresseSuggestions.set([]);
      this.newAdresseSuggestOpen.set(false);
      return;
    }
    const res = await this.photon.search(q, { limit: 6 }).toPromise();
    if (token !== this.newAdresseSuggestToken) return;
    this.newAdresseSuggestions.set(res ?? []);
    this.newAdresseSuggestOpen.set(true);
  }

  onNewAdresseInput(v: string) {
    this.newAdresse = v;
    void this.refreshNewAdresseSuggestions(v);
  }

  chooseNewAdresseSuggestion(f: PhotonFeature) {
    this.newAdresse = this.photon.label(f);
    const c = this.photon.coords(f);
    this.newLatitude = c?.lat ?? null;
    this.newLongitude = c?.lon ?? null;
    const city = this.photon.city(f);
    if (city) this.newVille = city;
    this.newAdresseSuggestions.set([]);
    this.newAdresseSuggestOpen.set(false);
  }

  newAdresseSuggestionLabel(f: PhotonFeature) {
    return this.photon.label(f);
  }

  /** Hook Angular: attache l'IntersectionObserver pour le chargement progressif de la liste "à venir". */
  ngAfterViewInit() {
    this.scheduleObserveUpcomingSentinel();
    this.attachSwipeNav();
  }

  /** Hook Angular: nettoyage des listeners + observers. */
  ngOnDestroy() {
    this.destroyed = true;

    this.detachSwipeNav();

    /** Invalide les requêtes "à venir" en cours pour éviter l'application de réponses tardives. */
    this.upcomingToken += 1;

    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onResize);
    }
    this.resizeObserver?.disconnect();
    this.upcomingObserver?.disconnect();
  }

  /** Recharge la liste des favoris du user (si connecté). */
  private async reloadFavorites() {
    if (!this.auth.isLoggedIn()) {
      this.favoriteIds.set(new Set());
      return;
    }

    const fav = await this.favoritesService.list().toPromise();
    const set = new Set((fav ?? []).map((e) => e.id));
    this.favoriteIds.set(set);
  }

  /**
   * Recharge les événements selon les filtres + la période de la vue.
   * Sérialisé pour éviter les courses (refreshs rapides) et recalculer le layout à la fin.
   */
  async reload() {
    if (this.reloadInFlight) {
      this.reloadQueued = true;
      this.dbg('reload queued');
      return;
    }

    this.reloadInFlight = true;
    const token = ++this.reloadToken;
    this.loading.set(true);
    try {
      const params: Record<string, string> = {};

      const fromTo = this.computeFromTo();
      if (fromTo.from) params['from'] = fromTo.from;
      if (fromTo.to) params['to'] = fromTo.to;

      if (this.q) params['q'] = this.q;
      if (this.adresse) params['adresse'] = this.adresse;
      if (this.categorie) params['categorie'] = this.categorie as string;
      if (this.favoris) params['favoris'] = 'true';
      if (this.includePending && !!this.auth.user()?.isAdmin) params['includePending'] = '1';
      if (this.caracteristiquesFilter.length) params['caracteristiques'] = this.caracteristiquesFilter.join(',');

      this.dbg('reload start', {
        token,
        viewMode: this.viewMode,
        selectedDate: this.selectedDate,
        from: params['from'],
        to: params['to'],
      });

      const res = await this.eventsService.list(params).toPromise();
      if (token === this.reloadToken) {
        this.events.set(res ?? []);

        /** Recharge aussi la liste "à venir" (démarre à la première page) en vue semaine et journée. */
        this.resetUpcoming();
      }
    } finally {
      if (token === this.reloadToken) {
        this.loading.set(false);
        this.dbg('reload end', { token, events: this.events().length });
        // After reload, DOM changes (headers/night buttons) can impact available height.
        // Recompute slotPx after render (rAF + double-rAF) to avoid relying on a manual resize.
        this.scheduleRecomputeSlotPx('reload');

        /** Ré-attache le sentinel si la section "à venir" est visible. */
        this.scheduleObserveUpcomingSentinel();
      }

      this.reloadInFlight = false;
      if (this.reloadQueued) {
        this.reloadQueued = false;
        void this.reload();
      }
    }
  }

  /** Indique si un event (id) est dans la liste des favoris. */
  isFavorite(id: string) {
    return this.favoriteIds().has(id);
  }

  /** Ajoute/retire un favori côté API et met à jour le state local. */
  async toggleFavorite(id: string) {
    if (!this.auth.isLoggedIn()) {
      await this.router.navigateByUrl('/login');
      return;
    }

    const current = this.favoriteIds();
    const next = new Set(current);

    if (next.has(id)) {
      await this.favoritesService.remove(id).toPromise();
      next.delete(id);
    } else {
      await this.favoritesService.add(id).toPromise();
      next.add(id);
    }

    this.favoriteIds.set(next);
  }

  /** Calcule le range (from/to) à envoyer à l'API selon filtres / vue semaine ou journée. */
  private computeFromTo() {
    if (this.dateDebutFilter || this.dateFinFilter) {
      const from = this.dateDebutFilter
        ? new Date(`${this.dateDebutFilter}T00:00:00`).toISOString()
        : undefined;
      const to = this.dateFinFilter ? new Date(`${this.dateFinFilter}T23:59:59`).toISOString() : undefined;
      return { from, to };
    }

    if (this.viewMode === 'day') {
      const d = this.selectedDateObj();
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      return { from: start.toISOString(), to: end.toISOString() };
    }

    const start = this.weekStart();
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }

  /** Réinitialise la pagination de la liste "à venir" et charge la première page. */
  private resetUpcoming() {
    this.upcomingOffset = 0;
    this.upcomingToken += 1;
    this.upcomingEvents.set([]);
    this.upcomingHasMore.set(true);
    void this.loadMoreUpcoming();
  }

  /** Charge la prochaine page (50 par 50) pour la liste "Événements à venir". */
  private async loadMoreUpcoming() {
    if (this.destroyed) return;
    if (this.upcomingLoading()) return;
    if (!this.upcomingHasMore()) return;

    const token = this.upcomingToken;
    this.upcomingLoading.set(true);
    try {
      const params: Record<string, string> = {};

      /**
       * Période de base: si un filtre date est utilisé, on le respecte.
       * Sinon, on démarre au plus tôt à aujourd'hui (événements à venir).
       */
      if (this.dateDebutFilter || this.dateFinFilter) {
        if (this.dateDebutFilter) {
          params['from'] = new Date(`${this.dateDebutFilter}T00:00:00`).toISOString();
        }
        if (this.dateFinFilter) {
          params['to'] = new Date(`${this.dateFinFilter}T23:59:59`).toISOString();
        }
      } else {
        const startKey = this.selectedDate < this.todayLocalKey() ? this.todayLocalKey() : this.selectedDate;
        const start = new Date(`${startKey}T00:00:00`);
        start.setHours(0, 0, 0, 0);
        params['from'] = start.toISOString();
      }

      if (this.q) params['q'] = this.q;
      if (this.adresse) params['adresse'] = this.adresse;
      if (this.categorie) params['categorie'] = this.categorie as string;
      if (this.favoris) params['favoris'] = 'true';
      if (this.includePending && !!this.auth.user()?.isAdmin) params['includePending'] = '1';
      if (this.caracteristiquesFilter.length) params['caracteristiques'] = this.caracteristiquesFilter.join(',');

      params['limit'] = String(this.upcomingPageSize);
      params['offset'] = String(this.upcomingOffset);

      const res = await this.eventsService.list(params).toPromise();
      if (token !== this.upcomingToken) {
        return;
      }

      const items = res ?? [];
      const next = [...this.upcomingEvents(), ...items];
      this.upcomingEvents.set(next);
      this.upcomingOffset += items.length;
      this.upcomingHasMore.set(items.length === this.upcomingPageSize);
    } catch {
      /** En cas d'erreur réseau, on stoppe le chargement progressif pour éviter une boucle. */
      if (token === this.upcomingToken) {
        this.upcomingHasMore.set(false);
      }
    } finally {
      if (token === this.upcomingToken) {
        this.upcomingLoading.set(false);
        this.scheduleObserveUpcomingSentinel();
      }
    }
  }

  /** Réinitialise les filtres puis relance un reload. */
  reset() {
    this.q = '';
    this.adresse = '';
    this.categorie = '';
    this.favoris = false;
    this.includePending = false;
    this.caracteristiquesFilter = [];
    this.dateDebutFilter = '';
    this.dateFinFilter = '';
    this.syncUrl();
    void this.reload();
  }

  /** Ouvre/ferme la modale de filtres. */
  toggleFilters() {
    this.showFilters = !this.showFilters;
  }

  /** Active/désactive le filtre « favoris » (nécessite d'être connecté) puis recharge. */
  async toggleFavoris() {
    if (!this.auth.isLoggedIn()) {
      await this.router.navigateByUrl('/login');
      return;
    }
    this.favoris = !this.favoris;
    await this.reloadFavorites();
    await this.reload();
  }

  async toggleIncludePending() {
    if (!this.isAdmin()) {
      this.includePending = false;
      this.syncUrl();
      return;
    }
    this.includePending = !this.includePending;
    this.syncUrl();
    await this.reload();
  }

  async onFavorisFilterChange(ev: Event) {
    const next = (ev.target as HTMLInputElement | null)?.checked ?? false;
    if (next && !this.auth.isLoggedIn()) {
      this.favoris = false;
      await this.router.navigateByUrl('/login');
      return;
    }
    this.favoris = next;
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

  /** Construit la liste de chips (tags) affichés pour représenter les filtres actifs. */
  activeChips() {
    const chips: Array<{ key: string; label: string }> = [];
    if (this.adresse) chips.push({ key: 'adresse', label: this.adresse });
    if (this.categorie) chips.push({ key: 'categorie', label: this.categorie });
    if (this.q) chips.push({ key: 'q', label: this.q });
    if (this.caracteristiquesFilter.length) chips.push({ key: 'caracteristiques', label: this.caracteristiquesFilter.join(', ') });
    if (this.dateDebutFilter) chips.push({ key: 'dateDebut', label: this.i18n.t('calendar.fromChip', { date: this.dateDebutFilter }) });
    if (this.dateFinFilter) chips.push({ key: 'dateFin', label: this.i18n.t('calendar.toChip', { date: this.dateFinFilter }) });
    if (this.favoris) chips.push({ key: 'favoris', label: this.i18n.t('calendar.favorites') });
    if (this.includePending && this.isAdmin()) chips.push({ key: 'includePending', label: this.i18n.t('calendar.pending') });
    return chips;
  }

  eventCountLabel(count: number) {
    return this.i18n.t('calendar.eventCount', { count });
  }

  nightEventsLabel(count: number) {
    return this.i18n.t('calendar.nightEvents', { count });
  }

  /** Charge tous les événements à venir pour alimenter les suggestions de filtres. */
  private async loadSuggestionPool() {
    const res = await this.eventsService.list({ from: this.todayLocalKey() }).toPromise();
    if (!this.destroyed) this.suggestionPool.set(res ?? []);
  }

  /** Retourne les suggestions de filtres (villes/catégories/tags) triées par fréquence, hors filtres déjà actifs. */
  suggestionChips(): Array<{ type: 'city' | 'category' | 'tag'; value: string; label: string }> {
    const pool = this.suggestionPool();
    const cityCount = new Map<string, number>();
    const catCount = new Map<string, number>();
    const tagCount = new Map<string, number>();
    for (const e of pool) {
      if (e.ville) {
        const k = e.ville.trim().toLowerCase();
        cityCount.set(k, (cityCount.get(k) ?? 0) + 1);
      }
      catCount.set(e.categorie, (catCount.get(e.categorie) ?? 0) + 1);
      for (const tag of e.caracteristiques ?? []) {
        tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
      }
    }
    // Villes fixées toujours présentes (clé en minuscules)
    for (const p of PINNED_SUGGESTION_CITIES) {
      const k = p.label.toLowerCase();
      if (!cityCount.has(k)) cityCount.set(k, 0);
    }
    const activeCity = this.adresse.trim().toLowerCase();
    const activeCat = (this.categorie ?? '').toLowerCase();
    const activeTags = new Set(this.caracteristiquesFilter.map(t => t.toLowerCase()));
    const canAddTag = this.caracteristiquesFilter.length < 3;
    const all: Array<{ type: 'city' | 'category' | 'tag'; value: string; label: string; count: number; pinned: boolean }> = [];
    for (const [cityKey, count] of cityCount.entries()) {
      const pinnedEntry = PINNED_SUGGESTION_CITIES.find(p => p.label.toLowerCase() === cityKey);
      const label = pinnedEntry ? pinnedEntry.label : cityKey;
      const searchTerm = pinnedEntry ? pinnedEntry.searchTerm : cityKey;
      if (searchTerm.toLowerCase() !== activeCity)
        all.push({ type: 'city', value: searchTerm, label, count, pinned: !!pinnedEntry });
    }
    for (const [cat, count] of catCount.entries()) {
      if (cat.toLowerCase() !== activeCat)
        all.push({ type: 'category', value: cat, label: cat, count, pinned: false });
    }
    if (canAddTag) {
      for (const [tag, count] of tagCount.entries()) {
        if (!activeTags.has(tag.toLowerCase()))
          all.push({ type: 'tag', value: tag, label: tag, count, pinned: false });
      }
    }
    // Villes fixées en tête, puis tri par fréquence décroissante
    return all
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.count - a.count)
      .slice(0, 12);
  }

  /** Active un filtre suggéré et relance le chargement. */
  applySuggestion(type: string, value: string) {
    if (type === 'city') {
      this.adresse = value;
    } else if (type === 'category') {
      this.categorie = value as EventCategory;
    } else if (type === 'tag') {
      const current = this.caracteristiquesFilter;
      if (!current.includes(value as EventTag) && current.length < 3)
        this.caracteristiquesFilter = [...current, value as EventTag];
    }
    this.syncUrl();
    void this.reload();
  }

  /** Retire un filtre correspondant à une chip, puis relance un reload (sauf chip date). */
  clearChip(key: string) {
    if (key === 'date') return;
    if (key === 'adresse') this.adresse = '';
    if (key === 'categorie') this.categorie = '';
    if (key === 'q') this.q = '';
    if (key === 'caracteristiques') this.caracteristiquesFilter = [];
    if (key === 'dateDebut') this.dateDebutFilter = '';
    if (key === 'dateFin') this.dateFinFilter = '';
    if (key === 'favoris') this.favoris = false;
    if (key === 'includePending') this.includePending = false;
    this.syncUrl();
    void this.reload();
  }

  /** Change la vue (semaine/journée) et recharge les événements correspondant à la période. */
  setViewMode(mode: 'week' | 'day') {
    this.viewMode = mode;
    // Switching view mode changes the DOM structure and header sizes.
    // Schedule recompute after the DOM has updated.
    this.scheduleRecomputeSlotPx('viewMode');
    this.scheduleAttachSwipeNav();
    this.syncUrl();
    void this.reload();
  }

  private scheduleAttachSwipeNav() {
    if (typeof window === 'undefined') return;
    window.setTimeout(() => {
      this.attachSwipeNav();
    }, 0);
  }

  private attachSwipeNav() {
    if (typeof window === 'undefined') return;

    const host = this.schedScroll?.nativeElement ?? (this.el.nativeElement as HTMLElement).querySelector('.schedScroll');
    if (!(host instanceof HTMLElement)) return;
    if (this.swipeHost === host) return;

    this.detachSwipeNav();
    this.swipeHost = host;

    host.addEventListener('touchstart', this.onSwipeTouchStart, { passive: true });
    host.addEventListener('touchend', this.onSwipeTouchEnd, { passive: true });
    host.addEventListener('touchcancel', this.onSwipeTouchEnd, { passive: true });
  }

  private detachSwipeNav() {
    if (!this.swipeHost) return;
    this.swipeHost.removeEventListener('touchstart', this.onSwipeTouchStart);
    this.swipeHost.removeEventListener('touchend', this.onSwipeTouchEnd);
    this.swipeHost.removeEventListener('touchcancel', this.onSwipeTouchEnd);
    this.swipeHost = undefined;
  }

  /** Navigation vers la période précédente (semaine -7 jours / journée -1 jour). */
  prevPeriod() {
    const d = this.selectedDateObj();
    const delta = this.viewMode === 'week' ? -7 : -1;
    d.setDate(d.getDate() + delta);
    this.selectedDate = this.localKeyFromDate(d);
    this.syncUrl();
    void this.reload();
  }

  /** Navigation vers la période suivante (semaine +7 jours / journée +1 jour). */
  nextPeriod() {
    const d = this.selectedDateObj();
    const delta = this.viewMode === 'week' ? 7 : 1;
    d.setDate(d.getDate() + delta);
    this.selectedDate = this.localKeyFromDate(d);
    this.syncUrl();
    void this.reload();
  }

  /** Handler du date picker: planifie le recalcul du layout puis recharge les événements. */
  onDateChange() {
    // Changing date often changes labels (and can wrap), impacting measured heights.
    this.scheduleRecomputeSlotPx('dateChange');
    this.syncUrl();
    void this.reload();
  }

  /** Ouvre le drawer latéral pour un jour donné (liste des événements du jour). */
  openSideForDay(dayKey: string) {
    this.selectedDate = dayKey;
    this.sideDayKey.set(dayKey);
    this.sideTab.set('day');
    this.sideSelectedEventIds.set(null);
    this.sideOpen.set(true);
  }

  /** Ouvre le drawer latéral pour un événement (affiche uniquement cet événement). */
  openSideForEvent(dayKey: string, eventId: string) {
    this.selectedDate = dayKey;
    this.sideDayKey.set(dayKey);
    this.sideTab.set('day');
    this.sideSelectedEventIds.set([eventId]);
    this.sideOpen.set(true);
  }

  /** Ouvre le drawer latéral pour un regroupement d'événements (affiche tout le groupe). */
  openSideForGroup(dayKey: string, eventIds: string[]) {
    this.selectedDate = dayKey;
    this.sideDayKey.set(dayKey);
    this.sideTab.set('day');
    this.sideSelectedEventIds.set(eventIds);
    this.sideOpen.set(true);
  }

  /** Ouvre le drawer latéral sur l'onglet « nuit » pour un jour donné. */
  openSideNightForDay(dayKey: string) {
    this.selectedDate = dayKey;
    this.sideDayKey.set(dayKey);
    this.sideTab.set('night');
    this.sideSelectedEventIds.set(null);
    this.sideOpen.set(true);
  }

  /** Ferme le drawer latéral. */
  closeSide() {
    this.sideOpen.set(false);
    this.sideSelectedEventIds.set(null);
  }

  /** Nombre total de minutes affichées dans la grille (fenêtre 06:00 -> 23:59). */
  private windowMinutes() {
    // inclusive: 6:00 -> 23:59 (so start times 23:xx remain visible)
    return (this.endHour - this.startHour + 1) * 60;
  }

  /**
   * Calcule `slotPx` à partir des hauteurs mesurées dans le DOM.
   *
   * Retourne false si le scheduler n'est pas encore rendu (hauteur 0), pour permettre
   * un retry sur la frame suivante.
   */
  private recomputeSlotPx(ctx?: { reason?: string; attempt?: number }) {
    if (!this.autoFitSlotPx) {
      return true;
    }

    const totalMinutes = this.windowMinutes();
    const slots = Math.floor(totalMinutes / this.minutesPerSlot);

    const schedulerEl = this.el.nativeElement.querySelector('.scheduler');
    const schedulerHeight = schedulerEl?.clientHeight ?? 0;
    if (!schedulerEl || schedulerHeight <= 0) {
      this.dbg('recomputeSlotPx skipped (scheduler not ready)', {
        reason: ctx?.reason,
        attempt: ctx?.attempt,
        schedulerHeight,
      });
      return false;
    }

    const heads = Array.from(schedulerEl?.querySelectorAll('.dayHead') ?? []) as HTMLElement[];
    const headH = Math.max(40, ...heads.map((h) => h.clientHeight));
    const spacers = Array.from(schedulerEl?.querySelectorAll('.nightSpacer') ?? []) as HTMLElement[];
    const spacerH = Math.max(32, ...spacers.map((s) => s.clientHeight));
    const nights = Array.from(schedulerEl?.querySelectorAll('.nightBtn') ?? []) as HTMLElement[];
    const nightH = Math.max(32, ...nights.map((n) => n.clientHeight));

    const available = Math.max(0, schedulerHeight - headH - spacerH - nightH);
    const px = Math.floor(available / slots);
    // Fit-first: never force a minimum that would make the timeline overflow.
    const fitted = Math.min(42, Math.max(6, px));

    const prev = this.slotPx();
    this.slotPx.set(fitted);

    this.dbg('recomputeSlotPx', {
      reason: ctx?.reason,
      attempt: ctx?.attempt,
      schedulerHeight,
      headH,
      spacerH,
      nightH,
      available,
      slots,
      px,
      fitted,
      prev,
    });
    return true;
  }

  /**
   * Attache un `ResizeObserver` sur l'élément le plus sensible au layout.
   * On observe `.schedGrid` (plutôt que seulement `.scheduler`) car le wrapping
   * des headers peut changer la hauteur du grid sans forcément toucher le container.
   */
  private ensureSchedulerObserved() {
    if (!this.autoFitSlotPx) {
      return;
    }

    const schedulerEl = this.el.nativeElement.querySelector('.scheduler') as Element | null;
    if (!schedulerEl || typeof ResizeObserver === 'undefined') {
      return;
    }

    const gridEl = (schedulerEl.querySelector('.schedGrid') as Element | null) ?? schedulerEl;
    if (this.observedScheduler === gridEl) {
      return;
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.scheduleRecomputeSlotPx('resizeObserver'));
    this.resizeObserver.observe(gridEl);
    this.observedScheduler = gridEl;
  }

  /**
   * Recalcule `slotPx` après stabilisation du layout.
   *
   * Pourquoi: lors de navigation/reload/changement de vue, le DOM peut exister mais
   * ne pas avoir sa taille finale. On planifie via `requestAnimationFrame` (parfois double-rAF)
   * et on retente quelques frames jusqu'à obtenir une hauteur non nulle.
   */
  private scheduleRecomputeSlotPx(reason: string) {
    if (!this.autoFitSlotPx) {
      return;
    }

    const maxAttempts = 6;
    let attempts = 0;

    const requiresDoubleRaf = reason === 'reload' || reason === 'navigation' || reason === 'viewMode';

    const tick = () => {
      attempts++;
      const ok = this.recomputeSlotPx({ reason, attempt: attempts });
      this.ensureSchedulerObserved();
      if (!ok && attempts < maxAttempts && typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(tick);
      }
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      if (requiresDoubleRaf) {
        requestAnimationFrame(() => requestAnimationFrame(tick));
      } else {
        requestAnimationFrame(tick);
      }
    } else {
      const tickTimeout = () => {
        attempts++;
        const ok = this.recomputeSlotPx({ reason, attempt: attempts });
        this.ensureSchedulerObserved();
        if (!ok && attempts < maxAttempts) {
          setTimeout(tickTimeout, 16);
        }
      };
      setTimeout(tickTimeout, 0);
    }
  }

  /** Calcule le delta en minutes entre le début de la fenêtre (06:00) et un datetime. */
  private minutesFromWindowStart(dayKey: string, iso: string) {
    const start = new Date(`${dayKey}T${String(this.startHour).padStart(2, '0')}:00:00`);
    const d = new Date(iso);
    return Math.floor((d.getTime() - start.getTime()) / 60000);
  }

  /**
   * Calcule le layout (top/height/colonnes) des blocs d'événements pour un jour.
   * Gère le clipping sur la fenêtre, le regroupement des overlaps, et le bloc "n événements".
   */
  private computeLayoutForDay(dayKey: string, items: EventDto[]): Array<LayoutItem> {
    const total = this.windowMinutes();
    const normalized = items
      .map((e) => {
        const s = this.minutesFromWindowStart(dayKey, e.dateDebut);
        let end = e.dateFin ? this.minutesFromWindowStart(dayKey, e.dateFin) : total;
        if (end < s) end = s + 30;

        // Display events that overlap the window (clipped), excluding pure nocturne events.
        if (this.isNocturne(e)) {
          return null;
        }

        if (end <= 0 || s >= total) {
          return null;
        }

        const startClamped = Math.max(0, Math.min(total, s));
        const endClamped = Math.max(0, Math.min(total, end));
        return { e, s: startClamped, end: Math.max(startClamped + 10, endClamped) };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.s - b.s || a.end - b.end || a.e.titre.localeCompare(b.e.titre));

    const groups: Array<Array<(typeof normalized)[number]>> = [];
    let current: Array<(typeof normalized)[number]> = [];
    let currentEnd = -1;
    for (const it of normalized) {
      if (current.length === 0) {
        current = [it];
        currentEnd = it.end;
        continue;
      }
      if (it.s < currentEnd) {
        current.push(it);
        currentEnd = Math.max(currentEnd, it.end);
      } else {
        groups.push(current);
        current = [it];
        currentEnd = it.end;
      }
    }
    if (current.length) groups.push(current);

    const pxPerMinute = this.slotPx() / this.minutesPerSlot;
    const out: LayoutItem[] = [];

    for (const g of groups) {
      if (g.length >= 4) {
        const top = Math.min(...g.map((x) => x.s));
        const bottom = Math.max(...g.map((x) => x.end));
        out.push({
          kind: 'merged',
          count: g.length,
          eventIds: g.map((x) => x.e.id),
          topPx: top * pxPerMinute,
          heightPx: Math.max(18, (bottom - top) * pxPerMinute),
        });
        continue;
      }

      const colEnds = [-1, -1, -1];
      const placed: Array<{ it: (typeof g)[number]; col: number }> = [];
      for (const it of g) {
        let col = 0;
        while (col < 3 && it.s < colEnds[col]) col++;
        if (col >= 3) col = 2;
        colEnds[col] = it.end;
        placed.push({ it, col });
      }
      const usedCols = Math.max(...placed.map((p) => p.col)) + 1;

      for (const p of placed) {
        const topPx = p.it.s * pxPerMinute;
        const heightPx = Math.max(18, (p.it.end - p.it.s) * pxPerMinute);
        out.push({
          kind: 'event',
          event: p.it.e,
          topPx,
          heightPx,
          leftPct: (p.col / usedCols) * 100,
          widthPct: (1 / usedCols) * 100,
        });
      }
    }

    return out;
  }

  /** Applique les filtres (ferme la modale) puis recharge les événements. */
  applyFilters() {
    this.showFilters = false;
    this.syncUrl();
    void this.reload();
  }

  /** Helper: retourne la clé locale `YYYY-MM-DD` d'une Date. */
  dateKey(d: Date) {
    return this.localKeyFromDate(d);
  }

  /** Helper: convertit une clé `YYYY-MM-DD` en Date locale à minuit. */
  dayKeyToDate(key: string) {
    return new Date(`${key}T00:00:00`);
  }

  /** Indique si la Date passée correspond à la date sélectionnée. */
  isSelectedDay(d: Date) {
    return this.dateKey(d) === this.selectedDate;
  }

  /** Indique si la Date passée correspond à aujourd'hui (pour la surbrillance fixe). */
  isTodayDay(d: Date) {
    return this.dateKey(d) === this.todayLocalKey();
  }

  /** Ouvre la modale de proposition d'événement. */
  async openPropose() {
    if (!this.auth.isLoggedIn()) {
      this.proposeGateMessage = this.i18n.t('calendar.proposeLoginMessage');
      this.proposeGateKind = 'login_required';
      this.proposeGateOpen = true;
      return;
    }

    await this.auth.ensureLoaded();

    this.showPropose = true;

    if (!this.newContact.trim()) {
      const u = this.auth.user();
      const email = (u?.email ?? '').trim();
      const phone = (u?.numero ?? '').trim() || this.i18n.t('common.notMentioned');
      if (email) {
        this.newContact = `email : ${email} Téléphone : ${phone}`;
      }
    }
  }

  /** Ferme la modale de proposition d'événement. */
  closePropose() {
    this.showPropose = false;
  }

  closeProposeGate() {
    this.proposeGateOpen = false;
  }

  /** Soumet un événement proposé via l'API puis réinitialise le formulaire et recharge. */
  async submitPropose() {
    const rawEnd = (this.newDateFin ?? '').trim();
    const rawContact = (this.newContact ?? '').trim();
    const payload: any = {
      titre: this.newTitre,
      description: this.newDescription,
      categorie: this.newCategorie,
      ville: (this.newVille || this.newAdresse || this.i18n.t('common.notProvided')).trim(),
      adresse: this.newAdresse,
      latitude: this.newLatitude,
      longitude: this.newLongitude,
      caracteristiques: this.newCaracteristiques.slice(0, 3),
      imageUrl: this.newImageUrl ? this.newImageUrl : undefined,
      dateDebut: new Date(this.newDateDebut).toISOString(),
      dateFin: rawEnd ? new Date(rawEnd).toISOString() : null,
      honeypot: this.newHoneypot,
    };

    // Only send contact if the user typed something.
    // If omitted, backend will generate default (email + téléphone) automatically.
    if (rawContact) payload.contact = rawContact;

    await this.eventsService.create(payload).toPromise();

    this.newTitre = '';
    this.newDescription = '';
    this.newCategorie = 'Concert';
    this.newVille = '';
    this.newAdresse = '';
    this.newLatitude = null;
    this.newLongitude = null;
    this.newAdresseSuggestions.set([]);
    this.newAdresseSuggestOpen.set(false);
    this.newCaracteristiques = [];
    this.newImageUrl = '';
    this.newContact = '';
    this.newDateDebut = '';
    this.newDateFin = '';
    this.newHoneypot = '';

    this.closePropose();
    await this.reload();
  }

  isNewTagSelected(tag: EventTag) {
    return this.newCaracteristiques.includes(tag);
  }

  toggleNewTag(tag: EventTag) {
    const current = this.newCaracteristiques;
    if (current.includes(tag)) {
      this.newCaracteristiques = current.filter((t) => t !== tag);
      return;
    }
    if (current.length >= 3) return;
    this.newCaracteristiques = [...current, tag];
  }

  displayTitle(e: EventDto) {
    const t = (e.titre ?? '').trim();
    return t ? t : 'Sans titre';
  }
}

type LayoutItem =
  | { kind: 'event'; event: EventDto; topPx: number; heightPx: number; leftPct: number; widthPct: number }
  | { kind: 'merged'; count: number; eventIds: string[]; topPx: number; heightPx: number };
