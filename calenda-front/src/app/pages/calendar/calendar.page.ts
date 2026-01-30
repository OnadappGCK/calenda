import { Component, DestroyRef, ElementRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { EventsService, EventCategory, EventDto } from '../../core/events.service';
import { categoryColor, categoryIcon } from '../../core/event-ui';
import { FavoritesService } from '../../core/favorites.service';

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
export class CalendarPage implements OnInit, OnDestroy {
  private readonly eventsService = inject(EventsService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly el = inject(ElementRef);

  private resizeObserver?: ResizeObserver;
  private observedScheduler?: Element;

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
  ville = '';
  lieu = '';
  categorie: EventCategory | '' = '';
  favoris = false;

  dateDebutFilter = '';
  dateFinFilter = '';

  showFilters = false;

  readonly sideOpen = signal<boolean>(false);
  readonly sideDayKey = signal<string>(this.selectedDate);
  readonly sideTab = signal<'day' | 'night'>('day');

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

  readonly canPropose = computed(() => {
    const role = this.auth.user()?.role;
    return role === 'ADMIN' || role === 'ORGANISATEUR';
  });

  /** Convertit un ISO datetime en minutes depuis minuit (heure locale). */
  private minutesOfDay(iso: string) {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  }

  /** Détermine si un événement est « nocturne » (00:00-05:59, fin avant 06:00, même jour). */
  private isNocturne(e: EventDto) {
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
      const key = this.localKeyFromIso(e.dateDebut);
      if (!this.isNocturne(e)) continue;
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
  newLieu = '';
  newDateDebut = '';
  newDateFin = '';

  protected readonly categoryColor = categoryColor;
  protected readonly categoryIcon = categoryIcon;

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

  readonly weekLabel = computed(() => {
    const start = this.weekStart();
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `Semaine du ${start.toLocaleDateString()} au ${end.toLocaleDateString()}`;
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
    const formatted = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    return `Semaine du ${formatted}`;
  }

  /**
   * Liste les jours (clés `YYYY-MM-DD`) à partir de la date sélectionnée et sur N semaines à venir.
   * Sert de base à l'affichage "Événements à venir".
   */
  readonly upcomingRangeDays = computed(() => {
    /** Démarre la liste au plus tôt à aujourd'hui (si on navigue dans le passé). */
    const startKey = this.selectedDate < this.todayLocalKey() ? this.todayLocalKey() : this.selectedDate;
    /** Base de calcul: lundi de la semaine contenant le point de départ (souvent aujourd'hui). */
    const startWeekKey = this.weekStartKeyFromDayKey(startKey);
    const startWeek = this.dayKeyToDate(startWeekKey);

    const end = new Date(startWeek);
    end.setDate(startWeek.getDate() + this.upcomingWeeksAhead * 7 - 1);
    end.setHours(0, 0, 0, 0);
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

  /**
   * Groupes d'événements à venir, structurés par semaine (lundi) puis par jour.
   * N'affiche que les jours qui contiennent au moins un événement.
   */
  readonly upcomingWeeks = computed(() => {
    const map = this.eventsByDay();
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

    for (const dayKey of this.upcomingRangeDays()) {
      const items = map.get(dayKey) ?? [];
      if (items.length === 0) continue;

      const weekStartKey = this.weekStartKeyFromDayKey(dayKey);
      const isCurrentWeek = weekStartKey === currentWeekStartKey;

      const label = isCurrentWeek
        ? 'Semaine en cours'
        : this.formatWeekLabelFromStartKey(weekStartKey);

      const w = weeks.get(weekStartKey) ?? { weekStartKey, label, days: [] };
      w.days.push({ dayKey, items });
      weeks.set(weekStartKey, w);
    }

    return Array.from(weeks.values()).sort((a, b) => a.weekStartKey.localeCompare(b.weekStartKey));
  });

  readonly sideEvents = computed(() => {
    const k = this.sideDayKey();
    return this.eventsByDay().get(k) ?? [];
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
    await this.reload();
  }

  /** Hook Angular: nettoyage des listeners + observers. */
  ngOnDestroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onResize);
    }
    this.resizeObserver?.disconnect();
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
      if (this.ville) params['ville'] = this.ville;
      if (this.lieu) params['lieu'] = this.lieu;
      if (this.categorie) params['categorie'] = this.categorie as string;
      if (this.favoris) params['favoris'] = 'true';

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
      }
    } finally {
      if (token === this.reloadToken) {
        this.loading.set(false);
        this.dbg('reload end', { token, events: this.events().length });
        // After reload, DOM changes (headers/night buttons) can impact available height.
        // Recompute slotPx after render (rAF + double-rAF) to avoid relying on a manual resize.
        this.scheduleRecomputeSlotPx('reload');
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
    const endSelected = new Date(start);
    endSelected.setDate(start.getDate() + this.upcomingWeeksAhead * 7 - 1);
    endSelected.setHours(23, 59, 59, 999);

    /** Garantit que la plage inclut au minimum les semaines à venir à partir d'aujourd'hui. */
    const todayWeekStartKey = this.weekStartKeyFromDayKey(this.todayLocalKey());
    const todayWeekStart = this.dayKeyToDate(todayWeekStartKey);
    const endToday = new Date(todayWeekStart);
    endToday.setDate(todayWeekStart.getDate() + this.upcomingWeeksAhead * 7 - 1);
    endToday.setHours(23, 59, 59, 999);

    const end = endSelected > endToday ? endSelected : endToday;
    return { from: start.toISOString(), to: end.toISOString() };
  }

  /** Réinitialise les filtres puis relance un reload. */
  reset() {
    this.q = '';
    this.ville = '';
    this.lieu = '';
    this.categorie = '';
    this.favoris = false;
    this.dateDebutFilter = '';
    this.dateFinFilter = '';
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

  /** Construit la liste de chips (tags) affichés pour représenter les filtres actifs. */
  activeChips() {
    const chips: Array<{ key: string; label: string }> = [];
    chips.push({ key: 'date', label: this.viewMode === 'week' ? 'Semaine' : 'Journée' });
    if (this.ville) chips.push({ key: 'ville', label: this.ville });
    if (this.lieu) chips.push({ key: 'lieu', label: this.lieu });
    if (this.categorie) chips.push({ key: 'categorie', label: this.categorie });
    if (this.q) chips.push({ key: 'q', label: this.q });
    if (this.dateDebutFilter) chips.push({ key: 'dateDebut', label: `Du ${this.dateDebutFilter}` });
    if (this.dateFinFilter) chips.push({ key: 'dateFin', label: `Au ${this.dateFinFilter}` });
    if (this.favoris) chips.push({ key: 'favoris', label: 'Favoris' });
    return chips;
  }

  /** Retire un filtre correspondant à une chip, puis relance un reload (sauf chip date). */
  clearChip(key: string) {
    if (key === 'date') return;
    if (key === 'ville') this.ville = '';
    if (key === 'lieu') this.lieu = '';
    if (key === 'categorie') this.categorie = '';
    if (key === 'q') this.q = '';
    if (key === 'dateDebut') this.dateDebutFilter = '';
    if (key === 'dateFin') this.dateFinFilter = '';
    if (key === 'favoris') this.favoris = false;
    void this.reload();
  }

  /** Change la vue (semaine/journée) et recharge les événements correspondant à la période. */
  setViewMode(mode: 'week' | 'day') {
    this.viewMode = mode;
    // Switching view mode changes the DOM structure and header sizes.
    // Schedule recompute after the DOM has updated.
    this.scheduleRecomputeSlotPx('viewMode');
    void this.reload();
  }

  /** Navigation vers la période précédente (semaine -7 jours / journée -1 jour). */
  prevPeriod() {
    const d = this.selectedDateObj();
    const delta = this.viewMode === 'week' ? -7 : -1;
    d.setDate(d.getDate() + delta);
    this.selectedDate = this.localKeyFromDate(d);
    void this.reload();
  }

  /** Navigation vers la période suivante (semaine +7 jours / journée +1 jour). */
  nextPeriod() {
    const d = this.selectedDateObj();
    const delta = this.viewMode === 'week' ? 7 : 1;
    d.setDate(d.getDate() + delta);
    this.selectedDate = this.localKeyFromDate(d);
    void this.reload();
  }

  /** Handler du date picker: planifie le recalcul du layout puis recharge les événements. */
  onDateChange() {
    // Changing date often changes labels (and can wrap), impacting measured heights.
    this.scheduleRecomputeSlotPx('dateChange');
    void this.reload();
  }

  /** Ouvre le drawer latéral pour un jour donné (liste des événements du jour). */
  openSideForDay(dayKey: string) {
    this.selectedDate = dayKey;
    this.sideDayKey.set(dayKey);
    this.sideTab.set('day');
    this.sideOpen.set(true);
  }

  /** Ouvre le drawer latéral sur l'onglet « nuit » pour un jour donné. */
  openSideNightForDay(dayKey: string) {
    this.selectedDate = dayKey;
    this.sideDayKey.set(dayKey);
    this.sideTab.set('night');
    this.sideOpen.set(true);
  }

  /** Ferme le drawer latéral. */
  closeSide() {
    this.sideOpen.set(false);
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
    const headH = Math.max(48, ...heads.map((h) => h.clientHeight));
    const spacers = Array.from(schedulerEl?.querySelectorAll('.nightSpacer') ?? []) as HTMLElement[];
    const spacerH = Math.max(48, ...spacers.map((s) => s.clientHeight));
    const nights = Array.from(schedulerEl?.querySelectorAll('.nightBtn') ?? []) as HTMLElement[];
    const nightH = Math.max(48, ...nights.map((n) => n.clientHeight));

    const available = Math.max(0, schedulerHeight - headH - spacerH - nightH);
    const px = Math.floor(available / slots);
    // Fit-first: never force a minimum that would make the timeline overflow.
    const fitted = Math.min(30, Math.max(6, px));

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
        let end = this.minutesFromWindowStart(dayKey, e.dateFin);
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

  /** Ouvre la modale de proposition d'événement. */
  openPropose() {
    this.showPropose = true;
  }

  /** Ferme la modale de proposition d'événement. */
  closePropose() {
    this.showPropose = false;
  }

  /** Soumet un événement proposé via l'API puis réinitialise le formulaire et recharge. */
  async submitPropose() {
    const payload = {
      titre: this.newTitre,
      description: this.newDescription,
      categorie: this.newCategorie,
      ville: this.newVille,
      lieu: this.newLieu,
      dateDebut: new Date(this.newDateDebut).toISOString(),
      dateFin: new Date(this.newDateFin).toISOString(),
    };

    await this.eventsService.create(payload).toPromise();

    this.newTitre = '';
    this.newDescription = '';
    this.newCategorie = 'Concert';
    this.newVille = '';
    this.newLieu = '';
    this.newDateDebut = '';
    this.newDateFin = '';

    this.closePropose();
    await this.reload();
  }
}

type LayoutItem =
  | { kind: 'event'; event: EventDto; topPx: number; heightPx: number; leftPct: number; widthPct: number }
  | { kind: 'merged'; count: number; topPx: number; heightPx: number };
