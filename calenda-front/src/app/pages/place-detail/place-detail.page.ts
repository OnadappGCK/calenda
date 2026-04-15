import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { API_BASE_URL } from '../../core/api.config';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n.service';
import { PlacesService, PlaceDto } from '../../core/places.service';

const TYPE_LABELS: Record<string, string> = {
  RESTAURANT: 'Restaurant',
  SORTIE: 'Sortie',
  BAR: 'Bar',
  ACTIVITE: 'Activité',
};
const TYPE_ICONS: Record<string, string> = {
  RESTAURANT: '🍽️',
  SORTIE: '🎭',
  BAR: '🍸',
  ACTIVITE: '🏃',
};

@Component({
  selector: 'app-place-detail-page',
  imports: [],
  templateUrl: './place-detail.page.html',
  styleUrl: './place-detail.page.scss',
})
export class PlaceDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly svc = inject(PlacesService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly apiBase = inject(API_BASE_URL);
  private readonly apiHost = this.apiBase.replace(/\/api\/?$/, '');
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  readonly place = signal<PlaceDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly typeLabel = computed(() => TYPE_LABELS[this.place()?.type ?? ''] ?? '');
  readonly typeIcon = computed(() => TYPE_ICONS[this.place()?.type ?? ''] ?? '');

  readonly mapUrl = computed((): SafeResourceUrl | null => {
    const p = this.place();
    if (!p) return null;
    if (p.latitude && p.longitude) {
      const lat = p.latitude;
      const lon = p.longitude;
      const delta = 0.005;
      const url = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - delta},${lat - delta},${lon + delta},${lat + delta}&layer=mapnik&marker=${lat},${lon}`;
      return this.sanitizer.bypassSecurityTrustResourceUrl(url);
    }
    return null;
  });

  readonly googleMapsUrl = computed((): string | null => {
    const p = this.place();
    if (!p) return null;
    if (p.latitude && p.longitude) {
      return `https://www.google.com/maps?q=${p.latitude},${p.longitude}`;
    }
    if (p.adresse) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.adresse + (p.ville ? ', ' + p.ville : ''))}`;
    }
    return null;
  });

  placeImageUrl(p: PlaceDto): string | null {
    const raw = (p.imageUrl ?? '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/')) return `${this.apiHost}${raw}`;
    return `${this.apiHost}/${raw}`;
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.error.set('ID manquant'); this.loading.set(false); return; }
    try {
      const p = await this.svc.getOne(id).toPromise();
      this.place.set(p ?? null);
    } catch {
      this.error.set('Établissement introuvable');
    } finally {
      this.loading.set(false);
    }
  }
}
