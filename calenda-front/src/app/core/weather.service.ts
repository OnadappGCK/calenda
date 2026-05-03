import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type WeatherDay = {
  date: string;
  code: number;
  tMax: number;
  tMin: number;
};

const KNOWN_CITIES: Record<string, { lat: number; lon: number; label: string }> = {
  sausset:   { lat: 43.3295, lon: 5.1057, label: 'Sausset-les-Pins' },
  carry:     { lat: 43.3277, lon: 5.1506, label: 'Carry-le-Rouet'  },
  martigues: { lat: 43.4068, lon: 5.0498, label: 'Martigues'        },
};

const DEFAULT_CITY_KEY = 'sausset';

/** Convertit un code météo WMO en emoji. */
export function weatherCodeToEmoji(code: number | null | undefined): string {
  if (code == null) return '—';
  if (code === 0)                      return '☀️';
  if (code === 1)                      return '🌤️';
  if (code === 2)                      return '⛅';
  if (code === 3)                      return '☁️';
  if (code === 45 || code === 48)      return '🌫️';
  if (code >= 51 && code <= 57)        return '🌦️';
  if (code >= 61 && code <= 65)        return '🌧️';
  if (code >= 66 && code <= 67)        return '🌨️';
  if (code >= 71 && code <= 77)        return '❄️';
  if (code >= 80 && code <= 82)        return '🌦️';
  if (code >= 85 && code <= 86)        return '🌨️';
  if (code >= 95 && code <= 99)        return '⛈️';
  return '—';
}

@Injectable({ providedIn: 'root' })
export class WeatherService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, { data: WeatherDay[]; ts: number }>();
  private readonly TTL_MS = 3_600_000;

  /** Résout la ville météo depuis le filtre adresse actif (ou Sausset par défaut). */
  resolveCity(adresse: string): { key: string; lat: number; lon: number; label: string } {
    const a = (adresse ?? '').toLowerCase();
    for (const [key, info] of Object.entries(KNOWN_CITIES)) {
      if (a.includes(key)) return { key, ...info };
    }
    return { key: DEFAULT_CITY_KEY, ...KNOWN_CITIES[DEFAULT_CITY_KEY] };
  }

  /** Récupère les prévisions sur 14 jours (utilise le cache 1h). */
  async getWeeklyWeather(lat: number, lon: number, cityKey: string): Promise<WeatherDay[]> {
    const cached = this.cache.get(cityKey);
    if (cached && Date.now() - cached.ts < this.TTL_MS) return cached.data;
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${lat}&longitude=${lon}` +
        `&daily=weathercode,temperature_2m_max,temperature_2m_min` +
        `&timezone=Europe%2FParis&forecast_days=14`;
      const res = await firstValueFrom(this.http.get<any>(url));
      const data: WeatherDay[] = (res.daily?.time ?? []).map((date: string, i: number) => ({
        date,
        code:  res.daily.weathercode[i]        ?? null,
        tMax:  Math.round(res.daily.temperature_2m_max[i] ?? 0),
        tMin:  Math.round(res.daily.temperature_2m_min[i] ?? 0),
      }));
      this.cache.set(cityKey, { data, ts: Date.now() });
      return data;
    } catch {
      return this.cache.get(cityKey)?.data ?? [];
    }
  }
}
