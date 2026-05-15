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

/**
 * Calcule la phase lunaire pour une date donnée (clé YYYY-MM-DD) et retourne l'emoji correspondant.
 * Algorithme purement mathématique : aucune API requise.
 * Référence lunaison : 6 jan 2000 18:14 UTC (nouvelle lune connue).
 * Cycle synodique : 29.53058867 jours.
 */
const SYNODIC = 29.53058867;
const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14, 0);

function lunarPhase(dateKey: string): number {
  const elapsed = (new Date(`${dateKey}T12:00:00Z`).getTime() - REF_NEW_MOON) / 86_400_000;
  return ((elapsed % SYNODIC) + SYNODIC) % SYNODIC;
}

/**
 * Retourne l'emoji de phase lunaire avec des seuils serrés :
 * - Nouvelle lune / pleine lune : ±1 jour
 * - Premier / dernier quartier  : ±1.5 jours
 * - Croissants et gibbeux entre les jalons
 */
export function moonPhaseEmoji(dateKey: string): string {
  const p   = lunarPhase(dateKey);
  const Q1  = SYNODIC * 0.25;  // ~7.38 j
  const FM  = SYNODIC * 0.5;   // ~14.77 j
  const Q3  = SYNODIC * 0.75;  // ~22.15 j
  if (p < 1.0 || p >= SYNODIC - 1.0)          return '🌑'; // nouvelle lune
  if (Math.abs(p - FM) < 1.0)                   return '�'; // pleine lune  (±1 j → max 2 jours)
  if (Math.abs(p - Q1) < 1.5)                   return '🌓'; // 1er quartier
  if (Math.abs(p - Q3) < 1.5)                   return '�'; // dernier quartier
  if (p < Q1)  return '�'; // croissant montant
  if (p < FM)  return '�'; // gibbeuse montante
  if (p < Q3)  return '�'; // gibbeuse descendante
  return '🌘';               // croissant descendant
}

/**
 * Retourne true si ce jour est le jour calendaire le plus proche de la pleine lune
 * (la phase à midi UTC est à moins de 0.5 j du pic, soit ~12 h de chaque côté).
 */
export function isFullMoonPeak(dateKey: string): boolean {
  const p    = lunarPhase(dateKey);
  const diff = Math.abs(p - SYNODIC * 0.5);
  return diff < 0.5;
}

/** SVG géométrique pur (cercles + arcs) — aucune dépendance de police, fonctionne partout. */
export function moonPhaseIconUrl(dateKey: string): string {
  const p   = lunarPhase(dateKey);
  const idx = Math.floor((p / SYNODIC) * 8) % 8;
  const lit = '#FFD700', dark = '#1a2a4a';
  const R = 10, C = 12, rx = 5;
  const base = `<circle cx="${C}" cy="${C}" r="${R}" fill="${dark}" stroke="#4a6080" stroke-width="0.5"/>`;
  const crescentRightLit = `<path d="M${C},${C-R} A${R},${R},0,0,1,${C},${C+R} A${rx},${R},0,0,1,${C},${C-R}Z" fill="${lit}"/>`;
  const crescentLeftLit = `<path d="M${C},${C-R} A${R},${R},0,0,0,${C},${C+R} A${rx},${R},0,0,0,${C},${C-R}Z" fill="${lit}"/>`;
  const quarterRightLit = `<path d="M${C},${C-R} A${R},${R},0,0,1,${C},${C+R} L${C},${C-R}Z" fill="${lit}"/>`;
  const quarterLeftLit = `<path d="M${C},${C-R} A${R},${R},0,0,0,${C},${C+R} L${C},${C-R}Z" fill="${lit}"/>`;
  const fullLit = `<circle cx="${C}" cy="${C}" r="${R}" fill="${lit}"/>`;

  const crescentLeftDark = `<path d="M${C},${C-R} A${R},${R},0,0,0,${C},${C+R} A${rx},${R},0,0,0,${C},${C-R}Z" fill="${dark}"/>`;
  const crescentRightDark = `<path d="M${C},${C-R} A${R},${R},0,0,1,${C},${C+R} A${rx},${R},0,0,1,${C},${C-R}Z" fill="${dark}"/>`;

  const shapes: Record<number, string> = {
    0: '',
    1: crescentRightLit,
    2: quarterRightLit,
    3: `${fullLit}${crescentLeftDark}`,
    4: fullLit,
    5: `${fullLit}${crescentRightDark}`,
    6: quarterLeftLit,
    7: crescentLeftLit,
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${base}${shapes[idx] ?? ''}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

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
