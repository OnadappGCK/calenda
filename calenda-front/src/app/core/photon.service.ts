import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';

export type PhotonFeature = {
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    state?: string;
    country?: string;
  };
};

@Injectable({ providedIn: 'root' })
export class PhotonService {
  private readonly http = inject(HttpClient);

  search(q: string, params?: { limit?: number }) {
    const qq = (q ?? '').trim();
    if (!qq) {
      return this.http.get<{ features: PhotonFeature[] }>('https://photon.komoot.io/api/', {
        params: { q: ' ', limit: String(params?.limit ?? 1), lang: 'fr' },
      }).pipe(map(() => [] as PhotonFeature[]));
    }

    return this.http
      .get<{ features: PhotonFeature[] }>('https://photon.komoot.io/api/', {
        params: {
          q: qq,
          limit: String(params?.limit ?? 6),
          lang: 'fr',
        },
      })
      .pipe(map((r) => r?.features ?? []));
  }

  label(f: PhotonFeature) {
    const p = f?.properties ?? {};
    const name = (p.name ?? '').trim();
    const street = `${(p.housenumber ?? '').trim()} ${(p.street ?? '').trim()}`.trim();
    const city = `${(p.postcode ?? '').trim()} ${(p.city ?? '').trim()}`.trim();
    const country = (p.country ?? '').trim();

    return [name, street, city, country].filter((x) => (x ?? '').trim()).join(', ');
  }

  coords(f: PhotonFeature) {
    const c = f?.geometry?.coordinates;
    if (!c || c.length !== 2) return null;
    const [lon, lat] = c;
    if (typeof lat !== 'number' || typeof lon !== 'number') return null;
    return { lat, lon };
  }

  city(f: PhotonFeature) {
    return (f?.properties?.city ?? '').trim();
  }
}
